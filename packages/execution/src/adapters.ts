import type { AbsolutePath } from "@prism/core";
import { execFileAsync, parseScriptJson, resolveScriptPath, type ScriptExecutionResult } from "@prism/core";

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
  milestone: string
): Promise<ScriptExecutionResult<SaveResult>> {
  const { stdout } = await execFileAsync(scriptPath("prism-save.sh"), [projectRoot, milestone], {
    encoding: "utf8",
  });

  return parseScriptJson<SaveResult>(stdout);
}
