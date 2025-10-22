import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 开发/生产开关：开发态（npm run dev）时为 true | 打包后运行（.exe/.dmg/.AppImage）为 false
const isDev = !app.isPackaged;

function r(...segments) {
  return join(__dirname, "..", ...segments);
};

function createWindow() {
  const WIDTH = 1220;
  const HEIGHT = 860;
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    resizable: false, // 禁止拖拽改变尺寸
    maximizable: false, // 禁止最大化
    fullscreen: false, // 禁止全屏

    minWidth: WIDTH, // 保险：最小=最大=初始
    minHeight: HEIGHT,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,

    webPreferences: {
      preload: r("electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(r("dist", "index.html"));
  };
  win.on("enter-full-screen", () => {win.setFullScreen(false);});
};

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
