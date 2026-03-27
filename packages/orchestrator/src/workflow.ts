import type { ApprovalRequirement, EntityId } from "@prism/core";

export const WORKFLOW_PHASES = [
  "understand",
  "identify_problem",
  "spec",
  "plan",
  "execute",
  "verify",
  "release",
  "resume",
] as const;

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export interface WorkflowTransition {
  from: WorkflowPhase;
  to: WorkflowPhase;
  reason:
    | "progress"
    | "regression"
    | "approval_pause"
    | "resume"
    | "verification_failure";
}

export interface WorkflowCheckpointSummary {
  phase: WorkflowPhase;
  activeSpecId: EntityId | null;
  blockers: string[];
  nextActions: string[];
}

export interface WorkflowState {
  phase: WorkflowPhase;
  projectId: EntityId;
  activeSpecId: EntityId | null;
  approvalsPending: ApprovalRequirement[];
  blockers: string[];
  transitionHistory: WorkflowTransition[];
}

export const DEFAULT_WORKFLOW_SEQUENCE: WorkflowPhase[] = [
  "understand",
  "identify_problem",
  "spec",
  "plan",
  "execute",
  "verify",
  "release",
];

export function getNextWorkflowPhase(phase: WorkflowPhase): WorkflowPhase | null {
  const index = DEFAULT_WORKFLOW_SEQUENCE.indexOf(phase);
  if (index === -1 || index === DEFAULT_WORKFLOW_SEQUENCE.length - 1) {
    return null;
  }
  return DEFAULT_WORKFLOW_SEQUENCE[index + 1] ?? null;
}

export function canAdvanceWorkflow(state: WorkflowState): boolean {
  return state.blockers.length === 0 && state.approvalsPending.length === 0;
}

export function createInitialWorkflowState(
  projectId: EntityId,
  activeSpecId: EntityId | null = null
): WorkflowState {
  return {
    phase: "understand",
    projectId,
    activeSpecId,
    approvalsPending: [],
    blockers: [],
    transitionHistory: [],
  };
}
