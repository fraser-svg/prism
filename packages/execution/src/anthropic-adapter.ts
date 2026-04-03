import type { TaskNode, ProviderCapability } from "@prism/core";
import type {
  ProviderAdapter,
  TaskResult,
  TokenEstimate,
  ExecutionContext,
} from "./provider-adapter";
import { DEFAULT_TIMEOUT_MS } from "./provider-adapter";
import { RuntimeMode, detectRuntimeMode } from "./runtime-mode";
import { PRICING } from "./pricing";

// @anthropic-ai/sdk is an optional peer dependency (only needed in HEADLESS mode)
interface AnthropicClient {
  messages: {
    create(params: Record<string, unknown>, opts?: Record<string, unknown>): Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerId = "anthropic" as const;
  readonly displayName = "Anthropic (Claude)";

  capabilities(): ProviderCapability[] {
    return ["reasoning", "code_generation", "verification", "tool_use"];
  }

  async execute(task: TaskNode, context: ExecutionContext): Promise<TaskResult> {
    const mode = detectRuntimeMode();

    if (mode === RuntimeMode.SKILL) {
      return {
        status: "skipped",
        fileManifest: [],
        output: "",
      };
    }

    const timeoutMs = context.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const sdkName = "@anthropic-ai/sdk";
      const sdk = await (import(/* webpackIgnore: true */ sdkName) as Promise<{ default: new () => AnthropicClient }>);
      const client = new sdk.default();

      const prompt = this.buildPrompt(task, context);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await client.messages.create(
          {
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }],
          },
          { signal: controller.signal },
        );

        clearTimeout(timer);

        const output =
          response.content
            .filter((b: { type: string; text?: string }): b is { type: "text"; text: string } => b.type === "text")
            .map((b: { type: "text"; text: string }) => b.text)
            .join("\n") || "";

        return {
          status: "success",
          fileManifest: [],
          output,
          tokensUsed: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return {
          status: "timeout",
          fileManifest: [],
          output: "",
          error: `Anthropic API timed out after ${timeoutMs}ms`,
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      const isAuth = message.includes("401") || message.includes("auth") || message.includes("API key");

      return {
        status: "failed",
        fileManifest: [],
        output: "",
        error: isAuth ? `Anthropic auth failed: ${message}` : message,
      };
    }
  }

  estimateCost(task: TaskNode): TokenEstimate | null {
    const estimate = Math.max(task.description.length / 4, 500);
    return {
      inputTokens: Math.round(estimate),
      outputTokens: Math.round(estimate * 2),
      estimatedCostUsd:
        (estimate / 1000) * PRICING.anthropic.inputPer1k +
        ((estimate * 2) / 1000) * PRICING.anthropic.outputPer1k,
    };
  }

  private buildPrompt(task: TaskNode, context: ExecutionContext): string {
    const parts: string[] = [];

    if (context.constraints) {
      parts.push(`## Constraints\n${context.constraints}`);
    }
    if (context.sharedContext) {
      parts.push(`## Context from prior workers\n${context.sharedContext}`);
    }
    if (context.filesToRead.length > 0) {
      parts.push(`## Files to reference\n${context.filesToRead.join("\n")}`);
    }

    parts.push(`## Task\n${task.title}\n\n${task.description}`);

    if (task.action) {
      parts.push(`## Action\n${task.action}`);
    }
    if (task.verificationRequirements.length > 0) {
      parts.push(`## Verification requirements\n${task.verificationRequirements.join("\n")}`);
    }

    return parts.join("\n\n");
  }
}
