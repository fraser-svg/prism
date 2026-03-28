import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AbsolutePath, Checkpoint, EntityId, ISODateString, Spec } from "@prism/core";
import { resumeFromArtifacts } from "./resume-engine";

let testDir: string;

function abs(p: string): AbsolutePath {
  return p as AbsolutePath;
}

const PROJECT_ID = "proj-test" as EntityId;
const SPEC_ID = "spec-1" as EntityId;

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  const now = new Date().toISOString() as ISODateString;
  return {
    id: "chk-1" as EntityId,
    projectId: PROJECT_ID,
    runId: null,
    activeSpecId: SPEC_ID,
    phase: "execute",
    stageRoute: null,
    stageTotal: null,
    progressSummary: "in progress",
    keyDecisions: [],
    preferences: [],
    blockers: [],
    nextRecommendedActions: ["continue building"],
    lastVerificationSummary: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  const now = new Date().toISOString() as ISODateString;
  return {
    id: SPEC_ID,
    title: "test spec",
    projectId: PROJECT_ID,
    type: "product",
    status: "approved",
    summary: "test",
    scope: [],
    nonGoals: [],
    acceptanceCriteria: [],
    verificationPlan: { checks: [], notes: [] },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  testDir = join(tmpdir(), `resume-engine-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("resumeFromArtifacts", () => {
  it("cold start: returns understand phase when no artifacts exist", async () => {
    const result = await resumeFromArtifacts(abs(testDir), PROJECT_ID);
    expect(result.source).toBe("cold_start");
    expect(result.workflow.phase).toBe("understand");
    expect(result.workflow.blockers).toEqual([]);
    expect(result.workflow.approvalsPending).toEqual([]);
  });

  it("resumes from checkpoint with full state", async () => {
    const checkpointsDir = join(testDir, ".prism", "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });

    const checkpoint = makeCheckpoint({
      phase: "verify",
      blockers: ["needs review"],
      approvalsPending: [{ id: "a1" as EntityId, title: "deploy approval", mode: "approval_required", reason: "prod" }],
    });
    await writeFile(join(checkpointsDir, "latest.json"), JSON.stringify(checkpoint));

    const result = await resumeFromArtifacts(abs(testDir), PROJECT_ID);
    expect(result.source).toBe("checkpoint");
    expect(result.workflow.phase).toBe("verify");
    expect(result.workflow.activeSpecId).toBe(SPEC_ID);
    expect(result.workflow.blockers).toEqual(["needs review"]);
    expect(result.workflow.approvalsPending).toHaveLength(1);
    expect(result.workflow.approvalsPending[0].title).toBe("deploy approval");
    expect(result.summary.nextActions).toEqual(["continue building"]);
  });

  it("resumes from checkpoint without approvalsPending (backward compat)", async () => {
    const checkpointsDir = join(testDir, ".prism", "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });

    // Simulate old checkpoint without approvalsPending field
    const checkpoint = makeCheckpoint();
    const raw = JSON.parse(JSON.stringify(checkpoint));
    delete raw.approvalsPending;
    await writeFile(join(checkpointsDir, "latest.json"), JSON.stringify(raw));

    const result = await resumeFromArtifacts(abs(testDir), PROJECT_ID);
    expect(result.source).toBe("checkpoint");
    expect(result.workflow.approvalsPending).toEqual([]);
  });

  it("derives phase from approved spec artifact", async () => {
    const specDir = join(testDir, ".prism", "specs", SPEC_ID);
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(makeSpec({ status: "approved" })));

    const result = await resumeFromArtifacts(abs(testDir), PROJECT_ID);
    expect(result.source).toBe("artifacts");
    expect(result.workflow.phase).toBe("plan");
    expect(result.workflow.activeSpecId).toBe(SPEC_ID);
  });

  it("derives spec phase from draft spec artifact", async () => {
    const specDir = join(testDir, ".prism", "specs", SPEC_ID);
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(makeSpec({ status: "draft" })));

    const result = await resumeFromArtifacts(abs(testDir), PROJECT_ID);
    expect(result.source).toBe("artifacts");
    expect(result.workflow.phase).toBe("spec");
    expect(result.workflow.activeSpecId).toBe(SPEC_ID);
  });

  it("derives execute phase from plan artifact", async () => {
    // Need both a spec dir (so specs dir has entries) and a plan dir
    const specDir = join(testDir, ".prism", "specs", SPEC_ID);
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(makeSpec()));

    const planDir = join(testDir, ".prism", "plans", "plan-1");
    await mkdir(planDir, { recursive: true });
    const now = new Date().toISOString();
    await writeFile(
      join(planDir, "metadata.json"),
      JSON.stringify({
        id: "plan-1",
        title: "test plan",
        projectId: PROJECT_ID,
        specId: SPEC_ID,
        phases: [],
        risks: [],
        approvals: [],
        sequencingRationale: "test",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await resumeFromArtifacts(abs(testDir), PROJECT_ID);
    expect(result.source).toBe("artifacts");
    expect(result.workflow.phase).toBe("execute");
    expect(result.workflow.activeSpecId).toBe(SPEC_ID);
  });

  it("checkpoint takes priority over artifact scan", async () => {
    // Both checkpoint and spec exist — checkpoint wins
    const checkpointsDir = join(testDir, ".prism", "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });
    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint({ phase: "verify" })),
    );

    const specDir = join(testDir, ".prism", "specs", SPEC_ID);
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(makeSpec()));

    const result = await resumeFromArtifacts(abs(testDir), PROJECT_ID);
    expect(result.source).toBe("checkpoint");
    expect(result.workflow.phase).toBe("verify");
  });

  it("records resume transition in history", async () => {
    const checkpointsDir = join(testDir, ".prism", "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });
    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint({ phase: "execute" })),
    );

    const result = await resumeFromArtifacts(abs(testDir), PROJECT_ID);
    expect(result.workflow.transitionHistory).toHaveLength(1);
    expect(result.workflow.transitionHistory[0]).toEqual({
      from: "resume",
      to: "execute",
      reason: "resume",
    });
  });
});
