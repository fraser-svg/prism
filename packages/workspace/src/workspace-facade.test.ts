import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceFacade } from "./workspace-facade";

describe("WorkspaceFacade", () => {
  let tmpDir: string;
  let facade: WorkspaceFacade;

  afterEach(async () => {
    facade?.close();
    if (tmpDir) await rm(tmpDir, { recursive: true });
  });

  it("full workspace lifecycle", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-facade-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    facade = new WorkspaceFacade(home);

    // Step 1: Register 3 projects
    const dir1 = join(tmpDir, "project-alpha");
    const dir2 = join(tmpDir, "project-beta");
    const dir3 = join(tmpDir, "project-gamma");
    await mkdir(dir1);
    await mkdir(dir2);
    await mkdir(dir3);

    const p1 = facade.registry.register(dir1, "Alpha");
    const p2 = facade.registry.register(dir2, "Beta");
    const p3 = facade.registry.register(dir3, "Gamma");

    // Step 2: Set active project
    facade.registry.setActive(p1.id);

    // Step 3: Index artifacts in 2 projects via write callback
    const callback1 = facade.createWriteCallback(p1.id);
    callback1({
      action: "write",
      entityType: "spec",
      entityId: "spec-1",
      projectId: p1.id,
      contentPreview: "Login feature with email and password authentication",
    });
    callback1({
      action: "write",
      entityType: "plan",
      entityId: "plan-1",
      projectId: p1.id,
      contentPreview: "Phase 1: Auth flow, Phase 2: Dashboard",
    });

    const callback2 = facade.createWriteCallback(p2.id);
    callback2({
      action: "write",
      entityType: "spec",
      entityId: "spec-2",
      projectId: p2.id,
      contentPreview: "Payment processing with Stripe integration",
    });

    // Step 4: Search across projects
    const loginResults = facade.search.search("login");
    expect(loginResults).toHaveLength(1);
    expect(loginResults[0].projectName).toBe("Alpha");

    const authResults = facade.search.search("authentication");
    expect(authResults).toHaveLength(1);

    // Step 5: Check health badges
    const badges = facade.health.computeAllBadges();
    expect(badges).toHaveLength(3);
    const alphaBadge = badges.find((b) => b.projectId === p1.id);
    expect(alphaBadge?.badge).toBe("healthy");
    const gammaBadge = badges.find((b) => b.projectId === p3.id);
    expect(gammaBadge?.badge).toBe("new");

    // Step 6: Delete project directory — verify unreachable
    rmSync(dir3, { recursive: true });
    const gammaAfter = facade.health.computeBadge(p3.id);
    expect(gammaAfter).toBe("unreachable");

    // Step 7: Build resume for active project
    const resume = facade.resume.buildResume(p1.id);
    expect(resume).not.toBeNull();
    expect(resume!.projectName).toBe("Alpha");
    expect(resume!.recommendedNextAction).toBe("Start building");

    // Step 8: Query changelog
    const events = facade.eventLog.query();
    expect(events.length).toBeGreaterThan(0);
    const registrationEvents = events.filter(
      (e) => e.eventType === "project:registered",
    );
    expect(registrationEvents.length).toBe(3);

    // Step 9: Workspace status rollup
    const status = facade.workspaceStatus();
    expect(status.workspace.projectCount).toBe(3);
    expect(status.workspace.activeProjectId).toBe(p1.id);
    expect(status.projects).toHaveLength(3);
    expect(status.activeProjectResume).not.toBeNull();
    expect(status.recentEvents.length).toBeGreaterThan(0);

    // Step 10: Cross-project queries
    const allSpecs = facade.allSpecs();
    expect(allSpecs).toHaveLength(2);

    const allPlans = facade.allPlans();
    expect(allPlans).toHaveLength(1);

    const recentRuns = facade.recentRuns();
    expect(recentRuns).toHaveLength(0);
  });

  it("excludes unreachable projects from artifact queries", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-facade-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    facade = new WorkspaceFacade(home);

    const dir1 = join(tmpDir, "alive");
    await mkdir(dir1);
    const p1 = facade.registry.register(dir1, "Alive");

    const callback = facade.createWriteCallback(p1.id);
    callback({
      action: "write",
      entityType: "spec",
      entityId: "spec-1",
      projectId: p1.id,
      contentPreview: "Active spec",
    });

    // Archive project — should exclude from queries
    facade.registry.remove(p1.id);

    const specs = facade.allSpecs();
    expect(specs).toHaveLength(0);
  });

  it("write callback fires events", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-facade-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    facade = new WorkspaceFacade(home);

    const dir = join(tmpDir, "proj");
    await mkdir(dir);
    const p = facade.registry.register(dir, "Test");

    const callback = facade.createWriteCallback(p.id);
    callback({
      action: "write",
      entityType: "spec",
      entityId: "spec-1",
      projectId: p.id,
      contentPreview: "Test content",
    });

    const events = facade.eventLog.query({ eventType: "artifact:written" });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("spec/spec-1");
  });

  it("delete callback removes from search index", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-facade-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    facade = new WorkspaceFacade(home);

    const dir = join(tmpDir, "proj");
    await mkdir(dir);
    const p = facade.registry.register(dir, "Test");

    const callback = facade.createWriteCallback(p.id);

    // Write an artifact
    callback({
      action: "write",
      entityType: "spec",
      entityId: "spec-1",
      projectId: p.id,
      contentPreview: "Searchable content here",
    });

    // Verify it's searchable
    expect(facade.search.search("searchable")).toHaveLength(1);

    // Delete the artifact
    callback({
      action: "delete",
      entityType: "spec",
      entityId: "spec-1",
      projectId: p.id,
    });

    // Verify it's removed from search
    expect(facade.search.search("searchable")).toHaveLength(0);

    // Verify delete event was logged
    const events = facade.eventLog.query({ eventType: "artifact:deleted" });
    expect(events).toHaveLength(1);
  });
});
