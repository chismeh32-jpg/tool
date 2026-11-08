// Puente seguro entre la interfaz y el proceso principal.
// La interfaz solo puede pedir acciones con nombre; nunca ejecutar comandos libres.
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("toolbox", {
  catalog: () => ipcRenderer.invoke("catalog"),
  systemInfo: () => ipcRenderer.invoke("system:info"),
  createRestorePoint: (opts) => ipcRenderer.invoke("system:restorePoint", opts),
  openLogs: () => ipcRenderer.invoke("system:openLogs"),
  checkUpdate: () => ipcRenderer.invoke("app:checkUpdate"),
  openRelease: (url) => ipcRenderer.invoke("app:openRelease", url),
  reboot: () => ipcRenderer.invoke("system:reboot"),
  runRepair: (id, opts) => ipcRenderer.invoke("repairs:run", id, opts),
  bloatStatus: () => ipcRenderer.invoke("bloat:status"),
  profilePlan: (id) => ipcRenderer.invoke("profiles:plan", id),
  profileApply: (id, sel, opts) => ipcRenderer.invoke("profiles:apply", id, sel, opts),
  programsList: () => ipcRenderer.invoke("uninstall:list"),
  programUninstall: (key) => ipcRenderer.invoke("uninstall:run", key),
  stopWaitingUninstall: () => ipcRenderer.invoke("uninstall:stopWaiting"),
  cleanLeftovers: (ids) => ipcRenderer.invoke("uninstall:clean", ids),
  openBackups: () => ipcRenderer.invoke("system:openBackups"),
  gfxState: () => ipcRenderer.invoke("gfx:state"),
  gfxNvidia: (action, arg) => ipcRenderer.invoke("gfx:nvidia", action, arg),
  gfxAmd: (action, arg) => ipcRenderer.invoke("gfx:amd", action, arg),
  gfxWindows: (key, enable) => ipcRenderer.invoke("gfx:windows", key, enable),
  gfxTelemetry: (enable) => ipcRenderer.invoke("gfx:telemetry", enable),
  bloatRemove: (ids, opts) => ipcRenderer.invoke("bloat:remove", ids, opts),
  bloatReinstall: (ids) => ipcRenderer.invoke("bloat:reinstall", ids),
  restartExplorer: () => ipcRenderer.invoke("system:restartExplorer"),
  cleanupScan: (ids) => ipcRenderer.invoke("cleanup:scan", ids),
  cleanupRun: (ids, opts) => ipcRenderer.invoke("cleanup:run", ids, opts),
  tweaksStatus: () => ipcRenderer.invoke("tweaks:status"),
  tweaksSet: (ids, enable, opts) => ipcRenderer.invoke("tweaks:set", ids, enable, opts),
  appsCheck: () => ipcRenderer.invoke("apps:check"),
  appsInstall: (ids) => ipcRenderer.invoke("apps:install", ids),
  appsUpgradeAll: () => ipcRenderer.invoke("apps:upgradeAll"),
  onLog: on("toolbox:log"),
  onProgress: on("toolbox:progress"),
  onBusy: on("toolbox:busy"),
});
