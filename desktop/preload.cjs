const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("redactDesktop", Object.freeze({
  platform: process.platform,
  getAiStatus: () => ipcRenderer.invoke("redact:ai-status"),
  configureAi: enabled => ipcRenderer.invoke("redact:configure-ai", enabled),
  analyzeContext: text => ipcRenderer.invoke("redact:analyze-context", text),
  cancelAnalysis: () => ipcRenderer.invoke("redact:cancel-analysis"),
  getHistory: () => ipcRenderer.invoke("redact:history"),
  setHistoryEnabled: enabled => ipcRenderer.invoke("redact:set-history", enabled),
  saveSummary: kinds => ipcRenderer.invoke("redact:save-summary", kinds),
  clearHistory: () => ipcRenderer.invoke("redact:clear-history"),
  copyText: text => ipcRenderer.invoke("redact:copy-text", text),
}));
