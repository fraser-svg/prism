/**
 * Single source of truth for all IPC channel definitions.
 * Main process handlers, preload bridge, and renderer types all derive from this.
 * Adding a channel here without implementing it in all layers causes a compile-time error.
 */

import type { Result } from "./result";
import type { WorkspaceStatus, ProjectBadge, ProjectResume } from "@prism/workspace";
import type { ProjectRow } from "@prism/workspace";

// ── Return types for IPC handlers ──────────────────────────────────

export interface ProjectDetail {
  project: ProjectRow;
  badge: ProjectBadge;
  resume: ProjectResume | null;
  specs: Array<{
    entityId: string;
    title: string | null;
    contentPreview: string | null;
    updatedAt: string;
  }>;
  plans: Array<{
    entityId: string;
    title: string | null;
    contentPreview: string | null;
    updatedAt: string;
  }>;
  recentRuns: Array<{
    entityId: string;
    title: string | null;
    updatedAt: string;
  }>;
}

export interface RegisterProjectResult {
  project: ProjectRow;
}

// ── Channel map: channel name → [args tuple, return type] ──────────

export interface IpcChannelMap {
  "workspace:status": [args: [], ret: WorkspaceStatus];
  "project:list": [args: [], ret: ProjectRow[]];
  "project:detail": [args: [id: string], ret: ProjectDetail];
  "project:register": [args: [rootPath: string, name?: string], ret: RegisterProjectResult];
  "project:setActive": [args: [id: string], ret: void];
  "project:remove": [args: [id: string], ret: void];
  "project:health": [args: [id: string], ret: ProjectBadge];
  "app:selectFolder": [args: [], ret: string | null];
}

// ── Derived types for type-safe IPC ────────────────────────────────

/** Extract the args tuple for a given channel. */
export type IpcArgs<C extends keyof IpcChannelMap> = IpcChannelMap[C][0];

/** Extract the unwrapped return type for a given channel. */
export type IpcReturn<C extends keyof IpcChannelMap> = IpcChannelMap[C][1];

/** The actual return type over IPC (always wrapped in Result). */
export type IpcResult<C extends keyof IpcChannelMap> = Result<IpcReturn<C>>;

/** All channel names as a union type. */
export type IpcChannel = keyof IpcChannelMap;

/** Channel names as a runtime array for registration. */
export const IPC_CHANNELS: IpcChannel[] = [
  "workspace:status",
  "project:list",
  "project:detail",
  "project:register",
  "project:setActive",
  "project:remove",
  "project:health",
  "app:selectFolder",
] as const;
