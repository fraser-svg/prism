import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceDatabase } from "./workspace-database";

describe("WorkspaceDatabase", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true });
  });

  it("opens a new database and runs initial migration", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    const db = WorkspaceDatabase.open(dbPath);
    try {
      // Verify migration ran — _migrations table should exist with version 1
      const row = db.inner
        .prepare("SELECT MAX(version) as v FROM _migrations")
        .get() as { v: number };
      expect(row.v).toBe(4);
    } finally {
      db.close();
    }
  });

  it("sets WAL journal mode", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    const db = WorkspaceDatabase.open(dbPath);
    try {
      const row = db.inner.pragma("journal_mode") as Array<{
        journal_mode: string;
      }>;
      expect(row[0].journal_mode).toBe("wal");
    } finally {
      db.close();
    }
  });

  it("creates all expected tables", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    const db = WorkspaceDatabase.open(dbPath);
    try {
      const tables = db.inner
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("_migrations");
      expect(tableNames).toContain("projects");
      expect(tableNames).toContain("integrations");
      expect(tableNames).toContain("events");
      expect(tableNames).toContain("artifact_index");
      expect(tableNames).toContain("context_items");
      expect(tableNames).toContain("extracted_knowledge");
      expect(tableNames).toContain("knowledge_summaries");
    } finally {
      db.close();
    }
  });

  it("creates FTS5 virtual tables", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    const db = WorkspaceDatabase.open(dbPath);
    try {
      const tables = db.inner
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('artifact_fts', 'knowledge_fts') ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      expect(tables.length).toBe(2);
      expect(tables.map(t => t.name)).toContain("artifact_fts");
      expect(tables.map(t => t.name)).toContain("knowledge_fts");
    } finally {
      db.close();
    }
  });

  it("is idempotent — opening twice runs no duplicate migrations", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    const db1 = WorkspaceDatabase.open(dbPath);
    db1.close();

    const db2 = WorkspaceDatabase.open(dbPath);
    try {
      const rows = db2.inner
        .prepare("SELECT COUNT(*) as c FROM _migrations")
        .get() as { c: number };
      expect(rows.c).toBe(4);
    } finally {
      db2.close();
    }
  });

  it("tracks migration versions correctly", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    const db = WorkspaceDatabase.open(dbPath);
    try {
      const rows = db.inner
        .prepare("SELECT version, applied_at FROM _migrations")
        .all() as Array<{ version: number; applied_at: string }>;
      expect(rows).toHaveLength(4);
      expect(rows[0].version).toBe(1);
      expect(rows[0].applied_at).toBeTruthy();
      expect(rows[1].version).toBe(2);
      expect(rows[1].applied_at).toBeTruthy();
      expect(rows[2].version).toBe(3);
      expect(rows[2].applied_at).toBeTruthy();
      expect(rows[3].version).toBe(4);
      expect(rows[3].applied_at).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it("throws on corrupt database file", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    await writeFile(dbPath, "not a database", "utf-8");

    expect(() => WorkspaceDatabase.open(dbPath)).toThrow();
  });

  it("can insert and query projects", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    const db = WorkspaceDatabase.open(dbPath);
    try {
      db.inner
        .prepare(
          "INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)",
        )
        .run("proj-1", "Test Project", "test-project", "/tmp/test");

      const row = db.inner
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get("proj-1") as { id: string; name: string; slug: string };

      expect(row.id).toBe("proj-1");
      expect(row.name).toBe("Test Project");
      expect(row.slug).toBe("test-project");
    } finally {
      db.close();
    }
  });

  it("FTS triggers sync artifact_fts with artifact_index", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-db-"));
    const dbPath = join(tmpDir, "workspace.db");

    const db = WorkspaceDatabase.open(dbPath);
    try {
      // Insert a project first (FK constraint)
      db.inner
        .prepare(
          "INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)",
        )
        .run("proj-1", "Test", "test", "/tmp/test");

      // Insert an artifact
      db.inner
        .prepare(
          "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, content_preview) VALUES (?, ?, ?, ?, ?)",
        )
        .run("proj-1", "spec", "spec-1", "Login Feature", "User should be able to login with email");

      // Search FTS
      const results = db.inner
        .prepare("SELECT * FROM artifact_fts WHERE artifact_fts MATCH ?")
        .all("login") as Array<{ title: string; content_preview: string }>;

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Login Feature");
    } finally {
      db.close();
    }
  });
});
