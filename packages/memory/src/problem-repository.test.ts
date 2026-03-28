import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId, ProblemStatement } from "@prism/core";
import { createProblemRepository } from "./problem-repository";
import { projectPaths, problemPaths } from "./paths";

function makeProblem(overrides: Partial<ProblemStatement> = {}): ProblemStatement {
  return {
    id: "test-problem" as EntityId,
    projectId: "test-project" as EntityId,
    specId: null,
    originalRequest: "Build me an X crawler",
    realProblem: "Monitor brand mentions on X",
    targetUser: "Marketing team",
    assumptions: ["X API access", "Real-time not required"],
    reframed: true,
    reframeDetails: "Reframed from crawler to API-based monitoring",
    createdAt: "2026-03-28T00:00:00.000Z" as any,
    updatedAt: "2026-03-28T00:00:00.000Z" as any,
    ...overrides,
  };
}

describe("problemPaths", () => {
  it("returns correct directory structure", () => {
    const root = "/tmp/test-project" as AbsolutePath;
    const paths = problemPaths(root, "my-problem" as EntityId);
    expect(paths.problemDir).toBe("/tmp/test-project/.prism/problems/my-problem");
    expect(paths.metadataFile).toBe("/tmp/test-project/.prism/problems/my-problem/metadata.json");
  });

  it("rejects invalid entity IDs", () => {
    const root = "/tmp/test-project" as AbsolutePath;
    expect(() => problemPaths(root, "../etc/passwd" as EntityId)).toThrow("Invalid entity ID");
  });
});

describe("projectPaths includes problemsDir", () => {
  it("includes problemsDir in project paths", () => {
    const root = "/tmp/test-project" as AbsolutePath;
    const paths = projectPaths(root);
    expect(paths.problemsDir).toBe("/tmp/test-project/.prism/problems");
  });
});

describe("createProblemRepository", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-problem-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("writes and reads a ProblemStatement", async () => {
    const repo = createProblemRepository(tmpDir as AbsolutePath);
    const problem = makeProblem({ id: "prob-1" as EntityId });

    await repo.writeMetadata("prob-1" as EntityId, problem);
    const result = await repo.readMetadata("prob-1" as EntityId);

    expect(result).toEqual(problem);
  });

  it("round-trips: write then read returns identical data", async () => {
    const repo = createProblemRepository(tmpDir as AbsolutePath);
    const problem = makeProblem({
      id: "prob-roundtrip" as EntityId,
      assumptions: [],
      reframed: false,
      reframeDetails: null,
    });

    await repo.writeMetadata("prob-roundtrip" as EntityId, problem);
    const result = await repo.readMetadata("prob-roundtrip" as EntityId);

    expect(result).toEqual(problem);
  });

  it("lists all written problems", async () => {
    const repo = createProblemRepository(tmpDir as AbsolutePath);

    await repo.writeMetadata("alpha" as EntityId, makeProblem({ id: "alpha" as EntityId }));
    await repo.writeMetadata("beta" as EntityId, makeProblem({ id: "beta" as EntityId }));

    const ids = await repo.list();
    expect(ids.sort()).toEqual(["alpha", "beta"]);
  });

  it("returns null for nonexistent problem", async () => {
    const repo = createProblemRepository(tmpDir as AbsolutePath);
    const result = await repo.readMetadata("nonexistent" as EntityId);
    expect(result).toBeNull();
  });

  it("reports exists correctly", async () => {
    const repo = createProblemRepository(tmpDir as AbsolutePath);
    expect(await repo.exists("prob-1" as EntityId)).toBe(false);

    await repo.writeMetadata("prob-1" as EntityId, makeProblem({ id: "prob-1" as EntityId }));
    expect(await repo.exists("prob-1" as EntityId)).toBe(true);
  });
});
