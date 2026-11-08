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
    repairState: {},   // id -> { running, step, total, label, percent, result }
    bloatStatus: null, // id -> { installed, provisioned }
    bloatSel: new Set(),
    bloatState: {},    // id -> { status, reason }
    programs: null,    // lista de programas instalados
    programQuery: "",
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

  /**
   * Ejecuta una acción que puede crear un punto de restauración antes.
   * run(opts) llama al proceso principal. Si «Restaurar sistema» está apagado, pide permiso
   * para encenderlo; si no se puede crear el punto, pregunta si seguir sin él.
   * Devuelve el resultado final, o null si el usuario cancela.
   */
  async function withRestorePoint(run, opts, what) {
    let r = await run(opts);
    if (!r || !r.aborted) return r;
    const rp = r.restorePoint || {};
    if (rp.needsEnable) {
      const body = el("div");
      body.append(el("p", "", "«Restaurar sistema» está desactivado en tu PC, así que ahora mismo no se pueden crear puntos de restauración."));
      body.append(el("p", "", "Si lo activamos, Windows reservará una parte del disco (normalmente entre el 3 y el 5 %) para guardar estas copias. Puedes desactivarlo cuando quieras en Configuración → Sistema → Información → Protección del sistema."));
      const ok = await confirmDialog({ title: "¿Activar Restaurar sistema?", body, ok: "Activar y continuar" });
      if (ok) r = await run({ ...opts, allowEnableRestore: true });
      else {
        const go = await confirmDialog({ title: "¿Continuar sin punto de restauración?", body: el("p", "", `Puedes ${what} igualmente, pero no habrá una copia para volver atrás.`), ok: "Continuar sin punto" });
        if (!go) return null;
        return run({ ...opts, restorePoint: false });
      }
      if (!r || !r.aborted) return r;
    }
    const msg = (r.restorePoint && r.restorePoint.message) || "error desconocido";
    const go = await confirmDialog({
      title: "No se pudo crear el punto de restauración",
      body: el("p", "", `Windows ha dicho: «${msg}». ¿Quieres ${what} igualmente?`),
      ok: "Continuar sin punto",
    });
    if (!go) return null;
    return run({ ...opts, restorePoint: false });
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
    if (page === "bloat" && !state.programs) loadPrograms();
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
  $("#open-logs").addEventListener("click", () => api.openLogs());
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
    let r = await api.createRestorePoint();
    if (busyGuard(r)) return;
    if (r.needsEnable) {
      const body = el("div");
      body.append(el("p", "", "«Restaurar sistema» está desactivado en tu PC. Si lo activamos, Windows reservará una parte del disco (normalmente entre el 3 y el 5 %) para guardar estas copias."));
      if (!(await confirmDialog({ title: "¿Activar Restaurar sistema?", body, ok: "Activar y crear" }))) return;
      r = await api.createRestorePoint({ allowEnable: true });
      if (busyGuard(r)) return;
    }
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
      else if (state.sizes[it.id] === -1) size.append(el("span", "muted", "No se pudo medir"));
      else if (it.id in state.sizes) size.append(el("span", "", state.sizes[it.id] === null ? "?" : formatBytes(state.sizes[it.id])));
      else size.append(el("span", "muted", state.scanning ? "Analizando…" : "—"));
      if (st) {
        const label = { running: st.percent != null ? `Limpiando… ${Math.round(st.percent)} %` : "Limpiando…", done: "✔ Liberado", error: "✖ Error" }[st.status];
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
    const total = ids.reduce((s, id) => s + Math.max(0, state.sizes[id] || 0), 0);
    const unknown = ids.some((id) => state.sizes[id] === null || state.sizes[id] === -1 || !(id in state.sizes));
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
    const total = Object.values(state.sizes).reduce((s, b) => s + Math.max(0, b || 0), 0);
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
    const ids = items.map((i) => i.id);
    const r = await withRestorePoint((o) => api.cleanupRun(ids, o), { restorePoint: rp.value }, "limpiar");
    if (r === null || busyGuard(r)) return;
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
    if (kind === "bloat") { state.bloatState[id] = data; renderBloat(); }
    if (kind === "profile") updateProfileProgress(id, data);
    if (kind === "repair") {
      state.repairState[id] = { ...(state.repairState[id] || {}), running: true, ...data };
      updateRepairProgress(id);
    }
    if (kind === "install") {
      state.appState[id] = data;
      if (["done", "already", "uptodate", "reboot", "userScope"].includes(data.status)) state.installed[id] = true;
      renderApps();
    }
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
      const st = state.appState[a.id] || {};
      let note = null;
      if (st.status === "running") title.append(el("span", "badge info", "Instalando…"));
      else if (st.status === "error") { title.append(el("span", "badge warn", "Error")); note = st.reason; }
      else if (st.status === "reboot") { title.append(el("span", "badge ok", "Instalada"), el("span", "badge neutral", "Reinicia para terminar")); }
      else if (st.status === "userScope") { title.append(el("span", "badge ok", "Instalada")); note = "Instalada solo para tu usuario: ToolBox no puede modificarla."; }
      else if (state.installed[a.id]) title.append(el("span", "badge ok", "Instalada"));
      info.append(title, el("div", "muted", a.summary));
      if (note) info.append(el("div", "muted small app-note", note));
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
    const reboot = r.results.some((x) => x.status === "reboot");
    let msg = bad ? `${ok} instalado${ok === 1 ? "" : "s"}, ${bad} con error. Mira la Actividad.` : `¡Listo! ${ok} programa${ok > 1 ? "s" : ""} instalado${ok > 1 ? "s" : ""}.`;
    if (reboot) msg += " Algunos necesitan que reinicies el PC para terminar.";
    toast(msg, bad ? "error" : "ok");
    state.appSel.clear();
    renderApps();
  });

  $("#upgrade-btn").addEventListener("click", async () => {
    const body = el("p", "", "ToolBox buscará versiones nuevas de todos los programas instalados que winget conoce y las instalará. Puede tardar un rato y algunos programas se cerrarán para actualizarse.");
    if (!(await confirmDialog({ title: "¿Actualizar todas tus apps?", body, ok: "Actualizar" }))) return;
    $("#activity").classList.remove("hidden");
    const r = await api.appsUpgradeAll();
    if (busyGuard(r)) return;
    toast(r.ok ? (r.reboot ? "Programas actualizados. Reinicia el PC para terminar." : "Tus programas están al día.")
      : "Algunos programas no se pudieron actualizar. Mira la Actividad.", r.ok ? "ok" : "error");
  });

  // ------------------------------------------------------------ Reparar
  function offerReboot(text) {
    toast(text, "ok", {
      label: "Reiniciar ahora",
      run: async () => {
        const body = el("p", "", "Guarda lo que tengas abierto. El PC se reiniciará en 10 segundos.");
        if (await confirmDialog({ title: "¿Reiniciar el PC ahora?", body, ok: "Reiniciar" })) api.reboot();
      },
    });
  }

  function renderRepairs() {
    const list = $("#repair-list");
    list.innerHTML = "";
    for (const r of state.catalog.repairs) {
      const st = state.repairState[r.id] || {};
      const card = el("div", "repair" + (st.running ? " running" : ""));
      card.id = `repair-${r.id}`;
      const main = el("div");
      main.append(el("h3", "", r.problem));
      const fix = el("p", "fix");
      fix.append(el("strong", "", r.name + ". "), r.summary);
      main.append(fix);
      const badges = el("div", "badges");
      badges.append(el("span", `badge ${r.risk === "seguro" ? "ok" : "warn"}`, r.risk === "seguro" ? "Seguro" : "Precaución"));
      badges.append(el("span", "badge neutral", "⏱ " + r.duration));
      if (r.internet) badges.append(el("span", "badge neutral", "Necesita Internet"));
      if (r.rebootRequired) badges.append(el("span", "badge neutral", "Hay que reiniciar"));
      main.append(badges);
      const more = el("div", "item-more hidden");
      const p1 = el("p"); p1.innerHTML = "<strong>Qué hace:</strong> "; p1.append(r.details);
      const ol = el("ol", "steps");
      r.steps.forEach((s) => ol.append(el("li", "", s)));
      const p2 = el("p"); p2.innerHTML = "<strong>Qué notarás después:</strong> "; p2.append(r.after);
      more.append(p1, ol, p2);
      const toggle = el("button", "link-btn", "Más información");
      toggle.addEventListener("click", () => {
        more.classList.toggle("hidden");
        toggle.textContent = more.classList.contains("hidden") ? "Más información" : "Menos información";
      });
      main.append(more, toggle);

      const btn = el("button", "btn primary", st.running ? "Reparando…" : "Reparar");
      btn.disabled = state.busy || !!st.running;
      btn.dataset.repairBtn = r.id;
      btn.addEventListener("click", () => startRepair(r));
      card.append(el("div", "repair-ico", r.icon), main, btn);

      if (st.running) {
        const prog = el("div", "repair-progress");
        prog.id = `repair-progress-${r.id}`;
        const meter = el("div", "meter");
        meter.append(el("div", "meter-fill"));
        prog.append(el("div", "small repair-step"), meter);
        card.append(prog);
      } else if (st.result) {
        card.append(renderRepairResult(st.result));
      }
      list.append(card);
      if (st.running) updateRepairProgress(r.id);
    }
  }

  function updateRepairProgress(id) {
    const st = state.repairState[id];
    const box = document.getElementById(`repair-progress-${id}`);
    if (!box || !st) { renderRepairs(); return; }
    const overall = st.total ? ((st.step - 1) + (st.percent != null ? st.percent / 100 : 0)) / st.total : 0;
    box.querySelector(".repair-step").textContent = st.label
      ? `Paso ${st.step} de ${st.total}: ${st.label}${st.percent != null && st.percent < 100 ? ` — ${Math.round(st.percent)} %` : "…"}`
      : "Empezando…";
    const meter = box.querySelector(".meter");
    meter.classList.toggle("indeterminate", st.percent == null);
    box.querySelector(".meter-fill").style.width = Math.round(overall * 100) + "%";
  }

  function renderRepairResult(res) {
    const kind = !res.ok ? "bad" : res.warnings && res.warnings.length ? "warn" : "ok";
    const box = el("div", `repair-result ${kind}`);
    const title = !res.ok ? `✖ No se pudo completar: «${res.failed}». ${res.message || ""}`
      : res.warnings.length ? "✔ Terminado, con algún aviso:" : "✔ Terminado.";
    box.append(el("div", "", title));
    const lines = [...(res.warnings || []).map((w) => "⚠ " + w), ...(res.notes || [])];
    if (lines.length) {
      const ul = el("ul");
      lines.forEach((w) => ul.append(el("li", "", w)));
      box.append(ul);
    }
    if (res.reboot) box.append(el("div", "small", "Reinicia el PC para que el arreglo surta efecto."));
    return box;
  }

  async function startRepair(r) {
    const body = el("div");
    body.append(el("p", "", r.summary));
    const ol = el("ol", "steps");
    r.steps.forEach((s) => ol.append(el("li", "", s)));
    body.append(el("p", "", "Pasos:"), ol);
    const after = el("p"); after.innerHTML = "<strong>Qué notarás después:</strong> "; after.append(r.after);
    body.append(after);
    const rp = restorePointOption(r.risk !== "seguro");
    if (r.risk !== "seguro") body.append(rp.node);
    body.append(el("p", "muted small", `⏱ Tarda ${r.duration}. Puedes seguir usando el PC mientras tanto.`));
    if (!(await confirmDialog({ title: `¿${r.name}?`, body, ok: "Empezar" }))) return;

    state.repairState[r.id] = { running: true };
    renderRepairs();
    $("#activity").classList.remove("hidden");
    const res = await withRestorePoint((o) => api.runRepair(r.id, o), { restorePoint: r.risk !== "seguro" && rp.value }, "reparar");
    if (res === null || busyGuard(res)) { state.repairState[r.id] = {}; renderRepairs(); return; }
    state.repairState[r.id] = { running: false, result: res.error ? { ok: false, failed: "inicio", message: res.error, warnings: [] } : res };
    renderRepairs();
    if (res.ok && res.reboot) offerReboot(`${r.name}: listo. Reinicia el PC para terminar.`);
    else if (res.ok) toast(`${r.name}: listo.`, "ok");
    else toast(`${r.name}: no se pudo completar. Mira el resultado y la Actividad.`, "error");
  }

  // ------------------------------------------------------------ Perfiles de un clic
  const PHASE_TEXT = { tweaks: "Aplicando ajustes", bloat: "Quitando apps de Windows", cleanup: "Limpiando" };

  function renderProfiles() {
    const box = $("#profile-cards");
    box.innerHTML = "";
    for (const p of state.catalog.profiles) {
      const card = el("div", "profile-card");
      card.append(el("span", "action-ico", p.icon), el("span", "who", p.who), el("strong", "", p.name), el("p", "", p.summary));
      const b = el("button", "btn primary", "Ver qué cambia");
      b.dataset.profileBtn = p.id;
      b.disabled = state.busy;
      b.addEventListener("click", () => openProfile(p));
      card.append(b);
      box.append(card);
    }
  }

  async function openProfile(p) {
    const plan = await api.profilePlan(p.id);
    if (busyGuard(plan)) return;
    if (!plan || plan.error) { toast("No se pudo preparar el perfil.", "error"); return; }
    const name = (kind, id) => {
      if (kind === "tweaks") return state.catalog.tweaks.find((t) => t.id === id).name;
      if (kind === "bloat") return state.catalog.bloat.apps.find((a) => a.id === id).name;
      return state.catalog.cleanup.find((c) => c.id === id).name;
    };
    const body = el("div");
    body.append(el("p", "", p.summary));
    const inputs = [];
    const group = (title, kind, items, isDone, extra) => {
      if (!items.length) return;
      const g = el("div", "plan-group");
      g.append(el("h3", "", title));
      for (const it of items) {
        const done = isDone(it);
        const row = el("label", "plan-row" + (done ? " done" : ""));
        const cb = el("input", "check");
        cb.type = "checkbox";
        cb.checked = !done;
        cb.disabled = done;
        if (!done) inputs.push({ kind, id: it.id, cb });
        row.append(cb, el("span", "", name(kind, it.id)),
          el("span", "muted", done ? (kind === "tweaks" ? "ya activado" : "no la tienes") : extra(it)));
        g.append(row);
      }
      body.append(g);
    };
    group("Ajustes que se activan", "tweaks", plan.tweaks, (t) => t.already, () => "");
    group("Apps de Windows que se quitan", "bloat", plan.bloat, (b) => !b.present, () => "se puede reinstalar");
    group("Limpieza", "cleanup", plan.cleanup, () => false, (c) => (c.bytes > 0 ? formatBytes(c.bytes) : ""));
    if (!inputs.length) {
      toast(`Tu PC ya tiene todo lo del perfil «${p.name}». 👍`, "ok");
      return;
    }
    const rp = restorePointOption(true);
    body.append(rp.node);
    body.append(el("p", "muted small", "Todo se puede deshacer: los ajustes desde «Ajustes» y las apps con «Reinstalar» en «Desinstalar → Apps de Windows»."));
    if (!(await confirmDialog({ title: `${p.icon} Perfil «${p.name}»`, body, ok: "Aplicar perfil" }))) return;

    const sel = { tweaks: [], bloat: [], cleanup: [] };
    inputs.filter((i) => i.cb.checked).forEach((i) => sel[i.kind].push(i.id));
    if (!sel.tweaks.length && !sel.bloat.length && !sel.cleanup.length) return;
    $("#profile-progress").classList.remove("hidden");
    $("#profile-progress-text").textContent = `Aplicando «${p.name}»…`;
    $("#profile-progress-fill").style.width = "0%";
    const r = await withRestorePoint((o) => api.profileApply(p.id, sel, o), { restorePoint: rp.value }, "aplicar el perfil");
    $("#profile-progress").classList.add("hidden");
    if (r === null || busyGuard(r)) return;
    if (r.error) { toast("No se pudo aplicar el perfil: " + r.error, "error"); return; }
    const freed = (r.cleanup || []).reduce((s, x) => s + (x.freed || 0), 0);
    const fails = (r.tweaks || []).filter((x) => !x.ok).length + (r.bloat || []).filter((x) => x.status === "error").length;
    let msg = `Perfil «${p.name}» aplicado.`;
    if (freed) msg += ` Liberados ${formatBytes(freed)}.`;
    if (fails) msg += ` ${fails} cambio${fails > 1 ? "s" : ""} no se pudo aplicar (mira la Actividad).`;
    if (r.logout) msg += " Algunos cambios se verán al volver a iniciar sesión.";
    toast(msg, fails ? "error" : "ok");
    // Lo aplicado cambia lo que muestran otras pantallas
    state.bloatStatus = null;
    state.scanned = false;
    state.sizes = {};
    loadSystem();
  }

  function updateProfileProgress(id, ph) {
    const order = ["tweaks", "bloat", "cleanup"];
    const share = 100 / order.length;
    const pct = order.indexOf(ph.phase) * share + (ph.total ? (ph.done / ph.total) * share : 0);
    $("#profile-progress-text").textContent = `${PHASE_TEXT[ph.phase]}… (${ph.done}/${ph.total})`;
    $("#profile-progress-fill").style.width = Math.round(pct) + "%";
  }

  // ------------------------------------------------------------ Desinstalar: pestañas
  document.querySelectorAll(".tab[data-tab]").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab[data-tab]").forEach((x) => x.classList.toggle("active", x === t));
    $("#tab-programs").classList.toggle("hidden", t.dataset.tab !== "programs");
    $("#tab-winapps").classList.toggle("hidden", t.dataset.tab !== "winapps");
    if (t.dataset.tab === "winapps" && !state.bloatStatus) loadBloat();
    if (t.dataset.tab === "programs" && !state.programs) loadPrograms();
  }));

  // ------------------------------------------------------------ Desinstalar: programas
  const formatDate = (d) => (/^\d{8}$/.test(d || "") ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : "");

  async function loadPrograms() {
    $("#program-count").textContent = "Cargando programas…";
    const list = await api.programsList();
    if (!Array.isArray(list)) { $("#program-count").textContent = "No se pudo leer la lista de programas."; return; }
    state.programs = list;
    renderPrograms();
  }

  function renderPrograms() {
    const box = $("#program-list");
    box.innerHTML = "";
    const q = state.programQuery.trim().toLowerCase();
    const list = state.programs.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.publisher || "").toLowerCase().includes(q));
    $("#program-count").textContent = `${state.programs.length} programas instalados` + (q ? ` · ${list.length} coinciden` : "");
    for (const p of list) {
      const row = el("div", "program-row");
      const info = el("div");
      info.append(el("strong", "", p.name));
      const meta = [p.publisher, p.version && `versión ${p.version}`, formatDate(p.date) && `instalado el ${formatDate(p.date)}`].filter(Boolean).join(" · ");
      info.append(el("div", "meta", meta));
      const b = el("button", "btn btn-small", "Desinstalar");
      b.dataset.uninstallKey = p.key;
      b.disabled = state.busy;
      b.addEventListener("click", () => uninstallProgram(p));
      row.append(info, el("span", "size", p.sizeKB > 0 ? formatBytes(p.sizeKB * 1024) : ""), b);
      box.append(row);
    }
    if (!list.length) box.append(el("p", "muted", "No hay programas con ese nombre."));
  }
  $("#program-search").addEventListener("input", (e) => { state.programQuery = e.target.value; renderPrograms(); });

  async function uninstallProgram(p) {
    const body = el("div");
    body.append(el("p", "", "Así funciona:"));
    const ol = el("ol", "steps");
    ["Se abre el desinstalador oficial del programa: sigue sus pasos (normalmente «Siguiente» y «Desinstalar»).",
      "Cuando termine, ToolBox busca carpetas y entradas del registro que haya dejado.",
      "Te enseña lo que encuentre y tú eliges qué borrar. Nada se borra sin preguntarte."].forEach((t) => ol.append(el("li", "", t)));
    body.append(ol);
    if (!(await confirmDialog({ title: `¿Desinstalar ${p.name}?`, body, ok: "Desinstalar" }))) return;

    $("#uninstall-banner").classList.remove("hidden");
    $("#uninstall-banner-title").textContent = `Desinstalando ${p.name}…`;
    const r = await api.programUninstall(p.key);
    $("#uninstall-banner").classList.add("hidden");
    if (busyGuard(r)) return;
    if (r.error) { toast("No se pudo desinstalar: " + r.error, "error"); return; }
    if (!r.uninstalled) {
      toast(r.aborted ? `Hemos dejado de esperar. Si ${p.name} se desinstaló, vuelve a abrir esta lista.`
        : `${p.name} sigue instalado (¿se canceló el desinstalador?).`, "info");
      await loadPrograms();
      return;
    }
    state.programs = state.programs.filter((x) => x.key !== p.key);
    renderPrograms();
    if (!r.leftovers.length) { toast(`${p.name} desinstalado sin dejar restos. ✨`, "ok"); return; }
    await offerLeftovers(p, r.leftovers);
  }
  $("#uninstall-stop").addEventListener("click", () => api.stopWaitingUninstall());

  async function offerLeftovers(p, leftovers) {
    const body = el("div");
    body.append(el("p", "", `${p.name} se ha desinstalado, pero ha dejado esto. Marca lo que quieras borrar:`));
    const inputs = [];
    const group = (title, items) => {
      if (!items.length) return;
      const g = el("div", "plan-group");
      g.append(el("h3", "", title));
      for (const it of items) {
        const row = el("label", "plan-row");
        const cb = el("input", "check");
        cb.type = "checkbox";
        cb.checked = true;
        inputs.push({ id: it.id, cb });
        const txt = el("span");
        txt.append(el("div", "leftover-path", it.path), el("div", "muted", it.reason));
        row.append(cb, txt, el("span", "muted", it.bytes ? formatBytes(it.bytes) : ""));
        g.append(row);
      }
      body.append(g);
    };
    group("Carpetas (irán a la Papelera)", leftovers.filter((l) => l.kind === "folder"));
    group("Registro (se guarda copia antes de borrar)", leftovers.filter((l) => l.kind === "key"));
    body.append(el("p", "muted small", "Solo se proponen carpetas y claves con el nombre exacto del programa, y nunca algo que use otro programa instalado."));
    if (!(await confirmDialog({ title: "Restos encontrados", body, ok: "Borrar lo marcado" }))) return;
    const ids = inputs.filter((i) => i.cb.checked).map((i) => i.id);
    if (!ids.length) return;
    const r = await api.cleanLeftovers(ids);
    if (busyGuard(r)) return;
    const ok = r.results.filter((x) => x.ok).length;
    const bad = r.results.length - ok;
    const hasKeys = r.results.some((x) => x.kind === "key" && x.ok);
    toast(bad ? `${ok} restos borrados, ${bad} no se pudieron borrar (quizá estén en uso).` : `${p.name} eliminado por completo. ✨`,
      bad ? "error" : "ok", hasKeys ? { label: "Ver copias", run: () => api.openBackups() } : undefined);
  }

  // ------------------------------------------------------------ Quitar apps
  const bloatPresent = (id) => {
    const st = state.bloatStatus && state.bloatStatus[id];
    return !!(st && (st.installed || st.provisioned));
  };

  async function loadBloat(keepSelection) {
    const st = await api.bloatStatus();
    if (!st || st.error) { $("#bloat-status").textContent = "No se pudo comprobar qué apps tienes."; return; }
    const first = !state.bloatStatus;
    state.bloatStatus = st;
    if (first && !keepSelection) selectRecommendedBloat();
    // Lo que ya no está no puede seguir seleccionado
    [...state.bloatSel].forEach((id) => { if (!bloatPresent(id)) state.bloatSel.delete(id); });
    const n = state.catalog.bloat.apps.filter((a) => bloatPresent(a.id)).length;
    $("#bloat-status").textContent = `Tienes ${n} de las ${state.catalog.bloat.apps.length} apps de esta lista.`;
    renderBloat();
  }

  function selectRecommendedBloat() {
    const rec = new Set(state.catalog.bloat.groups.filter((g) => g.recommended).map((g) => g.id));
    state.catalog.bloat.apps.forEach((a) => { if (rec.has(a.group) && !a.warn && bloatPresent(a.id)) state.bloatSel.add(a.id); });
  }

  function renderBloat() {
    const root = $("#bloat-groups");
    root.innerHTML = "";
    if (!state.bloatStatus) return;
    for (const g of state.catalog.bloat.groups) {
      const box = el("div", "bloat-group");
      const h = el("h2", "", g.name);
      if (g.recommended) h.append(" ", el("span", "badge ok", "Recomendado quitar"));
      box.append(h, el("p", "", g.summary));
      const list = el("div", "bloat-list");
      for (const a of state.catalog.bloat.apps.filter((x) => x.group === g.id)) {
        const present = bloatPresent(a.id);
        const st = state.bloatState[a.id] || {};
        const row = el("label", "bloat-row" + (state.bloatSel.has(a.id) ? " checked" : "") + (present ? "" : " absent"));
        const cb = el("input", "check");
        cb.type = "checkbox";
        cb.checked = state.bloatSel.has(a.id);
        cb.disabled = !present || st.status === "running";
        cb.setAttribute("aria-label", a.name);
        cb.addEventListener("change", () => {
          cb.checked ? state.bloatSel.add(a.id) : state.bloatSel.delete(a.id);
          row.classList.toggle("checked", cb.checked);
          updateBloatTotal();
        });
        const info = el("div");
        const title = el("strong", "", a.name);
        if (st.status === "running") title.append(el("span", "badge info", "Trabajando…"));
        else if (st.status === "removed") title.append(el("span", "badge ok", "Quitada"));
        else if (st.status === "reinstalled") title.append(el("span", "badge ok", "Reinstalada"));
        else if (st.status === "error") title.append(el("span", "badge warn", "Error"));
        else title.append(el("span", `badge ${present ? "neutral" : "neutral"}`, present ? "Instalada" : "No instalada"));
        info.append(title, el("div", "muted", a.summary));
        if (a.warn && present) info.append(el("div", "app-note", "⚠ " + a.warn));
        if (st.reason) info.append(el("div", "app-note", st.reason));
        row.append(cb, info);
        if (!present && st.status !== "running") {
          if (a.canReinstall) {
            const b = el("button", "btn btn-small", "Reinstalar");
            b.dataset.bloatReinstall = a.id;
            b.disabled = state.busy;
            b.addEventListener("click", (e) => { e.preventDefault(); reinstallBloat(a); });
            row.append(b);
          } else row.append(el("span", "muted small", "Desde Microsoft Store"));
        } else row.append(el("span"));
        list.append(row);
      }
      box.append(list);
      root.append(box);
    }
    updateBloatTotal();
  }

  function updateBloatTotal() {
    const n = state.bloatSel.size;
    $("#bloat-total").textContent = n ? `${n} app${n > 1 ? "s" : ""} seleccionada${n > 1 ? "s" : ""}` : "Nada seleccionado";
    refreshButtons();
  }

  $("#bloat-recommended").addEventListener("click", () => {
    if (!state.bloatStatus) return;
    state.bloatSel.clear();
    selectRecommendedBloat();
    renderBloat();
  });

  $("#bloat-remove-btn").addEventListener("click", async () => {
    const apps = state.catalog.bloat.apps.filter((a) => state.bloatSel.has(a.id));
    const body = el("div");
    body.append(el("p", "", "Se van a quitar estas apps para todos los usuarios del PC (y también para los que se creen más adelante):"));
    const ul = el("ul");
    apps.forEach((a) => {
      const li = el("li");
      li.append(el("strong", "", a.name), el("span", "muted", a.warn ? "⚠ " + a.warn : a.summary));
      ul.append(li);
    });
    body.append(ul);
    body.append(el("p", "muted small", "Podrás volver a instalarlas desde esta misma pantalla con «Reinstalar»."));
    const risky = apps.some((a) => a.group !== "ads" || a.warn);
    const rp = restorePointOption(risky);
    body.append(rp.node);
    if (!(await confirmDialog({ title: `¿Quitar ${apps.length} app${apps.length > 1 ? "s" : ""}?`, body, ok: "Quitar" }))) return;
    $("#activity").classList.remove("hidden");
    const r = await withRestorePoint((o) => api.bloatRemove(apps.map((a) => a.id), o), { restorePoint: rp.value }, "quitar las apps");
    if (r === null || busyGuard(r)) return;
    const removed = r.results.filter((x) => x.status === "removed").length;
    const errors = r.results.filter((x) => x.status === "error").length;
    toast(errors ? `${removed} quitada${removed === 1 ? "" : "s"}; ${errors} no se pudo${errors === 1 ? "" : "ieron"} quitar.` : `¡Listo! ${removed} app${removed === 1 ? "" : "s"} quitada${removed === 1 ? "" : "s"}.`, errors ? "error" : "ok");
    state.bloatSel.clear();
    await loadBloat(true);
  });

  async function reinstallBloat(a) {
    const body = el("p", "", `Se descargará ${a.name} desde Microsoft Store. Necesitas conexión a Internet.`);
    if (!(await confirmDialog({ title: `¿Reinstalar ${a.name}?`, body, ok: "Reinstalar" }))) return;
    const r = await api.bloatReinstall([a.id]);
    if (busyGuard(r)) return;
    const res = r.results[0];
    toast(res.status === "reinstalled" ? `${a.name} reinstalada.` : `${a.name}: ${res.reason || "no se pudo reinstalar."}`, res.status === "reinstalled" ? "ok" : "error");
    await loadBloat(true);
  }

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
    $("#bloat-remove-btn").disabled = state.busy || !state.bloatSel.size;
    document.querySelectorAll("[data-bloat-reinstall]").forEach((b) => { b.disabled = state.busy; });
    document.querySelectorAll("[data-profile-btn], [data-uninstall-key]").forEach((b) => { b.disabled = state.busy; });
    document.querySelectorAll("[data-repair-btn]").forEach((b) => {
      b.disabled = state.busy || !!(state.repairState[b.dataset.repairBtn] || {}).running;
    });
  }

  // ------------------------------------------------------------ Arranque
  (async () => {
    state.catalog = await api.catalog();
    $("#demo-pill").classList.toggle("hidden", !state.catalog.mock);
    state.catalog.cleanup.filter((c) => c.recommended).forEach((c) => state.cleanSel.add(c.id));
    renderCleanup();
    renderCats();
    renderApps();
    renderRepairs();
    renderProfiles();
    refreshButtons();
    loadSystem();
  })();
})();
