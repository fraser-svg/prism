import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { TaskNode, ProviderCapability } from "@prism/core";
import type {
  ProviderAdapter,
  TaskResult,
  TokenEstimate,
  ExecutionContext,
} from "./provider-adapter";
import { DEFAULT_TIMEOUT_MS } from "./provider-adapter";
import { PRICING } from "./pricing";

const SCRIPT_NAME = "prism-gemini-worker.sh";

interface GeminiResult {
  status: "completed" | "failed";
  worker_id: string;
  provider: string;
  model: string;
  reason?: string;
  file_manifest: string[];
  staging_path?: string;
}

export class GoogleAdapter implements ProviderAdapter {
  readonly providerId = "google" as const;
  readonly displayName = "Google (Gemini)";

  private scriptPath: string;

  constructor(scriptsDir?: string) {
    this.scriptPath = scriptsDir
      ? resolve(scriptsDir, SCRIPT_NAME)
      : resolve(import.meta.dirname, "../../../scripts", SCRIPT_NAME);
  }

  capabilities(): ProviderCapability[] {
    return ["reasoning", "code_generation", "visual_design", "verification"];
  }

  async execute(task: TaskNode, context: ExecutionContext): Promise<TaskResult> {
    const timeoutMs = context.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const safeId = task.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const workerId = `adapter-${safeId}-${Date.now()}`;

    const stdinPayload = JSON.stringify({
      task: `${task.title}\n\n${task.description}`,
      files_to_read: context.filesToRead,
      constraints: context.constraints,
      shared_context: context.sharedContext,
      model: "gemini-2.5-pro",
    });

    return new Promise<TaskResult>((resolveResult) => {
      const child = spawn("bash", [this.scriptPath, context.projectRoot, workerId], {
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
      });

      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          if (child.pid) process.kill(-child.pid, "SIGTERM");
        } catch {
          // Process already exited
        }
      }, timeoutMs);

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.stdin?.write(stdinPayload);
      child.stdin?.end();

      child.on("close", async () => {
        clearTimeout(timer);

        if (timedOut) {
          resolveResult({
            status: "timeout",
            fileManifest: [],
            output: "",
            error: `Gemini worker timed out after ${timeoutMs}ms`,
          });
          return;
        }

        const resultPath = join(
          context.projectRoot,
          ".prism",
          "staging",
          workerId,
          "result.json",
        );

        try {
          const raw = await readFile(resultPath, "utf-8");
          const result: GeminiResult = JSON.parse(raw);

          resolveResult({
            status: result.status === "completed" ? "success" : "failed",
            fileManifest: result.file_manifest || [],
            output: raw,
            error: result.reason,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isNotFound = message.includes("ENOENT");

          resolveResult({
            status: "failed",
            fileManifest: [],
            output: stderr,
            error: isNotFound
              ? `Gemini worker did not produce result.json at ${resultPath}`
              : `Failed to parse result.json: ${message}`,
          });
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolveResult({
          status: "failed",
          fileManifest: [],
          output: "",
          error: `Failed to spawn Gemini worker: ${err.message}`,
        });
      });
    });
  }

  estimateCost(task: TaskNode): TokenEstimate | null {
    const estimate = Math.max(task.description.length / 4, 500);
    return {
      inputTokens: Math.round(estimate),
      outputTokens: Math.round(estimate * 2),
      estimatedCostUsd:
        (estimate / 1000) * PRICING.google.inputPer1k +
        ((estimate * 2) / 1000) * PRICING.google.outputPer1k,
    };
  }
}
