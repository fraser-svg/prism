import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/**
 * Tests for auto-create project directory logic.
 * Mirrors the behavior in apps/web/server/index.ts POST /api/projects handler.
 */

/** Same slug function as in server/index.ts */
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";
}

/** Replicate the server's auto-create decision logic */
function resolveProjectPath(
  rootPath: string | undefined,
  name: string,
  prismaticBase: string,
): { path: string; autoCreate: boolean } {
  if (!rootPath) {
    return { path: resolve(join(prismaticBase, nameToSlug(name))), autoCreate: true };
  }
  const resolved = resolve(rootPath);
  const isUnderPrismatic = resolved.startsWith(prismaticBase + "/");
  return { path: resolved, autoCreate: isUnderPrismatic };
}

describe("nameToSlug", () => {
  it("converts a simple name to lowercase slug", () => {
    expect(nameToSlug("My Project")).toBe("my-project");
  });

  it("handles special characters", () => {
    expect(nameToSlug("Hello, World! #2")).toBe("hello-world-2");
  });

  it("strips leading and trailing dashes", () => {
    expect(nameToSlug("---test---")).toBe("test");
  });

  it("falls back to 'project' for empty/whitespace-only names", () => {
    expect(nameToSlug("   ")).toBe("project");
    expect(nameToSlug("!!!")).toBe("project");
  });

  it("handles unicode by stripping non-alphanumeric", () => {
    expect(nameToSlug("caf\u00e9 app")).toBe("caf-app");
  });

  it("collapses multiple separators into one dash", () => {
    expect(nameToSlug("a   b...c")).toBe("a-b-c");
  });
});

describe("resolveProjectPath", () => {
  let tmpDir: string;
  let prismaticBase: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-create-"));
    prismaticBase = join(tmpDir, "Prismatic");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("auto-generates path under prismaticBase when rootPath omitted", () => {
    const result = resolveProjectPath(undefined, "My App", prismaticBase);
    expect(result.path).toBe(join(prismaticBase, "my-app"));
    expect(result.autoCreate).toBe(true);
  });

  it("allows auto-create for paths under prismaticBase", () => {
    const customPath = join(prismaticBase, "custom-name");
    const result = resolveProjectPath(customPath, "ignored", prismaticBase);
    expect(result.path).toBe(customPath);
    expect(result.autoCreate).toBe(true);
  });

  it("rejects auto-create for paths outside prismaticBase", () => {
    const outsidePath = join(tmpDir, "elsewhere", "project");
    const result = resolveProjectPath(outsidePath, "ignored", prismaticBase);
    expect(result.path).toBe(outsidePath);
    expect(result.autoCreate).toBe(false);
  });
});

describe("auto-create directory behavior", () => {
  let tmpDir: string;
  let prismaticBase: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-mkdir-"));
    prismaticBase = join(tmpDir, "Prismatic");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("creates directory recursively when path is under prismaticBase and does not exist", () => {
    const projectPath = join(prismaticBase, "new-project");
    expect(existsSync(projectPath)).toBe(false);

    mkdirSync(projectPath, { recursive: true });

    expect(existsSync(projectPath)).toBe(true);
    expect(existsSync(prismaticBase)).toBe(true);
  });

  it("no-ops when directory already exists", async () => {
    const projectPath = join(prismaticBase, "existing");
    await mkdir(projectPath, { recursive: true });
    expect(existsSync(projectPath)).toBe(true);

    // Should not throw
    mkdirSync(projectPath, { recursive: true });
    expect(existsSync(projectPath)).toBe(true);
  });

  it("rejects creation outside prismaticBase when dir does not exist", () => {
    const outsidePath = join(tmpDir, "elsewhere", "project");
    const { autoCreate } = resolveProjectPath(outsidePath, "test", prismaticBase);

    expect(autoCreate).toBe(false);
    expect(existsSync(outsidePath)).toBe(false);
    // Server would return 400 here — we don't create it
  });

  it("allows registration of existing dir outside prismaticBase", async () => {
    const outsidePath = join(tmpDir, "elsewhere");
    await mkdir(outsidePath, { recursive: true });

    const { autoCreate } = resolveProjectPath(outsidePath, "test", prismaticBase);
    expect(autoCreate).toBe(false);
    expect(existsSync(outsidePath)).toBe(true);
    // Server would proceed with register() here since dir exists
  });

  it("handles permission errors gracefully", () => {
    // On most systems, /root or /proc won't be writable
    // This tests that mkdirSync throws, which the server catches
    const unwritable = "/proc/fake-prismatic/test-project";
    expect(() => mkdirSync(unwritable, { recursive: true })).toThrow();
  });

  it("rejects prismaticBase itself as a project root", () => {
    const result = resolveProjectPath(prismaticBase, "test", prismaticBase);
    expect(result.autoCreate).toBe(false);
  });
});

describe("slug collision avoidance", () => {
  let tmpDir: string;
  let base: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-collision-"));
    base = join(tmpDir, "Prismatic");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  /** Mirrors the server's collision-avoidance loop */
  function resolveUniquePath(name: string): string {
    let slug = nameToSlug(name);
    let candidate = resolve(join(base, slug));
    let suffix = 2;
    while (existsSync(candidate)) {
      candidate = resolve(join(base, `${slug}-${suffix}`));
      suffix++;
    }
    return candidate;
  }

  it("returns base slug when no collision exists", () => {
    const path = resolveUniquePath("My Project");
    expect(path).toBe(join(base, "my-project"));
  });

  it("appends -2 when slug already exists", () => {
    mkdirSync(join(base, "my-project"), { recursive: true });
    const path = resolveUniquePath("My Project");
    expect(path).toBe(join(base, "my-project-2"));
  });

  it("increments suffix until unique", () => {
    mkdirSync(join(base, "test"), { recursive: true });
    mkdirSync(join(base, "test-2"), { recursive: true });
    mkdirSync(join(base, "test-3"), { recursive: true });
    const path = resolveUniquePath("test");
    expect(path).toBe(join(base, "test-4"));
  });

  it("handles unicode names colliding on fallback slug", () => {
    mkdirSync(join(base, "project"), { recursive: true });
    const path = resolveUniquePath("客户项目");
    expect(path).toBe(join(base, "project-2"));
  });
});
