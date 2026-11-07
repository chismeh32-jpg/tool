const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const backend = require("./backend");
const CLEANUP = require("./data/cleanup");
const TWEAKS = require("./data/tweaks");
const APPS = require("./data/apps");

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
  win.once("ready-to-show", () => win.show());
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
const log = (text) => send("toolbox:log", { text, time: Date.now() });
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

ipcMain.handle("catalog", () => ({ cleanup: publicCleanup, tweaks: publicTweaks, apps: APPS, mock: backend.isMock }));
ipcMain.handle("system:info", () => backend.systemInfo().catch((e) => ({ error: e.message })));
ipcMain.handle("system:restorePoint", () => exclusive(() => backend.createRestorePoint(log)));
ipcMain.handle("system:restartExplorer", () => exclusive(() => backend.restartExplorer(log)));

ipcMain.handle("cleanup:scan", (_e, ids) =>
  exclusive(() => backend.cleanupScan(validIds(ids, CLEANUP), progress("scan"))));
ipcMain.handle("cleanup:run", (_e, ids, opts = {}) => exclusive(async () => {
  const list = validIds(ids, CLEANUP);
  if (opts.restorePoint) {
    const rp = await backend.createRestorePoint(log);
    if (!rp.ok && !opts.continueWithoutRestorePoint) return { aborted: true, restorePoint: rp };
  }
  return { results: await backend.cleanupRun(list, log, progress("clean")) };
}));

ipcMain.handle("tweaks:status", () => backend.tweaksStatus().catch((e) => ({ error: e.message })));
ipcMain.handle("tweaks:set", (_e, ids, enable, opts = {}) => exclusive(async () => {
  const list = validIds(ids, TWEAKS);
  if (opts.restorePoint) {
    const rp = await backend.createRestorePoint(log);
    if (!rp.ok && !opts.continueWithoutRestorePoint) return { aborted: true, restorePoint: rp };
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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
