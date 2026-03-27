import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import type { AbsolutePath } from "@prism/core";

const execFileAsync = promisify(execFile);

type MemoryModel = "none" | "legacy" | "split";

export interface ScriptExecutionResult<T> {
  summary: string;
  data: T;
}

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

async function execScriptWithJsonInput(
  script: AbsolutePath,
  args: string[],
  payload: unknown
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(script, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`Script exited ${code ?? "unknown"}: ${stderr}`));
    });

    child.stdin.write(`${JSON.stringify(payload)}\n`);
    child.stdin.end();
  });
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
