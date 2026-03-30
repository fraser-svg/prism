import type { AbsolutePath, Checkpoint, EntityId, WorkflowPhase } from "@prism/core";
import {
  createCheckpointRepository,
  createSpecRepository,
  createPlanRepository,
  projectPaths,
} from "@prism/memory";
import { readdir, readFile } from "node:fs/promises";

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
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Checkpoint read failed (corrupt or missing): ${message}`);

    // Fallback: scan history directory for the most recent valid checkpoint
    try {
      const historyDir = `${projectRoot}/.prism/checkpoints/history`;
      const historyFiles = await readdir(historyDir);
      const jsonFiles = historyFiles.filter((f) => f.endsWith(".json")).sort().reverse();

      for (const file of jsonFiles) {
        try {
          const content = await readFile(`${historyDir}/${file}`, "utf-8");
          const checkpoint = JSON.parse(content) as Checkpoint;
          if (checkpoint.phase) {
            console.warn(`Recovered checkpoint from history: ${file}`);
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
        } catch {
          continue; // Corrupted history file — try next
        }
      }
    } catch {
      // History dir doesn't exist or is unreadable — fall through to artifact scan
    }
  }

  // 2. Try artifact scan
  let artifactResult: ArtifactPhaseResult | null = null;
  try {
    artifactResult = await derivePhaseFromArtifacts(projectRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Artifact scan failed (corrupt or missing files), falling through to registry: ${message}`);
  }
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

  // Parallel check: do plans and specs directories have entries?
  const [hasPlan, hasSpec] = await Promise.all([
    hasEntries(paths.plansDir),
    hasEntries(paths.specsDir),
  ]);

  // Check from highest phase to lowest
  // Plans exist → at least "plan" phase
  if (hasPlan) {
    const planRepo = createPlanRepository(projectRoot);
    const planIds = await planRepo.list();
    if (planIds.length > 0) {
      // Parallel metadata reads — allSettled so one corrupt file doesn't reject all
      const planResults = await Promise.allSettled(planIds.map((id) => planRepo.readMetadata(id)));
      const plans = planResults
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof planRepo.readMetadata>>> => r.status === "fulfilled")
        .map((r) => r.value);
      const withSpec = plans.find((p) => p?.specId);
      if (withSpec) {
        return { phase: "execute", activeSpecId: withSpec.specId as EntityId };
      }
      return { phase: "execute", activeSpecId: null };
    }
  }

  // Specs exist → at least "spec" phase
  if (hasSpec) {
    const specRepo = createSpecRepository(projectRoot);
    const specIds = await specRepo.list();
    // Parallel metadata reads — allSettled so one corrupt file doesn't reject all
    const specResults = await Promise.allSettled(specIds.map((id) => specRepo.readMetadata(id)));
    const specs = specResults
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof specRepo.readMetadata>>> => r.status === "fulfilled")
      .map((r) => r.value);
    const approved = specs.findIndex((s) => s?.status === "approved");
    if (approved !== -1) {
      return { phase: "plan", activeSpecId: specIds[approved]! };
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
