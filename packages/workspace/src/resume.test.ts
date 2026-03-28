import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceContext } from "./workspace-manager";
import { ResumeBuilder } from "./resume";

describe("ResumeBuilder", () => {
  let tmpDir: string;
  let ctx: WorkspaceContext;
  let builder: ResumeBuilder;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-resume-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    ctx = WorkspaceManager.initialize(home);
    builder = new ResumeBuilder(ctx.db.inner);

    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Test Project", "test-project", "/tmp/test-proj");
  });

  afterEach(async () => {
    ctx.db.close();
    await rm(tmpDir, { recursive: true });
  });

  it("returns null for nonexistent project", () => {
    expect(builder.buildResume("nonexistent")).toBeNull();
  });

  it("returns 'Start your first spec' for brand new project", () => {
    const resume = builder.buildResume("proj-1");
    expect(resume).not.toBeNull();
    expect(resume!.projectName).toBe("Test Project");
    expect(resume!.recommendedNextAction).toBe("Start your first spec");
    expect(resume!.lastCheckpointSummary).toBeNull();
  });

  it("recommends creating a plan when specs exist but no plans", () => {
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "spec", "spec-1", "Login Feature");

    const resume = builder.buildResume("proj-1");
    expect(resume!.recommendedNextAction).toBe(
      "Create a plan for Login Feature",
    );
  });

  it("recommends 'Start building' when plan exists but no runs", () => {
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "spec", "spec-1", "Login Feature");
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "plan", "plan-1", "Login Plan");

    const resume = builder.buildResume("proj-1");
    expect(resume!.recommendedNextAction).toBe("Start building");
  });

  it("recommends 'Run reviews' when runs exist but no reviews", () => {
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "spec", "spec-1", "Login");
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "plan", "plan-1", "Plan");
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "run", "run-1", "Build Run");

    const resume = builder.buildResume("proj-1");
    expect(resume!.recommendedNextAction).toBe("Run reviews");
    expect(resume!.pendingReviews).toContain("1 run(s) awaiting review");
  });

  it("includes checkpoint summary when available", () => {
    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, content_preview, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "checkpoint", "cp-1", "Latest Checkpoint", "Phase 3 complete. Working on auth.");

    const resume = builder.buildResume("proj-1");
    expect(resume!.lastCheckpointSummary).toBe(
      "Phase 3 complete. Working on auth.",
    );
  });

  it("returns null for archived project", () => {
    ctx.db.inner
      .prepare("UPDATE projects SET status = 'archived' WHERE id = ?")
      .run("proj-1");

    expect(builder.buildResume("proj-1")).toBeNull();
  });

  it("includes blocker in recommended action when blockers exist", () => {
    ctx.db.inner
      .prepare(
        "INSERT INTO events (project_id, event_type, summary) VALUES (?, ?, ?)",
      )
      .run("proj-1", "blocker:active", "Waiting on API key from vendor");

    ctx.db.inner
      .prepare(
        "INSERT INTO artifact_index (project_id, entity_type, entity_id, title, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run("proj-1", "spec", "spec-1", "Feature");

    const resume = builder.buildResume("proj-1");
    expect(resume!.recommendedNextAction).toBe(
      "Resolve blocker: Waiting on API key from vendor",
    );
    expect(resume!.openBlockers).toHaveLength(1);
  });
});
