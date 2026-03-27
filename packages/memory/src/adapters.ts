import type { AbsolutePath } from "@prism/core";
import {
  execFileAsync,
  execScriptWithJsonInput,
  parseScriptJson,
  resolveScriptPath,
  type ScriptExecutionResult,
} from "@prism/core";

type MemoryModel = "none" | "legacy" | "split";

export interface PrismStateReadResult {
  model: MemoryModel;
  files: Array<string | { file: string; mtime?: string }>;
  file_count?: number;
  summary: Record<string, string> | null;
}

export interface PrismStateStatusResult {
  model: MemoryModel;
  files: Array<{ file: string; exists: boolean; mtime: string | null }>;
}

export interface PrismCheckpointPayload {
  stage?: number | string;
  progress?: string;
  decisions?: string[];
  preferences?: string[];
  next_steps?: string[];
}

export interface PrismCheckpointResult extends PrismCheckpointPayload {
  status?: string;
  reason?: string;
}

function scriptPath(name: string): AbsolutePath {
  return resolveScriptPath(import.meta.url, name);
}

export async function readProductMemory(
  projectRoot: AbsolutePath
): Promise<ScriptExecutionResult<PrismStateReadResult>> {
  const { stdout } = await execFileAsync(scriptPath("prism-state.sh"), ["read", projectRoot], {
    encoding: "utf8",
  });

  return parseScriptJson<PrismStateReadResult>(stdout);
}

export async function getProductMemoryStatus(
  projectRoot: AbsolutePath
): Promise<ScriptExecutionResult<PrismStateStatusResult>> {
  const { stdout } = await execFileAsync(
    scriptPath("prism-state.sh"),
    ["status", projectRoot],
    {
      encoding: "utf8",
    }
  );

  return parseScriptJson<PrismStateStatusResult>(stdout);
}

export async function saveCheckpoint(
  projectRoot: AbsolutePath,
  changeName: string,
  payload: PrismCheckpointPayload
): Promise<ScriptExecutionResult<PrismCheckpointResult>> {
  const stdout = await execScriptWithJsonInput(
    scriptPath("prism-checkpoint.sh"),
    [projectRoot, changeName],
    payload
  );

  return parseScriptJson<PrismCheckpointResult>(stdout);
}
