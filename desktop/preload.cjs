const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("redactDesktop", Object.freeze({
  platform: process.platform,
  getHistory: () => ipcRenderer.invoke("redact:history"),
  setHistoryEnabled: enabled => ipcRenderer.invoke("redact:set-history", enabled),
  saveSummary: kinds => ipcRenderer.invoke("redact:save-summary", kinds),
  clearHistory: () => ipcRenderer.invoke("redact:clear-history"),
  copyText: text => ipcRenderer.invoke("redact:copy-text", text),
}));
