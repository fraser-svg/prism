import { execFile, spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { AbsolutePath } from "./common";

export const execFileAsync = promisify(execFile);

export interface ScriptExecutionResult<T> {
  summary: string;
  data: T;
}

const ENTITY_ID_SAFE = /^[a-zA-Z0-9_\-]+$/;

export function validateEntityId(id: string): string {
  if (!ENTITY_ID_SAFE.test(id)) {
    throw new Error(`Invalid entity ID (must be alphanumeric/dash/underscore): ${id}`);
  }
  return id;
}

export function resolveScriptPath(metaUrl: string, name: string): AbsolutePath {
  const dir = fileURLToPath(new URL(".", metaUrl));
  return `${dir}../../../scripts/${name}` as AbsolutePath;
}

export async function parseScriptJson<T>(stdout: string): Promise<ScriptExecutionResult<T>> {
  const [summaryPart, outputPathPart] = stdout.trim().split("→").map((part) => part.trim());
  if (!outputPathPart) {
    throw new Error(`Script output did not include a temp file path: ${stdout}`);
  }

  const json = await readFile(outputPathPart, "utf8");
  await unlink(outputPathPart).catch(() => {});
  return {
    summary: summaryPart,
    data: JSON.parse(json) as T,
  };
}

export async function execScriptWithJsonInput(
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
