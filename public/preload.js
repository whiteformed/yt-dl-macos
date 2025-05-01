const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  fetchVideoMetadata: async (url) =>
    await ipcRenderer.invoke("fetch-video-metadata", url),
  downloadVideo: (data) => ipcRenderer.send("download-video", data),
  onDownloadProgress: (callback) =>
    ipcRenderer.on("download-progress", (_event, data) => callback(data)),
  onDownloadError: (callback) =>
    ipcRenderer.on("download-error", (_event, error) => callback(error)),
  onGenericError: (callback) =>
    ipcRenderer.on("generic-error", (_event, error) => callback(error)),
  selectFolder: async () => await ipcRenderer.invoke("select-folder"),
  storeGet: async (key) => await ipcRenderer.invoke("store-get", key),
  storeSet: async (key, value) =>
    await ipcRenderer.invoke("store-set", key, value),
  performGlobalReset: () => ipcRenderer.send("global-reset"),
});
