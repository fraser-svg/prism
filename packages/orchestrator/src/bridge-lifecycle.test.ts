/**
 * Bridge lifecycle integration test.
 *
 * Simulates a full skill session through the bridge by calling adapter and
 * service functions directly (not via subprocess). Tests the complete flow
 * from cold start through release state derivation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId } from "@prism/core";
import {
  createSpecRepository,
  createPlanRepository,
  createCheckpointRepository,
  planPaths,
} from "@prism/memory";
import {
  checkRequiredReviews,
  isReviewComplete,
  deriveReleaseState,
} from "@prism/guardian";

import {
  skillSpecToCore,
  skillPlanToCore,
  skillCheckpointToCore,
  skillReviewToCore,
  skillVerificationToCore,
} from "./bridge-adapters";
import { recordReview, recordVerification } from "./services";
import { evaluateTransition } from "./gate-evaluator";
import { resumeFromArtifacts } from "./resume-engine";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let projectRoot: AbsolutePath;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "prism-lifecycle-test-"));
  projectRoot = tmpDir as AbsolutePath;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Full lifecycle integration
// ---------------------------------------------------------------------------

describe("full skill session lifecycle", () => {
  it("flows from cold start through release state", async () => {
    const projectId = "proj-lifecycle" as EntityId;
    const specId = "spec-lifecycle-1" as EntityId;
    const planId = "plan-lifecycle-1" as EntityId;
    const runId = "run-lifecycle-1" as EntityId;

    // -----------------------------------------------------------------------
    // Step 1: Resume on empty project — expect cold start
    // -----------------------------------------------------------------------
    const resumeResult1 = await resumeFromArtifacts(projectRoot, projectId);
    expect(resumeResult1.source).toBe("cold_start");
    expect(resumeResult1.workflow.phase).toBe("understand");
    expect(resumeResult1.workflow.activeSpecId).toBeNull();

    // -----------------------------------------------------------------------
    // Step 2: Write a spec
    // -----------------------------------------------------------------------
    const specInput = skillSpecToCore(
      {
        title: "Lifecycle Test Spec",
        type: "change",
        status: "approved",
        summary: "End-to-end lifecycle test",
        acceptanceCriteria: ["Feature is implemented", "Tests pass"],
        projectId: "proj-lifecycle",
      },
      specId,
    );
    const specRepo = createSpecRepository(projectRoot);
    await specRepo.writeMetadata(specId, specInput);

    // Verify spec is readable
    const writtenSpec = await specRepo.readMetadata(specId);
    expect(writtenSpec).not.toBeNull();
    expect(writtenSpec!.title).toBe("Lifecycle Test Spec");
    expect(writtenSpec!.status).toBe("approved");
    expect(writtenSpec!.acceptanceCriteria).toHaveLength(2);

    // -----------------------------------------------------------------------
    // Step 3: Gate check spec→plan (should pass — spec is approved)
    // -----------------------------------------------------------------------
    const gateSpecToPlan = await evaluateTransition(
      "spec",
      "plan",
      projectRoot,
      specId,
    );
    expect(gateSpecToPlan.allowed).toBe(true);
    expect(gateSpecToPlan.blockers).toHaveLength(0);
    expect(gateSpecToPlan.evidence).toContain(
      "spec is approved with acceptance criteria",
    );

    // -----------------------------------------------------------------------
    // Step 4: Write a plan
    // -----------------------------------------------------------------------
    const planInput = skillPlanToCore(
      {
        title: "Lifecycle Test Plan",
        specId,
        phases: [
          { id: "ph-1", title: "Implementation", description: "Write code" },
        ],
        risks: ["scope creep"],
        sequencingRationale: "single phase",
        projectId: "proj-lifecycle",
      },
      planId,
    );
    const planRepo = createPlanRepository(projectRoot);
    await planRepo.writeMetadata(planId, planInput);

    const writtenPlan = await planRepo.readMetadata(planId);
    expect(writtenPlan).not.toBeNull();
    expect(writtenPlan!.specId).toBe(specId);

    // -----------------------------------------------------------------------
    // Step 5: Write a task graph file
    // -----------------------------------------------------------------------
    const paths = planPaths(projectRoot, planId);
    await mkdir(paths.planDir, { recursive: true });
    await writeFile(
      paths.taskGraphFile,
      JSON.stringify({
        id: "tg-1",
        planId,
        specId,
        tasks: [
          {
            id: "t-1",
            title: "Implement feature",
            status: "pending",
          },
        ],
      }),
      "utf-8",
    );

    // -----------------------------------------------------------------------
    // Step 6: Gate check plan→execute (should pass — task graph exists)
    // -----------------------------------------------------------------------
    const gatePlanToExecute = await evaluateTransition(
      "plan",
      "execute",
      projectRoot,
      specId,
    );
    expect(gatePlanToExecute.allowed).toBe(true);
    expect(gatePlanToExecute.blockers).toHaveLength(0);
    expect(gatePlanToExecute.evidence).toContain("task graph file exists");

    // -----------------------------------------------------------------------
    // Step 7: Write a checkpoint
    // -----------------------------------------------------------------------
    const checkpoint = skillCheckpointToCore({
      projectId: "proj-lifecycle",
      runId,
      activeSpecId: specId,
      phase: "execute",
      progress: "Implementation complete",
      decisions: ["Used TypeScript strict mode"],
      nextSteps: ["Run verification"],
      blockers: [],
    });
    const checkpointRepo = createCheckpointRepository(projectRoot);
    const checkpointMarkdown = [
      `# Checkpoint: ${checkpoint.phase}`,
      ``,
      checkpoint.progressSummary
        ? `**Progress:** ${checkpoint.progressSummary}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    await checkpointRepo.write(checkpoint, checkpointMarkdown);

    const writtenCheckpoint = await checkpointRepo.readLatest();
    expect(writtenCheckpoint).not.toBeNull();
    expect(writtenCheckpoint!.phase).toBe("execute");
    expect(writtenCheckpoint!.runId).toBe(runId);

    // -----------------------------------------------------------------------
    // Step 8: Record an engineering review (approved / pass)
    // -----------------------------------------------------------------------
    const reviewInput = skillReviewToCore(
      {
        verdict: "pass",
        summary: "Implementation is correct and well-tested",
        findings: [],
        projectId: "proj-lifecycle",
      },
      specId,
      "engineering",
    );
    await recordReview(projectRoot, reviewInput);

    // For a "change" spec, we also need a qa review — record it as passing
    const qaReviewInput = skillReviewToCore(
      {
        verdict: "pass",
        summary: "QA checks passed",
        findings: [],
        projectId: "proj-lifecycle",
      },
      specId,
      "qa",
    );
    await recordReview(projectRoot, qaReviewInput);

    // -----------------------------------------------------------------------
    // Step 9: Record a verification result (passed)
    // -----------------------------------------------------------------------
    const verificationInput = skillVerificationToCore(
      {
        specId,
        passed: true,
        checksRun: ["lint", "test", "type-check"],
        failures: [],
        projectId: "proj-lifecycle",
      },
      runId,
    );
    await recordVerification(projectRoot, verificationInput);

    // -----------------------------------------------------------------------
    // Step 10: Check reviews — should show engineering + qa complete
    // -----------------------------------------------------------------------
    const reviewCheck = await checkRequiredReviews(specId, "change", projectRoot);
    expect(reviewCheck.required).toContain("engineering");
    expect(reviewCheck.required).toContain("qa");
    expect(reviewCheck.passing).toContain("engineering");
    expect(reviewCheck.passing).toContain("qa");
    expect(reviewCheck.missing).toHaveLength(0);
    expect(reviewCheck.failing).toHaveLength(0);
    expect(reviewCheck.complete).toBe(true);

    const reviewsDone = await isReviewComplete(specId, "change", projectRoot);
    expect(reviewsDone).toBe(true);

    // -----------------------------------------------------------------------
    // Step 11: Check release state
    // -----------------------------------------------------------------------
    const releaseState = await deriveReleaseState(specId, "change", projectRoot, {
      runId,
    });
    expect(releaseState.implementationComplete).toBe(true); // checkpoint exists
    expect(releaseState.reviewsComplete).toBe(true);
    expect(releaseState.verificationComplete).toBe(true);
    expect(releaseState.approvalsComplete).toBe(true); // no approvals pending
    expect(releaseState.decision).toBe("ready");
    expect(releaseState.missingEvidence).toHaveLength(0);

    // -----------------------------------------------------------------------
    // Step 12: Resume again — should find checkpoint (not cold start)
    // -----------------------------------------------------------------------
    const resumeResult2 = await resumeFromArtifacts(projectRoot, projectId);
    expect(resumeResult2.source).toBe("checkpoint");
    expect(resumeResult2.workflow.phase).toBe("execute");
    expect(resumeResult2.workflow.activeSpecId).toBe(specId);
  });
});

// ---------------------------------------------------------------------------
// Focused unit-style integration cases
// ---------------------------------------------------------------------------

describe("resume from artifacts", () => {
  it("returns artifacts source when only a spec exists (no checkpoint)", async () => {
    const specId = "spec-resume-only" as EntityId;
    const spec = skillSpecToCore(
      {
        title: "Resume From Spec",
        type: "change",
        status: "approved",
        acceptanceCriteria: ["AC 1"],
      },
      specId,
    );
    const specRepo = createSpecRepository(projectRoot);
    await specRepo.writeMetadata(specId, spec);

    const result = await resumeFromArtifacts(
      projectRoot,
      "proj-resume" as EntityId,
    );
    expect(result.source).toBe("artifacts");
    expect(result.workflow.phase).toBe("plan");
    expect(result.workflow.activeSpecId).toBe(specId);
  });

  it("returns artifacts source with execute phase when plan exists", async () => {
    const specId = "spec-with-plan" as EntityId;
    const planId = "plan-for-resume" as EntityId;

    const spec = skillSpecToCore(
      {
        title: "Spec With Plan",
        type: "change",
        status: "approved",
        acceptanceCriteria: ["AC 1"],
      },
      specId,
    );
    const plan = skillPlanToCore(
      { title: "Plan For Resume", specId },
      planId,
    );

    const specRepo = createSpecRepository(projectRoot);
    const planRepo = createPlanRepository(projectRoot);
    await specRepo.writeMetadata(specId, spec);
    await planRepo.writeMetadata(planId, plan);

    const result = await resumeFromArtifacts(
      projectRoot,
      "proj-resume-plan" as EntityId,
    );
    expect(result.source).toBe("artifacts");
    expect(result.workflow.phase).toBe("execute");
    expect(result.workflow.activeSpecId).toBe(specId);
  });
});

describe("gate evaluator edge cases", () => {
  it("spec->plan is blocked when spec has no acceptance criteria", async () => {
    const specId = "spec-no-ac" as EntityId;
    const spec = skillSpecToCore(
      {
        title: "Spec Without AC",
        type: "change",
        status: "approved",
        acceptanceCriteria: [], // empty
      },
      specId,
    );
    const specRepo = createSpecRepository(projectRoot);
    await specRepo.writeMetadata(specId, spec);

    const result = await evaluateTransition("spec", "plan", projectRoot, specId);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("spec has no acceptance criteria");
  });

  it("plan->execute is blocked when task graph is missing", async () => {
    const specId = "spec-no-graph" as EntityId;
    const planId = "plan-no-graph" as EntityId;

    const spec = skillSpecToCore(
      {
        title: "Spec No Graph",
        type: "change",
        status: "approved",
        acceptanceCriteria: ["AC 1"],
      },
      specId,
    );
    const plan = skillPlanToCore(
      { title: "Plan No Graph", specId },
      planId,
    );

    await createSpecRepository(projectRoot).writeMetadata(specId, spec);
    await createPlanRepository(projectRoot).writeMetadata(planId, plan);
    // Intentionally do NOT write task-graph.json

    const result = await evaluateTransition("plan", "execute", projectRoot, specId);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("task graph file does not exist");
  });
});

describe("review orchestration", () => {
  it("change spec requires engineering and qa reviews", async () => {
    const specId = "spec-review-check" as EntityId;
    const result = await checkRequiredReviews(specId, "change", projectRoot);

    expect(result.required).toEqual(expect.arrayContaining(["engineering", "qa"]));
    expect(result.present).toHaveLength(0);
    expect(result.missing).toEqual(expect.arrayContaining(["engineering", "qa"]));
    expect(result.complete).toBe(false);
  });

  it("task spec only requires engineering review", async () => {
    const specId = "spec-task-review" as EntityId;
    const result = await checkRequiredReviews(specId, "task", projectRoot);

    expect(result.required).toEqual(["engineering"]);
    expect(result.complete).toBe(false);
  });

  it("shows complete after all required reviews pass", async () => {
    const specId = "spec-reviews-done" as EntityId;

    // Write engineering review
    const engReview = skillReviewToCore(
      { verdict: "pass", summary: "LGTM" },
      specId,
      "engineering",
    );
    await recordReview(projectRoot, engReview);

    // task type only requires engineering
    const result = await checkRequiredReviews(specId, "task", projectRoot);
    expect(result.complete).toBe(true);
    expect(result.passing).toContain("engineering");
    expect(result.missing).toHaveLength(0);
  });
});

describe("release state via CLI path (runId from checkpoint)", () => {
  it("derives release-ready state when runId is read from checkpoint, not injected", async () => {
    // This test mirrors the real SKILL.md flow:
    // 1. Checkpoint is written with runId (during execute/verify)
    // 2. Verification is recorded with the same runId
    // 3. release-state CLI reads runId from the checkpoint (NOT passed as argument)
    //
    // The original bug: cmdReleaseState didn't read runId from checkpoint,
    // so deriveReleaseState always got runId=undefined → verificationComplete=false.

    const specId = "spec-cli-release" as EntityId;
    const runId = "run-cli-release" as EntityId;

    // Write a checkpoint with runId (as the skill does during build)
    const checkpoint = skillCheckpointToCore({
      phase: "verify",
      runId,
      activeSpecId: specId,
      projectId: "proj-cli",
    });
    const checkpointRepo = createCheckpointRepository(projectRoot);
    await checkpointRepo.write(checkpoint, "# Checkpoint: verify");

    // Write passing verification for this runId
    await recordVerification(
      projectRoot,
      skillVerificationToCore({ specId, passed: true, checksRun: ["test"] }, runId),
    );

    // Write passing engineering review (task type only needs engineering)
    await recordReview(
      projectRoot,
      skillReviewToCore({ verdict: "pass", summary: "OK" }, specId, "engineering"),
    );

    // Simulate the CLI path: read runId from checkpoint, then call deriveReleaseState
    const latestCheckpoint = await checkpointRepo.readLatest();
    expect(latestCheckpoint).not.toBeNull();
    expect(latestCheckpoint!.runId).toBe(runId);

    const resolvedRunId = latestCheckpoint!.runId ?? undefined;
    const result = await deriveReleaseState(specId, "task", projectRoot, {
      runId: resolvedRunId,
    });

    expect(result.verificationComplete).toBe(true);
    expect(result.implementationComplete).toBe(true);
    expect(result.reviewsComplete).toBe(true);
    expect(result.decision).toBe("ready");
    expect(result.missingEvidence).toHaveLength(0);
  });

  it("returns hold when checkpoint has no runId", async () => {
    const specId = "spec-no-runid" as EntityId;

    // Write a checkpoint WITHOUT runId
    const checkpoint = skillCheckpointToCore({
      phase: "verify",
      activeSpecId: specId,
      // runId intentionally omitted
    });
    const checkpointRepo = createCheckpointRepository(projectRoot);
    await checkpointRepo.write(checkpoint, "# Checkpoint: verify");

    // Simulate CLI path: read runId from checkpoint (will be null)
    const latestCheckpoint = await checkpointRepo.readLatest();
    const resolvedRunId = latestCheckpoint?.runId ?? undefined;

    const result = await deriveReleaseState(specId, "task", projectRoot, {
      runId: resolvedRunId,
    });

    expect(result.verificationComplete).toBe(false);
    expect(result.decision).toBe("hold");
    expect(result.missingEvidence).toContain("no verification run ID provided");
  });
});

describe("release state derivation", () => {
  it("returns hold when no checkpoint, reviews, or verification exist", async () => {
    const specId = "spec-cold-release" as EntityId;
    const result = await deriveReleaseState(specId, "task", projectRoot);

    expect(result.decision).toBe("hold");
    expect(result.implementationComplete).toBe(false);
    expect(result.reviewsComplete).toBe(false);
    expect(result.verificationComplete).toBe(false);
    expect(result.missingEvidence.length).toBeGreaterThan(0);
  });

  it("returns ready when all evidence is present", async () => {
    const specId = "spec-ready" as EntityId;
    const runId = "run-ready" as EntityId;

    // Write passing engineering review (task type only needs engineering)
    await recordReview(
      projectRoot,
      skillReviewToCore({ verdict: "pass", summary: "OK" }, specId, "engineering"),
    );

    // Write passing verification
    await recordVerification(
      projectRoot,
      skillVerificationToCore({ specId, passed: true, checksRun: ["test"] }, runId),
    );

    // Write checkpoint
    const checkpoint = skillCheckpointToCore({
      phase: "verify",
      runId,
      activeSpecId: specId,
    });
    const checkpointRepo = createCheckpointRepository(projectRoot);
    await checkpointRepo.write(checkpoint, `# Checkpoint: verify`);

    const result = await deriveReleaseState(specId, "task", projectRoot, { runId });
    expect(result.decision).toBe("ready");
    expect(result.implementationComplete).toBe(true);
    expect(result.reviewsComplete).toBe(true);
    expect(result.verificationComplete).toBe(true);
    expect(result.approvalsComplete).toBe(true);
    expect(result.missingEvidence).toHaveLength(0);
  });
});
