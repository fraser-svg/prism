import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { AbsolutePath } from "@prism/core";
import { EventLog } from "./event-log";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceSettings } from "./types";

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  rootPath: string;
  status: string;
  primaryPlatform: string | null;
  productType: string | null;
  autodetectDismissed: boolean;
  registeredAt: string;
  lastAccessedAt: string | null;
}

export interface AutoDetectResult {
  suggest: boolean;
  rootPath: string;
  name: string;
}

export class ProjectRegistry {
  private eventLog: EventLog;

  constructor(
    private db: Database.Database,
    private settingsPath: AbsolutePath,
    private settings: WorkspaceSettings,
  ) {
    this.eventLog = new EventLog(db);
  }

  register(rootPath: string, name?: string): ProjectRow {
    const absPath = resolve(rootPath);
    const projectName = name ?? this.nameFromPath(absPath);

    // Check for existing row (resurrection or idempotent)
    const existing = this.db
      .prepare("SELECT * FROM projects WHERE root_path = ?")
      .get(absPath) as RawProjectRow | undefined;

    if (existing) {
      if (existing.status === "active") {
        return this.toProjectRow(existing);
      }
      // Resurrect dismissed or archived
      this.db
        .prepare(
          "UPDATE projects SET status = 'active', autodetect_dismissed = 0, name = ?, last_accessed_at = datetime('now') WHERE id = ?",
        )
        .run(projectName, existing.id);
      this.eventLog.append({
        projectId: existing.id,
        eventType: "project:registered",
        summary: `Re-registered project: ${projectName}`,
      });
      return this.toProjectRow({
        ...existing,
        status: "active",
        autodetect_dismissed: 0,
        name: projectName,
      });
    }

    const id = randomUUID();
    const slug = this.generateSlug(projectName);

    this.db
      .prepare(
        "INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)",
      )
      .run(id, projectName, slug, absPath);

    this.eventLog.append({
      projectId: id,
      eventType: "project:registered",
      summary: `Registered project: ${projectName}`,
    });

    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as RawProjectRow;
    return this.toProjectRow(row);
  }

  get(id: string): ProjectRow | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as RawProjectRow | undefined;
    return row ? this.toProjectRow(row) : null;
  }

  list(options?: { includeArchived?: boolean }): ProjectRow[] {
    const includeArchived = options?.includeArchived ?? false;
    const query = includeArchived
      ? "SELECT * FROM projects WHERE status != 'dismissed' ORDER BY last_accessed_at DESC NULLS LAST"
      : "SELECT * FROM projects WHERE status = 'active' ORDER BY last_accessed_at DESC NULLS LAST";

    const rows = this.db.prepare(query).all() as RawProjectRow[];
    return rows.map((r) => this.toProjectRow(r));
  }

  setActive(id: string): void {
    const project = this.get(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    // Write settings first — if this fails, DB stays unchanged
    const updatedSettings = { ...this.settings, defaultProjectId: id };
    WorkspaceManager.writeSettings(this.settingsPath, updatedSettings);
    this.settings.defaultProjectId = id;

    this.db
      .prepare(
        "UPDATE projects SET last_accessed_at = datetime('now') WHERE id = ?",
      )
      .run(id);

    this.eventLog.append({
      projectId: id,
      eventType: "project:switched",
      summary: `Switched to project: ${project.name}`,
    });
  }

  remove(id: string): void {
    const project = this.get(id);
    if (!project) return;

    this.db
      .prepare("UPDATE projects SET status = 'archived' WHERE id = ?")
      .run(id);

    this.eventLog.append({
      projectId: id,
      eventType: "project:archived",
      summary: `Archived project: ${project.name}`,
    });
  }

  autoDetect(rootPath: string): AutoDetectResult {
    const absPath = resolve(rootPath);
    const prismDir = `${absPath}/.prism`;

    if (!existsSync(prismDir)) {
      return { suggest: false, rootPath: absPath, name: "" };
    }

    const existing = this.db
      .prepare("SELECT * FROM projects WHERE root_path = ?")
      .get(absPath) as RawProjectRow | undefined;

    if (existing) {
      return { suggest: false, rootPath: absPath, name: existing.name };
    }

    return {
      suggest: true,
      rootPath: absPath,
      name: this.nameFromPath(absPath),
    };
  }

  dismissAutoDetect(rootPath: string): void {
    const absPath = resolve(rootPath);

    const existing = this.db
      .prepare("SELECT id FROM projects WHERE root_path = ?")
      .get(absPath) as { id: string } | undefined;

    if (existing) {
      this.db
        .prepare(
          "UPDATE projects SET status = 'dismissed', autodetect_dismissed = 1 WHERE id = ?",
        )
        .run(existing.id);
    } else {
      const id = randomUUID();
      const name = this.nameFromPath(absPath);
      const slug = this.generateSlug(name);
      this.db
        .prepare(
          "INSERT INTO projects (id, name, slug, root_path, status, autodetect_dismissed) VALUES (?, ?, ?, ?, 'dismissed', 1)",
        )
        .run(id, name, slug, absPath);
    }
  }

  private nameFromPath(absPath: string): string {
    return absPath.split("/").pop() ?? "unnamed";
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existing = this.db
      .prepare("SELECT slug FROM projects WHERE slug = ?")
      .get(base) as { slug: string } | undefined;

    if (!existing) return base;

    for (let i = 2; i <= 11; i++) {
      const candidate = `${base}-${i}`;
      const dup = this.db
        .prepare("SELECT slug FROM projects WHERE slug = ?")
        .get(candidate) as { slug: string } | undefined;
      if (!dup) return candidate;
    }

    throw new Error(
      `Failed to generate unique slug for "${name}" after 10 retries`,
    );
  }

  private toProjectRow(raw: RawProjectRow): ProjectRow {
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      rootPath: raw.root_path,
      status: raw.status,
      primaryPlatform: raw.primary_platform,
      productType: raw.product_type,
      autodetectDismissed: raw.autodetect_dismissed === 1,
      registeredAt: raw.registered_at,
      lastAccessedAt: raw.last_accessed_at,
    };
  }
}

interface RawProjectRow {
  id: string;
  name: string;
  slug: string;
  root_path: string;
  status: string;
  primary_platform: string | null;
  product_type: string | null;
  autodetect_dismissed: number;
  registered_at: string;
  last_accessed_at: string | null;
}
