/**
 * Preload script: exposes typed API to renderer via contextBridge.
 *
 * The renderer accesses window.prism.* — no direct Node.js or Electron access.
 * Every call returns Result<T> (ok/error, never raw exceptions).
 */

import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel, IpcChannelMap, IpcResult } from "../shared/ipc-channels";

/** Type-safe invoke wrapper. */
function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcChannelMap[C][0]
): Promise<IpcResult<C>> {
  return ipcRenderer.invoke(channel, ...args);
}

/** The API exposed to the renderer via window.prism. */
const prismApi = {
  workspace: {
    status: () => invoke("workspace:status"),
    onChanged: (callback: () => void) => {
      ipcRenderer.on("workspace:changed", callback);
      return () => {
        ipcRenderer.removeListener("workspace:changed", callback);
      };
    },
  },
  project: {
    list: () => invoke("project:list"),
    detail: (id: string) => invoke("project:detail", id),
    register: (rootPath: string, name?: string) =>
      invoke("project:register", rootPath, name),
    setActive: (id: string) => invoke("project:setActive", id),
    remove: (id: string) => invoke("project:remove", id),
    health: (id: string) => invoke("project:health", id),
  },
  app: {
    selectFolder: () => invoke("app:selectFolder"),
  },
} as const;

export type PrismApi = typeof prismApi;

contextBridge.exposeInMainWorld("prism", prismApi);
