import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceContext } from "./workspace-manager";
import { ProjectHealth } from "./health";

describe("ProjectHealth", () => {
  let tmpDir: string;
  let ctx: WorkspaceContext;
  let health: ProjectHealth;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-health-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    ctx = WorkspaceManager.initialize(home);
    health = new ProjectHealth(ctx.db.inner, 14);
  });

  afterEach(async () => {
    ctx.db.close();
    await rm(tmpDir, { recursive: true });
  });

  it("returns 'new' for project with no artifacts", async () => {
    const projDir = join(tmpDir, "new-proj");
    await mkdir(projDir);
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "New", "new", projDir);

    expect(health.computeBadge("proj-1")).toBe("new");
  });

  it("returns 'unreachable' when project directory is gone", () => {
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Gone", "gone", "/nonexistent/path/that/does/not/exist");

    expect(health.computeBadge("proj-1")).toBe("unreachable");
  });

  it("returns 'unreachable' for nonexistent project ID", () => {
    expect(health.computeBadge("nonexistent")).toBe("unreachable");
  });

  it("returns 'healthy' for project with recent artifacts", async () => {
    const projDir = join(tmpDir, "healthy-proj");
    await mkdir(projDir);
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Healthy", "healthy", projDir);
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "spec", "spec-1", "Test Spec");

    expect(health.computeBadge("proj-1")).toBe("healthy");
  });

  it("returns 'stale' when artifacts exceed threshold", async () => {
    const projDir = join(tmpDir, "stale-proj");
    await mkdir(projDir);
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Stale", "stale", projDir);
    // Insert artifact updated 30 days ago
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now', '-30 days'))",
      )
      .run("proj-1", "spec", "spec-1", "Old Spec");

    expect(health.computeBadge("proj-1")).toBe("stale");
  });

  it("returns 'needs-review' when runs outnumber reviews", async () => {
    const projDir = join(tmpDir, "review-proj");
    await mkdir(projDir);
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Review", "review", projDir);
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "run", "run-1", "Build Run");
    // No review artifacts

    expect(health.computeBadge("proj-1")).toBe("needs-review");
  });

  it("returns 'healthy' when runs equal reviews", async () => {
    const projDir = join(tmpDir, "balanced-proj");
    await mkdir(projDir);
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Balanced", "balanced", projDir);
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "run", "run-1", "Build Run");
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "review", "review-1", "Code Review");

    expect(health.computeBadge("proj-1")).toBe("healthy");
  });

  it("computes badges for all active projects", async () => {
    const dir1 = join(tmpDir, "proj-a");
    const dir2 = join(tmpDir, "proj-b");
    await mkdir(dir1);
    await mkdir(dir2);
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "A", "a", dir1);
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-2", "B", "b", dir2);

    const badges = health.computeAllBadges();
    expect(badges).toHaveLength(2);
    expect(badges.every((b) => b.badge === "new")).toBe(true);
  });

  it("priority: unreachable > blocked > needs-review > stale > new > healthy", async () => {
    // This test ensures the priority ordering is respected
    const projDir = join(tmpDir, "priority-proj");
    await mkdir(projDir);
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Priority", "priority", projDir);

    // Add a stale artifact AND an unreviewed run — needs-review should win over stale
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now', '-30 days'))",
      )
      .run("proj-1", "spec", "spec-1", "Old Spec");
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "run", "run-1", "Run");

    expect(health.computeBadge("proj-1")).toBe("needs-review");
  });
});
