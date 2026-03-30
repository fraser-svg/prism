/**
 * learning-journal.ts — Learning Journal aggregation for Prism self-healing engine.
 *
 * Reads all SessionReportCards, computes dimension trends and recurring patterns,
 * and writes a LearningJournal JSON artifact for downstream prescription and dogfood.
 */

import type {
  AbsolutePath,
  LearningJournal,
  LearningJournalPattern,
  SessionReportCard,
  TrendDirection,
  EntityId,
} from "@prism/core";
import { dogfoodPaths } from "@prism/memory";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";

const RECURRING_THRESHOLD = 3;
const RECENT_SCORES_WINDOW = 5;
const PERFORMANCE_WARN_THRESHOLD = 100;

const AUTO_DIMENSIONS = [
  "guided_start",
  "research_proof",
  "stress_verification",
  "evidence_quality",
] as const;

async function readAllReportCards(
  projectRoot: AbsolutePath,
  projectId?: EntityId,
): Promise<SessionReportCard[]> {
  const paths = dogfoodPaths(projectRoot);
  const cards: SessionReportCard[] = [];

  try {
    const files = await readdir(paths.reportsDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith(".json") && !f.endsWith(".pending"),
    );

    if (jsonFiles.length > PERFORMANCE_WARN_THRESHOLD) {
      console.warn(
        `Learning Journal: full scan over ${jsonFiles.length} report cards, consider incremental counters`,
      );
    }

    for (const file of jsonFiles) {
      try {
        const content = await readFile(
          `${paths.reportsDir}/${file}`,
          "utf-8",
        );
        const card = JSON.parse(content) as SessionReportCard;
        if (!projectId || card.projectId === projectId) {
          cards.push(card);
        }
      } catch {
        // Eng review 13A: JSON parse guard — skip corrupt files
        console.warn(
          `Learning Journal: skipping corrupt report card: ${file}`,
        );
      }
    }
  } catch {
    // Reports dir doesn't exist
  }

  return cards.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function computeTrend(recentScores: (number | null)[]): TrendDirection {
  const valid = recentScores.filter((s): s is number => s !== null);
  if (valid.length < 2) return "stable";

  const mid = Math.floor(valid.length / 2);
  const firstHalf = valid.slice(0, mid);
  const secondHalf = valid.slice(mid);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const delta = avgSecond - avgFirst;
  if (delta > 1) return "improving";
  if (delta < -1) return "degrading";
  return "stable";
}

export interface JournalUpdateResult {
  journal: LearningJournal;
  newlyRecurring: string[];
}

export async function updateLearningJournal(
  projectRoot: AbsolutePath,
  projectId?: EntityId,
): Promise<JournalUpdateResult> {
  const paths = dogfoodPaths(projectRoot);
  await mkdir(paths.dogfoodDir, { recursive: true });

  const cards = await readAllReportCards(projectRoot, projectId);
  const newlyRecurring: string[] = [];

  // Read existing journal for recurring state comparison
  const previousPatterns: Map<string, boolean> = new Map();
  try {
    const existing = JSON.parse(
      await readFile(paths.journalFile, "utf-8"),
    ) as LearningJournal;
    for (const p of existing.patterns) {
      previousPatterns.set(p.dimension, p.recurring);
    }
  } catch {
    // No existing journal
  }

  const patterns: LearningJournalPattern[] = [];

  for (const dim of AUTO_DIMENSIONS) {
    const scores = cards.map((c) => {
      const d = c.dimensions[dim as keyof typeof c.dimensions];
      return d?.score ?? null;
    });

    const validScores = scores.filter((s): s is number => s !== null);
    const avg =
      validScores.length > 0
        ? validScores.reduce((a, b) => a + b, 0) / validScores.length
        : 0;

    const lowOccurrences = validScores.filter((s) => s <= 5).length;
    const recurring = lowOccurrences >= RECURRING_THRESHOLD;
    const wasRecurring = previousPatterns.get(dim) ?? false;

    if (recurring && !wasRecurring) {
      newlyRecurring.push(dim);
    }

    const recentScores = scores.slice(-RECENT_SCORES_WINDOW);

    patterns.push({
      dimension: dim,
      trend: computeTrend(recentScores),
      avgScore: Math.round(avg * 10) / 10,
      occurrences: lowOccurrences,
      recurring,
      firstRecurringAt: null, // Will be set below from previous journal
      detail:
        lowOccurrences > 0
          ? `Score <= 5 in ${lowOccurrences}/${cards.length} sessions`
          : `Healthy — avg ${avg.toFixed(1)}`,
      recentScores,
    });
  }

  // Preserve firstRecurringAt from previous journal and set for newly recurring
  try {
    const existing = JSON.parse(
      await readFile(paths.journalFile, "utf-8"),
    ) as LearningJournal;
    for (const pattern of patterns) {
      const prev = existing.patterns.find(
        (p) => p.dimension === pattern.dimension,
      );
      if (prev?.firstRecurringAt && pattern.recurring) {
        pattern.firstRecurringAt = prev.firstRecurringAt;
      }
    }
  } catch {
    /* no previous journal */
  }

  // Set firstRecurringAt for newly recurring dimensions
  for (const pattern of patterns) {
    if (pattern.recurring && !pattern.firstRecurringAt) {
      pattern.firstRecurringAt = new Date().toISOString();
    }
  }

  const allAvgScores = patterns.map((p) => p.avgScore).filter((s) => s > 0);
  const overallAvg =
    allAvgScores.length > 0
      ? Math.round(
          (allAvgScores.reduce((a, b) => a + b, 0) / allAvgScores.length) * 10,
        ) / 10
      : 0;

  const allRecentScores = patterns.flatMap((p) => p.recentScores);
  const overallTrend = computeTrend(allRecentScores);

  const journal: LearningJournal = {
    schemaVersion: 1,
    lastUpdated: new Date().toISOString(),
    totalSessions: cards.length,
    patterns,
    overallTrend,
    overallAvgScore: overallAvg,
  };

  await writeFile(paths.journalFile, JSON.stringify(journal, null, 2));

  return { journal, newlyRecurring };
}
