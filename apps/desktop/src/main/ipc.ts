/**
 * IPC handler registration.
 * Maps every channel from ipc-channels.ts to its DesktopApi method.
 * All handlers return Result<T> — no raw throws cross the IPC boundary.
 */

import { ipcMain, dialog, type BrowserWindow } from "electron";
import type { DesktopApi } from "./api";
import type { IpcChannel } from "../shared/ipc-channels";
import { ok, err, tryCatch } from "../shared/result";

export function registerIpcHandlers(api: DesktopApi, mainWindow: BrowserWindow): void {
  // Helper: wrap a sync function into a Result-returning IPC handler
  function handleSync<T>(channel: IpcChannel, fn: (...args: unknown[]) => T): void {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        const result = fn(...args);
        console.log(`[prism:ipc] ${channel} → ok`);
        return ok(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[prism:ipc] ${channel} → error:`, message);
        return err(channel.replace(":", "_").toUpperCase() + "_ERROR", message);
      }
    });
  }

  // ── Workspace ──────────────────────────────────────────────────

  handleSync("workspace:status", () => api.workspaceStatus());

  // ── Projects ───────────────────────────────────────────────────

  handleSync("project:list", () => api.listProjects());

  handleSync("project:detail", (id: unknown) => {
    if (typeof id !== "string") throw new Error("project:detail requires a string id");
    return api.projectDetail(id);
  });

  handleSync("project:register", (rootPath: unknown, name: unknown) => {
    if (typeof rootPath !== "string") throw new Error("project:register requires a string rootPath");
    return api.registerProject(rootPath, typeof name === "string" ? name : undefined);
  });

  handleSync("project:setActive", (id: unknown) => {
    if (typeof id !== "string") throw new Error("project:setActive requires a string id");
    api.setActiveProject(id);
  });

  handleSync("project:remove", (id: unknown) => {
    if (typeof id !== "string") throw new Error("project:remove requires a string id");
    api.removeProject(id);
  });

  handleSync("project:health", (id: unknown) => {
    if (typeof id !== "string") throw new Error("project:health requires a string id");
    return api.projectHealth(id);
  });

  // ── App-level ──────────────────────────────────────────────────

  ipcMain.handle("app:selectFolder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select a project folder",
      buttonLabel: "Register Project",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return ok(null);
    }

    return ok(result.filePaths[0]);
  });

  // ── External change polling → renderer refresh ─────────────────

  api.startPolling(() => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workspace:changed");
    }
  });
}

export function removeIpcHandlers(): void {
  const channels: IpcChannel[] = [
    "workspace:status",
    "project:list",
    "project:detail",
    "project:register",
    "project:setActive",
    "project:remove",
    "project:health",
    "app:selectFolder",
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }
}
