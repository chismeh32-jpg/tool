const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const backend = require("./backend");
const CLEANUP = require("./data/cleanup");
const TWEAKS = require("./data/tweaks");
const APPS = require("./data/apps");
const REPAIRS = require("./data/repairs");
const BLOATWARE = require("./data/bloatware");
const profiles = require("./backend/profiles");
const GFX = require("./data/graphics");

let win = null;
let busy = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: "ToolBox",
    backgroundColor: "#0f1117",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "ui", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => { log("Ventana lista."); win.show(); });
  win.webContents.on("did-finish-load", () => log("Interfaz cargada."));
  // Si algo falla al cargar la interfaz, que quede en el registro (sirve para pedir ayuda)
  win.webContents.on("did-fail-load", (_e, code, desc, url) => log(`✖ No se pudo cargar la interfaz: ${desc} (${code}) ${url}`));
  win.webContents.on("render-process-gone", (_e, d) => log(`✖ La interfaz se cerró inesperadamente: ${d.reason} (código ${d.exitCode})`));
  win.webContents.on("preload-error", (_e, p, err) => log(`✖ Error en ${path.basename(p)}: ${err && err.message}`));
  win.on("unresponsive", () => log("⚠ La ventana no responde."));
  win.loadFile(path.join(__dirname, "ui", "index.html"));

  // Los enlaces externos se abren en el navegador, nunca dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

// ------------------------------------------------------------------ Utilidades IPC
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
// El registro se muestra en «Actividad» y además se guarda en un archivo por día
// (%APPDATA%\ToolBox\logs) para poder pedir ayuda si algo falla.
let logFile = null;
function logPath() {
  if (!logFile) {
    const dir = app.getPath("logs");
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, `toolbox-${new Date().toISOString().slice(0, 10)}.log`);
    // Los registros de más de 30 días sobran
    try {
      const limit = Date.now() - 30 * 24 * 3600 * 1000;
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (/^toolbox-\d{4}-\d{2}-\d{2}\.log$/.test(f) && fs.statSync(full).mtimeMs < limit) fs.rmSync(full, { force: true });
      }
    } catch { /* no es grave */ }
  }
  return logFile;
}
const log = (text) => {
  const time = Date.now();
  send("toolbox:log", { text, time });
  try { fs.appendFileSync(logPath(), `[${new Date(time).toISOString()}] ${text}\n`, "utf8"); } catch { /* sin disco: solo pantalla */ }
};
const progress = (kind) => (id, data) => send("toolbox:progress", { kind, id, data });

/** Solo se aceptan identificadores que existen en nuestros catálogos. */
function validIds(ids, catalog) {
  if (!Array.isArray(ids)) return [];
  const known = new Set(catalog.map((c) => c.id));
  return [...new Set(ids.filter((id) => typeof id === "string" && known.has(id)))];
}

/** Las operaciones que tocan el sistema se ejecutan de una en una. */
async function exclusive(fn) {
  if (busy) return { error: "busy" };
  busy = true;
  send("toolbox:busy", true);
  try {
    return await fn();
  } catch (e) {
    log("✖ Error inesperado: " + (e && e.message ? e.message : e));
    return { error: String(e && e.message ? e.message : e) };
  } finally {
    busy = false;
    send("toolbox:busy", false);
  }
}

// Quitamos los fragmentos de PowerShell antes de enviar los catálogos a la interfaz
const publicCleanup = CLEANUP.map(({ id, name, icon, summary, details, after, risk, recommended, admin, slow }) =>
  ({ id, name, icon, summary, details, after, risk, recommended, admin, slow: !!slow }));
const publicTweaks = TWEAKS.map(({ id, category, name, summary, details, risk, restart, admin }) =>
  ({ id, category, name, summary, details, risk, restart, admin: !!admin || false }));

const publicRepairs = REPAIRS.map(({ steps, ...rest }) => ({ ...rest, steps: steps.map((s) => s.label) }));

const publicBloat = { groups: BLOATWARE.GROUPS, apps: BLOATWARE.APPS.map(({ preRemove, ...rest }) => ({ ...rest, canReinstall: !!rest.storeId })) };

ipcMain.handle("catalog", () => ({ cleanup: publicCleanup, tweaks: publicTweaks, apps: APPS, repairs: publicRepairs, bloat: publicBloat, profiles: profiles.PROFILES, graphics: GFX, mock: backend.isMock }));
ipcMain.handle("bloat:status", () => backend.bloatStatus().catch((e) => ({ error: e.message })));
ipcMain.handle("bloat:remove", (_e, ids, opts = {}) => exclusive(async () => {
  const list = validIds(ids, BLOATWARE.APPS);
  if (opts.restorePoint) {
    const rp = await backend.createRestorePoint(log, { allowEnable: !!opts.allowEnableRestore });
    if (!rp.ok) return { aborted: true, restorePoint: rp };
  }
  return { results: await backend.bloatRemove(list, log, progress("bloat")) };
}));
ipcMain.handle("bloat:reinstall", (_e, ids) =>
  exclusive(async () => ({ results: await backend.bloatReinstall(validIds(ids, BLOATWARE.APPS), log, progress("bloat")) })));
ipcMain.handle("system:info", () => backend.systemInfo().catch((e) => ({ error: e.message })));
ipcMain.handle("system:restorePoint", (_e, opts = {}) =>
  exclusive(() => backend.createRestorePoint(log, { allowEnable: !!opts.allowEnable })));
ipcMain.handle("system:reboot", () => exclusive(() => backend.reboot(log)));
ipcMain.handle("repairs:run", (_e, id, opts = {}) => exclusive(async () => {
  const [rid] = validIds([id], REPAIRS);
  if (!rid) return { error: "unknown" };
  if (opts.restorePoint) {
    const rp = await backend.createRestorePoint(log, { allowEnable: !!opts.allowEnableRestore });
    if (!rp.ok) return { aborted: true, restorePoint: rp };
  }
  return backend.runRepair(rid, log, (p) => send("toolbox:progress", { kind: "repair", id: rid, data: p }));
}));
// ---- Perfiles de un clic
ipcMain.handle("profiles:plan", (_e, id) => exclusive(() => profiles.planProfile(backend, id)));
ipcMain.handle("profiles:apply", (_e, id, sel = {}, opts = {}) => exclusive(async () => {
  const p = profiles.PROFILES.find((x) => x.id === id);
  if (!p) return { error: "unknown" };
  // Solo lo que el perfil incluye; la interfaz puede desmarcar, nunca añadir
  const pick = (kind) => (Array.isArray(sel[kind]) ? sel[kind] : []).filter((x) => p[kind].includes(x));
  const chosen = { tweaks: pick("tweaks"), bloat: pick("bloat"), cleanup: pick("cleanup") };
  if (opts.restorePoint) {
    const rp = await backend.createRestorePoint(log, { allowEnable: !!opts.allowEnableRestore });
    if (!rp.ok) return { aborted: true, restorePoint: rp };
  }
  log(`▶ Aplicando el perfil «${p.name}»`);
  const r = await profiles.applyProfile(backend, chosen, log, (ph) => send("toolbox:progress", { kind: "profile", id, data: ph }));
  log(`✔ Perfil «${p.name}» aplicado.`);
  return r;
}));

// ---- Desinstalador completo
let programCache = new Map();
let leftoverCache = [];
let uninstallSignal = null;
ipcMain.handle("uninstall:list", async () => {
  try {
    const list = await backend.programsList();
    programCache = new Map(list.map((p) => [p.key, p]));
    return list.map(({ uninstall, quiet, ...rest }) => rest);
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle("uninstall:run", (_e, key) => exclusive(async () => {
  const entry = programCache.get(key);
  if (!entry) return { error: "unknown" };
  uninstallSignal = { aborted: false };
  const result = await backend.programUninstall(entry, log, { signal: uninstallSignal });
  uninstallSignal = null;
  leftoverCache = [];
  if (result.uninstalled) {
    log("Buscando restos…");
    const others = [...programCache.values()].filter((p) => p.key !== key);
    leftoverCache = (await backend.leftoversScan(entry, others)).map((l, i) => ({ ...l, id: `l${i}` }));
    log(leftoverCache.length ? `Encontrados ${leftoverCache.length} restos.` : "✔ No quedan restos.");
    programCache.delete(key);
  }
  return { ...result, leftovers: leftoverCache };
}));
ipcMain.handle("uninstall:stopWaiting", () => { if (uninstallSignal) uninstallSignal.aborted = true; return true; });
ipcMain.handle("uninstall:clean", (_e, ids) => exclusive(async () => {
  const items = leftoverCache.filter((l) => Array.isArray(ids) && ids.includes(l.id));
  const results = await backend.leftoversClean(items, path.join(app.getPath("userData"), "backups"), log);
  leftoverCache = [];
  return { results };
}));
ipcMain.handle("system:openBackups", () => {
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});
// ---- Gráficos
// Antes del primer cambio se guardan los valores que tenía el usuario, para «Volver a como lo tenía».
const gfxBackupFile = () => path.join(app.getPath("userData"), "graphics-backup.json");
const readGfxBackup = () => { try { return JSON.parse(fs.readFileSync(gfxBackupFile(), "utf8")); } catch { return {}; } };
const writeGfxBackup = (b) => { fs.mkdirSync(path.dirname(gfxBackupFile()), { recursive: true }); fs.writeFileSync(gfxBackupFile(), JSON.stringify(b, null, 2)); };
const amdCurrent = (st) => {
  const out = {};
  for (const [k, f] of Object.entries((st && st.features) || {})) if (f.supported) { out[k] = f.enabled ? 1 : 0; if (k === "sharpening" && f.sharpness != null) out.sharpness = f.sharpness; }
  return out;
};

ipcMain.handle("gfx:state", () => exclusive(async () => {
  const [detect, nvidia, amd, win, tasks] = await Promise.all([
    backend.gpuDetect(), backend.nvidiaState(), backend.amdState(), backend.windowsState(), backend.nvidiaTelemetryTasks(),
  ]);
  const b = readGfxBackup();
  return { detect, nvidia, amd, win, tasks, backup: { nvidia: !!b.nvidia, amd: !!b.amd } };
}));
ipcMain.handle("gfx:nvidia", (_e, action, arg) => exclusive(async () => {
  const keys = GFX.NVIDIA.map((s) => s.key);
  const b = readGfxBackup();
  if (action === "preset" || action === "set") {
    const values = action === "preset" ? (GFX.NVIDIA_PRESETS.find((p) => p.id === arg) || {}).values : arg;
    if (!values) return { error: "unknown" };
    if (!b.nvidia) { const st = await backend.nvidiaState(); if (st.values) { b.nvidia = st.values; writeGfxBackup(b); } }
    return backend.nvidiaApply(values, log);
  }
  if (action === "backup") {
    if (!b.nvidia) return { error: "nobackup" };
    const r = await backend.nvidiaApply(b.nvidia, log);
    if (r.ok) { delete b.nvidia; writeGfxBackup(b); }
    return r;
  }
  if (action === "factory") { const r = await backend.nvidiaFactory(keys, log); if (r.ok) { delete b.nvidia; writeGfxBackup(b); } return r; }
  return { error: "unknown" };
}));
ipcMain.handle("gfx:amd", (_e, action, arg) => exclusive(async () => {
  const b = readGfxBackup();
  if (action === "preset" || action === "set") {
    const values = action === "preset" ? (GFX.AMD_PRESETS.find((p) => p.id === arg) || {}).values : arg;
    if (!values) return { error: "unknown" };
    if (!b.amd) { b.amd = amdCurrent(await backend.amdState()); writeGfxBackup(b); }
    return backend.amdApply(values, log);
  }
  if (action === "backup") {
    if (!b.amd) return { error: "nobackup" };
    const r = await backend.amdApply(b.amd, log);
    if (r.ok) { delete b.amd; writeGfxBackup(b); }
    return r;
  }
  return { error: "unknown" };
}));
ipcMain.handle("gfx:windows", (_e, key, enable) => exclusive(() => {
  if (!GFX.WINDOWS.find((w) => w.key === key)) return { error: "unknown" };
  return backend.windowsSet(key, !!enable, log);
}));
ipcMain.handle("gfx:telemetry", (_e, enable) => exclusive(() => backend.nvidiaTelemetrySet(!!enable, log)));
ipcMain.handle("system:openLogs", () => shell.openPath(path.dirname(logPath())));
ipcMain.handle("system:restartExplorer", () => exclusive(() => backend.restartExplorer(log)));

ipcMain.handle("cleanup:scan", (_e, ids) =>
  exclusive(() => backend.cleanupScan(validIds(ids, CLEANUP), progress("scan"))));
ipcMain.handle("cleanup:run", (_e, ids, opts = {}) => exclusive(async () => {
  const list = validIds(ids, CLEANUP);
  if (opts.restorePoint) {
    const rp = await backend.createRestorePoint(log, { allowEnable: !!opts.allowEnableRestore });
    if (!rp.ok) return { aborted: true, restorePoint: rp };
  }
  return { results: await backend.cleanupRun(list, log, progress("clean")) };
}));

ipcMain.handle("tweaks:status", () => backend.tweaksStatus().catch((e) => ({ error: e.message })));
ipcMain.handle("tweaks:set", (_e, ids, enable, opts = {}) => exclusive(async () => {
  const list = validIds(ids, TWEAKS);
  if (opts.restorePoint) {
    const rp = await backend.createRestorePoint(log, { allowEnable: !!opts.allowEnableRestore });
    if (!rp.ok) return { aborted: true, restorePoint: rp };
  }
  const results = [];
  for (const id of list) results.push({ id, ...(await backend.tweakSet(id, !!enable, log)) });
  return { results };
}));

ipcMain.handle("apps:check", async () => {
  const winget = await backend.wingetAvailable();
  return { winget, installed: winget ? await backend.appsInstalled() : {} };
});
ipcMain.handle("apps:install", (_e, ids) =>
  exclusive(async () => ({ results: await backend.appsInstall(validIds(ids, APPS), log, progress("install")) })));
ipcMain.handle("apps:upgradeAll", () => exclusive(() => backend.appsUpgradeAll(log)));

app.on("child-process-gone", (_e, d) => log(`⚠ Proceso interno cerrado: ${d.type} – ${d.reason} (código ${d.exitCode})`));
app.whenReady().then(() => {
  log(`ToolBox ${app.getVersion()} iniciado${backend.isMock ? " (modo demostración)" : ""}.`);
  createWindow();
});
app.on("window-all-closed", () => app.quit());
