/**
 * experiments.ts — Autoresearch experiment system for Prism self-healing.
 *
 * Manages A/B experiments on prompt variants. Session ID parity determines
 * assignment: even = baseline, odd = variant. Variants are injected via
 * .prism/experiments/active-variant.md (referenced by SKILL.md).
 *
 * Lifecycle: create → record metrics → decide → promote/discard
 */

import type {
  AbsolutePath,
  Experiment,
  ExperimentDecision,
  ExperimentLevel,
  ExperimentMetric,
  ExperimentRegistry,
  ExperimentVariant,
  LearningJournal,
  SessionReportCard,
} from "@prism/core";
import { experimentPaths, dogfoodPaths } from "@prism/memory";
import { mkdir, readFile, writeFile, rename, unlink, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSIONS_REQUIRED = 10;
const IMPROVEMENT_THRESHOLD = 0.10; // 10% improvement required
const MIN_DATAPOINTS = 3;

/**
 * Prompt variant templates keyed by dimension.
 * Each template provides a stricter/more-specific version of the review prompt
 * section that targets the given dimension.
 */
const VARIANT_TEMPLATES: Record<string, { label: string; content: string; targetFile: string; targetSection: string }> = {
  guided_start: {
    label: "stricter-intake-validation",
    content: [
      "## Guided Start — Variant",
      "",
      "Before advancing past the understand phase, verify:",
      "1. IntakeBrief exists with ALL questions resolved (zero unresolved)",
      "2. User has confirmed the problem statement in their own words",
      "3. At least 2 clarifying questions were asked and answered",
      "4. Success criteria are explicit and measurable",
      "",
      "If any check fails, do NOT proceed. Ask the missing question.",
    ].join("\n"),
    targetFile: "references/reviews/planning-review.md",
    targetSection: "guided-start",
  },
  research_proof: {
    label: "stricter-research-evidence",
    content: [
      "## Research Proof — Variant",
      "",
      "Before advancing past the spec phase, verify:",
      "1. SolutionThesis exists with >= 2 alternatives explored",
      "2. Each alternative has a concrete pro/con analysis",
      "3. Recommendation includes explicit reasoning (not just 'best option')",
      "4. At least 1 alternative was seriously considered, not strawmanned",
      "",
      "If research is shallow, request deeper investigation before proceeding.",
    ].join("\n"),
    targetFile: "references/reviews/planning-review.md",
    targetSection: "research-proof",
  },
  stress_verification: {
    label: "mandatory-stress-scenarios",
    content: [
      "## Stress Verification — Variant",
      "",
      "Verification plans MUST include:",
      "1. At least 1 stress scenario (high load, large input, concurrent access)",
      "2. At least 1 edge case scenario (empty input, boundary values, null)",
      "3. All scenarios must have explicit pass/fail criteria",
      "4. Scenarios must be runnable, not hypothetical",
      "",
      "Reject verification plans with only happy-path scenarios.",
    ].join("\n"),
    targetFile: "references/reviews/qa-review.md",
    targetSection: "stress-verification",
  },
  evidence_quality: {
    label: "high-confidence-evidence-required",
    content: [
      "## Evidence Quality — Variant",
      "",
      "All review findings MUST have:",
      "1. Evidence confidence rated as 'high' (code reference or test output)",
      "2. No unsupported absence claims ('X is missing' without checking)",
      "3. Each finding links to specific file:line or test output",
      "4. Severity matches actual impact, not hypothetical risk",
      "",
      "Downgrade or remove findings that lack concrete evidence.",
    ].join("\n"),
    targetFile: "references/reviews/qa-review.md",
    targetSection: "evidence-quality",
  },
};

// ─── Registry CRUD ───────────────────────────────────────────────────────────

function emptyRegistry(): ExperimentRegistry {
  return {
    schemaVersion: 1,
    globalEnabled: true,
    maxConcurrentPerLevel: 1,
    levelsEnabled: { prompt: true },
    experiments: { prompt: [] },
  };
}

/**
 * Read the experiment registry. Returns empty registry if not found or corrupt.
 * Corrupt files are renamed to .corrupt for debugging.
 */
export async function readRegistry(projectRoot: AbsolutePath): Promise<ExperimentRegistry> {
  const paths = experimentPaths(projectRoot);
  try {
    const content = await readFile(paths.registryFile, "utf-8");
    return JSON.parse(content) as ExperimentRegistry;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
      return emptyRegistry();
    }
    // Corrupt JSON — rename and return fresh
    try {
      await rename(paths.registryFile, `${paths.registryFile}.corrupt.${Date.now()}`);
    } catch { /* ignore rename failure */ }
    console.warn("Experiments: corrupt registry, reset to empty");
    return emptyRegistry();
  }
}

/** Atomic write: temp file + rename */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${randomUUID().slice(0, 8)}`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2));
  await rename(tmpPath, filePath);
}

export async function writeRegistry(projectRoot: AbsolutePath, registry: ExperimentRegistry): Promise<void> {
  const paths = experimentPaths(projectRoot);
  await atomicWriteJson(paths.registryFile, registry);
}

// ─── Experiment CRUD ─────────────────────────────────────────────────────────

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

const SAFE_PATH_SEGMENT = /^[a-z0-9_-]+$/;

function validatePathSegment(value: string, label: string): void {
  if (!SAFE_PATH_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

export async function readExperiment(projectRoot: AbsolutePath, level: ExperimentLevel, id: string): Promise<Experiment | null> {
  validatePathSegment(level, "level");
  validatePathSegment(id, "id");
  const paths = experimentPaths(projectRoot);
  try {
    const content = await readFile(paths.experimentFile(level, id), "utf-8");
    return JSON.parse(content) as Experiment;
  } catch {
    return null;
  }
}

export async function writeExperiment(projectRoot: AbsolutePath, experiment: Experiment): Promise<void> {
  validatePathSegment(experiment.level, "level");
  validatePathSegment(experiment.id, "id");
  const paths = experimentPaths(projectRoot);
  await atomicWriteJson(paths.experimentFile(experiment.level, experiment.id), experiment);
}

// ─── Create Experiment ───────────────────────────────────────────────────────

export interface CreateExperimentOpts {
  projectRoot: AbsolutePath;
  dimension: string;
  baselineContent: string;
}

export async function createExperiment(opts: CreateExperimentOpts): Promise<Experiment | null> {
  const template = VARIANT_TEMPLATES[opts.dimension];
  if (!template) return null;

  const registry = await readRegistry(opts.projectRoot);

  // Check if experiments are enabled
  if (!registry.globalEnabled || !registry.levelsEnabled.prompt) return null;

  // Check max concurrent
  const activeIds = registry.experiments.prompt ?? [];
  const activeCount = await countActiveExperiments(opts.projectRoot, activeIds);
  if (activeCount >= registry.maxConcurrentPerLevel) return null;

  const id = `exp-prompt-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${opts.dimension}-${randomUUID().slice(0, 6)}`;

  // Dedup: don't create if one already exists for this dimension
  for (const existingId of activeIds) {
    const existing = await readExperiment(opts.projectRoot, "prompt", existingId);
    if (existing && existing.dimension === opts.dimension && existing.status === "active") {
      return null;
    }
  }

  const experiment: Experiment = {
    id,
    level: "prompt",
    status: "active",
    createdAt: new Date().toISOString(),
    expiresAfter: SESSIONS_REQUIRED,
    sessionsRun: 0,
    hypothesis: `Stricter ${opts.dimension} prompt improves ${opts.dimension} scores`,
    dimension: opts.dimension,
    targetFile: template.targetFile,
    targetSection: template.targetSection,
    baselineVariant: {
      id: "baseline",
      label: "baseline",
      content: opts.baselineContent,
      contentHash: contentHash(opts.baselineContent),
    },
    testVariant: {
      id: "variant-1",
      label: template.label,
      content: template.content,
      contentHash: contentHash(template.content),
    },
    metrics: [],
    decision: null,
  };

  await writeExperiment(opts.projectRoot, experiment);

  // Update registry
  registry.experiments.prompt.push(id);
  await writeRegistry(opts.projectRoot, registry);

  return experiment;
}

async function countActiveExperiments(projectRoot: AbsolutePath, ids: string[]): Promise<number> {
  let count = 0;
  for (const id of ids) {
    const exp = await readExperiment(projectRoot, "prompt", id);
    if (exp && exp.status === "active") count++;
  }
  return count;
}

// ─── Record Metric ───────────────────────────────────────────────────────────

export function assignVariant(sessionId: string): "baseline" | "test" {
  // Deterministic: hash session ID, check parity
  const hash = createHash("sha256").update(sessionId).digest();
  return hash[0]! % 2 === 0 ? "baseline" : "test";
}

export async function recordMetric(
  projectRoot: AbsolutePath,
  experimentId: string,
  reportCard: SessionReportCard,
): Promise<boolean> {
  const experiment = await readExperiment(projectRoot, "prompt", experimentId);
  if (!experiment || experiment.status !== "active") return false;

  // Dedup: skip if this session already recorded a metric
  if (experiment.metrics.some(m => m.sessionId === reportCard.sessionId)) return false;

  const dim = experiment.dimension as keyof SessionReportCard["dimensions"];
  const dimScore = reportCard.dimensions[dim];
  if (!dimScore || typeof dimScore.score !== "number") return false;

  const variant = assignVariant(reportCard.sessionId);

  const metric: ExperimentMetric = {
    dimension: experiment.dimension,
    value: dimScore.score,
    sessionId: reportCard.sessionId,
    variant,
    timestamp: new Date().toISOString(),
  };

  experiment.metrics.push(metric);
  experiment.sessionsRun++;
  await writeExperiment(projectRoot, experiment);

  return true;
}

// ─── Decide Experiment ───────────────────────────────────────────────────────

export async function decideExperiment(
  projectRoot: AbsolutePath,
  experimentId: string,
): Promise<ExperimentDecision | null> {
  const experiment = await readExperiment(projectRoot, "prompt", experimentId);
  if (!experiment || experiment.status !== "active") return null;

  if (experiment.sessionsRun < experiment.expiresAfter) return null;

  const baselineMetrics = experiment.metrics.filter(m => m.variant === "baseline");
  const testMetrics = experiment.metrics.filter(m => m.variant === "test");

  // Need minimum datapoints on each side
  if (baselineMetrics.length < MIN_DATAPOINTS || testMetrics.length < MIN_DATAPOINTS) {
    // Not enough data, but experiment expired. Inconclusive.
    const decision: ExperimentDecision = {
      winner: "inconclusive",
      baselineAvg: avg(baselineMetrics.map(m => m.value)),
      testAvg: avg(testMetrics.map(m => m.value)),
      improvement: 0,
      confidence: "low",
      decidedAt: new Date().toISOString(),
    };
    experiment.decision = decision;
    experiment.status = "decided";
    await writeExperiment(projectRoot, experiment);
    return decision;
  }

  // Use unrounded averages for decision to avoid rounding-induced threshold flips
  const baselineAvgRaw = rawAvg(baselineMetrics.map(m => m.value));
  const testAvgRaw = rawAvg(testMetrics.map(m => m.value));

  // Avoid division by zero
  const improvement = baselineAvgRaw > 0
    ? (testAvgRaw - baselineAvgRaw) / baselineAvgRaw
    : testAvgRaw > baselineAvgRaw ? 1 : 0;

  let winner: ExperimentDecision["winner"] = "inconclusive";
  let confidence: ExperimentDecision["confidence"] = "low";

  if (improvement >= IMPROVEMENT_THRESHOLD) {
    winner = "test";
    confidence = improvement >= 0.2 ? "high" : "medium";
  } else if (improvement <= -IMPROVEMENT_THRESHOLD) {
    winner = "baseline";
    confidence = improvement <= -0.2 ? "high" : "medium";
  }

  const decision: ExperimentDecision = {
    winner,
    baselineAvg: avg(baselineMetrics.map(m => m.value)),
    testAvg: avg(testMetrics.map(m => m.value)),
    improvement: Math.round(improvement * 1000) / 1000,
    confidence,
    decidedAt: new Date().toISOString(),
  };

  experiment.decision = decision;
  experiment.status = "decided";
  await writeExperiment(projectRoot, experiment);

  return decision;
}

/** Compute average. Round only for display; callers doing comparisons should use rawAvg. */
function rawAvg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function avg(values: number[]): number {
  return Math.round(rawAvg(values) * 100) / 100;
}

// ─── Promote / Discard ───────────────────────────────────────────────────────

export async function promoteExperiment(
  projectRoot: AbsolutePath,
  experimentId: string,
): Promise<boolean> {
  const experiment = await readExperiment(projectRoot, "prompt", experimentId);
  if (!experiment || experiment.status !== "decided") return false;

  experiment.status = "promoted";
  await writeExperiment(projectRoot, experiment);
  return true;
}

export async function discardExperiment(
  projectRoot: AbsolutePath,
  experimentId: string,
): Promise<boolean> {
  const experiment = await readExperiment(projectRoot, "prompt", experimentId);
  if (!experiment || experiment.status !== "decided") return false;

  experiment.status = "discarded";
  await writeExperiment(projectRoot, experiment);

  // Clean up active variant file if it was from this experiment
  await cleanupVariantFile(projectRoot);
  return true;
}

// ─── Variant File Management ─────────────────────────────────────────────────

/**
 * Write the active variant file for the current session.
 * SKILL.md references this file; the variant is injected without
 * modifying SKILL.md on disk.
 */
export async function writeVariantFile(
  projectRoot: AbsolutePath,
  sessionId: string,
): Promise<string | null> {
  const registry = await readRegistry(projectRoot);
  const activeIds = registry.experiments.prompt ?? [];

  // Find the first active experiment
  for (const id of activeIds) {
    const experiment = await readExperiment(projectRoot, "prompt", id);
    if (!experiment || experiment.status !== "active") continue;

    const variant = assignVariant(sessionId);
    const content = variant === "test"
      ? experiment.testVariant.content
      : experiment.baselineVariant.content;

    const paths = experimentPaths(projectRoot);
    await mkdir(dirname(paths.activeVariantFile), { recursive: true });

    const header = [
      `<!-- Experiment: ${experiment.id} | Variant: ${variant} | Session: ${sessionId} -->`,
      `<!-- Dimension: ${experiment.dimension} | Hypothesis: ${experiment.hypothesis} -->`,
      "",
    ].join("\n");

    // Atomic write: temp file + rename to avoid truncated reads on crash
    const tmpVariant = `${paths.activeVariantFile}.tmp.${randomUUID().slice(0, 8)}`;
    await writeFile(tmpVariant, header + content);
    await rename(tmpVariant, paths.activeVariantFile);
    return variant;
  }

  // No active experiments — clean up any stale variant file
  await cleanupVariantFile(projectRoot);
  return null;
}

export async function cleanupVariantFile(projectRoot: AbsolutePath): Promise<void> {
  const paths = experimentPaths(projectRoot);
  try {
    await unlink(paths.activeVariantFile);
  } catch { /* file doesn't exist, that's fine */ }
}

// ─── Propose Experiments (from self-healing signals) ─────────────────────────

/**
 * Read the current content of a target file to use as the baseline prompt.
 * Falls back to a descriptive label if the file doesn't exist.
 */
async function readBaselineContent(projectRoot: AbsolutePath, dimension: string): Promise<string> {
  const template = VARIANT_TEMPLATES[dimension];
  if (!template) return `Current ${dimension} prompt (baseline)`;

  try {
    const filePath = `${projectRoot}/${template.targetFile}`;
    return await readFile(filePath, "utf-8");
  } catch {
    // File doesn't exist yet — use descriptive fallback
    return `Current ${dimension} prompt (baseline — target file not found)`;
  }
}

/**
 * Propose new experiments based on degrading patterns in the learning journal.
 * Only proposes for dimensions that are degrading and don't already have
 * an active experiment.
 */
export async function proposeExperiments(
  projectRoot: AbsolutePath,
  journal: LearningJournal,
): Promise<string[]> {
  const proposed: string[] = [];

  for (const pattern of journal.patterns) {
    if (pattern.trend !== "degrading") continue;
    if (!pattern.recurring) continue;

    // Check if a template exists for this dimension
    if (!VARIANT_TEMPLATES[pattern.dimension]) continue;

    const baselineContent = await readBaselineContent(projectRoot, pattern.dimension);

    const experiment = await createExperiment({
      projectRoot,
      dimension: pattern.dimension,
      baselineContent,
    });

    if (experiment) {
      proposed.push(experiment.id);
    }
  }

  return proposed;
}

/**
 * Evaluate all active experiments: record metrics from the latest report card
 * and decide any that have enough data.
 */
export async function evaluateExperiments(
  projectRoot: AbsolutePath,
  reportCard: SessionReportCard,
): Promise<{
  metricsRecorded: string[];
  decided: string[];
  promoted: string[];
  discarded: string[];
}> {
  const result = {
    metricsRecorded: [] as string[],
    decided: [] as string[],
    promoted: [] as string[],
    discarded: [] as string[],
  };

  const registry = await readRegistry(projectRoot);
  const activeIds = registry.experiments.prompt ?? [];

  for (const id of activeIds) {
    const experiment = await readExperiment(projectRoot, "prompt", id);
    if (!experiment || experiment.status !== "active") continue;

    // Record metric
    const recorded = await recordMetric(projectRoot, id, reportCard);
    if (recorded) {
      result.metricsRecorded.push(id);
    }

    // Try to decide
    const decision = await decideExperiment(projectRoot, id);
    if (decision) {
      result.decided.push(id);

      // Auto-promote winners, auto-discard baseline winners, leave inconclusive for retry
      if (decision.winner === "test") {
        await promoteExperiment(projectRoot, id);
        result.promoted.push(id);
      } else if (decision.winner === "baseline") {
        await discardExperiment(projectRoot, id);
        result.discarded.push(id);
      }
      // "inconclusive" — leave as decided, don't discard (insufficient signal)
    }
  }

  return result;
}
