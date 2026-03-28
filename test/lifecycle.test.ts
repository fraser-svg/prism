import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AbsolutePath,
  Checkpoint,
  EntityId,
  ISODateString,
  Plan,
  Review,
  Spec,
  VerificationResult,
  WorkflowState,
} from "@prism/core";
import {
  createSpecRepository,
  createPlanRepository,
  createCheckpointRepository,
  createReviewRepository,
  createVerificationRepository,
} from "@prism/memory";
import { evaluateTransition } from "@prism/orchestrator";
import { resumeFromArtifacts } from "@prism/orchestrator";
import { checkExecutionIntent } from "@prism/execution";

let testDir: string;

function abs(p: string): AbsolutePath {
  return p as AbsolutePath;
}

const PROJECT_ID = "proj-e2e" as EntityId;
const SPEC_ID = "spec-e2e" as EntityId;
const PLAN_ID = "plan-e2e" as EntityId;
const RUN_ID = "run-e2e" as EntityId;

function now(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  const ts = now();
  return {
    id: SPEC_ID,
    title: "E2E test spec",
    projectId: PROJECT_ID,
    type: "product",
    status: "approved",
    summary: "test",
    scope: ["feature-a"],
    nonGoals: [],
    acceptanceCriteria: [{ id: "ac1" as EntityId, description: "works correctly", status: "unverified" }],
    verificationPlan: { checks: ["lint", "test"], notes: [] },
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  const ts = now();
  return {
    id: PLAN_ID,
    title: "E2E test plan",
    projectId: PROJECT_ID,
    specId: SPEC_ID,
    phases: [{ id: "p1" as EntityId, title: "phase 1", description: "build it", dependsOn: [] }],
    risks: [],
    approvals: [],
    sequencingRationale: "simple",
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  const ts = now();
  return {
    id: "chk-e2e" as EntityId,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    activeSpecId: SPEC_ID,
    phase: "execute",
    progressSummary: "building",
    keyDecisions: [],
    blockers: [],
    nextRecommendedActions: [],
    lastVerificationSummary: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

beforeEach(async () => {
  testDir = join(tmpdir(), `lifecycle-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("E2E: full lifecycle with gates", () => {
  it("advances through understand → spec → plan → execute with artifacts at each gate", async () => {
    const root = abs(testDir);

    // Ensure .prism/ directory exists for the understand gate
    await mkdir(join(testDir, ".prism"), { recursive: true });

    // Gate: understand → identify_problem (requires .prism/ dir)
    const g1 = await evaluateTransition("understand", "identify_problem", root);
    expect(g1.allowed).toBe(true);

    // Gate: identify_problem → spec (always allowed)
    const g2 = await evaluateTransition("identify_problem", "spec", root);
    expect(g2.allowed).toBe(true);

    // Gate: spec → plan requires approved spec
    const g3_blocked = await evaluateTransition("spec", "plan", root, SPEC_ID);
    expect(g3_blocked.allowed).toBe(false);
    expect(g3_blocked.blockers.length).toBeGreaterThan(0);

    // Write approved spec
    const specRepo = createSpecRepository(root);
    await specRepo.writeMetadata(SPEC_ID, makeSpec({ status: "approved" }));

    // Now spec → plan should pass
    const g3_ok = await evaluateTransition("spec", "plan", root, SPEC_ID);
    expect(g3_ok.allowed).toBe(true);
    expect(g3_ok.evidence.length).toBeGreaterThan(0);

    // Gate: plan → execute requires plan
    const g4_blocked = await evaluateTransition("plan", "execute", root, SPEC_ID);
    expect(g4_blocked.allowed).toBe(false);

    // Write plan with task graph
    const planRepo = createPlanRepository(root);
    await planRepo.writeMetadata(PLAN_ID, makePlan());
    // Write task graph file alongside the plan
    const planDir = join(testDir, ".prism", "plans", PLAN_ID);
    await writeFile(join(planDir, "task-graph.json"), JSON.stringify({ tasks: [] }));

    // Now plan → execute should pass
    const g4_ok = await evaluateTransition("plan", "execute", root, SPEC_ID);
    expect(g4_ok.allowed).toBe(true);
  });

  it("blocks lifecycle when spec is draft (not approved)", async () => {
    const root = abs(testDir);
    const specRepo = createSpecRepository(root);
    await specRepo.writeMetadata(SPEC_ID, makeSpec({ status: "draft" }));

    const result = await evaluateTransition("spec", "plan", root, SPEC_ID);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([expect.stringContaining("draft")]));
  });
});

describe("E2E: resume from checkpoint", () => {
  it("resumes from checkpoint with full state including approvals", async () => {
    const root = abs(testDir);
    const checkpointRepo = createCheckpointRepository(root);

    const checkpoint = makeCheckpoint({
      phase: "verify",
      approvalsPending: [
        { id: "a1" as EntityId, title: "deploy", mode: "approval_required", reason: "prod" },
      ],
      blockers: ["waiting on review"],
    });
    await checkpointRepo.write(checkpoint, "# Checkpoint\nPhase: verify");

    const result = await resumeFromArtifacts(root, PROJECT_ID);
    expect(result.source).toBe("checkpoint");
    expect(result.workflow.phase).toBe("verify");
    expect(result.workflow.approvalsPending).toHaveLength(1);
    expect(result.workflow.blockers).toContain("waiting on review");
  });

  it("cold start when no artifacts exist", async () => {
    const root = abs(testDir);
    const result = await resumeFromArtifacts(root, PROJECT_ID);
    expect(result.source).toBe("cold_start");
    expect(result.workflow.phase).toBe("understand");
  });
});

describe("E2E: execution intent policy enforcement", () => {
  it("blocks push when approvals are pending", () => {
    const state: WorkflowState = {
      phase: "execute",
      projectId: PROJECT_ID,
      activeSpecId: SPEC_ID,
      approvalsPending: [
        { id: "a1" as EntityId, title: "push approval", mode: "approval_required", reason: "main branch" },
      ],
      blockers: [],
      transitionHistory: [],
    };

    const pushResult = checkExecutionIntent(
      { type: "push", target: "main", requiresApproval: false },
      state,
    );
    expect(pushResult.allowed).toBe(false);

    // Save should still be allowed
    const saveResult = checkExecutionIntent(
      { type: "save", target: "milestone", requiresApproval: false },
      state,
    );
    expect(saveResult.allowed).toBe(true);
  });

  it("allows push when no approvals are pending", () => {
    const state: WorkflowState = {
      phase: "execute",
      projectId: PROJECT_ID,
      activeSpecId: SPEC_ID,
      approvalsPending: [],
      blockers: [],
      transitionHistory: [],
    };

    const result = checkExecutionIntent(
      { type: "push", target: "main", requiresApproval: false },
      state,
    );
    expect(result.allowed).toBe(true);
  });
});

describe("E2E: regression (verification failure)", () => {
  it("allows regression from verify back to execute", async () => {
    const root = abs(testDir);

    // Regression transitions are valid
    const result = await evaluateTransition("verify", "execute", root);
    expect(result.allowed).toBe(true);
    expect(result.evidence).toEqual(expect.arrayContaining([expect.stringContaining("regression")]));
  });
});
