import type { AbsolutePath, EntityId, ReleaseDecision, SpecType } from "@prism/core";
import { createVerificationRepository } from "@prism/memory";
import { CheckpointRepository } from "@prism/memory";
import { isReviewComplete } from "./review-orchestration";

export interface ReleaseEvidence {
  implementationComplete: boolean;
  reviewsComplete: boolean;
  verificationComplete: boolean;
  approvalsComplete: boolean;
  decision: ReleaseDecision;
  missingEvidence: string[];
}

export async function deriveReleaseState(
  specId: EntityId,
  specType: SpecType,
  projectRoot: AbsolutePath,
  options?: {
    runId?: EntityId;
    approvalsPending?: unknown[];
  },
): Promise<ReleaseEvidence> {
  const missingEvidence: string[] = [];

  // 1. Check implementation (checkpoint exists for this spec)
  const checkpointRepo = new CheckpointRepository(projectRoot);
  const checkpoint = await checkpointRepo.readLatestForSpec(specId);
  const implementationComplete = checkpoint !== null;
  if (!implementationComplete) missingEvidence.push("no checkpoint found");

  // 2. Check reviews
  const reviewsComplete = await isReviewComplete(specId, specType, projectRoot);
  if (!reviewsComplete) missingEvidence.push("required reviews incomplete");

  // 3. Check verification
  let verificationComplete = false;
  if (options?.runId) {
    const verifyRepo = createVerificationRepository(projectRoot);
    const verification = await verifyRepo.read(options.runId);
    verificationComplete = verification?.passed === true;
    if (!verificationComplete) missingEvidence.push("verification not passed");
  } else {
    missingEvidence.push("no verification run ID provided");
  }

  // 4. Check approvals
  const approvalsComplete = !options?.approvalsPending?.length;
  if (!approvalsComplete) missingEvidence.push("approvals pending");

  // 5. Derive decision
  let decision: ReleaseDecision;
  if (implementationComplete && reviewsComplete && verificationComplete && approvalsComplete) {
    decision = "ready";
  } else if (!approvalsComplete) {
    decision = "pending";
  } else {
    decision = "hold";
  }

  return {
    implementationComplete,
    reviewsComplete,
    verificationComplete,
    approvalsComplete,
    decision,
    missingEvidence,
  };
}
