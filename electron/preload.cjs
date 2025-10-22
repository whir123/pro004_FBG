// CommonJS 版本的 preload
const { contextBridge, ipcRenderer } = require("electron");
// 先只暴露一个空对象；需要再加 API 时往里放
contextBridge.exposeInMainWorld(
  "electronAPI",
  Object.freeze({
    ping: () => ipcRenderer.invoke("ping"),
  })
);
