export type ExecutionIntentType = "save" | "push" | "deploy" | "delete";

export interface ExecutionIntent {
  type: ExecutionIntentType;
  target: string;
  requiresApproval: boolean;
}

export interface IntentCheckResult {
  allowed: boolean;
  reason: string;
}
