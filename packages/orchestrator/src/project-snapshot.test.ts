import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AbsolutePath, EntityId, ISODateString } from "@prism/core";
import { extractProjectSnapshot } from "./project-snapshot";

let testDir: string;

function abs(p: string): AbsolutePath {
  return p as AbsolutePath;
}

const SPEC_ID = "spec-1" as EntityId;
const now = () => new Date().toISOString() as ISODateString;

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `project-snapshot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("extractProjectSnapshot", () => {
  it("returns empty snapshot when no .prism/ exists", async () => {
    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.projectName).toBeNull();
    expect(snapshot.productSummary).toBeNull();
    expect(snapshot.targetUser).toBeNull();
    expect(snapshot.features).toEqual([]);
    expect(snapshot.taskProgress).toBeNull();
    expect(snapshot.architectureMarkdown).toBeNull();
    expect(snapshot.stateMarkdown).toBeNull();
    expect(snapshot.roadmapMarkdown).toBeNull();
    expect(snapshot.decisionsMarkdown).toBeNull();
    expect(snapshot.shipStatus).toEqual([]);
    expect(snapshot.currentPhase).toBeNull();
    expect(snapshot.blockers).toEqual([]);
    expect(snapshot.nextActions).toEqual([]);
    expect(snapshot.warnings).toEqual([]);
  });

  it("parses product.md for name, summary, and target user", async () => {
    const memoryDir = join(testDir, ".prism", "memory");
    await mkdir(memoryDir, { recursive: true });

    await writeFile(
      join(memoryDir, "product.md"),
      `# My Cool Product\n\nA tool for building things faster.\n\n**Target User:** Agency operators\n`,
    );

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.projectName).toBe("My Cool Product");
    expect(snapshot.productSummary).toBe("A tool for building things faster.");
    expect(snapshot.targetUser).toBe("Agency operators");
  });

  it("handles missing product.md gracefully (all nulls, no warning)", async () => {
    const memoryDir = join(testDir, ".prism", "memory");
    await mkdir(memoryDir, { recursive: true });

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.projectName).toBeNull();
    expect(snapshot.productSummary).toBeNull();
    expect(snapshot.targetUser).toBeNull();
    expect(snapshot.warnings).toEqual([]);
  });

  it("handles empty product.md (all nulls)", async () => {
    const memoryDir = join(testDir, ".prism", "memory");
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, "product.md"), "");

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.projectName).toBeNull();
    expect(snapshot.productSummary).toBeNull();
  });

  it("reads specs with type=product only", async () => {
    const specsDir = join(testDir, ".prism", "specs");
    const spec1Dir = join(specsDir, SPEC_ID);
    const spec2Dir = join(specsDir, "spec-2");
    await mkdir(spec1Dir, { recursive: true });
    await mkdir(spec2Dir, { recursive: true });

    // Product spec
    await writeFile(
      join(spec1Dir, "metadata.json"),
      JSON.stringify({
        id: SPEC_ID,
        title: "Feature A",
        projectId: "proj-1",
        type: "product",
        status: "approved",
        summary: "A product feature",
        scope: [],
        nonGoals: [],
        acceptanceCriteria: [
          { id: "ac-1", description: "must work", status: "passing" },
          { id: "ac-2", description: "must be fast", status: "unverified" },
        ],
        verificationPlan: { checks: [], notes: [] },
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    // Non-product spec (should be excluded)
    await writeFile(
      join(spec2Dir, "metadata.json"),
      JSON.stringify({
        id: "spec-2",
        title: "Infra Change",
        projectId: "proj-1",
        type: "infrastructure",
        status: "approved",
        summary: "An infra change",
        scope: [],
        nonGoals: [],
        acceptanceCriteria: [],
        verificationPlan: { checks: [], notes: [] },
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.features).toHaveLength(1);
    expect(snapshot.features[0]!.title).toBe("Feature A");
    expect(snapshot.features[0]!.status).toBe("in_progress");
    expect(snapshot.features[0]!.acceptanceCriteria).toEqual({ total: 2, passing: 1 });
  });

  it("resolves shipped status via ReleaseState", async () => {
    const specsDir = join(testDir, ".prism", "specs", SPEC_ID);
    const releaseDir = join(testDir, ".prism", "release-state", SPEC_ID);
    await mkdir(specsDir, { recursive: true });
    await mkdir(releaseDir, { recursive: true });

    await writeFile(
      join(specsDir, "metadata.json"),
      JSON.stringify({
        id: SPEC_ID,
        title: "Shipped Feature",
        projectId: "proj-1",
        type: "product",
        status: "approved",
        summary: "shipped",
        scope: [],
        nonGoals: [],
        acceptanceCriteria: [],
        verificationPlan: { checks: [], notes: [] },
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    await writeFile(
      join(releaseDir, "state.json"),
      JSON.stringify({ decision: "go", decidedAt: now() }),
    );

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.features[0]!.status).toBe("shipped");
  });

  it("resolves shipped status via receipt fallback when no ReleaseState", async () => {
    const specsDir = join(testDir, ".prism", "specs", SPEC_ID);
    const shipsDir = join(testDir, ".prism", "ships", SPEC_ID);
    await mkdir(specsDir, { recursive: true });
    await mkdir(shipsDir, { recursive: true });

    await writeFile(
      join(specsDir, "metadata.json"),
      JSON.stringify({
        id: SPEC_ID,
        title: "Shipped via Receipt",
        projectId: "proj-1",
        type: "product",
        status: "approved",
        summary: "shipped via receipt",
        scope: [],
        nonGoals: [],
        acceptanceCriteria: [],
        verificationPlan: { checks: [], notes: [] },
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    await writeFile(
      join(shipsDir, "receipt.json"),
      JSON.stringify({
        id: "receipt-1",
        projectId: "proj-1",
        specId: SPEC_ID,
        prUrl: "https://github.com/test/pr/1",
        commitSha: "abc123",
        commitMessage: "ship it",
        branch: "main",
        baseBranch: "main",
        tagName: null,
        deployUrl: null,
        deployPlatform: null,
        deployHealthStatus: null,
        specSummary: "test",
        reviewVerdicts: {},
        changelogUpdated: false,
        shippedAt: "2026-03-30T12:00:00.000Z",
        confidence: { level: "high", method: "auto", concerns: [], escalated: false, escalationCount: 0, checksRun: [], checksSkipped: [] },
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.features[0]!.status).toBe("shipped");
    expect(snapshot.shipStatus).toHaveLength(1);
    expect(snapshot.shipStatus[0]!.prUrl).toBe("https://github.com/test/pr/1");
    expect(snapshot.shipStatus[0]!.confidence).toBe("high");
  });

  it("reads root task-graph.json", async () => {
    const prismDir = join(testDir, ".prism");
    await mkdir(prismDir, { recursive: true });

    await writeFile(
      join(prismDir, "task-graph.json"),
      JSON.stringify({
        tasks: [
          { id: "t1", title: "Build UI", status: "done", wave: 1 },
          { id: "t2", title: "Write tests", status: "in_progress", wave: 1 },
          { id: "t3", title: "Deploy", status: "pending", wave: 2 },
        ],
      }),
    );

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.taskProgress).not.toBeNull();
    expect(snapshot.taskProgress!.total).toBe(3);
    expect(snapshot.taskProgress!.completed).toBe(1);
    expect(snapshot.taskProgress!.tasks).toHaveLength(3);
    expect(snapshot.taskProgress!.tasks[0]!.wave).toBe(1);
  });

  it("falls back to plan-level task graph via checkpoint", async () => {
    const prismDir = join(testDir, ".prism");
    const checkpointsDir = join(prismDir, "checkpoints");
    const planDir = join(prismDir, "plans", "plan-1");
    await mkdir(checkpointsDir, { recursive: true });
    await mkdir(planDir, { recursive: true });

    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify({
        id: "chk-1",
        projectId: "proj-1",
        runId: null,
        activeSpecId: SPEC_ID,
        phase: "execute",
        stageRoute: null,
        stageTotal: null,
        progressSummary: "building",
        keyDecisions: [],
        preferences: [],
        blockers: [],
        nextRecommendedActions: [],
        lastVerificationSummary: null,
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    await writeFile(
      join(planDir, "metadata.json"),
      JSON.stringify({ specId: SPEC_ID }),
    );

    await writeFile(
      join(planDir, "task-graph.json"),
      JSON.stringify([
        { id: "t1", title: "Plan task A", status: "completed" },
        { id: "t2", title: "Plan task B", status: "pending" },
      ]),
    );

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.taskProgress).not.toBeNull();
    expect(snapshot.taskProgress!.total).toBe(2);
    expect(snapshot.taskProgress!.completed).toBe(1);
  });

  it("adds warning for corrupt task-graph.json", async () => {
    const prismDir = join(testDir, ".prism");
    await mkdir(prismDir, { recursive: true });
    await writeFile(join(prismDir, "task-graph.json"), "NOT VALID JSON {{{");

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.taskProgress).toBeNull();
    expect(snapshot.warnings).toContain("task-graph.json contains invalid JSON");
  });

  it("adds warning for corrupt spec metadata", async () => {
    const specDir = join(testDir, ".prism", "specs", SPEC_ID);
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "metadata.json"), "BROKEN JSON");

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.features).toEqual([]);
    expect(snapshot.warnings).toContain(`specs/${SPEC_ID}/metadata.json is corrupt`);
  });

  it("reads memory markdown files", async () => {
    const memoryDir = join(testDir, ".prism", "memory");
    await mkdir(memoryDir, { recursive: true });

    await writeFile(join(memoryDir, "architecture.md"), "# Architecture\n\nMonorepo with 4 packages.");
    await writeFile(join(memoryDir, "state.md"), "# State\n\nAll systems operational.");
    await writeFile(join(memoryDir, "roadmap.md"), "# Roadmap\n\n- Phase 1\n- Phase 2");
    await writeFile(join(memoryDir, "decisions.md"), "# Decisions\n\nChose TypeScript.");

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.architectureMarkdown).toContain("Monorepo with 4 packages");
    expect(snapshot.stateMarkdown).toContain("All systems operational");
    expect(snapshot.roadmapMarkdown).toContain("Phase 1");
    expect(snapshot.decisionsMarkdown).toContain("Chose TypeScript");
  });

  it("reads checkpoint for phase, blockers, and next actions", async () => {
    const checkpointsDir = join(testDir, ".prism", "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });

    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify({
        id: "chk-1",
        projectId: "proj-1",
        runId: null,
        activeSpecId: SPEC_ID,
        phase: "verify",
        stageRoute: null,
        stageTotal: null,
        progressSummary: "verifying",
        keyDecisions: [],
        preferences: [],
        blockers: ["CI is red"],
        nextRecommendedActions: ["Fix tests", "Run again"],
        lastVerificationSummary: null,
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.currentPhase).toBe("verify");
    expect(snapshot.blockers).toEqual(["CI is red"]);
    expect(snapshot.nextActions).toEqual(["Fix tests", "Run again"]);
  });

  it("groups planned features correctly based on spec status", async () => {
    const specDir = join(testDir, ".prism", "specs", SPEC_ID);
    await mkdir(specDir, { recursive: true });

    await writeFile(
      join(specDir, "metadata.json"),
      JSON.stringify({
        id: SPEC_ID,
        title: "Draft Feature",
        projectId: "proj-1",
        type: "product",
        status: "draft",
        summary: "just an idea",
        scope: [],
        nonGoals: [],
        acceptanceCriteria: [],
        verificationPlan: { checks: [], notes: [] },
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    const snapshot = await extractProjectSnapshot(abs(testDir));

    expect(snapshot.features[0]!.status).toBe("planned");
  });
});
