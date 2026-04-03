import { execFile } from "node:child_process";
import { resolve } from "node:path";
import type { TaskNode, ProviderCapability } from "@prism/core";
import type {
  ProviderAdapter,
  TaskResult,
  TokenEstimate,
  ExecutionContext,
} from "./provider-adapter";
import { RuntimeMode, detectRuntimeMode } from "./runtime-mode";

const STATUS_SCRIPT = "prism-stitch-status.sh";

interface StitchStatus {
  repo_status: string;
  sdk_installed: boolean;
  keychain_connected: boolean;
  reason?: string;
}

export class StitchAdapter implements ProviderAdapter {
  readonly providerId = "stitch" as const;
  readonly displayName = "Google Stitch";

  private statusScriptPath: string;

  constructor(scriptsDir?: string) {
    this.statusScriptPath = scriptsDir
      ? resolve(scriptsDir, "stitch-mcp", STATUS_SCRIPT)
      : resolve(import.meta.dirname, "../../../scripts/stitch-mcp", STATUS_SCRIPT);
  }

  capabilities(): ProviderCapability[] {
    return ["visual_design"];
  }

  async execute(_task: TaskNode, _context: ExecutionContext): Promise<TaskResult> {
    const mode = detectRuntimeMode();

    if (mode === RuntimeMode.SKILL) {
      return {
        status: "skipped",
        fileManifest: [],
        output: "",
      };
    }

    // HEADLESS mode: Stitch requires MCP host (Claude Code). Cannot invoke programmatically yet.
    return {
      status: "failed",
      fileManifest: [],
      output: "",
      error: "Stitch adapter requires SKILL mode (Claude Code as MCP host). Headless invocation not yet supported.",
    };
  }

  estimateCost(_task: TaskNode): TokenEstimate | null {
    return null;
  }

  async checkStitchHealth(): Promise<StitchStatus> {
    return new Promise((res) => {
      execFile("bash", [this.statusScriptPath], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          res({
            repo_status: "unavailable",
            sdk_installed: false,
            keychain_connected: false,
            reason: err.message,
          });
          return;
        }
        try {
          res(JSON.parse(stdout) as StitchStatus);
        } catch {
          res({
            repo_status: "unavailable",
            sdk_installed: false,
            keychain_connected: false,
            reason: "Failed to parse status script output",
          });
        }
      });
    });
  }
}
