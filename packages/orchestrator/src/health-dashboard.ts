/**
 * health-dashboard.ts — Markdown health report generator for Prism self-healing engine.
 *
 * Reads report cards, learning journal, and prescriptions to produce
 * a human-readable HEALTH.md with sparklines, session tables, and trends.
 */

import type {
  AbsolutePath,
  SessionReportCard,
  LearningJournal,
  Prescription,
} from "@prism/core";
import { dogfoodPaths } from "@prism/memory";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { readActivePrescriptions } from "./prescription-manager";

export function sparkline(scores: (number | null)[]): string {
  const blocks = " \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";
  return scores
    .map((s) => {
      if (s === null) return "\u00B7";
      const idx = Math.min(Math.round((s / 10) * 8), 8);
      return blocks[idx];
    })
    .join("");
}

function passOrFail(score: number | null): string {
  if (score === null) return "\u2014";
  return score >= 5 ? "pass" : "FAIL";
}

function trendArrow(trend: string): string {
  switch (trend) {
    case "improving":
      return "\u2191";
    case "degrading":
      return "\u2193";
    default:
      return "\u2192";
  }
}

export async function generateHealthDashboard(
  projectRoot: AbsolutePath,
): Promise<string> {
  const paths = dogfoodPaths(projectRoot);
  await mkdir(paths.dogfoodDir, { recursive: true });

  // Read report cards (last 5, sorted by timestamp not filename)
  const cards: SessionReportCard[] = [];
  try {
    const files = await readdir(paths.reportsDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith(".json") && !f.endsWith(".pending"),
    );

    const allCards: SessionReportCard[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await readFile(
          `${paths.reportsDir}/${file}`,
          "utf-8",
        );
        allCards.push(JSON.parse(content) as SessionReportCard);
      } catch {
        /* skip corrupt */
      }
    }

    allCards.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    cards.push(...allCards.slice(-5));
  } catch {
    /* no reports dir */
  }

  // Read journal
  let journal: LearningJournal | null = null;
  try {
    journal = JSON.parse(
      await readFile(paths.journalFile, "utf-8"),
    ) as LearningJournal;
  } catch {
    /* no journal */
  }

  // Read prescriptions
  const prescriptions = await readActivePrescriptions(projectRoot);

  // Generate
  const healthScore = journal?.overallAvgScore
    ? Math.round(journal.overallAvgScore * 10)
    : null;
  const trend = journal?.overallTrend ?? "stable";

  const lines: string[] = [
    `# Prism Health Report`,
    `Last updated: ${new Date().toISOString()}`,
    ``,
  ];

  if (healthScore !== null) {
    lines.push(`## Health Score: ${healthScore}/100 ${trendArrow(trend)}`);
  } else {
    lines.push(`## Health Score: Insufficient data`);
  }
  lines.push(``);

  // Session table
  if (cards.length > 0) {
    lines.push(`## Last ${cards.length} Sessions`);
    lines.push(
      `| Date | Score | Top Issue | Guided Start | Research | Stress Test | Evidence |`,
    );
    lines.push(
      `|------|-------|-----------|-------------|----------|-------------|----------|`,
    );

    for (const card of cards) {
      const date = card.timestamp.split("T")[0];
      const score =
        card.overallScore !== null ? `${card.overallScore}` : "\u2014";

      const dims = card.dimensions;
      const weakest = Object.entries(dims)
        .filter(([, d]) => d.score !== null)
        .sort((a, b) => (a[1].score ?? 99) - (b[1].score ?? 99));
      const topIssue =
        weakest.length > 0
          ? weakest[0]![0].replace(/_/g, " ")
          : "\u2014";

      lines.push(
        `| ${date} | ${score} | ${topIssue} | ${passOrFail(dims.guided_start.score)} | ${passOrFail(dims.research_proof.score)} | ${passOrFail(dims.stress_verification.score)} | ${passOrFail(dims.evidence_quality.score)} |`,
      );
    }
    lines.push(``);
  } else {
    lines.push(`## Sessions`);
    lines.push(`No sessions recorded yet.`);
    lines.push(``);
  }

  // Sparklines
  if (journal && journal.patterns.length > 0) {
    lines.push(`## Dimension Trends`);
    for (const pattern of journal.patterns) {
      const spark = sparkline(pattern.recentScores);
      lines.push(
        `- **${pattern.dimension.replace(/_/g, " ")}**: ${spark} avg ${pattern.avgScore} ${trendArrow(pattern.trend)}`,
      );
    }
    lines.push(``);
  }

  // Recurring issues
  const recurring = journal?.patterns.filter((p) => p.recurring) ?? [];
  if (recurring.length > 0) {
    lines.push(
      `## Top ${Math.min(recurring.length, 3)} Recurring Issues`,
    );
    for (const pattern of recurring.slice(0, 3)) {
      const since = pattern.firstRecurringAt
        ? ` \u2014 recurring since ${pattern.firstRecurringAt.split("T")[0]}`
        : "";
      const rx = prescriptions.find(
        (p) => p.dimension === pattern.dimension,
      );
      const rxText = rx ? ` \u2014 Rx: ${rx.prescription}` : "";
      lines.push(`1. ${pattern.detail}${since}${rxText}`);
    }
    lines.push(``);
  }

  // Prescriptions
  if (prescriptions.length > 0) {
    lines.push(`## Active Prescriptions`);
    for (const p of prescriptions) {
      lines.push(
        `- ${p.prescription} (since ${p.createdAt.split("T")[0]}, severity: ${p.severity})`,
      );
    }
    lines.push(``);
  }

  lines.push(`## Trend: ${trend}`);

  const markdown = lines.join("\n");
  await writeFile(paths.healthFile, markdown);
  return markdown;
}
