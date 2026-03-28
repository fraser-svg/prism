import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceDatabase } from "./workspace-database";
import type { WorkspaceSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export interface WorkspaceContext {
  homePath: AbsolutePath;
  dbPath: AbsolutePath;
  settingsPath: AbsolutePath;
  settings: WorkspaceSettings;
  db: WorkspaceDatabase;
}

export class WorkspaceManager {
  static initialize(homePath?: AbsolutePath): WorkspaceContext {
    const home = homePath ?? (join(homedir(), ".prism") as AbsolutePath);
    const dbPath = join(home, "workspace.db") as AbsolutePath;
    const settingsPath = join(home, "settings.json") as AbsolutePath;

    // Ensure home directory exists
    try {
      const stat = statSync(home);
      if (!stat.isDirectory()) {
        throw new Error(`${home} exists but is not a directory`);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        mkdirSync(home, { recursive: true, mode: 0o700 });
      } else {
        throw err;
      }
    }

    // Load or create settings
    const settings = WorkspaceManager.loadOrCreateSettings(settingsPath);

    // Open database (runs migrations)
    const db = WorkspaceDatabase.open(dbPath);

    return { homePath: home as AbsolutePath, dbPath, settingsPath, settings, db };
  }

  private static loadOrCreateSettings(
    settingsPath: AbsolutePath,
  ): WorkspaceSettings {
    try {
      const raw = readFileSync(settingsPath, "utf-8");
      const parsed = JSON.parse(raw);
      return WorkspaceManager.mergeSettings(parsed);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Create default settings
        const settings: WorkspaceSettings = {
          ...DEFAULT_SETTINGS,
          workspaceId: randomUUID(),
        };
        writeFileSync(
          settingsPath,
          JSON.stringify(settings, null, 2) + "\n",
          "utf-8",
        );
        return settings;
      }

      // Corrupt JSON — backup and recreate
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      try {
        const raw = readFileSync(settingsPath, "utf-8");
        writeFileSync(`${settingsPath}.corrupt.${timestamp}`, raw, "utf-8");
      } catch {
        // Best-effort backup
      }

      const settings: WorkspaceSettings = {
        ...DEFAULT_SETTINGS,
        workspaceId: randomUUID(),
      };
      writeFileSync(
        settingsPath,
        JSON.stringify(settings, null, 2) + "\n",
        "utf-8",
      );
      return settings;
    }
  }

  private static mergeSettings(parsed: unknown): WorkspaceSettings {
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_SETTINGS, workspaceId: randomUUID() };
    }

    const obj = parsed as Record<string, unknown>;

    const workspaceId =
      typeof obj.workspaceId === "string" && obj.workspaceId.length > 0
        ? obj.workspaceId
        : randomUUID();

    const defaultProjectId =
      typeof obj.defaultProjectId === "string" ? obj.defaultProjectId : null;

    const stalenessThresholdDays =
      typeof obj.stalenessThresholdDays === "number" &&
      obj.stalenessThresholdDays > 0
        ? obj.stalenessThresholdDays
        : DEFAULT_SETTINGS.stalenessThresholdDays;

    const autoDetectProjects =
      typeof obj.autoDetectProjects === "boolean"
        ? obj.autoDetectProjects
        : DEFAULT_SETTINGS.autoDetectProjects;

    return {
      workspaceId,
      defaultProjectId,
      stalenessThresholdDays,
      autoDetectProjects,
    };
  }

  static writeSettings(
    settingsPath: AbsolutePath,
    settings: WorkspaceSettings,
  ): void {
    try {
      writeFileSync(
        settingsPath,
        JSON.stringify(settings, null, 2) + "\n",
        "utf-8",
      );
    } catch (err) {
      throw new Error(
        `Failed to write workspace settings: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
