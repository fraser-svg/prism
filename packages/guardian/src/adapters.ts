import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import type { AbsolutePath } from "@prism/core";

const execFileAsync = promisify(execFile);

export interface ScriptExecutionResult<T> {
  summary: string;
  data: T;
}

export interface VerifyOptions {
  files?: string[];
  lint?: boolean;
  compile?: boolean;
  cwd?: AbsolutePath;
}

export interface VerifyResult {
  passed: boolean;
  checks: {
    files: string;
    lint: string;
    compile: string;
  };
  errors: Array<{
    type: string;
    file?: string;
    details?: string;
  }>;
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

export async function runVerification(
  projectRoot: AbsolutePath,
  options: VerifyOptions = {}
): Promise<ScriptExecutionResult<VerifyResult>> {
  const args = [projectRoot];

  if (options.files && options.files.length > 0) {
    args.push("--files", options.files.join(","));
  }
  if (options.lint) {
    args.push("--lint");
  }
  if (options.compile) {
    args.push("--compile");
  }
  if (options.cwd) {
    args.push("--cwd", options.cwd);
  }

  const { stdout } = await execFileAsync(scriptPath("prism-verify.sh"), args, {
    encoding: "utf8",
  });

  return parseScriptJson<VerifyResult>(stdout);
}
