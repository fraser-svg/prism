#!/usr/bin/env node
/**
 * Bridge CLI — thin entry point for SKILL.md to invoke typed core services.
 *
 * Usage: npx tsx packages/orchestrator/src/cli.ts <command> <args...>
 *
 * All commands output JSON to stdout. Exit 0 = success, exit 1 = error/blocked.
 * Errors always produce { "error": "..." } JSON so the skill can parse them.
 */

import type { AbsolutePath, EntityId, ReviewType, SpecType, WorkflowPhase } from "@prism/core";
import { WORKFLOW_PHASES } from "@prism/core";
import {
  createSpecRepository,
  createPlanRepository,
  createCheckpointRepository,
  createProblemRepository,
  projectPaths,
  planPaths,
} from "@prism/memory";
import { checkRequiredReviews, isReviewComplete, deriveReleaseState } from "@prism/guardian";

import { evaluateTransition } from "./gate-evaluator";
import { resumeFromArtifacts } from "./resume-engine";
import { recordReview, recordVerification } from "./services";
import { execShip } from "./ship";
import { execDeployDetect, execDeployTrigger } from "./deploy";
import { execRecordShip } from "./ship-receipt";
import { runSelfHealingPipeline, runCrashRecovery } from "./self-healing";
import { extractPipelineSnapshot } from "./pipeline-snapshot";
import { generatePipelineHtml } from "./pipeline-visualizer";
import { extractProjectSnapshot } from "./project-snapshot";
import { generateProjectHtml } from "./project-visualizer";
import {
  skillSpecToCore,
  skillPlanToCore,
  skillProblemToCore,
  skillReviewToCore,
  skillVerificationToCore,
  skillCheckpointToCore,
  deriveProjectId,
  type SkillSpecInput,
  type SkillPlanInput,
  type SkillProblemInput,
  type SkillReviewInput,
  type SkillVerificationInput,
  type SkillCheckpointInput,
} from "./bridge-adapters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function output(data: unknown, exitCode = 0): never {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  process.exit(exitCode);
}

function fail(message: string): never {
  output({ error: message }, 1);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function readStdinJson<T>(): Promise<T> {
  const raw = await readStdin();
  if (!raw.trim()) fail("empty stdin");
  try {
    return JSON.parse(raw) as T;
  } catch {
    fail(`invalid JSON on stdin: ${raw.slice(0, 100)}`);
  }
}

function requireArg(args: string[], index: number, name: string): string {
  const val = args[index];
  if (!val) throw new Error(`missing required argument: ${name}`);
  return val;
}

/** Enrich stdin input with a deterministic projectId when the skill doesn't provide one. */
function enrichProjectId<T extends { projectId?: string }>(input: T, projectRoot: string): T {
  if (!input.projectId || input.projectId === "unknown") {
    return { ...input, projectId: deriveProjectId(undefined, projectRoot) as string };
  }
  return input;
}

function parseSpecId(args: string[]): EntityId | undefined {
  const idx = args.indexOf("--spec-id");
  if (idx !== -1 && args[idx + 1]) return args[idx + 1] as EntityId;
  return undefined;
}

function isWorkflowPhase(s: string): s is WorkflowPhase {
  return (WORKFLOW_PHASES as readonly string[]).includes(s);
}

const REVIEW_TYPES = ["planning", "engineering", "qa", "design", "ship_readiness", "codex"] as const;
function isReviewType(s: string): s is ReviewType {
  return (REVIEW_TYPES as readonly string[]).includes(s);
}

const SPEC_TYPES = ["product", "change", "task"] as const;
function isSpecType(s: string): s is SpecType {
  return (SPEC_TYPES as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Pure execution layer — returns data, never calls process.exit
// ---------------------------------------------------------------------------

async function execGateCheck(args: string[]): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const from = requireArg(args, 1, "fromPhase");
  const to = requireArg(args, 2, "toPhase");

  if (!isWorkflowPhase(from)) throw new Error(`invalid fromPhase: ${from}`);
  if (!isWorkflowPhase(to)) throw new Error(`invalid toPhase: ${to}`);

  const specId = parseSpecId(args);
  const result = await evaluateTransition(from, to, projectRoot, specId);

  if (result.allowed) {
    return { allowed: true, evidence: result.evidence };
  }
  return { allowed: false, blockers: result.blockers, evidence: result.evidence };
}

async function execWriteSpec(args: string[], stdinData?: unknown): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const input = enrichProjectId(
    stdinData as SkillSpecInput ?? await readStdinJson<SkillSpecInput>(),
    projectRoot,
  );

  const spec = skillSpecToCore(input, specId);
  const repo = createSpecRepository(projectRoot);
  await repo.writeMetadata(specId, spec);

  return { written: true, specId, path: `${projectPaths(projectRoot).specsDir}/${specId}` };
}

async function execWritePlan(args: string[], stdinData?: unknown): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const planId = requireArg(args, 2, "planId") as EntityId;
  const input = enrichProjectId(
    stdinData as SkillPlanInput ?? await readStdinJson<SkillPlanInput>(),
    projectRoot,
  );

  input.specId = specId;
  const plan = skillPlanToCore(input, planId);
  const repo = createPlanRepository(projectRoot);
  await repo.writeMetadata(planId, plan);

  return { written: true, planId, specId, path: `${projectPaths(projectRoot).plansDir}/${planId}` };
}

async function execWriteTaskGraph(args: string[], stdinData?: unknown): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const planId = requireArg(args, 1, "planId") as EntityId;
  const raw = stdinData != null ? JSON.stringify(stdinData) : await readStdin();

  if (!raw.trim()) throw new Error("empty stdin for task graph");

  // Validate it's valid JSON
  try {
    JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON for task graph");
  }

  const paths = planPaths(projectRoot, planId);
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(paths.taskGraphFile), { recursive: true });
  await writeFile(paths.taskGraphFile, raw, "utf-8");

  return { written: true, planId, path: paths.taskGraphFile };
}

async function execRecordReview(args: string[], stdinData?: unknown): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const reviewTypeStr = requireArg(args, 2, "reviewType");

  if (!isReviewType(reviewTypeStr)) throw new Error(`invalid reviewType: ${reviewTypeStr}`);

  const input = enrichProjectId(
    stdinData as SkillReviewInput ?? await readStdinJson<SkillReviewInput>(),
    projectRoot,
  );
  const review = skillReviewToCore(input, specId, reviewTypeStr);
  await recordReview(projectRoot, review);

  return { written: true, specId, reviewType: reviewTypeStr, verdict: review.verdict };
}

async function execRecordVerification(args: string[], stdinData?: unknown): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const runId = requireArg(args, 1, "runId") as EntityId;
  const input = enrichProjectId(
    stdinData as SkillVerificationInput ?? await readStdinJson<SkillVerificationInput>(),
    projectRoot,
  );

  const verification = skillVerificationToCore(input, runId);
  await recordVerification(projectRoot, verification);

  return { written: true, runId, passed: verification.passed };
}

async function execCheckReviews(args: string[]): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const specTypeStr = requireArg(args, 2, "specType");

  if (!isSpecType(specTypeStr)) throw new Error(`invalid specType: ${specTypeStr}`);

  const result = await checkRequiredReviews(specId, specTypeStr, projectRoot);
  const complete = await isReviewComplete(specId, specTypeStr, projectRoot);

  return { complete, reviews: result };
}

async function execCheckpoint(args: string[], stdinData?: unknown): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const input = enrichProjectId(
    stdinData as SkillCheckpointInput ?? await readStdinJson<SkillCheckpointInput>(),
    projectRoot,
  );
  const checkpoint = skillCheckpointToCore(input);

  const repo = createCheckpointRepository(projectRoot);
  const markdown = [
    `# Checkpoint: ${checkpoint.phase}`,
    ``,
    checkpoint.progressSummary ? `**Progress:** ${checkpoint.progressSummary}` : null,
    checkpoint.blockers.length ? `**Blockers:** ${checkpoint.blockers.join(", ")}` : null,
    checkpoint.nextRecommendedActions.length ? `**Next:** ${checkpoint.nextRecommendedActions.join(", ")}` : null,
    checkpoint.keyDecisions.length ? `**Decisions:** ${checkpoint.keyDecisions.join(", ")}` : null,
  ].filter(Boolean).join("\n");
  await repo.write(checkpoint, markdown);

  return { written: true, phase: checkpoint.phase, id: checkpoint.id };
}

async function cmdWriteProblem(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const problemId = requireArg(args, 1, "problemId") as EntityId;
  const input = enrichProjectId(await readStdinJson<SkillProblemInput>(), projectRoot);

  const problem = skillProblemToCore(input, problemId);
  const repo = createProblemRepository(projectRoot);
  await repo.writeMetadata(problemId, problem);

  output({ written: true, problemId, path: `${projectPaths(projectRoot).problemsDir}/${problemId}` });
}

async function execResume(args: string[]): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const projectId = (args[1] ?? "default") as EntityId;
  const changeName = args[2] ?? undefined;

  const result = await resumeFromArtifacts(projectRoot, projectId, changeName);

  return {
    phase: result.workflow.phase,
    activeSpecId: result.workflow.activeSpecId,
    blockers: result.workflow.blockers,
    source: result.source,
    summary: result.summary,
  };
}

async function execReleaseState(args: string[]): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const specTypeStr = requireArg(args, 2, "specType");

  if (!isSpecType(specTypeStr)) throw new Error(`invalid specType: ${specTypeStr}`);

  // Read runId from the checkpoint for this specific spec
  const checkpointRepo = createCheckpointRepository(projectRoot);
  const checkpoint = await checkpointRepo.readLatestForSpec(specId);
  const runId = checkpoint?.runId ?? undefined;

  return await deriveReleaseState(specId, specTypeStr, projectRoot, { runId });
}

async function execSessionEnd(args: string[], stdinData?: unknown): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const projectId = requireArg(args, 1, "projectId") as EntityId;
  const sessionId = requireArg(args, 2, "sessionId");

  // Read events from stdin if provided, otherwise use empty array
  let events: Array<{ eventType: string; metadata: Record<string, unknown> | null }> = [];
  let availableCapabilities: string[] = [];
  let sessionIncomplete = false;

  if (stdinData && typeof stdinData === "object") {
    const data = stdinData as Record<string, unknown>;
    if (Array.isArray(data.events)) events = data.events;
    if (Array.isArray(data.availableCapabilities)) availableCapabilities = data.availableCapabilities;
    if (data.sessionIncomplete === true) sessionIncomplete = true;
  } else {
    try {
      const raw = await readStdin();
      if (raw.trim()) {
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (Array.isArray(data.events)) events = data.events;
        if (Array.isArray(data.availableCapabilities)) availableCapabilities = data.availableCapabilities;
        if (data.sessionIncomplete === true) sessionIncomplete = true;
      }
    } catch {
      // No stdin or invalid — proceed with empty events
    }
  }

  // Run crash recovery first to handle any orphaned sessions
  const recoveredSessions = await runCrashRecovery({
    projectRoot,
    projectId,
    events,
    availableCapabilities,
  });

  // Run the full self-healing pipeline
  const result = await runSelfHealingPipeline({
    projectRoot,
    projectId,
    sessionId,
    events,
    availableCapabilities,
    sessionIncomplete,
  });

  result.recoveredSessions = recoveredSessions;
  return result;
}

async function execPipeline(args: string[]): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;

  const snapshot = await extractPipelineSnapshot(projectRoot);
  const html = generatePipelineHtml(snapshot);

  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dogfoodPaths } = await import("@prism/memory");
  const paths = dogfoodPaths(projectRoot);
  await mkdir(paths.dogfoodDir, { recursive: true });
  await writeFile(`${paths.dogfoodDir}/PIPELINE.html`, html);

  return snapshot;
}

async function execProject(args: string[]): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;

  const snapshot = await extractProjectSnapshot(projectRoot);
  const html = generateProjectHtml(snapshot);

  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dogfoodPaths } = await import("@prism/memory");
    const paths = dogfoodPaths(projectRoot);
    await mkdir(paths.dogfoodDir, { recursive: true });
    await writeFile(`${paths.dogfoodDir}/PROJECT.html`, html);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...snapshot, writeError: message };
  }

  return snapshot;
}

async function execSessionReport(args: string[]): Promise<unknown> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const projectId = args[1] as EntityId | undefined;

  const { readdir, readFile } = await import("node:fs/promises");
  const { dogfoodPaths } = await import("@prism/memory");
  const paths = dogfoodPaths(projectRoot);

  try {
    const files = await readdir(paths.reportsDir);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    if (jsonFiles.length === 0) {
      return { found: false, message: "no report cards found" };
    }

    // If projectId specified, find matching report; otherwise return latest
    for (const file of jsonFiles) {
      const content = await readFile(`${paths.reportsDir}/${file}`, "utf-8");
      const report = JSON.parse(content) as Record<string, unknown>;

      if (!projectId || report.projectId === projectId) {
        return { found: true, file, report };
      }
    }

    return { found: false, message: `no report cards found for project ${projectId}` };
  } catch {
    return { found: false, message: "reports directory does not exist" };
  }
}

// ---------------------------------------------------------------------------
// CLI wrapper layer — reads stdin, calls pure layer, calls output()/fail()
// ---------------------------------------------------------------------------

async function cmdGateCheck(args: string[]): Promise<void> {
  output(await execGateCheck(args));
}

async function cmdWriteSpec(args: string[]): Promise<void> {
  output(await execWriteSpec(args));
}

async function cmdWritePlan(args: string[]): Promise<void> {
  output(await execWritePlan(args));
}

async function cmdWriteTaskGraph(args: string[]): Promise<void> {
  output(await execWriteTaskGraph(args));
}

async function cmdRecordReview(args: string[]): Promise<void> {
  output(await execRecordReview(args));
}

async function cmdRecordVerification(args: string[]): Promise<void> {
  output(await execRecordVerification(args));
}

async function cmdCheckReviews(args: string[]): Promise<void> {
  output(await execCheckReviews(args));
}

async function cmdCheckpoint(args: string[]): Promise<void> {
  output(await execCheckpoint(args));
}

async function cmdResume(args: string[]): Promise<void> {
  output(await execResume(args));
}

async function cmdReleaseState(args: string[]): Promise<void> {
  output(await execReleaseState(args));
}

async function cmdPipeline(args: string[]): Promise<void> {
  output(await execPipeline(args));
}

async function cmdSessionEnd(args: string[]): Promise<void> {
  output(await execSessionEnd(args));
}

async function cmdSessionReport(args: string[]): Promise<void> {
  output(await execSessionReport(args));
}

async function cmdProject(args: string[]): Promise<void> {
  output(await execProject(args));
}

// ---------------------------------------------------------------------------
// Batch command — executes multiple commands in a single Node.js process
// ---------------------------------------------------------------------------

interface BatchCommand {
  command: string;
  args: string[];
  stdin?: unknown;
}

/** Map command names to their pure execution functions */
const EXEC_HANDLERS: Record<string, (args: string[], stdin?: unknown) => Promise<unknown>> = {
  "gate-check": execGateCheck,
  "write-spec": execWriteSpec,
  "write-plan": execWritePlan,
  "write-task-graph": execWriteTaskGraph,
  "record-review": execRecordReview,
  "record-verification": execRecordVerification,
  "check-reviews": execCheckReviews,
  checkpoint: execCheckpoint,
  resume: execResume,
  "release-state": execReleaseState,
  ship: execShip,
  "deploy-detect": execDeployDetect as (args: string[], stdin?: unknown) => Promise<unknown>,
  "deploy-trigger": execDeployTrigger as (args: string[], stdin?: unknown) => Promise<unknown>,
  "record-ship": execRecordShip,
  "session-end": execSessionEnd,
  "session-report": execSessionReport as (args: string[], stdin?: unknown) => Promise<unknown>,
  pipeline: execPipeline as (args: string[], stdin?: unknown) => Promise<unknown>,
  project: execProject as (args: string[], stdin?: unknown) => Promise<unknown>,
};

async function cmdBatch(): Promise<void> {
  const commands = await readStdinJson<BatchCommand[]>();
  const results: Array<{ command: string; ok: boolean; data?: unknown; error?: string }> = [];

  for (const cmd of commands) {
    const start = Date.now();
    const handler = EXEC_HANDLERS[cmd.command];
    if (!handler) {
      results.push({ command: cmd.command, ok: false, error: `unknown command: ${cmd.command}` });
      console.error(`[prism] batch: ${cmd.command} ${Date.now() - start}ms error`);
      continue;
    }
    try {
      const data = await handler(cmd.args, cmd.stdin);
      results.push({ command: cmd.command, ok: true, data });
      console.error(`[prism] batch: ${cmd.command} ${Date.now() - start}ms ok`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ command: cmd.command, ok: false, error: message });
      console.error(`[prism] batch: ${cmd.command} ${Date.now() - start}ms error`);
    }
  }

  output({ results });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  "gate-check": cmdGateCheck,
  "write-spec": cmdWriteSpec,
  "write-plan": cmdWritePlan,
  "write-task-graph": cmdWriteTaskGraph,
  "write-problem": cmdWriteProblem,
  "record-review": cmdRecordReview,
  "record-verification": cmdRecordVerification,
  "check-reviews": cmdCheckReviews,
  checkpoint: cmdCheckpoint,
  resume: cmdResume,
  "release-state": cmdReleaseState,
  ship: async (args) => output(await execShip(args)),
  "deploy-detect": async (args) => output(await execDeployDetect(args)),
  "deploy-trigger": async (args) => output(await execDeployTrigger(args)),
  "record-ship": async (args) => output(await execRecordShip(args)),
  "session-end": cmdSessionEnd,
  "session-report": cmdSessionReport,
  pipeline: cmdPipeline,
  project: cmdProject,
  batch: cmdBatch,
};

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    fail(`usage: cli.ts <command> [args...]\ncommands: ${Object.keys(COMMANDS).join(", ")}`);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    fail(`unknown command: ${command}\nvalid: ${Object.keys(COMMANDS).join(", ")}`);
  }

  await handler(args);
}

// Top-level try/catch — all errors become structured JSON
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  output({ error: message }, 1);
});
