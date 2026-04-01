import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { WorkspaceFacade } from "@prism/workspace";
import { registerIpcHandlers } from "./ipc-handlers";

let mainWindow: BrowserWindow | null = null;
let facade: WorkspaceFacade | null = null;

async function createWindow() {
  facade = new WorkspaceFacade();

  // Concurrent CLI access: busy_timeout prevents SQLITE_BUSY errors
  facade.context.db.inner.pragma("busy_timeout = 5000");

  registerIpcHandlers(facade);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    title: "Prism",
    backgroundColor: "#0a0a0f",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  facade?.close();
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
