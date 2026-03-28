import type {
  AbsolutePath,
  Checkpoint,
  EntityId,
  ISODateString,
  Plan,
  ReleaseState,
  Review,
  Spec,
  VerificationResult,
} from "@prism/core";
import {
  checkpointPaths,
  createCheckpointRepository,
  createPlanRepository,
  createReleaseStateRepository,
  createReviewRepository,
  createSpecRepository,
  createVerificationRepository,
  projectPaths,
  readProductMemory,
  saveCheckpoint,
} from "@prism/memory";
import { runVerification, type VerifyOptions, type VerifyResult } from "@prism/guardian";
import { saveMilestone, type SaveResult } from "@prism/execution";

import {
  getNextWorkflowPhase,
  type WorkflowCheckpointSummary,
  type WorkflowState,
} from "./workflow";
import { resumeFromArtifacts } from "./resume-engine";
import {
  planTaskGraph,
  readNextReadyTasks,
  readRegistryStatus,
  readTaskGraphStatus,
  scanProjectState,
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
  const resumeResult = await resumeFromArtifacts(projectRoot, projectId, changeName);

  // Legacy field: attempt registry read for backward compat
  let registry: RegistryStatusResult | null = null;
  if (changeName) {
    try {
      registry = (await readRegistryStatus(projectRoot, changeName)).data;
    } catch {
      // Registry unavailable — that's fine in M2+
    }
  }

  return {
    context,
    registry,
    workflow: resumeResult.workflow,
    summary: resumeResult.summary,
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

export async function createExecutionPlan(
  projectRoot: AbsolutePath,
  changeName: string,
  graph: SupervisorTaskInput[]
): Promise<ExecutionPlanningResult> {
  const plan = await planTaskGraph(projectRoot, changeName, graph);
  const status = await readTaskGraphStatus(projectRoot, changeName);

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

// ---------------------------------------------------------------------------
// Canonical entity writers
// ---------------------------------------------------------------------------

function generateEntityId(): EntityId {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as EntityId;
}

export async function createSpec(
  projectRoot: AbsolutePath,
  spec: Omit<Spec, "id" | "createdAt" | "updatedAt">,
): Promise<Spec> {
  const repo = createSpecRepository(projectRoot);
  const now = new Date().toISOString() as ISODateString;
  const full: Spec = { ...spec, id: generateEntityId(), createdAt: now, updatedAt: now };
  await repo.writeMetadata(full.id, full);
  return full;
}

export async function approveSpec(
  projectRoot: AbsolutePath,
  specId: EntityId,
): Promise<Spec> {
  const repo = createSpecRepository(projectRoot);
  const spec = await repo.readMetadata(specId);
  if (!spec) throw new Error(`Spec ${specId} not found`);
  const now = new Date().toISOString() as ISODateString;
  const approved: Spec = { ...spec, status: "approved", updatedAt: now };
  await repo.writeMetadata(specId, approved);
  return approved;
}

export async function createPlan(
  projectRoot: AbsolutePath,
  plan: Omit<Plan, "id" | "createdAt" | "updatedAt">,
): Promise<Plan> {
  const repo = createPlanRepository(projectRoot);
  const now = new Date().toISOString() as ISODateString;
  const full: Plan = { ...plan, id: generateEntityId(), createdAt: now, updatedAt: now };
  await repo.writeMetadata(full.id, full);
  return full;
}

export async function approvePlan(
  projectRoot: AbsolutePath,
  planId: EntityId,
): Promise<Plan> {
  const repo = createPlanRepository(projectRoot);
  const plan = await repo.readMetadata(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);
  return plan;
}

export async function recordVerification(
  projectRoot: AbsolutePath,
  result: Omit<VerificationResult, "id" | "createdAt" | "updatedAt"> | VerificationResult,
): Promise<VerificationResult> {
  const repo = createVerificationRepository(projectRoot);
  const now = new Date().toISOString() as ISODateString;
  const full: VerificationResult = "id" in result && result.id
    ? { ...result, updatedAt: now } as VerificationResult
    : { ...result, id: generateEntityId(), createdAt: now, updatedAt: now } as VerificationResult;
  await repo.write(full.runId, full);
  return full;
}

export async function recordReview(
  projectRoot: AbsolutePath,
  review: Omit<Review, "id" | "createdAt" | "updatedAt"> | Review,
): Promise<Review> {
  const repo = createReviewRepository(projectRoot);
  const now = new Date().toISOString() as ISODateString;
  const full: Review = "id" in review && review.id
    ? { ...review, updatedAt: now } as Review
    : { ...review, id: generateEntityId(), createdAt: now, updatedAt: now } as Review;
  // Write as <reviewType>.json (latest) + archive with timestamp to preserve history
  const slot = `${full.reviewType}.json`;
  const archiveSlot = `${full.reviewType}-${now.replace(/[:.]/g, "-")}.json`;
  const content = JSON.stringify(full, null, 2) + "\n";
  await repo.writeFile(full.specId, slot, content);
  await repo.writeFile(full.specId, archiveSlot, content);
  return full;
}

export async function recordReleaseState(
  projectRoot: AbsolutePath,
  releaseState: Omit<ReleaseState, "id" | "createdAt" | "updatedAt">,
): Promise<ReleaseState> {
  const repo = createReleaseStateRepository(projectRoot);
  const now = new Date().toISOString() as ISODateString;
  const full: ReleaseState = { ...releaseState, id: generateEntityId(), createdAt: now, updatedAt: now };
  await repo.write(full.specId, full);
  return full;
}
