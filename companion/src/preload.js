const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("promptlyCompanion", {
  getConfig: () => ipcRenderer.invoke("promptly:get-config")
});
