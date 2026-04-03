import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { WorkspaceFacade } from "@prism/workspace";
import { registerIpcHandlers } from "./ipc-handlers";

let mainWindow: BrowserWindow | null = null;
let facade: WorkspaceFacade | null = null;

// Register stub IPC handlers that return errors gracefully.
// Called when the workspace backend fails to initialize (e.g. native module missing).
function registerStubHandlers() {
  const channels = [
    "portfolio:list",
    "clients:create",
    "clients:update",
    "projects:create",
    "projects:link",
    "projects:update",
    "projects:getPipeline",
    "projects:getTimeline",
    "sessions:runAction",
  ];
  for (const channel of channels) {
    ipcMain.handle(channel, () => ({
      error: "Workspace not available — database failed to initialize",
    }));
  }
  // Dialog still works without backend
  ipcMain.handle("dialog:selectDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select Project Directory",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}

console.log("[PRISM DEBUG] __dirname =", __dirname);
const preloadPath = join(__dirname, "preload.js");
console.log("[PRISM DEBUG] preload path =", preloadPath);
console.log("[PRISM DEBUG] preload exists =", existsSync(preloadPath));

async function createWindow() {
  try {
    facade = new WorkspaceFacade();
    // Concurrent CLI access: busy_timeout prevents SQLITE_BUSY errors
    facade.context.db.inner.pragma("busy_timeout = 5000");
    registerIpcHandlers(facade);
  } catch (err) {
    console.error("Failed to initialize workspace:", err);
    registerStubHandlers();
  }

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
