import type { AbsolutePath, ExecutionIntent } from "@prism/core";
import { execFileAsync, parseScriptJson, resolveScriptPath, type ScriptExecutionResult } from "@prism/core";
import { checkExecutionIntent } from "./intent-policy";
import type { WorkflowState } from "@prism/core";

export interface SaveResult {
  status: string;
  reason?: string;
  commit?: string;
  files_staged?: number;
  push?: string;
  branch?: string;
  milestone?: string;
}

function scriptPath(name: string): AbsolutePath {
  return resolveScriptPath(import.meta.url, name);
}

export async function saveMilestone(
  projectRoot: AbsolutePath,
  milestone: string,
  workflowState?: WorkflowState,
): Promise<ScriptExecutionResult<SaveResult>> {
  if (workflowState) {
    const intent: ExecutionIntent = {
      type: "save",
      target: milestone,
      requiresApproval: false,
    };
    const check = checkExecutionIntent(intent, workflowState);
    if (!check.allowed) {
      throw new Error(`Save blocked: ${check.reason}`);
    }
  }

  const { stdout } = await execFileAsync(scriptPath("prism-save.sh"), [projectRoot, milestone], {
    encoding: "utf8",
  });

  return parseScriptJson<SaveResult>(stdout);
}

export async function pushMilestone(
  projectRoot: AbsolutePath,
  milestone: string,
  workflowState: WorkflowState,
): Promise<ScriptExecutionResult<SaveResult>> {
  const intent: ExecutionIntent = {
    type: "push",
    target: milestone,
    requiresApproval: true,
  };
  const check = checkExecutionIntent(intent, workflowState);
  if (!check.allowed) {
    throw new Error(`Push blocked: ${check.reason}`);
  }

  const { stdout } = await execFileAsync(scriptPath("prism-save.sh"), [projectRoot, milestone, "--push"], {
    encoding: "utf8",
  });

  return parseScriptJson<SaveResult>(stdout);
}
