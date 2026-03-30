/**
 * health-dashboard.test.ts — Tests for markdown health report generation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AbsolutePath,
  EntityId,
  SessionReportCard,
  LearningJournal,
} from "@prism/core";
import { generateHealthDashboard } from "./health-dashboard";

describe("generateHealthDashboard", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;
  let reportsDir: string;
  let dogfoodDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-"));
    projectRoot = tmpDir as AbsolutePath;
    dogfoodDir = join(tmpDir, ".prism", "dogfood");
    reportsDir = join(dogfoodDir, "reports");
    await mkdir(reportsDir, { recursive: true });
    await mkdir(join(dogfoodDir, "prescriptions"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeReportCard(
    sessionId: string,
    scores: {
      guided_start: number | null;
      research_proof: number | null;
      stress_verification: number | null;
      evidence_quality: number | null;
    },
    overallScore: number | null = null,
    timestamp?: string,
  ): SessionReportCard {
    return {
      schemaVersion: 1,
      sessionId,
      projectId: "proj-1" as EntityId,
      timestamp: timestamp ?? "2026-03-15T12:00:00Z",
      dimensions: {
        guided_start: { score: scores.guided_start, source: "auto", evidence: null },
        research_proof: { score: scores.research_proof, source: "auto", evidence: null },
        stress_verification: { score: scores.stress_verification, source: "auto", evidence: null },
        evidence_quality: { score: scores.evidence_quality, source: "auto", evidence: null },
        post_handoff_bugs: { score: null, source: "manual_on_resume", evidence: null },
        user_corrections: { score: null, source: "manual_on_resume", evidence: null },
      },
      overallScore,
      summary: "test",
      replaySessionId: sessionId,
      crashRecovery: false,
      capabilitiesAvailable: [],
    };
  }

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------

  it("generates markdown with session table and sparklines", async () => {
    // Write report cards
    await writeFile(
      join(reportsDir, "s1.json"),
      JSON.stringify(
        makeReportCard(
          "s1",
          { guided_start: 10, research_proof: 8, stress_verification: 7, evidence_quality: 9 },
          85,
          "2026-03-15T12:00:00Z",
        ),
      ),
    );

    // Write a learning journal
    const journal: LearningJournal = {
      schemaVersion: 1,
      lastUpdated: new Date().toISOString(),
      totalSessions: 1,
      patterns: [
        {
          dimension: "guided_start",
          trend: "improving",
          avgScore: 10,
          occurrences: 0,
          recurring: false,
          firstRecurringAt: null,
          detail: "Healthy -- avg 10.0",
          recentScores: [10],
        },
        {
          dimension: "research_proof",
          trend: "stable",
          avgScore: 8,
          occurrences: 0,
          recurring: false,
          firstRecurringAt: null,
          detail: "Healthy -- avg 8.0",
          recentScores: [8],
        },
        {
          dimension: "stress_verification",
          trend: "stable",
          avgScore: 7,
          occurrences: 0,
          recurring: false,
          firstRecurringAt: null,
          detail: "Healthy -- avg 7.0",
          recentScores: [7],
        },
        {
          dimension: "evidence_quality",
          trend: "stable",
          avgScore: 9,
          occurrences: 0,
          recurring: false,
          firstRecurringAt: null,
          detail: "Healthy -- avg 9.0",
          recentScores: [9],
        },
      ],
      overallTrend: "improving",
      overallAvgScore: 8.5,
    };
    await writeFile(
      join(dogfoodDir, "learning-journal.json"),
      JSON.stringify(journal, null, 2),
    );

    const markdown = await generateHealthDashboard(projectRoot);

    expect(markdown).toContain("# Prism Health Report");
    expect(markdown).toContain("## Health Score:");
    expect(markdown).toContain("85/100");
    expect(markdown).toContain("## Last 1 Sessions");
    expect(markdown).toContain("| Date |");
    expect(markdown).toContain("2026-03-15");
    expect(markdown).toContain("## Dimension Trends");
    expect(markdown).toContain("guided start");
  });

  // -------------------------------------------------------------------------
  // 2. Empty state
  // -------------------------------------------------------------------------

  it("shows 'No sessions recorded yet' and 'Insufficient data' when empty", async () => {
    const markdown = await generateHealthDashboard(projectRoot);

    expect(markdown).toContain("No sessions recorded yet");
    expect(markdown).toContain("Insufficient data");
  });

  // -------------------------------------------------------------------------
  // 3. Pass/fail threshold
  // -------------------------------------------------------------------------

  it("shows pass for scores >= 5 and FAIL for scores < 5", async () => {
    await writeFile(
      join(reportsDir, "s1.json"),
      JSON.stringify(
        makeReportCard(
          "s1",
          {
            guided_start: 5,
            research_proof: 4,
            stress_verification: 10,
            evidence_quality: 0,
          },
          null,
          "2026-03-15T12:00:00Z",
        ),
      ),
    );

    const markdown = await generateHealthDashboard(projectRoot);

    // Extract the table row
    const lines = markdown.split("\n");
    const dataRow = lines.find((l) => l.includes("2026-03-15"))!;
    expect(dataRow).toBeTruthy();

    // guided_start=5 -> pass, research_proof=4 -> FAIL,
    // stress_verification=10 -> pass, evidence_quality=0 -> FAIL
    expect(dataRow).toContain("pass");
    expect(dataRow).toContain("FAIL");

    // Count occurrences
    const passCount = (dataRow.match(/pass/g) || []).length;
    const failCount = (dataRow.match(/FAIL/g) || []).length;
    expect(passCount).toBe(2);
    expect(failCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 4. Sparkline rendering
  // -------------------------------------------------------------------------

  it("renders correct block characters for score values", async () => {
    // Write report cards and journal with known scores
    const journal: LearningJournal = {
      schemaVersion: 1,
      lastUpdated: new Date().toISOString(),
      totalSessions: 5,
      patterns: [
        {
          dimension: "guided_start",
          trend: "improving",
          avgScore: 5,
          occurrences: 0,
          recurring: false,
          firstRecurringAt: null,
          detail: "test",
          recentScores: [0, 5, 10, null],
        },
      ],
      overallTrend: "stable",
      overallAvgScore: 5,
    };
    await writeFile(
      join(dogfoodDir, "learning-journal.json"),
      JSON.stringify(journal, null, 2),
    );

    const markdown = await generateHealthDashboard(projectRoot);

    // score=0 -> block index 0 = space
    // score=5 -> block index round((5/10)*8) = 4 -> lower half block
    // score=10 -> block index 8 -> full block
    // null -> middle dot
    const trendLine = markdown
      .split("\n")
      .find((l) => l.includes("guided start"))!;
    expect(trendLine).toBeTruthy();
    // The sparkline should contain the middle dot for null
    expect(trendLine).toContain("\u00B7");
    // Full block for score 10
    expect(trendLine).toContain("\u2588");
  });
});
