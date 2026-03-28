/**
 * Bridge adapters — convert between skill data formats and core entity types.
 *
 * These adapters write "gate-sufficient" fields: exactly what the gate evaluator
 * and review orchestration actually read. Not the full entity, not metadata-only.
 */

import { basename } from "node:path";
import { createHash } from "node:crypto";
import type {
  AbsolutePath,
  EntityId,
  ISODateString,
  ReviewType,
  ReviewVerdict,
  SpecStatus,
  SpecType,
  WorkflowPhase,
} from "@prism/core";
import type {
  Spec,
  Plan,
  Review,
  ReviewFinding,
  VerificationResult,
  VerificationFailure,
  Checkpoint,
  AcceptanceCriterion,
} from "@prism/core";

// ---------------------------------------------------------------------------
// Input shapes from the skill (what arrives via stdin JSON)
// ---------------------------------------------------------------------------

export interface SkillSpecInput {
  title: string;
  type?: SpecType;
  status?: SpecStatus;
  summary?: string;
  scope?: string[];
  nonGoals?: string[];
  acceptanceCriteria?: string[]; // requirement titles as plain strings
  projectId?: string;
}

export interface SkillPlanInput {
  title: string;
  specId: string;
  phases?: Array<{ id?: string; title: string; description?: string; dependsOn?: string[] }>;
  risks?: string[];
  sequencingRationale?: string;
  projectId?: string;
}

export interface SkillReviewInput {
  verdict: ReviewVerdict;
  summary?: string;
  findings?: Array<{
    severity?: "p1" | "p2";
    category?: string;
    title: string;
    details?: string;
    filePath?: string;
    line?: number;
  }>;
  projectId?: string;
}

export interface SkillVerificationInput {
  specId: string;
  passed: boolean;
  checksRun?: string[];
  failures?: Array<{ check: string; details?: string }>;
  projectId?: string;
}

export interface SkillCheckpointInput {
  projectId?: string;
  runId?: string;
  activeSpecId?: string;
  phase?: WorkflowPhase;
  stage?: number | string;
  stageRoute?: string;
  stageTotal?: number;
  progress?: string;
  decisions?: string[];
  preferences?: string[];
  nextSteps?: string[];
  blockers?: string[];
  lastVerificationSummary?: string;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

function generateEntityId(): EntityId {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as EntityId;
}

/**
 * Derive a deterministic projectId from a project root path.
 * Uses the basename of the path as a readable prefix plus a short hash for uniqueness.
 */
export function deriveProjectId(projectId: string | undefined, projectRoot?: string): EntityId {
  if (projectId && projectId !== "unknown") return projectId as EntityId;
  if (!projectRoot) return "unknown" as EntityId;
  const name = basename(projectRoot);
  const hash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 8);
  return `${name}-${hash}` as EntityId;
}

function now(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

export function skillSpecToCore(input: SkillSpecInput, specId: EntityId): Spec {
  const ts = now();
  const criteria: AcceptanceCriterion[] = (input.acceptanceCriteria ?? []).map(
    (desc, i) => ({
      id: `ac-${i}` as EntityId,
      description: desc,
      status: "unverified" as const,
    }),
  );

  return {
    id: specId,
    title: input.title,
    projectId: (input.projectId ?? "unknown") as EntityId,
    type: input.type ?? "change",
    status: input.status ?? "approved",
    summary: input.summary ?? input.title,
    scope: input.scope ?? [],
    nonGoals: input.nonGoals ?? [],
    acceptanceCriteria: criteria,
    verificationPlan: { checks: [], notes: [] },
    createdAt: ts,
    updatedAt: ts,
  };
}

export function skillPlanToCore(
  input: SkillPlanInput,
  planId: EntityId,
): Plan {
  const ts = now();
  return {
    id: planId,
    title: input.title,
    projectId: (input.projectId ?? "unknown") as EntityId,
    specId: input.specId as EntityId,
    phases: (input.phases ?? []).map((p, i) => ({
      id: (p.id ?? `phase-${i}`) as EntityId,
      title: p.title,
      description: p.description ?? "",
      dependsOn: (p.dependsOn ?? []) as EntityId[],
    })),
    risks: input.risks ?? [],
    approvals: [],
    sequencingRationale: input.sequencingRationale ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
}

export function skillReviewToCore(
  input: SkillReviewInput,
  specId: EntityId,
  reviewType: ReviewType,
): Review {
  const ts = now();
  const findings: ReviewFinding[] = (input.findings ?? []).map((f) => ({
    severity: f.severity ?? "p2",
    category: f.category ?? "general",
    title: f.title,
    details: f.details ?? "",
    filePath: f.filePath,
    line: f.line,
  }));

  return {
    id: generateEntityId(),
    projectId: (input.projectId ?? "unknown") as EntityId,
    specId,
    reviewType,
    verdict: input.verdict,
    findings,
    summary: input.summary ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
}

export function skillVerificationToCore(
  input: SkillVerificationInput,
  runId: EntityId,
): VerificationResult {
  const ts = now();
  const failures: VerificationFailure[] = (input.failures ?? []).map((f) => ({
    check: f.check,
    details: f.details ?? "",
  }));

  return {
    id: generateEntityId(),
    projectId: (input.projectId ?? "unknown") as EntityId,
    specId: input.specId as EntityId,
    runId,
    checksRun: input.checksRun ?? [],
    passed: input.passed,
    failures,
    timestamp: ts,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function skillCheckpointToCore(
  input: SkillCheckpointInput,
): Checkpoint {
  const ts = now();
  return {
    id: generateEntityId(),
    projectId: (input.projectId ?? "unknown") as EntityId,
    runId: (input.runId ?? null) as EntityId | null,
    activeSpecId: (input.activeSpecId ?? null) as EntityId | null,
    phase: input.phase ?? mapSkillStageToPhase(input.stage),
    stageRoute: input.stageRoute ?? null,
    stageTotal: input.stageTotal ?? null,
    progressSummary: input.progress ?? "",
    keyDecisions: input.decisions ?? [],
    preferences: input.preferences ?? [],
    blockers: input.blockers ?? [],
    nextRecommendedActions: input.nextSteps ?? [],
    lastVerificationSummary: input.lastVerificationSummary ?? null,
    createdAt: ts,
    updatedAt: ts,
  };
}

function mapSkillStageToPhase(stage?: number | string): WorkflowPhase {
  if (stage === undefined || stage === null) return "understand";
  const n = typeof stage === "string" ? parseFloat(stage) : stage;
  if (Number.isNaN(n)) return "understand";
  if (n <= 0) return "understand";
  if (n <= 1) return "spec";
  if (n <= 2) return "plan";
  if (n <= 2.5) return "plan"; // design stage maps to plan phase
  if (n <= 3) return "execute";
  if (n <= 4) return "verify";
  if (n <= 4.5) return "verify"; // design review maps to verify phase
  return "release";
}
