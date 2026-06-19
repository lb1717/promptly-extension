const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("promptlyCompanion", {
  getConfig: () => ipcRenderer.invoke("promptly:get-config"),
  refreshConfig: () => ipcRenderer.invoke("promptly:refresh-config"),
  openExternal: (url) => ipcRenderer.invoke("promptly:open-external", url),
  getAppInfo: () => ipcRenderer.invoke("promptly:get-app-info"),
  getPermissionStatus: () => ipcRenderer.invoke("promptly:get-permission-status"),
  requestAllPermissions: () => ipcRenderer.invoke("promptly:request-all-permissions"),
  completePermissionsOnboarding: () => ipcRenderer.invoke("promptly:complete-permissions-onboarding"),
  openNewWindow: () => ipcRenderer.invoke("promptly:open-window"),
  closeWindow: () => ipcRenderer.invoke("promptly:close-window"),
  getSettings: () => ipcRenderer.invoke("promptly:get-settings"),
  saveSettings: (patch) => ipcRenderer.invoke("promptly:save-settings", patch),
  setCollapsed: (collapsed) => ipcRenderer.invoke("promptly:set-collapsed", collapsed),
  pasteToHost: (text) => ipcRenderer.invoke("promptly:paste-to-host", text),
  requestMicrophoneAccess: () => ipcRenderer.invoke("promptly:request-microphone-access")
});
