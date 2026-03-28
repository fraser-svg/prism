import type { AbsolutePath, DeviationRule, EntityId, GateResult, WorkflowPhase } from "@prism/core";
import { evaluatePlanQuality } from "./plan-quality-checker";
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

export const DEFAULT_DEVIATION_RULES: DeviationRule[] = [
  { severity: "auto_fix", description: "Bug discovered during implementation", action: "Fix inline, existing files only. Note in status output." },
  { severity: "auto_fix_critical", description: "Missing security/validation", action: "Fix inline, existing files only. Add to must-haves. Note in status." },
  { severity: "auto_fix_blocking", description: "Missing dependency/broken import", action: "Fix in existing files only. Note in status." },
  { severity: "ask_user", description: "Architectural change, scope expansion, OR any fix needing new files", action: "STOP. Present options via AskUserQuestion." },
];

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
      // Parallel metadata reads instead of sequential loop
      const plans = await Promise.all(planIds.map((id) => planRepo.readMetadata(id)));
      const matchIdx = plans.findIndex((p) => p && p.specId === activeSpecId);
      if (matchIdx !== -1) {
        const planId = planIds[matchIdx]!;
        evidence.push(`plan ${planId} exists for spec ${activeSpecId}`);
        // Check task graph file exists
        const paths = planPaths(projectRoot, planId);
        if (await pathExists(paths.taskGraphFile)) {
          evidence.push("task graph file exists");
          // Quality gate check
          const qualityResult = await evaluatePlanQuality(projectRoot, planId, activeSpecId! as EntityId);
          if (!qualityResult.passed && !qualityResult.legacy) {
            blockers.push(qualityResult.summary);
            for (const qDim of qualityResult.dimensions.filter((d) => !d.passed)) {
              blockers.push(`  ${qDim.name}: ${qDim.details}`);
            }
          }
          if (qualityResult.legacy) {
            evidence.push("legacy plan format — quality check skipped");
          }
          if (qualityResult.passed) {
            evidence.push(qualityResult.summary);
          }
        } else {
          blockers.push("task graph file does not exist");
        }
      } else {
        blockers.push("no plan found for spec");
      }
    }
  }

  if (from === "execute" && to === "verify") {
    const checkpointRepo = createCheckpointRepository(projectRoot);
    if (activeSpecId) {
      const checkpoint = await checkpointRepo.readLatestForSpec(activeSpecId as EntityId);
      if (checkpoint) {
        evidence.push("checkpoint exists for spec");
      } else {
        blockers.push("no checkpoint found for spec");
      }
    } else if (await checkpointRepo.exists()) {
      evidence.push("checkpoint exists");
    } else {
      blockers.push("no checkpoint found");
    }
  }

  if (from === "verify" && to === "release") {
    if (!activeSpecId) {
      blockers.push("no active spec ID provided");
    } else {
      // Parallel round 1: read spec + checkpoint simultaneously
      const specRepo = createSpecRepository(projectRoot);
      const checkpointRepo = createCheckpointRepository(projectRoot);
      const [spec, checkpoint] = await Promise.all([
        specRepo.readMetadata(activeSpecId),
        checkpointRepo.readLatestForSpec(activeSpecId as EntityId),
      ]);

      if (!spec) {
        blockers.push(`spec ${activeSpecId} not found`);
      } else {
        // Parallel round 2: reviews + verification (depend on spec.type and checkpoint.runId)
        const runId = checkpoint?.runId;
        const [reviewsPass, verification] = await Promise.all([
          isReviewComplete(activeSpecId, spec.type, projectRoot),
          runId
            ? createVerificationRepository(projectRoot).read(runId)
            : Promise.resolve(null),
        ]);

        if (reviewsPass) {
          evidence.push("all required reviews passing");
        } else {
          blockers.push("required reviews incomplete or not passing");
        }

        if (runId) {
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
