(() => {
  "use strict";
  const api = window.toolbox;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const state = {
    catalog: null,
    busy: false,
    sizes: {},          // limpieza: id -> bytes | null
    cleanSel: new Set(),
    cleanState: {},     // id -> {status, freed}
    scanned: false,
    installed: {},
    appSel: new Set(),
    appState: {},
    appCat: "Todas",
    appQuery: "",
    tweakStatus: {},
    tweakPending: new Set(),
  };

  // ------------------------------------------------------------ Utilidades
  function formatBytes(b) {
    if (b === null || b === undefined) return "—";
    if (b < 1024 * 1024) return `${Math.max(0, Math.round(b / 1024))} KB`;
    if (b < 1024 ** 3) return `${Math.round(b / 1024 ** 2)} MB`;
    return `${(b / 1024 ** 3).toFixed(b < 10 * 1024 ** 3 ? 1 : 0).replace(".", ",")} GB`;
  }

  function toast(text, kind = "info", action) {
    const t = el("div", `toast ${kind}`);
    t.append(el("span", "", text));
    if (action) {
      const b = el("button", "link-btn", action.label);
      b.addEventListener("click", () => { action.run(); t.remove(); });
      t.append(b);
    }
    const close = el("button", "icon-btn", "✕");
    close.setAttribute("aria-label", "Cerrar aviso");
    close.addEventListener("click", () => t.remove());
    t.append(close);
    $("#toasts").append(t);
    setTimeout(() => t.remove(), action ? 9000 : 5000);
  }

  /** Ventana de confirmación. Devuelve una promesa con true/false. */
  function confirmDialog({ title, body, ok = "Aceptar", danger = false }) {
    return new Promise((resolve) => {
      $("#modal-title").textContent = title;
      const container = $("#modal-body");
      container.innerHTML = "";
      container.append(body);
      const okBtn = $("#modal-ok");
      okBtn.textContent = ok;
      okBtn.className = "btn " + (danger ? "danger" : "primary");
      $("#modal").classList.remove("hidden");
      okBtn.focus();
      const done = (v) => {
        $("#modal").classList.add("hidden");
        okBtn.onclick = null; $("#modal-cancel").onclick = null; document.onkeydown = null;
        resolve(v);
      };
      okBtn.onclick = () => done(true);
      $("#modal-cancel").onclick = () => done(false);
      document.onkeydown = (e) => { if (e.key === "Escape") done(false); };
    });
  }

  function restorePointOption(checked) {
    const label = el("label", "check-row");
    const input = el("input", "check");
    input.type = "checkbox";
    input.checked = checked;
    const text = el("span");
    text.innerHTML = "<strong>Crear un punto de restauración antes</strong><br><span class='muted'>Recomendado. Tarda un minuto y te permite volver atrás si algo no te gusta.</span>";
    label.append(input, text);
    return { node: label, get value() { return input.checked; } };
  }

  function busyGuard(result) {
    if (result && result.error === "busy") { toast("Espera a que termine la tarea actual.", "info"); return true; }
    return false;
  }

  // ------------------------------------------------------------ Navegación
  function go(page) {
    document.querySelectorAll(".nav-item[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === `page-${page}`));
    $(".content").scrollTop = 0;
    if (page === "tweaks") loadTweaks();
    if (page === "apps" && !state.appsChecked) checkApps();
  }
  document.querySelectorAll(".nav-item[data-page]").forEach((b) => b.addEventListener("click", () => go(b.dataset.page)));
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
    go(b.dataset.goto);
    if (b.dataset.autoscan && !state.scanned) scan();
  }));

  // ------------------------------------------------------------ Actividad
  const logBox = $("#activity-log");
  api.onLog(({ text, time }) => {
    const t = new Date(time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logBox.textContent += `[${t}] ${text}\n`;
    logBox.scrollTop = logBox.scrollHeight;
  });
  $("#activity-btn").addEventListener("click", () => $("#activity").classList.toggle("hidden"));
  $("#activity-close").addEventListener("click", () => $("#activity").classList.add("hidden"));
  api.onBusy((b) => {
    state.busy = b;
    $("#busy-dot").classList.toggle("hidden", !b);
    refreshButtons();
  });

  // ------------------------------------------------------------ Inicio
  async function loadSystem() {
    const info = await api.systemInfo();
    if (!info || info.error) { $("#disk-detail").textContent = "No se pudo leer la información del sistema."; return; }
    const used = info.diskTotal - info.diskFree;
    const pct = info.diskTotal ? Math.round((used / info.diskTotal) * 100) : 0;
    $("#greeting").textContent = info.user ? `Hola, ${info.user} 👋` : "Hola 👋";
    $("#disk-drive").textContent = `(${info.drive})`;
    $("#disk-free").textContent = formatBytes(info.diskFree);
    $("#disk-fill").style.width = pct + "%";
    $("#disk-fill").classList.toggle("full", pct >= 90);
    $("#disk-meter").setAttribute("aria-valuenow", pct);
    $("#disk-detail").textContent = `${formatBytes(used)} usados de ${formatBytes(info.diskTotal)} (${pct} %)` +
      (pct >= 90 ? " — tu disco está casi lleno, prueba la Limpieza." : "");
    const specs = $("#specs");
    specs.innerHTML = "";
    const rows = [
      ["Sistema", `${info.os.replace("Microsoft ", "")} (compilación ${info.build})`],
      ["Procesador", info.cpu],
      ["Memoria RAM", formatBytes(info.ram)],
      ["Encendido", info.uptimeHours >= 48 ? `hace ${Math.round(info.uptimeHours / 24)} días — reiniciar de vez en cuando ayuda` : `hace ${info.uptimeHours} h`],
      ["Permisos", info.admin ? "Administrador ✔" : "Sin permisos de administrador: algunas opciones no funcionarán"],
    ];
    rows.forEach(([k, v]) => specs.append(el("dt", "", k), el("dd", "", v)));
  }

  $("#restore-btn").addEventListener("click", async () => {
    const r = await api.createRestorePoint();
    if (busyGuard(r)) return;
    if (r.ok) toast("Punto de restauración creado.", "ok");
    else toast("No se pudo crear: " + (r.message || r.error || "error desconocido"), "error");
  });

  // ------------------------------------------------------------ Limpieza
  function renderCleanup() {
    const list = $("#cleanup-list");
    list.innerHTML = "";
    for (const it of state.catalog.cleanup) {
      const row = el("div", "item" + (state.cleanSel.has(it.id) ? " checked" : ""));
      const cb = el("input", "check");
      cb.type = "checkbox";
      cb.checked = state.cleanSel.has(it.id);
      cb.setAttribute("aria-label", it.name);
      cb.addEventListener("change", () => {
        cb.checked ? state.cleanSel.add(it.id) : state.cleanSel.delete(it.id);
        row.classList.toggle("checked", cb.checked);
        updateCleanTotal();
      });

      const main = el("div", "item-main");
      const h = el("h3", "", it.name);
      h.append(el("span", `badge ${it.risk === "seguro" ? "ok" : "warn"}`, it.risk === "seguro" ? "Seguro" : "Precaución"));
      if (it.slow) h.append(el("span", "badge neutral", "Tarda varios minutos"));
      main.append(h, el("p", "", it.summary));
      const more = el("div", "item-more hidden");
      const p1 = el("p"); p1.innerHTML = "<strong>Qué hace:</strong> "; p1.append(it.details);
      const p2 = el("p"); p2.innerHTML = "<strong>Qué notarás después:</strong> "; p2.append(it.after);
      more.append(p1, p2);
      const toggle = el("button", "link-btn", "Más información");
      toggle.addEventListener("click", () => {
        more.classList.toggle("hidden");
        toggle.textContent = more.classList.contains("hidden") ? "Más información" : "Menos información";
      });
      main.append(more, toggle);

      const size = el("div", "item-size");
      const st = state.cleanState[it.id];
      if (st && st.status === "running") size.append(el("span", "muted", "…"));
      else if (st && st.status === "done") size.append(el("span", "", formatBytes(st.freed)));
      else if (it.id in state.sizes) size.append(el("span", "", state.sizes[it.id] === null ? "?" : formatBytes(state.sizes[it.id])));
      else size.append(el("span", "muted", state.scanning ? "Analizando…" : "—"));
      if (st) {
        const label = { running: "Limpiando…", done: "✔ Liberado", error: "✖ Error" }[st.status];
        size.append(el("div", `item-state ${st.status}`, label));
      } else if (it.id in state.sizes && state.sizes[it.id] === null) {
        size.append(el("div", "muted small", "se mide al limpiar"));
      }

      row.append(cb, el("div", "item-ico", it.icon), main, size);
      list.append(row);
    }
    updateCleanTotal();
  }

  function updateCleanTotal() {
    const ids = [...state.cleanSel];
    const total = ids.reduce((s, id) => s + (state.sizes[id] || 0), 0);
    const unknown = ids.some((id) => state.sizes[id] === null || !(id in state.sizes));
    const box = $("#cleanup-total");
    if (!ids.length) box.textContent = "Nada seleccionado";
    else {
      box.innerHTML = "";
      box.append(`${ids.length} seleccionado${ids.length > 1 ? "s" : ""} · `);
      const b = el("strong", "", state.scanned ? formatBytes(total) + (unknown ? " o más" : "") : "analiza para ver el tamaño");
      box.append(b);
    }
    refreshButtons();
  }

  async function scan() {
    state.scanning = true;
    state.sizes = {};
    state.cleanState = {};
    $("#cleanup-result").classList.add("hidden");
    $("#scan-status").textContent = "Analizando… (no se borra nada)";
    renderCleanup();
    refreshButtons();
    const r = await api.cleanupScan(state.catalog.cleanup.map((c) => c.id));
    state.scanning = false;
    if (busyGuard(r)) { renderCleanup(); return; }
    state.scanned = true;
    Object.assign(state.sizes, r);
    const total = Object.values(state.sizes).reduce((s, b) => s + (b || 0), 0);
    $("#scan-status").textContent = `Hemos encontrado ${formatBytes(total)} que se pueden liberar.`;
    renderCleanup();
  }
  $("#scan-btn").addEventListener("click", scan);

  $("#clean-btn").addEventListener("click", async () => {
    const items = state.catalog.cleanup.filter((c) => state.cleanSel.has(c.id));
    const body = el("div");
    body.append(el("p", "", "Esto es lo que va a pasar:"));
    const ul = el("ul");
    items.forEach((it) => {
      const li = el("li");
      li.append(el("strong", "", `${it.icon} ${it.name}`));
      li.append(el("span", "muted", it.after));
      ul.append(li);
    });
    body.append(ul);
    const risky = items.some((i) => i.risk !== "seguro");
    const rp = restorePointOption(risky);
    body.append(rp.node);
    if (items.some((i) => i.slow)) body.append(el("p", "muted small", "⏱ Alguna de estas tareas tarda varios minutos. Puedes seguir usando el PC mientras tanto."));

    const ok = await confirmDialog({ title: "¿Limpiar ahora?", body, ok: "Sí, limpiar" });
    if (!ok) return;

    state.cleanState = {};
    renderCleanup();
    const r = await api.cleanupRun(items.map((i) => i.id), { restorePoint: rp.value });
    if (busyGuard(r)) return;
    if (r.aborted) {
      const again = await confirmDialog({
        title: "No se pudo crear el punto de restauración",
        body: el("p", "", `Windows ha dicho: «${r.restorePoint.message}». ¿Quieres limpiar igualmente?`),
        ok: "Limpiar sin punto",
      });
      if (!again) return;
      const r2 = await api.cleanupRun(items.map((i) => i.id), { restorePoint: false });
      return showCleanResult(r2);
    }
    showCleanResult(r);
  });

  function showCleanResult(r) {
    if (!r || !r.results) { toast("Algo ha fallado. Mira el panel de Actividad.", "error"); return; }
    const freed = r.results.reduce((s, x) => s + (x.freed || 0), 0);
    const skipped = r.results.reduce((s, x) => s + (x.skipped || 0), 0);
    const errors = r.results.filter((x) => !x.ok).length;
    const box = $("#cleanup-result");
    box.innerHTML = "";
    box.append(el("span", "big", "🎉"));
    const txt = el("div");
    txt.append(el("strong", "", `Has liberado ${formatBytes(freed)}.`));
    const extra = [];
    if (skipped) extra.push(`${skipped} archivo${skipped > 1 ? "s estaban" : " estaba"} en uso y se ha${skipped > 1 ? "n" : ""} saltado (es normal).`);
    if (errors) extra.push(`${errors} tarea${errors > 1 ? "s" : ""} dio error: revisa la Actividad.`);
    if (extra.length) txt.append(el("div", "muted", extra.join(" ")));
    box.append(txt);
    box.classList.remove("hidden");
    state.cleanSel.clear();
    renderCleanup();
    loadSystem();
  }

  api.onProgress(({ kind, id, data }) => {
    if (kind === "scan") { state.sizes[id] = data; renderCleanup(); }
    if (kind === "clean") { state.cleanState[id] = data; renderCleanup(); }
    if (kind === "install") { state.appState[id] = data.status; if (data.status === "done" || data.status === "already") state.installed[id] = true; renderApps(); }
  });

  // ------------------------------------------------------------ Apps
  async function checkApps() {
    state.appsChecked = true;
    const r = await api.appsCheck();
    $("#winget-missing").classList.toggle("hidden", r.winget);
    state.winget = r.winget;
    state.installed = r.installed || {};
    renderApps();
  }

  function renderCats() {
    const cats = ["Todas", ...new Set(state.catalog.apps.map((a) => a.category))];
    const box = $("#app-cats");
    box.innerHTML = "";
    cats.forEach((c) => {
      const b = el("button", "chip" + (state.appCat === c ? " active" : ""), c);
      b.addEventListener("click", () => { state.appCat = c; renderCats(); renderApps(); });
      box.append(b);
    });
  }

  function renderApps() {
    const grid = $("#app-grid");
    grid.innerHTML = "";
    const q = state.appQuery.trim().toLowerCase();
    const list = state.catalog.apps.filter((a) =>
      (state.appCat === "Todas" || a.category === state.appCat) &&
      (!q || a.name.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)));
    let lastCat = null;
    for (const a of list) {
      if (state.appCat === "Todas" && a.category !== lastCat) { grid.append(el("div", "app-cat-title", a.category)); lastCat = a.category; }
      const card = el("label", "app" + (state.appSel.has(a.id) ? " checked" : ""));
      const cb = el("input", "check");
      cb.type = "checkbox";
      cb.checked = state.appSel.has(a.id);
      cb.addEventListener("change", () => {
        cb.checked ? state.appSel.add(a.id) : state.appSel.delete(a.id);
        card.classList.toggle("checked", cb.checked);
        updateAppsTotal();
      });
      const info = el("div");
      const title = el("strong", "", a.name);
      const st = state.appState[a.id];
      if (st === "running") title.append(el("span", "badge info", "Instalando…"));
      else if (st === "error") title.append(el("span", "badge warn", "Error"));
      else if (state.installed[a.id]) title.append(el("span", "badge ok", "Instalada"));
      info.append(title, el("div", "muted", a.summary));
      card.append(cb, info);
      grid.append(card);
    }
    if (!list.length) grid.append(el("p", "muted", "No hay programas con ese nombre."));
    updateAppsTotal();
  }

  function updateAppsTotal() {
    const n = state.appSel.size;
    $("#apps-total").textContent = n ? `${n} programa${n > 1 ? "s" : ""} seleccionado${n > 1 ? "s" : ""}` : "Nada seleccionado";
    refreshButtons();
  }

  $("#app-search").addEventListener("input", (e) => { state.appQuery = e.target.value; renderApps(); });

  $("#install-btn").addEventListener("click", async () => {
    const apps = state.catalog.apps.filter((a) => state.appSel.has(a.id));
    const body = el("div");
    body.append(el("p", "", "Se van a descargar e instalar estos programas, uno detrás de otro:"));
    const ul = el("ul");
    apps.forEach((a) => { const li = el("li"); li.append(el("strong", "", a.name), el("span", "muted", a.summary)); ul.append(li); });
    body.append(ul);
    body.append(el("p", "muted small", "Al instalar aceptas las condiciones de uso de cada programa. Puedes seguir el progreso en «Actividad»."));
    if (!(await confirmDialog({ title: `¿Instalar ${apps.length} programa${apps.length > 1 ? "s" : ""}?`, body, ok: "Instalar" }))) return;
    $("#activity").classList.remove("hidden");
    const r = await api.appsInstall(apps.map((a) => a.id));
    if (busyGuard(r)) return;
    const ok = r.results.filter((x) => x.status !== "error").length;
    const bad = r.results.length - ok;
    toast(bad ? `${ok} instalados, ${bad} con error. Mira la Actividad.` : `¡Listo! ${ok} programa${ok > 1 ? "s" : ""} instalado${ok > 1 ? "s" : ""}.`, bad ? "error" : "ok");
    state.appSel.clear();
    renderApps();
  });

  $("#upgrade-btn").addEventListener("click", async () => {
    const body = el("p", "", "ToolBox buscará versiones nuevas de todos los programas instalados que winget conoce y las instalará. Puede tardar un rato y algunos programas se cerrarán para actualizarse.");
    if (!(await confirmDialog({ title: "¿Actualizar todas tus apps?", body, ok: "Actualizar" }))) return;
    $("#activity").classList.remove("hidden");
    const r = await api.appsUpgradeAll();
    if (busyGuard(r)) return;
    toast(r.ok ? "Tus programas están al día." : "Algunos programas no se pudieron actualizar.", r.ok ? "ok" : "error");
  });

  // ------------------------------------------------------------ Ajustes
  const RESTART_TEXT = { explorer: "Reinicia el Explorador", logout: "Al volver a iniciar sesión" };

  async function loadTweaks() {
    const s = await api.tweaksStatus();
    if (s && !s.error) state.tweakStatus = s;
    renderTweaks();
  }

  function renderTweaks() {
    const root = $("#tweak-groups");
    root.innerHTML = "";
    const groups = {};
    state.catalog.tweaks.forEach((t) => (groups[t.category] = groups[t.category] || []).push(t));
    for (const [cat, items] of Object.entries(groups)) {
      const g = el("div", "tweak-group");
      g.append(el("h2", "", cat));
      const list = el("div", "tweak-list");
      for (const t of items) {
        const row = el("div", "tweak");
        const info = el("div");
        const h = el("h3", "", t.name);
        if (t.restart) h.append(el("span", "badge neutral", RESTART_TEXT[t.restart]));
        info.append(h, el("p", "", t.summary));
        const more = el("div", "item-more hidden");
        more.append(el("p", "", t.details));
        const toggle = el("button", "link-btn", "Más información");
        toggle.addEventListener("click", () => {
          more.classList.toggle("hidden");
          toggle.textContent = more.classList.contains("hidden") ? "Más información" : "Menos información";
        });
        info.append(more, toggle);

        const sw = el("label", "switch");
        const input = el("input");
        input.type = "checkbox";
        input.setAttribute("role", "switch");
        input.setAttribute("aria-label", t.name);
        input.checked = !!state.tweakStatus[t.id];
        input.disabled = state.tweakPending.has(t.id);
        input.addEventListener("change", () => setTweak(t, input.checked));
        sw.append(input, el("span"));
        row.append(info, sw);
        list.append(row);
      }
      g.append(list);
      root.append(g);
    }
  }

  async function setTweak(t, enable) {
    state.tweakPending.add(t.id);
    renderTweaks();
    const r = await api.tweaksSet([t.id], enable, {});
    state.tweakPending.delete(t.id);
    if (busyGuard(r)) { renderTweaks(); return; }
    const res = r.results && r.results[0];
    if (res && res.ok) {
      state.tweakStatus[t.id] = enable;
      const msg = `${enable ? "Activado" : "Desactivado"}: ${t.name}.`;
      if (t.restart === "explorer") {
        toast(msg + " Se verá al reiniciar el Explorador.", "ok", { label: "Reiniciar ahora", run: () => api.restartExplorer() });
      } else if (t.restart === "logout") {
        toast(msg + " Se aplicará la próxima vez que inicies sesión.", "ok");
      } else toast(msg, "ok");
    } else {
      toast(`No se pudo cambiar «${t.name}». ${res && res.message ? res.message : ""}`, "error");
    }
    renderTweaks();
  }

  // ------------------------------------------------------------ Botones
  function refreshButtons() {
    $("#scan-btn").disabled = state.busy || state.scanning;
    $("#clean-btn").disabled = state.busy || !state.cleanSel.size;
    $("#install-btn").disabled = state.busy || !state.appSel.size || state.winget === false;
    $("#upgrade-btn").disabled = state.busy || state.winget === false;
    $("#restore-btn").disabled = state.busy;
  }

  // ------------------------------------------------------------ Arranque
  (async () => {
    state.catalog = await api.catalog();
    $("#demo-pill").classList.toggle("hidden", !state.catalog.mock);
    state.catalog.cleanup.filter((c) => c.recommended).forEach((c) => state.cleanSel.add(c.id));
    renderCleanup();
    renderCats();
    renderApps();
    refreshButtons();
    loadSystem();
  })();
})();
