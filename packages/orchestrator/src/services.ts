import type { AbsolutePath, EntityId } from "@prism/core";
import { checkpointPaths, projectPaths, readProductMemory, saveCheckpoint } from "@prism/memory";
import { runVerification, type VerifyOptions, type VerifyResult } from "@prism/guardian";
import { saveMilestone, type SaveResult } from "@prism/execution";

import {
  createInitialWorkflowState,
  getNextWorkflowPhase,
  type WorkflowCheckpointSummary,
  type WorkflowState,
} from "./workflow";
import {
  planTaskGraph,
  readNextReadyTasks,
  readRegistryStatus,
  readTaskGraphStatus,
  scanProjectState,
  updateRegistryChange,
  type PrismScanResult,
  type RegistryStatusResult,
  type SupervisorPlanResult,
  type SupervisorStatusResult,
  type SupervisorTaskInput,
} from "./adapters";

export interface LoadedProjectContext {
  scan: PrismScanResult;
  memory: Awaited<ReturnType<typeof readProductMemory>>["data"];
  paths: ReturnType<typeof projectPaths>;
  checkpointFiles: ReturnType<typeof checkpointPaths>;
}

export interface ResumeProjectResult {
  context: LoadedProjectContext;
  registry: RegistryStatusResult | null;
  workflow: WorkflowState;
  summary: WorkflowCheckpointSummary;
}

export interface ExecutionPlanningResult {
  plan: SupervisorPlanResult;
  status: SupervisorStatusResult;
}

export interface VerificationGateResult {
  verification: VerifyResult;
  readyToAdvance: boolean;
}

export interface SaveMilestoneResult {
  save: SaveResult;
}

export async function loadProjectContext(
  projectRoot: AbsolutePath
): Promise<LoadedProjectContext> {
  const [scanResult, memoryResult] = await Promise.all([
    scanProjectState(projectRoot),
    readProductMemory(projectRoot),
  ]);

  return {
    scan: scanResult.data,
    memory: memoryResult.data,
    paths: projectPaths(projectRoot),
    checkpointFiles: checkpointPaths(projectRoot),
  };
}

export async function resumeProject(
  projectRoot: AbsolutePath,
  projectId: EntityId,
  changeName?: string
): Promise<ResumeProjectResult> {
  const context = await loadProjectContext(projectRoot);
  const registry = changeName
    ? (await readRegistryStatus(projectRoot, changeName)).data
    : null;

  const workflow = createInitialWorkflowState(projectId, null);
  if (registry?.change?.stage) {
    const phase = mapRegistryStageToWorkflowPhase(registry.change.stage);
    workflow.phase = phase;
    workflow.transitionHistory = [
      {
        from: "resume",
        to: phase,
        reason: "resume",
      },
    ];
  }

  const summary: WorkflowCheckpointSummary = {
    phase: workflow.phase,
    activeSpecId: workflow.activeSpecId,
    blockers: registry?.checkpoint?.open_questions ?? [],
    nextActions: registry?.checkpoint?.next_steps ?? [],
  };

  return {
    context,
    registry,
    workflow,
    summary,
  };
}

export async function updateWorkflowCheckpoint(
  projectRoot: AbsolutePath,
  changeName: string,
  summary: {
    stage?: number | string;
    progress?: string;
    decisions?: string[];
    preferences?: string[];
    nextSteps?: string[];
  }
): Promise<Awaited<ReturnType<typeof saveCheckpoint>>["data"]> {
  const result = await saveCheckpoint(projectRoot, changeName, {
    stage: summary.stage,
    progress: summary.progress,
    decisions: summary.decisions,
    preferences: summary.preferences,
    next_steps: summary.nextSteps,
  });

  return result.data;
}

export async function setWorkflowStage(
  projectRoot: AbsolutePath,
  changeName: string,
  stage:
    | "understand"
    | "plan"
    | "build"
    | "verify"
    | "ship"
    | "design"
    | "design_review"
): Promise<RegistryStatusResult> {
  const result = await updateRegistryChange(projectRoot, changeName, { stage });
  return result.data;
}

export async function createExecutionPlan(
  projectRoot: AbsolutePath,
  changeName: string,
  graph: SupervisorTaskInput[]
): Promise<ExecutionPlanningResult> {
  const [plan, status] = await Promise.all([
    planTaskGraph(projectRoot, changeName, graph),
    planTaskGraph(projectRoot, changeName, graph).then(() =>
      readTaskGraphStatus(projectRoot, changeName)
    ),
  ]);

  return {
    plan: plan.data,
    status: status.data,
  };
}

export async function getReadyExecutionTasks(
  projectRoot: AbsolutePath,
  changeName: string
): Promise<SupervisorStatusResult> {
  const result = await readNextReadyTasks(projectRoot, changeName);
  return result.data;
}

export async function runVerificationGate(
  projectRoot: AbsolutePath,
  options: VerifyOptions = {}
): Promise<VerificationGateResult> {
  const verification = await runVerification(projectRoot, options);
  return {
    verification: verification.data,
    readyToAdvance: verification.data.passed,
  };
}

export async function saveProgressMilestone(
  projectRoot: AbsolutePath,
  milestone: string
): Promise<SaveMilestoneResult> {
  const save = await saveMilestone(projectRoot, milestone);
  return { save: save.data };
}

export function getRecommendedNextPhase(state: WorkflowState): WorkflowState["phase"] | null {
  return getNextWorkflowPhase(state.phase);
}

function mapRegistryStageToWorkflowPhase(
  stage: string
): WorkflowState["phase"] {
  switch (stage) {
    case "understand":
      return "understand";
    case "plan":
      return "plan";
    case "build":
      return "execute";
    case "verify":
    case "design_review":
      return "verify";
    case "ship":
      return "release";
    default:
      return "resume";
  }
}
