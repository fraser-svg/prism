import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceManager } from "./workspace-manager";

describe("WorkspaceManager", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true });
  });

  it("initializes a new workspace with settings and database", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-ws-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;

    const ctx = WorkspaceManager.initialize(home);
    try {
      expect(ctx.homePath).toBe(home);
      expect(ctx.settings.workspaceId).toBeTruthy();
      expect(ctx.settings.defaultProjectId).toBeNull();
      expect(ctx.settings.stalenessThresholdDays).toBe(14);
      expect(ctx.settings.autoDetectProjects).toBe(true);

      // Verify settings.json exists
      const raw = await readFile(ctx.settingsPath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.workspaceId).toBe(ctx.settings.workspaceId);
    } finally {
      ctx.db.close();
    }
  });

  it("is idempotent — second init preserves workspace ID", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-ws-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;

    const ctx1 = WorkspaceManager.initialize(home);
    const firstId = ctx1.settings.workspaceId;
    ctx1.db.close();

    const ctx2 = WorkspaceManager.initialize(home);
    try {
      expect(ctx2.settings.workspaceId).toBe(firstId);
    } finally {
      ctx2.db.close();
    }
  });

  it("creates home directory with correct permissions on macOS", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-ws-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;

    const ctx = WorkspaceManager.initialize(home);
    try {
      const s = await stat(home);
      // 0o700 = owner rwx, group/others none
      const mode = s.mode & 0o777;
      expect(mode).toBe(0o700);
    } finally {
      ctx.db.close();
    }
  });

  it("throws when home path exists as a file", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-ws-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    await writeFile(home, "not a directory", "utf-8");

    expect(() => WorkspaceManager.initialize(home)).toThrow(
      "exists but is not a directory",
    );
  });

  it("recovers from corrupt settings.json", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-ws-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;

    // First init to create the DB
    const ctx1 = WorkspaceManager.initialize(home);
    ctx1.db.close();

    // Corrupt settings
    const settingsPath = join(home, "settings.json");
    await writeFile(settingsPath, "{{not json", "utf-8");

    const ctx2 = WorkspaceManager.initialize(home);
    try {
      // Should have recovered with new settings
      expect(ctx2.settings.workspaceId).toBeTruthy();
      expect(ctx2.settings.stalenessThresholdDays).toBe(14);
    } finally {
      ctx2.db.close();
    }
  });

  it("merges partial settings with defaults", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-ws-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;

    // First init
    const ctx1 = WorkspaceManager.initialize(home);
    const originalId = ctx1.settings.workspaceId;
    ctx1.db.close();

    // Write partial settings (missing autoDetectProjects)
    const settingsPath = join(home, "settings.json");
    await writeFile(
      settingsPath,
      JSON.stringify({
        workspaceId: originalId,
        defaultProjectId: "proj-1",
        stalenessThresholdDays: 7,
      }),
      "utf-8",
    );

    const ctx2 = WorkspaceManager.initialize(home);
    try {
      expect(ctx2.settings.workspaceId).toBe(originalId);
      expect(ctx2.settings.defaultProjectId).toBe("proj-1");
      expect(ctx2.settings.stalenessThresholdDays).toBe(7);
      expect(ctx2.settings.autoDetectProjects).toBe(true); // default
    } finally {
      ctx2.db.close();
    }
  });

  it("rejects invalid stalenessThresholdDays and uses default", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-ws-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;

    const ctx1 = WorkspaceManager.initialize(home);
    ctx1.db.close();

    const settingsPath = join(home, "settings.json");
    await writeFile(
      settingsPath,
      JSON.stringify({
        workspaceId: "test-id",
        stalenessThresholdDays: -5,
      }),
      "utf-8",
    );

    const ctx2 = WorkspaceManager.initialize(home);
    try {
      expect(ctx2.settings.stalenessThresholdDays).toBe(14);
    } finally {
      ctx2.db.close();
    }
  });

  it("writeSettings persists changes", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-ws-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;

    const ctx = WorkspaceManager.initialize(home);
    try {
      const updated = { ...ctx.settings, defaultProjectId: "proj-42" };
      WorkspaceManager.writeSettings(ctx.settingsPath, updated);

      const raw = await readFile(ctx.settingsPath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.defaultProjectId).toBe("proj-42");
    } finally {
      ctx.db.close();
    }
  });
});
