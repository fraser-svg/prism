import type { AbsolutePath } from "@prism/core";
import {
  execFileAsync,
  execScriptWithJsonInput,
  parseScriptJson,
  resolveScriptPath,
  type ScriptExecutionResult,
} from "@prism/core";

export interface PrismScanResult {
  status: "NONE" | "PRODUCT_RESUME" | "PRODUCT_NEXT" | "MULTIPLE" | "FOUND";
  product: {
    exists: boolean;
    name: string | null;
    vision: string | null;
  };
  openspec: {
    cli_available: boolean;
    changes: Array<{ name: string; specs?: number }>;
    change_count: number;
  };
  registry: {
    status: string;
    stage: string;
    workers: number;
  };
  session: {
    exists: boolean;
    file: string;
  };
  v2_compat: {
    has_prism_log: boolean;
  };
  product_memory: {
    model: "none" | "legacy" | "split";
    files: string[];
    file_count: number;
  };
}

export interface RegistryStatusResult {
  version?: number;
  change?: {
    name: string;
    stage: string;
    branch?: string | null;
    complexity?: string | null;
    requirement_count?: number | null;
    spec_path?: string | null;
  };
  workers?: Array<{
    id: string;
    status: string;
    task?: string;
    retries?: number;
  }>;
  checkpoint?: {
    stage?: number | null;
    progress?: string | null;
    decisions?: string[];
    preferences?: string[];
    open_questions?: string[];
    next_steps?: string[];
  };
  events?: Array<{
    type?: string;
    message?: string;
  }>;
}

export interface SupervisorTaskInput {
  id: string;
  task: string;
  depends_on: string[];
}

export interface SupervisorTaskResult {
  id: string;
  task?: string;
  status: string;
  depends_on?: string[];
  retries?: number;
  blocked_by?: string[];
}

export interface SupervisorPlanResult {
  status: string;
  total?: number;
  tasks?: SupervisorTaskResult[];
  error?: string;
}

export interface SupervisorStatusResult {
  status?: string;
  total?: number;
  pending?: number;
  ready?: number;
  running?: number;
  completed?: number;
  failed?: number;
  abandoned?: number;
  blocked?: number;
  tasks?: SupervisorTaskResult[];
  error?: string;
}

function scriptPath(name: string): AbsolutePath {
  return resolveScriptPath(import.meta.url, name);
}

export async function scanProjectState(
  projectRoot: AbsolutePath
): Promise<ScriptExecutionResult<PrismScanResult>> {
  const { stdout } = await execFileAsync(scriptPath("prism-scan.sh"), [projectRoot], {
    encoding: "utf8",
  });

  return parseScriptJson<PrismScanResult>(stdout);
}

/**
 * @deprecated M2 canonical artifacts are the authority. Registry is read-only fallback for resume.
 */
export async function readRegistryStatus(
  projectRoot: AbsolutePath,
  changeName: string
): Promise<ScriptExecutionResult<RegistryStatusResult>> {
  const { stdout } = await execFileAsync(
    scriptPath("prism-registry.sh"),
    ["status", projectRoot, changeName],
    {
      encoding: "utf8",
    }
  );

  return parseScriptJson<RegistryStatusResult>(stdout);
}

/**
 * @deprecated M2 canonical artifacts are the authority. Do not write to registry from TypeScript.
 */
export async function updateRegistryChange(
  projectRoot: AbsolutePath,
  changeName: string,
  patch: Record<string, unknown>
): Promise<ScriptExecutionResult<RegistryStatusResult>> {
  const stdout = await execScriptWithJsonInput(
    scriptPath("prism-registry.sh"),
    ["update", projectRoot, changeName],
    patch
  );

  return parseScriptJson<RegistryStatusResult>(stdout);
}

export async function planTaskGraph(
  projectRoot: AbsolutePath,
  changeName: string,
  graph: SupervisorTaskInput[]
): Promise<ScriptExecutionResult<SupervisorPlanResult>> {
  const stdout = await execScriptWithJsonInput(
    scriptPath("prism-supervisor.sh"),
    ["plan", projectRoot, changeName],
    graph
  );

  return parseScriptJson<SupervisorPlanResult>(stdout);
}

export async function readTaskGraphStatus(
  projectRoot: AbsolutePath,
  changeName: string
): Promise<ScriptExecutionResult<SupervisorStatusResult>> {
  const { stdout } = await execFileAsync(
    scriptPath("prism-supervisor.sh"),
    ["status", projectRoot, changeName],
    {
      encoding: "utf8",
    }
  );

  return parseScriptJson<SupervisorStatusResult>(stdout);
}

export async function readNextReadyTasks(
  projectRoot: AbsolutePath,
  changeName: string
): Promise<ScriptExecutionResult<SupervisorStatusResult>> {
  const { stdout } = await execFileAsync(
    scriptPath("prism-supervisor.sh"),
    ["next", projectRoot, changeName],
    {
      encoding: "utf8",
    }
  );

  return parseScriptJson<SupervisorStatusResult>(stdout);
}
