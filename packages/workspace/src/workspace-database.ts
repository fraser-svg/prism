import Database from "better-sqlite3";
import { readFileSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS as EMBEDDED_MIGRATIONS } from "./migrations/embedded";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WorkspaceDatabase {
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static open(dbPath: string): WorkspaceDatabase {
    // Backup existing DB before migration attempts
    const needsBackup = existsSync(dbPath);

    let db: Database.Database;
    try {
      db = new Database(dbPath);
    } catch (err) {
      throw new Error(
        `Failed to open workspace database at ${dbPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // FTS5 preflight check
    try {
      db.exec("SELECT fts5()");
    } catch {
      // fts5() throws "wrong number of arguments" if available, "no such function" if not
      try {
        db.prepare("CREATE VIRTUAL TABLE _fts5_check USING fts5(test)").run();
        db.exec("DROP TABLE _fts5_check");
      } catch {
        db.close();
        throw new Error(
          "SQLite FTS5 extension required but not available. Ensure better-sqlite3 is installed correctly.",
        );
      }
    }

    const instance = new WorkspaceDatabase(db);

    if (needsBackup) {
      instance.backupBeforeMigrate(dbPath);
    }

    instance.runMigrations();
    return instance;
  }

  private backupBeforeMigrate(dbPath: string): void {
    const currentVersion = this.getCurrentVersion();
    const pendingMigrations = this.getPendingMigrations();
    if (pendingMigrations.length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupBase = `${dbPath}.pre-migrate-v${currentVersion}.${timestamp}`;

    try {
      copyFileSync(dbPath, backupBase);
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      if (existsSync(walPath)) copyFileSync(walPath, `${backupBase}-wal`);
      if (existsSync(shmPath)) copyFileSync(shmPath, `${backupBase}-shm`);
    } catch {
      // Best-effort backup — don't block migration
    }
  }

  private getCurrentVersion(): number {
    try {
      const row = this.db
        .prepare("SELECT MAX(version) as v FROM _migrations")
        .get() as { v: number | null } | undefined;
      return row?.v ?? 0;
    } catch {
      return 0;
    }
  }

  private getPendingMigrations(): Array<{
    version: number;
    sql: string;
  }> {
    const currentVersion = this.getCurrentVersion();

    // Try filesystem-based migrations first (works in dev/unbundled),
    // fall back to embedded migrations (works when bundled by Vite/Rollup).
    const migrationsDir = join(__dirname, "migrations");
    let files: string[] | null = null;
    try {
      files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      // Filesystem migrations not available (bundled environment)
    }

    if (files && files.length > 0) {
      const pending: Array<{ version: number; sql: string }> = [];
      for (const file of files) {
        const match = file.match(/^(\d+)-/);
        if (!match) continue;
        const version = parseInt(match[1], 10);
        if (version <= currentVersion) continue;
        const sql = readFileSync(join(migrationsDir, file), "utf-8");
        pending.push({ version, sql });
      }
      return pending;
    }

    // Fallback: use embedded migrations
    return EMBEDDED_MIGRATIONS.filter((m) => m.version > currentVersion);
  }

  private runMigrations(): void {
    const pending = this.getPendingMigrations();
    if (pending.length === 0) return;

    for (const migration of pending) {
      const runMigration = this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO _migrations (version) VALUES (?)").run(
          migration.version,
        );
      });

      try {
        runMigration();
      } catch (err) {
        throw new Error(
          `Workspace upgrade failed at migration ${migration.version}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  get inner(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
