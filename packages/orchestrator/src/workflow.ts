import {
  WORKFLOW_PHASES,
  type AbsolutePath,
  type EntityId,
  type GateResult,
  type WorkflowPhase,
  type WorkflowState,
  type WorkflowTransition,
} from "@prism/core";
import { evaluateTransition } from "./gate-evaluator";

export { WORKFLOW_PHASES };
export type { WorkflowPhase, WorkflowState, WorkflowTransition };

export interface WorkflowCheckpointSummary {
  phase: WorkflowPhase;
  activeSpecId: EntityId | null;
  blockers: string[];
  nextActions: string[];
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

/**
 * Lightweight synchronous check: returns true when the workflow state has
 * no blockers and no pending approvals.
 */
export function hasNoBlockers(state: WorkflowState): boolean {
  return state.blockers.length === 0 && state.approvalsPending.length === 0;
}

/**
 * Full async gate evaluation: checks both local state (blockers/approvals)
 * and artifact-based gate requirements for the next phase transition.
 */
export async function canAdvanceWorkflow(
  state: WorkflowState,
  projectRoot: AbsolutePath,
): Promise<GateResult> {
  const nextPhase = getNextWorkflowPhase(state.phase);
  if (!nextPhase) {
    return {
      allowed: false,
      blockers: [`no next phase from ${state.phase}`],
      evidence: [],
    };
  }

  if (!hasNoBlockers(state)) {
    return {
      allowed: false,
      blockers: [
        ...state.blockers,
        ...state.approvalsPending.map((a) => `approval pending: ${a.title}`),
      ],
      evidence: [],
    };
  }

  return evaluateTransition(
    state.phase,
    nextPhase,
    projectRoot,
    state.activeSpecId ?? undefined,
  );
}

export function createInitialWorkflowState(
  projectId: EntityId,
  activeSpecId: EntityId | null = null,
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
