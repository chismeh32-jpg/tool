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
