/**
 * learning-journal.test.ts — Tests for Learning Journal aggregation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId, SessionReportCard } from "@prism/core";
import { updateLearningJournal } from "./learning-journal";

describe("updateLearningJournal", () => {
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
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeReportCard(
    sessionId: string,
    scores: {
      guided_start?: number | null;
      research_proof?: number | null;
      stress_verification?: number | null;
      evidence_quality?: number | null;
    },
    projectId: string = "proj-1",
    timestamp?: string,
  ): SessionReportCard {
    return {
      schemaVersion: 1,
      sessionId,
      projectId: projectId as EntityId,
      timestamp: timestamp ?? new Date().toISOString(),
      dimensions: {
        guided_start: {
          score: scores.guided_start ?? null,
          source: "auto",
          evidence: null,
        },
        research_proof: {
          score: scores.research_proof ?? null,
          source: "auto",
          evidence: null,
        },
        stress_verification: {
          score: scores.stress_verification ?? null,
          source: "auto",
          evidence: null,
        },
        evidence_quality: {
          score: scores.evidence_quality ?? null,
          source: "auto",
          evidence: null,
        },
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
      },
      overallScore: null,
      summary: "test",
      replaySessionId: sessionId,
      crashRecovery: false,
      capabilitiesAvailable: [],
    };
  }

  async function writeReportCard(card: SessionReportCard): Promise<void> {
    await writeFile(
      join(reportsDir, `${card.sessionId}.json`),
      JSON.stringify(card, null, 2),
    );
  }

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------

  it("creates journal from report cards", async () => {
    await writeReportCard(
      makeReportCard("s1", {
        guided_start: 10,
        research_proof: 5,
        stress_verification: 8,
        evidence_quality: 7,
      }),
    );
    await writeReportCard(
      makeReportCard("s2", {
        guided_start: 8,
        research_proof: 6,
        stress_verification: 9,
        evidence_quality: 8,
      }),
    );

    const { journal } = await updateLearningJournal(projectRoot);

    expect(journal.schemaVersion).toBe(1);
    expect(journal.totalSessions).toBe(2);
    expect(journal.patterns).toHaveLength(4);
    expect(journal.patterns.map((p) => p.dimension)).toEqual([
      "guided_start",
      "research_proof",
      "stress_verification",
      "evidence_quality",
    ]);
    expect(journal.overallAvgScore).toBeGreaterThan(0);

    // Verify it was written to disk
    const journalPath = join(dogfoodDir, "learning-journal.json");
    const onDisk = JSON.parse(await readFile(journalPath, "utf-8"));
    expect(onDisk.totalSessions).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 2. Empty state
  // -------------------------------------------------------------------------

  it("produces empty patterns when no report cards exist", async () => {
    const { journal } = await updateLearningJournal(projectRoot);

    expect(journal.totalSessions).toBe(0);
    expect(journal.patterns).toHaveLength(4);
    for (const p of journal.patterns) {
      expect(p.avgScore).toBe(0);
      expect(p.occurrences).toBe(0);
      expect(p.recurring).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // 3. Recurring detection: pattern becomes recurring after 3+ low scores
  // -------------------------------------------------------------------------

  it("marks pattern as recurring after 3+ low scores (<=5)", async () => {
    for (let i = 0; i < 3; i++) {
      await writeReportCard(
        makeReportCard(`s${i}`, {
          guided_start: 3,
          research_proof: 9,
          stress_verification: 9,
          evidence_quality: 9,
        }),
      );
    }

    const { journal } = await updateLearningJournal(projectRoot);

    const guidedStart = journal.patterns.find(
      (p) => p.dimension === "guided_start",
    )!;
    expect(guidedStart.recurring).toBe(true);
    expect(guidedStart.occurrences).toBe(3);

    const research = journal.patterns.find(
      (p) => p.dimension === "research_proof",
    )!;
    expect(research.recurring).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. Newly recurring detection: tracks false->true transitions
  // -------------------------------------------------------------------------

  it("detects newly recurring dimensions", async () => {
    // First run: 2 low scores (not yet recurring)
    for (let i = 0; i < 2; i++) {
      await writeReportCard(
        makeReportCard(`s${i}`, { guided_start: 3 }),
      );
    }
    const { journal: journal1, newlyRecurring: nr1 } =
      await updateLearningJournal(projectRoot);
    expect(nr1).toEqual([]);
    expect(
      journal1.patterns.find((p) => p.dimension === "guided_start")!.recurring,
    ).toBe(false);

    // Add a third low score
    await writeReportCard(makeReportCard("s2", { guided_start: 4 }));
    const { newlyRecurring: nr2 } = await updateLearningJournal(projectRoot);
    expect(nr2).toContain("guided_start");
  });

  // -------------------------------------------------------------------------
  // 5. recentScores: window of last 5 scores maintained
  // -------------------------------------------------------------------------

  it("maintains window of last 5 scores in recentScores", async () => {
    for (let i = 0; i < 7; i++) {
      await writeReportCard(
        makeReportCard(`s${i}`, { guided_start: i + 1 }, "proj-1", `2026-01-0${i + 1}T00:00:00Z`),
      );
    }

    const { journal } = await updateLearningJournal(projectRoot);

    const guidedStart = journal.patterns.find(
      (p) => p.dimension === "guided_start",
    )!;
    // Last 5 scores: 3, 4, 5, 6, 7
    expect(guidedStart.recentScores).toHaveLength(5);
    expect(guidedStart.recentScores).toEqual([3, 4, 5, 6, 7]);
  });

  // -------------------------------------------------------------------------
  // 6. Trend computation
  // -------------------------------------------------------------------------

  it("computes improving trend when later scores are higher", async () => {
    const scores = [2, 2, 8, 9, 10];
    for (let i = 0; i < scores.length; i++) {
      await writeReportCard(
        makeReportCard(
          `s${i}`,
          { guided_start: scores[i] },
          "proj-1",
          `2026-01-0${i + 1}T00:00:00Z`,
        ),
      );
    }

    const { journal } = await updateLearningJournal(projectRoot);
    const guidedStart = journal.patterns.find(
      (p) => p.dimension === "guided_start",
    )!;
    expect(guidedStart.trend).toBe("improving");
  });

  it("computes degrading trend when later scores are lower", async () => {
    const scores = [9, 10, 2, 1, 1];
    for (let i = 0; i < scores.length; i++) {
      await writeReportCard(
        makeReportCard(
          `s${i}`,
          { guided_start: scores[i] },
          "proj-1",
          `2026-01-0${i + 1}T00:00:00Z`,
        ),
      );
    }

    const { journal } = await updateLearningJournal(projectRoot);
    const guidedStart = journal.patterns.find(
      (p) => p.dimension === "guided_start",
    )!;
    expect(guidedStart.trend).toBe("degrading");
  });

  it("computes stable trend when scores are consistent", async () => {
    const scores = [5, 5, 5, 5, 5];
    for (let i = 0; i < scores.length; i++) {
      await writeReportCard(
        makeReportCard(
          `s${i}`,
          { guided_start: scores[i] },
          "proj-1",
          `2026-01-0${i + 1}T00:00:00Z`,
        ),
      );
    }

    const { journal } = await updateLearningJournal(projectRoot);
    const guidedStart = journal.patterns.find(
      (p) => p.dimension === "guided_start",
    )!;
    expect(guidedStart.trend).toBe("stable");
  });

  // -------------------------------------------------------------------------
  // 7. Performance warning
  // -------------------------------------------------------------------------

  it("logs console.warn when > 100 report cards", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create 101 report card files
    for (let i = 0; i < 101; i++) {
      await writeReportCard(
        makeReportCard(
          `s${String(i).padStart(4, "0")}`,
          { guided_start: 5 },
          "proj-1",
          `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
        ),
      );
    }

    await updateLearningJournal(projectRoot);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("full scan over 101 report cards"),
    );

    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 8. Corrupt JSON guard (13A)
  // -------------------------------------------------------------------------

  it("skips corrupt report card files", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Write a valid card
    await writeReportCard(
      makeReportCard("s-valid", { guided_start: 10 }),
    );

    // Write a corrupt card
    await writeFile(
      join(reportsDir, "s-corrupt.json"),
      "NOT VALID JSON{{{",
    );

    const { journal } = await updateLearningJournal(projectRoot);

    expect(journal.totalSessions).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("skipping corrupt report card"),
    );

    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 9. projectId filtering
  // -------------------------------------------------------------------------

  it("only includes matching project's cards when projectId specified", async () => {
    await writeReportCard(
      makeReportCard("s-proj1", { guided_start: 10 }, "proj-1"),
    );
    await writeReportCard(
      makeReportCard("s-proj2", { guided_start: 3 }, "proj-2"),
    );

    const { journal } = await updateLearningJournal(
      projectRoot,
      "proj-1" as EntityId,
    );

    expect(journal.totalSessions).toBe(1);
  });
});
