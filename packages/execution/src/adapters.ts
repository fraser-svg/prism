import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import type { AbsolutePath } from "@prism/core";

const execFileAsync = promisify(execFile);

export interface ScriptExecutionResult<T> {
  summary: string;
  data: T;
}

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
  return new URL(`../../../scripts/${name}`, import.meta.url).pathname as AbsolutePath;
}

async function parseScriptJson<T>(stdout: string): Promise<ScriptExecutionResult<T>> {
  const [summaryPart, outputPathPart] = stdout.trim().split("→").map((part) => part.trim());
  if (!outputPathPart) {
    throw new Error(`Script output did not include a temp file path: ${stdout}`);
  }

  const json = await readFile(outputPathPart, "utf8");
  return {
    summary: summaryPart,
    data: JSON.parse(json) as T,
  };
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
