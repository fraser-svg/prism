import type { AbsolutePath } from "@prism/core";
import { execFileAsync, parseScriptJson, resolveScriptPath, type ScriptExecutionResult } from "@prism/core";

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
  return resolveScriptPath(import.meta.url, name);
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
