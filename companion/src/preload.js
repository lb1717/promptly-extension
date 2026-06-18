const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("promptlyCompanion", {
  getConfig: () => ipcRenderer.invoke("promptly:get-config"),
  openNewWindow: () => ipcRenderer.invoke("promptly:open-window"),
  closeWindow: () => ipcRenderer.invoke("promptly:close-window"),
  getSettings: () => ipcRenderer.invoke("promptly:get-settings"),
  saveSettings: (patch) => ipcRenderer.invoke("promptly:save-settings", patch),
  setCollapsed: (collapsed) => ipcRenderer.invoke("promptly:set-collapsed", collapsed),
  pasteToHost: (text) => ipcRenderer.invoke("promptly:paste-to-host", text)
});
