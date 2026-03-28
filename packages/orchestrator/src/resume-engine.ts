import type { AbsolutePath, EntityId, WorkflowPhase } from "@prism/core";
import {
  createCheckpointRepository,
  createSpecRepository,
  createPlanRepository,
  projectPaths,
} from "@prism/memory";
import { readdir } from "node:fs/promises";

import {
  createInitialWorkflowState,
  type WorkflowCheckpointSummary,
  type WorkflowState,
} from "./workflow";
import { readRegistryStatus, type RegistryStatusResult } from "./adapters";

export interface ResumeResult {
  workflow: WorkflowState;
  summary: WorkflowCheckpointSummary;
  source: "checkpoint" | "artifacts" | "registry" | "cold_start";
}

/**
 * Resume workflow state from canonical artifacts.
 *
 * Priority:
 *   1. Checkpoint (latest.json) — most complete snapshot
 *   2. Artifact scan (specs, plans) — derive phase from what exists
 *   3. Registry fallback — legacy path, console.warn emitted
 *   4. Cold start — no state found, begin at "understand"
 */
export async function resumeFromArtifacts(
  projectRoot: AbsolutePath,
  projectId: EntityId,
  changeName?: string,
): Promise<ResumeResult> {
  // 1. Try checkpoint
  const checkpointRepo = createCheckpointRepository(projectRoot);
  const checkpoint = await checkpointRepo.readLatest();

  if (checkpoint) {
    const workflow = createInitialWorkflowState(projectId, checkpoint.activeSpecId);
    workflow.phase = checkpoint.phase;
    workflow.blockers = checkpoint.blockers ?? [];
    workflow.approvalsPending = checkpoint.approvalsPending ?? [];
    workflow.transitionHistory = [
      { from: "resume" as WorkflowPhase, to: checkpoint.phase, reason: "resume" },
    ];

    return {
      workflow,
      summary: {
        phase: checkpoint.phase,
        activeSpecId: checkpoint.activeSpecId,
        blockers: checkpoint.blockers ?? [],
        nextActions: checkpoint.nextRecommendedActions ?? [],
      },
      source: "checkpoint",
    };
  }

  // 2. Try artifact scan
  const artifactResult = await derivePhaseFromArtifacts(projectRoot);
  if (artifactResult) {
    const workflow = createInitialWorkflowState(projectId, artifactResult.activeSpecId);
    workflow.phase = artifactResult.phase;
    workflow.transitionHistory = [
      { from: "resume" as WorkflowPhase, to: artifactResult.phase, reason: "resume" },
    ];

    return {
      workflow,
      summary: {
        phase: artifactResult.phase,
        activeSpecId: artifactResult.activeSpecId,
        blockers: [],
        nextActions: [],
      },
      source: "artifacts",
    };
  }

  // 3. Registry fallback
  if (changeName) {
    try {
      const registryResult = await readRegistryStatus(projectRoot, changeName);
      const registry: RegistryStatusResult = registryResult.data;
      if (registry?.change?.stage) {
        console.warn(
          "Resuming from legacy registry. Run a lifecycle transition to migrate to canonical artifacts.",
        );
        const phase = mapRegistryStageToWorkflowPhase(registry.change.stage);
        const workflow = createInitialWorkflowState(projectId, null);
        workflow.phase = phase;
        workflow.blockers = registry.checkpoint?.open_questions ?? [];
        workflow.transitionHistory = [
          { from: "resume" as WorkflowPhase, to: phase, reason: "resume" },
        ];

        return {
          workflow,
          summary: {
            phase,
            activeSpecId: null,
            blockers: workflow.blockers,
            nextActions: registry.checkpoint?.next_steps ?? [],
          },
          source: "registry",
        };
      }
    } catch {
      // Registry unavailable — fall through to cold start
    }
  }

  // 4. Cold start
  const workflow = createInitialWorkflowState(projectId, null);
  return {
    workflow,
    summary: {
      phase: "understand",
      activeSpecId: null,
      blockers: [],
      nextActions: [],
    },
    source: "cold_start",
  };
}

interface ArtifactPhaseResult {
  phase: WorkflowPhase;
  activeSpecId: EntityId | null;
}

/**
 * Scan canonical artifact directories to derive the current phase.
 * Returns the highest phase that has artifacts (with the active spec ID), or null if nothing found.
 */
async function derivePhaseFromArtifacts(
  projectRoot: AbsolutePath,
): Promise<ArtifactPhaseResult | null> {
  const paths = projectPaths(projectRoot);

  const hasEntries = async (dir: string): Promise<boolean> => {
    try {
      const entries = await readdir(dir);
      return entries.length > 0;
    } catch {
      return false;
    }
  };

  // Check from highest phase to lowest
  // Plans exist → at least "plan" phase
  // Specs exist → at least "spec" phase
  const hasPlan = await hasEntries(paths.plansDir);
  if (hasPlan) {
    const planRepo = createPlanRepository(projectRoot);
    const planIds = await planRepo.list();
    if (planIds.length > 0) {
      // Find the spec ID from the most recent plan
      for (const planId of planIds) {
        const plan = await planRepo.readMetadata(planId);
        if (plan?.specId) {
          return { phase: "execute", activeSpecId: plan.specId as EntityId };
        }
      }
      return { phase: "execute", activeSpecId: null };
    }
  }

  const hasSpec = await hasEntries(paths.specsDir);
  if (hasSpec) {
    const specRepo = createSpecRepository(projectRoot);
    const specIds = await specRepo.list();
    for (const id of specIds) {
      const spec = await specRepo.readMetadata(id);
      if (spec?.status === "approved") {
        return { phase: "plan", activeSpecId: id };
      }
    }
    // Draft spec found — return the first one
    if (specIds.length > 0) {
      return { phase: "spec", activeSpecId: specIds[0] ?? null };
    }
    return { phase: "spec", activeSpecId: null };
  }

  return null;
}

function mapRegistryStageToWorkflowPhase(stage: string): WorkflowPhase {
  switch (stage) {
    case "understand":
      return "understand";
    case "plan":
      return "plan";
    case "build":
      return "execute";
    case "verify":
    case "design":
    case "design_review":
      return "verify";
    case "ship":
      return "release";
    default:
      console.warn(`Unknown registry stage "${stage}", falling back to "understand"`);
      return "understand";
  }
}
