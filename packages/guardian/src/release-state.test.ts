import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId, Checkpoint, VerificationResult } from "@prism/core";
import { deriveReleaseState } from "./release-state";

describe("deriveReleaseState", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;
  const specId = "spec-release-1" as EntityId;
  const runId = "run-1" as EntityId;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-release-test-"));
    projectRoot = tmpDir as AbsolutePath;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  async function writeCheckpoint() {
    const checkpointsDir = join(tmpDir, ".prism", "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });
    const checkpoint: Checkpoint = {
      id: "cp-1" as EntityId,
      projectId: "proj-1" as EntityId,
      runId: null,
      activeSpecId: null,
      phase: "execute",
      progressSummary: "done",
      keyDecisions: [],
      blockers: [],
      nextRecommendedActions: [],
      lastVerificationSummary: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(checkpoint, null, 2) + "\n",
    );
  }

  async function writeReview(reviewType: string, verdict: string) {
    const reviewDir = join(tmpDir, ".prism", "reviews", specId);
    await mkdir(reviewDir, { recursive: true });
    await writeFile(
      join(reviewDir, `${reviewType}.json`),
      JSON.stringify({ verdict }),
    );
  }

  async function writeVerification(passed: boolean) {
    const runDir = join(tmpDir, ".prism", "runs", runId);
    await mkdir(runDir, { recursive: true });
    const verification: VerificationResult = {
      id: "v-1" as EntityId,
      projectId: "proj-1" as EntityId,
      specId,
      runId,
      checksRun: ["lint", "test"],
      passed,
      failures: passed ? [] : [{ check: "test", details: "failed" }],
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(
      join(runDir, "verification.json"),
      JSON.stringify(verification, null, 2) + "\n",
    );
  }

  it("all evidence present -> decision=ready", async () => {
    // task spec only needs engineering review
    await writeCheckpoint();
    await writeReview("engineering", "pass");
    await writeVerification(true);

    const result = await deriveReleaseState(specId, "task", projectRoot, { runId });
    expect(result.implementationComplete).toBe(true);
    expect(result.reviewsComplete).toBe(true);
    expect(result.verificationComplete).toBe(true);
    expect(result.approvalsComplete).toBe(true);
    expect(result.decision).toBe("ready");
    expect(result.missingEvidence).toEqual([]);
  });

  it("missing checkpoint -> decision=hold", async () => {
    await writeReview("engineering", "pass");
    await writeVerification(true);

    const result = await deriveReleaseState(specId, "task", projectRoot, { runId });
    expect(result.implementationComplete).toBe(false);
    expect(result.decision).toBe("hold");
    expect(result.missingEvidence).toContain("no checkpoint found");
  });

  it("missing reviews -> decision=hold", async () => {
    await writeCheckpoint();
    await writeVerification(true);

    const result = await deriveReleaseState(specId, "task", projectRoot, { runId });
    expect(result.reviewsComplete).toBe(false);
    expect(result.decision).toBe("hold");
    expect(result.missingEvidence).toContain("required reviews incomplete");
  });

  it("missing verification -> decision=hold", async () => {
    await writeCheckpoint();
    await writeReview("engineering", "pass");

    const result = await deriveReleaseState(specId, "task", projectRoot);
    expect(result.verificationComplete).toBe(false);
    expect(result.decision).toBe("hold");
    expect(result.missingEvidence).toContain("no verification run ID provided");
  });

  it("verification failed -> decision=hold", async () => {
    await writeCheckpoint();
    await writeReview("engineering", "pass");
    await writeVerification(false);

    const result = await deriveReleaseState(specId, "task", projectRoot, { runId });
    expect(result.verificationComplete).toBe(false);
    expect(result.decision).toBe("hold");
    expect(result.missingEvidence).toContain("verification not passed");
  });

  it("pending approvals -> decision=pending", async () => {
    await writeCheckpoint();
    await writeReview("engineering", "pass");
    await writeVerification(true);

    const result = await deriveReleaseState(specId, "task", projectRoot, {
      runId,
      approvalsPending: [{ id: "approval-1" }],
    });
    expect(result.approvalsComplete).toBe(false);
    expect(result.decision).toBe("pending");
    expect(result.missingEvidence).toContain("approvals pending");
  });

  it("partial evidence -> decision=hold with correct missing list", async () => {
    // No checkpoint, no reviews, no verification
    const result = await deriveReleaseState(specId, "task", projectRoot);
    expect(result.decision).toBe("hold");
    expect(result.missingEvidence).toContain("no checkpoint found");
    expect(result.missingEvidence).toContain("required reviews incomplete");
    expect(result.missingEvidence).toContain("no verification run ID provided");
  });
});
