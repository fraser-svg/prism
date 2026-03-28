import type { ExecutionIntent, IntentCheckResult } from "@prism/core";
import type { WorkflowState } from "@prism/core";

const APPROVAL_REQUIRED_TYPES = new Set(["push", "deploy", "delete"]);

export function checkExecutionIntent(
  intent: ExecutionIntent,
  workflowState: WorkflowState,
): IntentCheckResult {
  if (intent.requiresApproval && workflowState.approvalsPending.length > 0) {
    return {
      allowed: false,
      reason: `Intent "${intent.type}" requires approval but ${workflowState.approvalsPending.length} approval(s) pending`,
    };
  }

  if (APPROVAL_REQUIRED_TYPES.has(intent.type) && workflowState.approvalsPending.length > 0) {
    return {
      allowed: false,
      reason: `"${intent.type}" blocked: ${workflowState.approvalsPending.length} approval(s) pending`,
    };
  }

  return { allowed: true, reason: "allowed" };
}
