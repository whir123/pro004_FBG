import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {}); // 需要原生能力时再扩展
