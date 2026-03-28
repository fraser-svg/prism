import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceContext } from "./workspace-manager";
import { EventLog } from "./event-log";

describe("EventLog", () => {
  let tmpDir: string;
  let ctx: WorkspaceContext;
  let log: EventLog;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-events-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    ctx = WorkspaceManager.initialize(home);
    log = new EventLog(ctx.db.inner);

    // Insert test projects for FK constraints
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Project 1", "project-1", "/tmp/proj-1");
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-2", "Project 2", "project-2", "/tmp/proj-2");
  });

  afterEach(async () => {
    ctx.db.close();
    await rm(tmpDir, { recursive: true });
  });

  it("appends and queries events", () => {
    log.append({
      projectId: "proj-1",
      eventType: "project:registered",
      summary: "Registered project",
    });

    const events = log.query();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("project:registered");
    expect(events[0].summary).toBe("Registered project");
    expect(events[0].projectId).toBe("proj-1");
  });

  it("queries by project ID", () => {
    log.append({
      projectId: "proj-1",
      eventType: "project:registered",
      summary: "Registered 1",
    });
    log.append({
      projectId: "proj-2",
      eventType: "project:registered",
      summary: "Registered 2",
    });

    const events = log.query({ projectId: "proj-1" });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Registered 1");
  });

  it("queries by event type", () => {
    log.append({
      eventType: "project:registered",
      summary: "Registered",
    });
    log.append({
      eventType: "project:archived",
      summary: "Archived",
    });

    const events = log.query({ eventType: "project:archived" });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Archived");
  });

  it("queries by date range", () => {
    log.append({
      eventType: "project:registered",
      summary: "Event 1",
    });

    // Query from the future — should find nothing
    const events = log.query({ since: "2099-01-01" });
    expect(events).toHaveLength(0);
  });

  it("returns empty array when no events", () => {
    const events = log.query();
    expect(events).toHaveLength(0);
  });

  it("stores and retrieves metadata", () => {
    log.append({
      eventType: "artifact:written",
      summary: "Wrote spec",
      metadata: { entityType: "spec", entityId: "spec-1" },
    });

    const events = log.query();
    expect(events[0].metadata).toEqual({
      entityType: "spec",
      entityId: "spec-1",
    });
  });

  it("handles null metadata", () => {
    log.append({
      eventType: "project:registered",
      summary: "No metadata",
    });

    const events = log.query();
    expect(events[0].metadata).toBeNull();
  });

  it("respects limit", () => {
    for (let i = 0; i < 20; i++) {
      log.append({ eventType: "test", summary: `Event ${i}` });
    }

    const events = log.query({ limit: 5 });
    expect(events).toHaveLength(5);
  });

  it("recentForProject returns limited events for a project", () => {
    for (let i = 0; i < 20; i++) {
      log.append({
        projectId: "proj-1",
        eventType: "test",
        summary: `Event ${i}`,
      });
    }

    const events = log.recentForProject("proj-1", 3);
    expect(events).toHaveLength(3);
  });
});
