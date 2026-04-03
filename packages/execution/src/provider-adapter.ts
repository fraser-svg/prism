import type { ProviderId, ProviderCapability } from "@prism/core";
import type { TaskNode } from "@prism/core";

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  readonly displayName: string;

  execute(task: TaskNode, context: ExecutionContext): Promise<TaskResult>;
  capabilities(): ProviderCapability[];
  estimateCost?(task: TaskNode): TokenEstimate | null;
}

export interface TaskResult {
  status: "success" | "failed" | "timeout" | "skipped";
  fileManifest: string[];
  output: string;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
}

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface ExecutionContext {
  projectRoot: string;
  filesToRead: string[];
  constraints: string;
  sharedContext: string;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 120_000;
