import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceContext } from "./workspace-manager";
import { ProjectRegistry } from "./project-registry";

describe("ProjectRegistry", () => {
  let tmpDir: string;
  let ctx: WorkspaceContext;
  let registry: ProjectRegistry;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-registry-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    ctx = WorkspaceManager.initialize(home);
    registry = new ProjectRegistry(ctx.db.inner, ctx.settingsPath, ctx.settings);
  });

  afterEach(async () => {
    ctx.db.close();
    await rm(tmpDir, { recursive: true });
  });

  it("registers a new project", async () => {
    const projDir = join(tmpDir, "my-project");
    await mkdir(projDir);

    const project = registry.register(projDir, "My Project");
    expect(project.name).toBe("My Project");
    expect(project.slug).toBe("my-project");
    expect(project.status).toBe("active");
    expect(project.rootPath).toBe(projDir);
  });

  it("is idempotent — registering same path twice returns existing", async () => {
    const projDir = join(tmpDir, "my-project");
    await mkdir(projDir);

    const first = registry.register(projDir, "My Project");
    const second = registry.register(projDir, "My Project");
    expect(second.id).toBe(first.id);
  });

  it("generates name from path when not provided", async () => {
    const projDir = join(tmpDir, "cool-app");
    await mkdir(projDir);

    const project = registry.register(projDir);
    expect(project.name).toBe("cool-app");
  });

  it("lists active projects only by default", async () => {
    const dir1 = join(tmpDir, "proj-1");
    const dir2 = join(tmpDir, "proj-2");
    await mkdir(dir1);
    await mkdir(dir2);

    registry.register(dir1, "Project 1");
    const p2 = registry.register(dir2, "Project 2");
    registry.remove(p2.id);

    const active = registry.list();
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("Project 1");
  });

  it("lists archived projects when requested", async () => {
    const dir1 = join(tmpDir, "proj-1");
    const dir2 = join(tmpDir, "proj-2");
    await mkdir(dir1);
    await mkdir(dir2);

    registry.register(dir1, "Project 1");
    const p2 = registry.register(dir2, "Project 2");
    registry.remove(p2.id);

    const all = registry.list({ includeArchived: true });
    expect(all).toHaveLength(2);
  });

  it("sets active project and updates settings", async () => {
    const projDir = join(tmpDir, "my-project");
    await mkdir(projDir);

    const project = registry.register(projDir, "My Project");
    registry.setActive(project.id);

    // Re-initialize to verify settings persisted
    ctx.db.close();
    const ctx2 = WorkspaceManager.initialize(
      join(tmpDir, ".prism") as AbsolutePath,
    );
    expect(ctx2.settings.defaultProjectId).toBe(project.id);
    ctx2.db.close();
  });

  it("throws when setting active to nonexistent project", () => {
    expect(() => registry.setActive("nonexistent-id")).toThrow(
      "Project not found",
    );
  });

  it("removes a project (soft delete)", async () => {
    const projDir = join(tmpDir, "my-project");
    await mkdir(projDir);

    const project = registry.register(projDir, "My Project");
    registry.remove(project.id);

    const retrieved = registry.get(project.id);
    expect(retrieved?.status).toBe("archived");
  });

  it("handles path traversal in project paths", async () => {
    // resolve() normalizes "../" so this should still work safely
    const projDir = join(tmpDir, "my-project");
    await mkdir(projDir);
    const project = registry.register(join(tmpDir, ".", "my-project"));
    expect(project.rootPath).toBe(projDir);
  });

  it("handles slug collision with suffix", async () => {
    const dir1 = join(tmpDir, "proj-a");
    const dir2 = join(tmpDir, "proj-b");
    await mkdir(dir1);
    await mkdir(dir2);

    const p1 = registry.register(dir1, "Test");
    const p2 = registry.register(dir2, "Test");

    expect(p1.slug).toBe("test");
    expect(p2.slug).toBe("test-2");
  });

  it("autoDetect suggests when .prism/ exists and not registered", async () => {
    const projDir = join(tmpDir, "detectable");
    await mkdir(join(projDir, ".prism"), { recursive: true });

    const result = registry.autoDetect(projDir);
    expect(result.suggest).toBe(true);
    expect(result.name).toBe("detectable");
  });

  it("autoDetect does not suggest when already registered", async () => {
    const projDir = join(tmpDir, "registered");
    await mkdir(join(projDir, ".prism"), { recursive: true });

    registry.register(projDir, "Registered");

    const result = registry.autoDetect(projDir);
    expect(result.suggest).toBe(false);
  });

  it("autoDetect does not suggest when no .prism/ dir", async () => {
    const projDir = join(tmpDir, "no-prism");
    await mkdir(projDir);

    const result = registry.autoDetect(projDir);
    expect(result.suggest).toBe(false);
  });

  it("dismissAutoDetect prevents future suggestions", async () => {
    const projDir = join(tmpDir, "dismissed");
    await mkdir(join(projDir, ".prism"), { recursive: true });

    registry.dismissAutoDetect(projDir);

    const result = registry.autoDetect(projDir);
    expect(result.suggest).toBe(false);
  });

  it("resurrects dismissed project via explicit register", async () => {
    const projDir = join(tmpDir, "resurrect");
    await mkdir(join(projDir, ".prism"), { recursive: true });

    registry.dismissAutoDetect(projDir);
    const project = registry.register(projDir, "Resurrected");

    expect(project.status).toBe("active");
    expect(project.autodetectDismissed).toBe(false);
  });

  it("resurrects archived project via explicit register", async () => {
    const projDir = join(tmpDir, "archived-proj");
    await mkdir(projDir);

    const p = registry.register(projDir, "Archived");
    registry.remove(p.id);

    const resurrected = registry.register(projDir, "Back Again");
    expect(resurrected.id).toBe(p.id);
    expect(resurrected.status).toBe("active");
    expect(resurrected.name).toBe("Back Again");
  });
});
