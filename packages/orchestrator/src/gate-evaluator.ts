import type { AbsolutePath, GateResult, WorkflowPhase } from "@prism/core";
import {
  createSpecRepository,
  createPlanRepository,
  createCheckpointRepository,
  createVerificationRepository,
  projectPaths,
  planPaths,
} from "@prism/memory";
import { isReviewComplete } from "@prism/guardian";
import { access } from "node:fs/promises";

import { DEFAULT_WORKFLOW_SEQUENCE } from "./workflow";

/** Valid forward transitions from each phase. */
const VALID_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
  understand: ["identify_problem"],
  identify_problem: ["spec"],
  spec: ["plan"],
  plan: ["execute"],
  execute: ["verify"],
  verify: ["release"],
  release: [],
  resume: [
    "understand",
    "identify_problem",
    "spec",
    "plan",
    "execute",
    "verify",
    "release",
  ],
};

function phaseIndex(phase: WorkflowPhase): number {
  return DEFAULT_WORKFLOW_SEQUENCE.indexOf(phase);
}

function isRegression(from: WorkflowPhase, to: WorkflowPhase): boolean {
  const fromIdx = phaseIndex(from);
  const toIdx = phaseIndex(to);
  // resume has no index in the default sequence; it's never a regression source
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx < fromIdx;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function evaluateTransition(
  from: WorkflowPhase,
  to: WorkflowPhase,
  projectRoot: AbsolutePath,
  activeSpecId?: string,
): Promise<GateResult> {
  // Regression transitions are allowed
  if (isRegression(from, to)) {
    return { allowed: true, blockers: [], evidence: ["regression allowed"] };
  }

  // Check if the transition is valid (forward)
  const validTargets = VALID_TRANSITIONS[from];
  if (!validTargets || !validTargets.includes(to)) {
    return {
      allowed: false,
      blockers: [`invalid transition from ${from} to ${to}`],
      evidence: [],
    };
  }

  // Evaluate gate requirements per transition
  const blockers: string[] = [];
  const evidence: string[] = [];

  if (from === "understand" && to === "identify_problem") {
    const prismDir = projectPaths(projectRoot).prismDir;
    if (await pathExists(prismDir)) {
      evidence.push(".prism/ directory exists");
    } else {
      blockers.push(".prism/ directory does not exist");
    }
  }

  if (from === "identify_problem" && to === "spec") {
    // Lightweight — no artifact requirement
    evidence.push("lightweight transition, no artifacts required");
  }

  if (from === "spec" && to === "plan") {
    if (!activeSpecId) {
      blockers.push("no active spec ID provided");
    } else {
      const specRepo = createSpecRepository(projectRoot);
      const spec = await specRepo.readMetadata(activeSpecId);
      if (!spec) {
        blockers.push(`spec ${activeSpecId} not found`);
      } else {
        if (spec.status !== "approved") {
          blockers.push(`spec status is "${spec.status}", expected "approved"`);
        }
        if (!spec.acceptanceCriteria || spec.acceptanceCriteria.length === 0) {
          blockers.push("spec has no acceptance criteria");
        }
        if (spec.status === "approved" && spec.acceptanceCriteria?.length > 0) {
          evidence.push("spec is approved with acceptance criteria");
        }
      }
    }
  }

  if (from === "plan" && to === "execute") {
    if (!activeSpecId) {
      blockers.push("no active spec ID provided");
    } else {
      const planRepo = createPlanRepository(projectRoot);
      const planIds = await planRepo.list();
      // Find a plan for this spec
      let foundPlan = false;
      for (const planId of planIds) {
        const plan = await planRepo.readMetadata(planId);
        if (plan && plan.specId === activeSpecId) {
          foundPlan = true;
          evidence.push(`plan ${planId} exists for spec ${activeSpecId}`);
          // Check task graph file exists
          const paths = planPaths(projectRoot, planId);
          if (await pathExists(paths.taskGraphFile)) {
            evidence.push("task graph file exists");
          } else {
            blockers.push("task graph file does not exist");
          }
          break;
        }
      }
      if (!foundPlan) {
        blockers.push("no plan found for spec");
      }
    }
  }

  if (from === "execute" && to === "verify") {
    const checkpointRepo = createCheckpointRepository(projectRoot);
    if (await checkpointRepo.exists()) {
      evidence.push("checkpoint exists");
    } else {
      blockers.push("no checkpoint found");
    }
  }

  if (from === "verify" && to === "release") {
    if (!activeSpecId) {
      blockers.push("no active spec ID provided");
    } else {
      // Read the spec to determine its type for the review matrix
      const specRepo = createSpecRepository(projectRoot);
      const spec = await specRepo.readMetadata(activeSpecId);
      if (!spec) {
        blockers.push(`spec ${activeSpecId} not found`);
      } else {
        // Check reviews
        const reviewsPass = await isReviewComplete(activeSpecId, spec.type, projectRoot);
        if (reviewsPass) {
          evidence.push("all required reviews passing");
        } else {
          blockers.push("required reviews incomplete or not passing");
        }

        // Check verification result exists and passed
        const checkpointRepo = createCheckpointRepository(projectRoot);
        const checkpoint = await checkpointRepo.readLatest();
        const runId = checkpoint?.runId;
        if (runId) {
          const verifyRepo = createVerificationRepository(projectRoot);
          const verification = await verifyRepo.read(runId);
          if (verification?.passed) {
            evidence.push("verification passed");
          } else {
            blockers.push("verification not passed");
          }
        } else {
          blockers.push("no run ID in checkpoint for verification lookup");
        }
      }
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    evidence,
  };
}
