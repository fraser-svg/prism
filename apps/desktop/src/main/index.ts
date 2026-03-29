/**
 * Electron main process entry point.
 *
 * Architecture decision #7: Show window immediately with static shell (#1A1917 bg),
 * hydrate workspace data asynchronously via IPC after the window is visible.
 *
 * Architecture decision #4: Wire db.close() into Electron lifecycle via
 * before-quit and will-quit events.
 */

import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { DesktopApi } from "./api";
import { registerIpcHandlers, removeIpcHandlers } from "./ipc";

let mainWindow: BrowserWindow | null = null;
let api: DesktopApi | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#1A1917",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    show: true, // Show immediately — dark bg is already set
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Open DevTools in dev mode for debugging
  if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  // Log any load failures
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`[prism] Failed to load: ${errorCode} ${errorDescription}`);
  });

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[prism] Preload error in ${preloadPath}:`, error);
  });

  // Load renderer
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  console.log(`[prism] ELECTRON_RENDERER_URL = ${devUrl}`);
  console.log(`[prism] VITE_DEV_SERVER_URL = ${process.env.VITE_DEV_SERVER_URL}`);
  console.log(`[prism] __dirname = ${__dirname}`);

  if (devUrl) {
    console.log(`[prism] Loading dev URL: ${devUrl}`);
    win.loadURL(devUrl);
  } else if (process.env.VITE_DEV_SERVER_URL) {
    console.log(`[prism] Loading VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL}`);
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const filePath = join(__dirname, "../renderer/index.html");
    console.log(`[prism] Loading file: ${filePath}`);
    win.loadFile(filePath);
  }

  return win;
}

app.whenReady().then(() => {
  console.log("[prism] App ready, initializing...");

  // Initialize the API (creates WorkspaceFacade, opens SQLite)
  try {
    api = new DesktopApi();
    console.log("[prism] DesktopApi initialized");
  } catch (err) {
    console.error("[prism] Failed to initialize DesktopApi:", err);
    // Still create the window — show error state rather than nothing
  }

  mainWindow = createWindow();

  // Register IPC handlers (bridges renderer to @prism/* packages)
  if (api) {
    registerIpcHandlers(api, mainWindow);
    console.log("[prism] IPC handlers registered");
  }

  // macOS: re-create window when dock icon is clicked
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      if (api) {
        registerIpcHandlers(api, mainWindow);
      }
    }
  });
});

// ── Lifecycle cleanup ────────────────────────────────────────────

app.on("before-quit", () => {
  if (api) {
    api.close();
    api = null;
  }
  removeIpcHandlers();
});

// macOS: closing all windows doesn't quit the app
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
