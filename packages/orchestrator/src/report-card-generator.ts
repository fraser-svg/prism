/**
 * report-card-generator.ts — Session Report Card generation for Prism self-healing engine.
 *
 * Generates a SessionReportCard at session end by scoring dimensions
 * from EventLog events. Supports crash recovery for interrupted sessions.
 */

import type {
  AbsolutePath,
  SessionReportCard,
  ReportCardDimension,
  EntityId,
} from "@prism/core";
import { dogfoodPaths } from "@prism/memory";
import { mkdir, writeFile, readFile, readdir, unlink, access } from "node:fs/promises";

/** Which entity types are available for scoring. Dimensions score null if their prerequisite isn't wired. */
const CAPABILITY_ENTITY_MAP: Record<string, string> = {
  guided_start: "intake_brief",
  research_proof: "solution_thesis",
  stress_verification: "verification_scenario",
  evidence_quality: "review_finding",
};

export interface ReportCardInput {
  projectRoot: AbsolutePath;
  projectId: EntityId;
  sessionId: string;
  /** EventLog events filtered by sessionId */
  events: Array<{ eventType: string; metadata: Record<string, unknown> | null }>;
  /** Which entity types exist in this installation */
  availableCapabilities: string[];
  /** Whether this is crash recovery */
  crashRecovery?: boolean;
}

/** Safe numeric coercion for untrusted metadata values. Returns fallback if not a finite number. */
function safeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Score guided_start dimension.
 * 10 = IntakeBrief exists with 0 unresolved questions
 * 5 = IntakeBrief exists but has unresolved questions
 * 0 = No IntakeBrief
 */
function scoreGuidedStart(
  events: ReportCardInput["events"],
): number {
  const intakeEvents = events.filter(
    (e) =>
      e.eventType === "artifact:created" &&
      e.metadata?.entityType === "intake_brief",
  );
  if (intakeEvents.length === 0) return 0;
  const latest = intakeEvents[intakeEvents.length - 1];
  const unresolvedCount = safeNumber(latest?.metadata?.unresolvedQuestionCount, 0);
  return unresolvedCount === 0 ? 10 : 5;
}

/**
 * Score research_proof dimension.
 * 10 = SolutionThesis with >= 2 alternatives + explicit recommendation reason
 * 5 = SolutionThesis with < 2 alternatives OR missing reason
 * 0 = No SolutionThesis
 */
function scoreResearchProof(
  events: ReportCardInput["events"],
): number {
  const thesisEvents = events.filter(
    (e) =>
      e.eventType === "artifact:created" &&
      e.metadata?.entityType === "solution_thesis",
  );
  if (thesisEvents.length === 0) return 0;
  const latest = thesisEvents[thesisEvents.length - 1];
  const altCount = safeNumber(latest?.metadata?.alternativeCount, 0);
  const hasReason = Boolean(latest?.metadata?.hasRecommendationReason);
  return altCount >= 2 && hasReason ? 10 : 5;
}

/**
 * Score stress_verification dimension.
 * 10 = >= 1 stress + >= 1 edge scenario passed
 * 5 = Only happy_path scenarios
 * 0 = No verification scenarios
 */
function scoreStressVerification(
  events: ReportCardInput["events"],
): number {
  const verifyEvents = events.filter(
    (e) =>
      e.eventType === "artifact:created" &&
      e.metadata?.entityType === "verification_result",
  );
  if (verifyEvents.length === 0) return 0;
  const latest = verifyEvents[verifyEvents.length - 1];
  const hasStress = Boolean(latest?.metadata?.hasStressScenario);
  const hasEdge = Boolean(latest?.metadata?.hasEdgeScenario);
  if (hasStress && hasEdge) return 10;
  const scenarioCount = safeNumber(latest?.metadata?.scenarioCount, 0);
  return scenarioCount > 0 ? 5 : 0;
}

/**
 * Score evidence_quality dimension.
 * 10 = All findings have evidenceConfidence "high"
 * proportional for mixed confidence
 * 0 = Any unsupported absence claims
 */
function scoreEvidenceQuality(
  events: ReportCardInput["events"],
): number {
  const reviewEvents = events.filter(
    (e) =>
      e.eventType === "artifact:created" && e.metadata?.entityType === "review",
  );
  if (reviewEvents.length === 0) return 5; // No reviews = neutral, not penalized
  const latest = reviewEvents[reviewEvents.length - 1];
  const totalFindings = safeNumber(latest?.metadata?.totalFindings, 0);
  const highCount = safeNumber(latest?.metadata?.highConfidenceCount, 0);
  const hasUnsupportedAbsence = Boolean(
    latest?.metadata?.hasUnsupportedAbsence,
  );
  if (hasUnsupportedAbsence) return 0;
  if (totalFindings === 0) return 5;
  return Math.round((10 * highCount) / totalFindings);
}

function scoreDimension(
  dimension: string,
  input: ReportCardInput,
): ReportCardDimension {
  const requiredCapability = CAPABILITY_ENTITY_MAP[dimension];

  // Capability check (eng review decision 3A): if the prerequisite entity type
  // isn't available, score null instead of 0 to prevent false signals
  if (
    requiredCapability &&
    !input.availableCapabilities.includes(requiredCapability)
  ) {
    return {
      score: null,
      source: "auto",
      evidence: `Prerequisite "${requiredCapability}" not yet available`,
    };
  }

  let score: number;
  switch (dimension) {
    case "guided_start":
      score = scoreGuidedStart(input.events);
      break;
    case "research_proof":
      score = scoreResearchProof(input.events);
      break;
    case "stress_verification":
      score = scoreStressVerification(input.events);
      break;
    case "evidence_quality":
      score = scoreEvidenceQuality(input.events);
      break;
    default:
      return { score: null, source: "auto", evidence: "Unknown dimension" };
  }

  return {
    score,
    source: input.crashRecovery ? "crash_recovery" : "auto",
    evidence: `Scored from ${input.events.length} session events`,
  };
}

function computeOverallScore(
  dimensions: SessionReportCard["dimensions"],
): number | null {
  const values = Object.values(dimensions)
    .map((d) => d.score)
    .filter((s): s is number => s !== null);
  if (values.length === 0) return null;
  return Math.round(
    (values.reduce((a, b) => a + b, 0) / values.length) * 10,
  );
}

function generateSummary(
  dimensions: SessionReportCard["dimensions"],
  overallScore: number | null,
): string {
  const scored = Object.entries(dimensions)
    .filter(([, d]) => d.score !== null)
    .map(([name, d]) => ({ name, score: d.score! }));

  if (scored.length === 0) return "Insufficient data to generate summary.";

  const weak = scored
    .filter((s) => s.score < 5)
    .map((s) => s.name.replace(/_/g, " "));
  const strong = scored
    .filter((s) => s.score >= 8)
    .map((s) => s.name.replace(/_/g, " "));

  const parts: string[] = [];
  if (overallScore !== null) parts.push(`Overall score: ${overallScore}/100.`);
  if (strong.length > 0) parts.push(`Strong: ${strong.join(", ")}.`);
  if (weak.length > 0) parts.push(`Needs improvement: ${weak.join(", ")}.`);

  return parts.join(" ") || "Session completed.";
}

export async function generateReportCard(
  input: ReportCardInput,
): Promise<SessionReportCard> {
  const paths = dogfoodPaths(input.projectRoot);

  // Ensure directories exist
  await mkdir(paths.reportsDir, { recursive: true });

  // Step 1: Write pending marker (eng review decision 4A)
  const pendingPath = `${paths.reportsDir}/${input.sessionId}.pending`;
  await writeFile(
    pendingPath,
    JSON.stringify({ startedAt: new Date().toISOString() }),
  );

  try {
    // Step 2-6: Score dimensions
    const dimensions: SessionReportCard["dimensions"] = {
      guided_start: scoreDimension("guided_start", input),
      research_proof: scoreDimension("research_proof", input),
      stress_verification: scoreDimension("stress_verification", input),
      evidence_quality: scoreDimension("evidence_quality", input),
      post_handoff_bugs: {
        score: null,
        source: "manual_on_resume",
        evidence: null,
      },
      user_corrections: {
        score: null,
        source: "manual_on_resume",
        evidence: null,
      },
    };

    const overallScore = computeOverallScore(dimensions);

    const reportCard: SessionReportCard = {
      schemaVersion: 1,
      sessionId: input.sessionId,
      projectId: input.projectId,
      timestamp: new Date().toISOString(),
      dimensions,
      overallScore,
      summary: generateSummary(dimensions, overallScore),
      replaySessionId: input.sessionId,
      crashRecovery: input.crashRecovery ?? false,
      capabilitiesAvailable: input.availableCapabilities,
    };

    // Step 7: Write report card
    const reportPath = `${paths.reportsDir}/${input.sessionId}.json`;
    await writeFile(reportPath, JSON.stringify(reportCard, null, 2));

    // Step 8: Remove pending marker
    await unlink(pendingPath).catch(() => {});

    return reportCard;
  } catch (err) {
    // On error, leave pending marker for crash recovery
    throw err;
  }
}

/**
 * Check for pending report cards from crashed sessions and complete them.
 * Returns the session IDs of any recovered reports.
 */
export async function recoverPendingReports(
  projectRoot: AbsolutePath,
  projectId: EntityId,
  events: Array<{
    eventType: string;
    metadata: Record<string, unknown> | null;
  }>,
  availableCapabilities: string[],
): Promise<string[]> {
  const paths = dogfoodPaths(projectRoot);
  const recovered: string[] = [];

  try {
    const files = await readdir(paths.reportsDir);
    const pendingFiles = files.filter((f) => f.endsWith(".pending"));

    for (const pending of pendingFiles) {
      const sessionId = pending.replace(".pending", "");
      // Check if a completed report already exists (idempotency)
      const reportPath = `${paths.reportsDir}/${sessionId}.json`;
      if (await pathExists(reportPath)) {
        // Report exists — just clean up the pending marker
        await unlink(`${paths.reportsDir}/${pending}`).catch(() => {});
        continue;
      }

      // Generate crash recovery report
      const sessionEvents = events.filter(
        (e) => e.metadata?.sessionId === sessionId,
      );

      await generateReportCard({
        projectRoot,
        projectId,
        sessionId,
        events: sessionEvents,
        availableCapabilities,
        crashRecovery: true,
      });

      recovered.push(sessionId);
    }
  } catch {
    // Reports dir doesn't exist yet — nothing to recover
  }

  return recovered;
}
