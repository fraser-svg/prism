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
  projectPaths,
  planPaths,
} from "@prism/memory";
import { checkRequiredReviews, isReviewComplete, deriveReleaseState } from "@prism/guardian";

import { evaluateTransition } from "./gate-evaluator";
import { resumeFromArtifacts } from "./resume-engine";
import { recordReview, recordVerification } from "./services";
import {
  skillSpecToCore,
  skillPlanToCore,
  skillReviewToCore,
  skillVerificationToCore,
  skillCheckpointToCore,
  deriveProjectId,
  type SkillSpecInput,
  type SkillPlanInput,
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
  if (!val) fail(`missing required argument: ${name}`);
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
// Commands
// ---------------------------------------------------------------------------

async function cmdGateCheck(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const from = requireArg(args, 1, "fromPhase");
  const to = requireArg(args, 2, "toPhase");

  if (!isWorkflowPhase(from)) fail(`invalid fromPhase: ${from}`);
  if (!isWorkflowPhase(to)) fail(`invalid toPhase: ${to}`);

  const specId = parseSpecId(args);
  const result = await evaluateTransition(from, to, projectRoot, specId);

  if (result.allowed) {
    output({ allowed: true, evidence: result.evidence });
  } else {
    // Exit 0 — the command succeeded, the gate just blocked. Exit 1 is reserved for CLI errors.
    output({ allowed: false, blockers: result.blockers, evidence: result.evidence });
  }
}

async function cmdWriteSpec(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const input = enrichProjectId(await readStdinJson<SkillSpecInput>(), projectRoot);

  const spec = skillSpecToCore(input, specId);
  const repo = createSpecRepository(projectRoot);
  await repo.writeMetadata(specId, spec);

  output({ written: true, specId, path: `${projectPaths(projectRoot).specsDir}/${specId}` });
}

async function cmdWritePlan(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const planId = requireArg(args, 2, "planId") as EntityId;
  const input = enrichProjectId(await readStdinJson<SkillPlanInput>(), projectRoot);

  input.specId = specId;
  const plan = skillPlanToCore(input, planId);
  const repo = createPlanRepository(projectRoot);
  await repo.writeMetadata(planId, plan);

  output({ written: true, planId, specId, path: `${projectPaths(projectRoot).plansDir}/${planId}` });
}

async function cmdWriteTaskGraph(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const planId = requireArg(args, 1, "planId") as EntityId;
  const raw = await readStdin();

  if (!raw.trim()) fail("empty stdin for task graph");

  // Validate it's valid JSON
  try {
    JSON.parse(raw);
  } catch {
    fail("invalid JSON for task graph");
  }

  const paths = planPaths(projectRoot, planId);
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(paths.taskGraphFile), { recursive: true });
  await writeFile(paths.taskGraphFile, raw, "utf-8");

  output({ written: true, planId, path: paths.taskGraphFile });
}

async function cmdRecordReview(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const reviewTypeStr = requireArg(args, 2, "reviewType");

  if (!isReviewType(reviewTypeStr)) fail(`invalid reviewType: ${reviewTypeStr}`);

  const input = enrichProjectId(await readStdinJson<SkillReviewInput>(), projectRoot);
  const review = skillReviewToCore(input, specId, reviewTypeStr);
  await recordReview(projectRoot, review);

  output({ written: true, specId, reviewType: reviewTypeStr, verdict: review.verdict });
}

async function cmdRecordVerification(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const runId = requireArg(args, 1, "runId") as EntityId;
  const input = enrichProjectId(await readStdinJson<SkillVerificationInput>(), projectRoot);

  const verification = skillVerificationToCore(input, runId);
  await recordVerification(projectRoot, verification);

  output({ written: true, runId, passed: verification.passed });
}

async function cmdCheckReviews(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const specTypeStr = requireArg(args, 2, "specType");

  if (!isSpecType(specTypeStr)) fail(`invalid specType: ${specTypeStr}`);

  const result = await checkRequiredReviews(specId, specTypeStr, projectRoot);
  const complete = await isReviewComplete(specId, specTypeStr, projectRoot);

  output({ complete, reviews: result });
}

async function cmdCheckpoint(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const input = enrichProjectId(await readStdinJson<SkillCheckpointInput>(), projectRoot);
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

  output({ written: true, phase: checkpoint.phase, id: checkpoint.id });
}

async function cmdResume(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const projectId = (args[1] ?? "default") as EntityId;
  const changeName = args[2] ?? undefined;

  const result = await resumeFromArtifacts(projectRoot, projectId, changeName);

  output({
    phase: result.workflow.phase,
    activeSpecId: result.workflow.activeSpecId,
    blockers: result.workflow.blockers,
    source: result.source,
    summary: result.summary,
  });
}

async function cmdReleaseState(args: string[]): Promise<void> {
  const projectRoot = requireArg(args, 0, "projectRoot") as AbsolutePath;
  const specId = requireArg(args, 1, "specId") as EntityId;
  const specTypeStr = requireArg(args, 2, "specType");

  if (!isSpecType(specTypeStr)) fail(`invalid specType: ${specTypeStr}`);

  // Read runId from the checkpoint for this specific spec
  const checkpointRepo = createCheckpointRepository(projectRoot);
  const checkpoint = await checkpointRepo.readLatestForSpec(specId);
  const runId = checkpoint?.runId ?? undefined;

  const result = await deriveReleaseState(specId, specTypeStr, projectRoot, { runId });
  output(result);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  "gate-check": cmdGateCheck,
  "write-spec": cmdWriteSpec,
  "write-plan": cmdWritePlan,
  "write-task-graph": cmdWriteTaskGraph,
  "record-review": cmdRecordReview,
  "record-verification": cmdRecordVerification,
  "check-reviews": cmdCheckReviews,
  checkpoint: cmdCheckpoint,
  resume: cmdResume,
  "release-state": cmdReleaseState,
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
