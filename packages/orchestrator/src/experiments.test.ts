/**
 * experiments.test.ts — Tests for the autoresearch experiment system.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AbsolutePath,
  Experiment,
  ExperimentRegistry,
  LearningJournal,
  SessionReportCard,
} from "@prism/core";
import {
  readRegistry,
  writeRegistry,
  createExperiment,
  readExperiment,
  writeExperiment,
  recordMetric,
  decideExperiment,
  promoteExperiment,
  discardExperiment,
  assignVariant,
  writeVariantFile,
  cleanupVariantFile,
  proposeExperiments,
  evaluateExperiments,
} from "./experiments";

describe("experiments", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;
  let experimentsDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-exp-test-"));
    projectRoot = tmpDir as AbsolutePath;
    experimentsDir = join(tmpDir, ".prism", "experiments");
    await mkdir(experimentsDir, { recursive: true });
    await mkdir(join(experimentsDir, "prompt"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeReportCard(
    sessionId: string,
    overrides: Partial<SessionReportCard> = {},
    dimensionOverrides: Record<string, number | null> = {},
  ): SessionReportCard {
    return {
      schemaVersion: 1,
      sessionId,
      projectId: "test-project",
      timestamp: new Date().toISOString(),
      dimensions: {
        guided_start: { score: dimensionOverrides.guided_start ?? 5, source: "auto", evidence: "test" },
        research_proof: { score: dimensionOverrides.research_proof ?? 5, source: "auto", evidence: "test" },
        stress_verification: { score: dimensionOverrides.stress_verification ?? 5, source: "auto", evidence: "test" },
        evidence_quality: { score: dimensionOverrides.evidence_quality ?? 5, source: "auto", evidence: "test" },
        post_handoff_bugs: { score: null, source: "manual_on_resume", evidence: null },
        user_corrections: { score: null, source: "manual_on_resume", evidence: null },
      },
      overallScore: 50,
      summary: "Test report card",
      replaySessionId: sessionId,
      crashRecovery: false,
      capabilitiesAvailable: [],
      ...overrides,
    };
  }

  function makeJournal(
    patterns: Array<{ dimension: string; trend: string; recurring: boolean }>,
  ): LearningJournal {
    return {
      schemaVersion: 1,
      lastUpdated: new Date().toISOString(),
      totalSessions: 10,
      patterns: patterns.map(p => ({
        dimension: p.dimension,
        trend: p.trend as "improving" | "stable" | "degrading",
        avgScore: 4,
        occurrences: 5,
        recurring: p.recurring,
        firstRecurringAt: new Date().toISOString(),
        detail: "test",
        recentScores: [3, 4, 5, 3, 4],
      })),
      overallTrend: "stable",
      overallAvgScore: 4,
    };
  }

  // ─── Registry ────────────────────────────────────────────────────────────

  describe("registry", () => {
    it("returns empty registry when no file exists", async () => {
      const registry = await readRegistry(projectRoot);
      expect(registry.schemaVersion).toBe(1);
      expect(registry.globalEnabled).toBe(true);
      expect(registry.experiments.prompt).toEqual([]);
    });

    it("reads existing registry from disk", async () => {
      const reg: ExperimentRegistry = {
        schemaVersion: 1,
        globalEnabled: true,
        maxConcurrentPerLevel: 1,
        levelsEnabled: { prompt: true },
        experiments: { prompt: ["exp-1"] },
      };
      await writeFile(join(experimentsDir, "registry.json"), JSON.stringify(reg));

      const result = await readRegistry(projectRoot);
      expect(result.experiments.prompt).toEqual(["exp-1"]);
    });

    it("handles corrupt registry by resetting", async () => {
      await writeFile(join(experimentsDir, "registry.json"), "NOT JSON{{{");

      const result = await readRegistry(projectRoot);
      expect(result.schemaVersion).toBe(1);
      expect(result.experiments.prompt).toEqual([]);

      // Verify corrupt file was renamed
      const files = await readdir(experimentsDir);
      expect(files.some(f => f.includes(".corrupt."))).toBe(true);
    });

    it("writes registry atomically", async () => {
      const reg: ExperimentRegistry = {
        schemaVersion: 1,
        globalEnabled: true,
        maxConcurrentPerLevel: 2,
        levelsEnabled: { prompt: true },
        experiments: { prompt: ["exp-a", "exp-b"] },
      };
      await writeRegistry(projectRoot, reg);

      const onDisk = JSON.parse(await readFile(join(experimentsDir, "registry.json"), "utf-8"));
      expect(onDisk.maxConcurrentPerLevel).toBe(2);
      expect(onDisk.experiments.prompt).toEqual(["exp-a", "exp-b"]);
    });
  });

  // ─── Create Experiment ───────────────────────────────────────────────────

  describe("createExperiment", () => {
    it("creates experiment for known dimension", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "current prompt",
      });

      expect(exp).not.toBeNull();
      expect(exp!.level).toBe("prompt");
      expect(exp!.status).toBe("active");
      expect(exp!.dimension).toBe("guided_start");
      expect(exp!.testVariant.label).toBe("stricter-intake-validation");
      expect(exp!.metrics).toEqual([]);
      expect(exp!.decision).toBeNull();
    });

    it("returns null for unknown dimension", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "nonexistent_dimension",
        baselineContent: "test",
      });
      expect(exp).toBeNull();
    });

    it("returns null when experiments are globally disabled", async () => {
      await writeRegistry(projectRoot, {
        schemaVersion: 1,
        globalEnabled: false,
        maxConcurrentPerLevel: 1,
        levelsEnabled: { prompt: true },
        experiments: { prompt: [] },
      });

      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });
      expect(exp).toBeNull();
    });

    it("deduplicates: does not create second experiment for same dimension", async () => {
      const exp1 = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });
      expect(exp1).not.toBeNull();

      const exp2 = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });
      expect(exp2).toBeNull();
    });

    it("respects maxConcurrentPerLevel", async () => {
      await writeRegistry(projectRoot, {
        schemaVersion: 1,
        globalEnabled: true,
        maxConcurrentPerLevel: 1,
        levelsEnabled: { prompt: true },
        experiments: { prompt: [] },
      });

      const exp1 = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });
      expect(exp1).not.toBeNull();

      const exp2 = await createExperiment({
        projectRoot,
        dimension: "research_proof",
        baselineContent: "test",
      });
      expect(exp2).toBeNull();
    });

    it("writes experiment file to disk", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      const files = await readdir(join(experimentsDir, "prompt"));
      const jsonFiles = files.filter(f => f.endsWith(".json"));
      expect(jsonFiles).toHaveLength(1);

      const onDisk = JSON.parse(
        await readFile(join(experimentsDir, "prompt", jsonFiles[0]!), "utf-8"),
      ) as Experiment;
      expect(onDisk.id).toBe(exp!.id);
      expect(onDisk.dimension).toBe("guided_start");
    });

    it("updates registry with new experiment ID", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      const registry = await readRegistry(projectRoot);
      expect(registry.experiments.prompt).toContain(exp!.id);
    });
  });

  // ─── Variant Assignment ──────────────────────────────────────────────────

  describe("assignVariant", () => {
    it("returns deterministic assignment for same session ID", () => {
      const v1 = assignVariant("session-123");
      const v2 = assignVariant("session-123");
      expect(v1).toBe(v2);
    });

    it("returns different assignments for different session IDs", () => {
      // Generate enough sessions to get both variants
      const variants = new Set<string>();
      for (let i = 0; i < 20; i++) {
        variants.add(assignVariant(`session-${i}`));
      }
      expect(variants.size).toBe(2);
    });

    it("returns either baseline or test", () => {
      const v = assignVariant("any-session");
      expect(["baseline", "test"]).toContain(v);
    });
  });

  // ─── Record Metric ──────────────────────────────────────────────────────

  describe("recordMetric", () => {
    it("records dimension-specific score from report card", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      const card = makeReportCard("session-1", {}, { guided_start: 8 });
      const recorded = await recordMetric(projectRoot, exp!.id, card);
      expect(recorded).toBe(true);

      const updated = await readExperiment(projectRoot, "prompt", exp!.id);
      expect(updated!.metrics).toHaveLength(1);
      expect(updated!.metrics[0]!.value).toBe(8);
      expect(updated!.metrics[0]!.dimension).toBe("guided_start");
      expect(updated!.sessionsRun).toBe(1);
    });

    it("returns false for null dimension score", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      const card = makeReportCard("session-1", {}, { guided_start: null as unknown as number });
      // Override the dimension to have null score
      card.dimensions.guided_start = { score: null, source: "auto", evidence: "not available" };

      const recorded = await recordMetric(projectRoot, exp!.id, card);
      expect(recorded).toBe(false);
    });

    it("returns false for non-existent experiment", async () => {
      const card = makeReportCard("session-1");
      const recorded = await recordMetric(projectRoot, "nonexistent", card);
      expect(recorded).toBe(false);
    });

    it("assigns correct variant based on session ID parity", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      // Record multiple sessions
      for (let i = 0; i < 6; i++) {
        const card = makeReportCard(`session-${i}`, {}, { guided_start: 7 });
        await recordMetric(projectRoot, exp!.id, card);
      }

      const updated = await readExperiment(projectRoot, "prompt", exp!.id);
      const variants = new Set(updated!.metrics.map(m => m.variant));
      expect(variants.size).toBe(2); // Both baseline and test should appear
    });
  });

  // ─── Decide Experiment ───────────────────────────────────────────────────

  describe("decideExperiment", () => {
    it("returns null when not enough sessions", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      // Record only 2 sessions (need 5)
      for (let i = 0; i < 2; i++) {
        const card = makeReportCard(`session-${i}`, {}, { guided_start: 8 });
        await recordMetric(projectRoot, exp!.id, card);
      }

      const decision = await decideExperiment(projectRoot, exp!.id);
      expect(decision).toBeNull();
    });

    it("decides test winner when variant beats baseline by >10%", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      // Manually inject metrics to control the experiment
      const experiment = await readExperiment(projectRoot, "prompt", exp!.id);
      experiment!.sessionsRun = 10;
      experiment!.metrics = [
        // Baseline: avg 5
        { dimension: "guided_start", value: 5, sessionId: "s1", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s2", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s3", variant: "baseline", timestamp: new Date().toISOString() },
        // Test: avg 8 (60% improvement)
        { dimension: "guided_start", value: 8, sessionId: "s4", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 8, sessionId: "s5", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 8, sessionId: "s6", variant: "test", timestamp: new Date().toISOString() },
      ];
      await writeExperiment(projectRoot, experiment!);

      const decision = await decideExperiment(projectRoot, exp!.id);
      expect(decision).not.toBeNull();
      expect(decision!.winner).toBe("test");
      expect(decision!.improvement).toBeGreaterThan(0.1);
    });

    it("decides baseline winner when variant is worse by >10%", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      const experiment = await readExperiment(projectRoot, "prompt", exp!.id);
      experiment!.sessionsRun = 10;
      experiment!.metrics = [
        // Baseline: avg 8
        { dimension: "guided_start", value: 8, sessionId: "s1", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 8, sessionId: "s2", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 8, sessionId: "s3", variant: "baseline", timestamp: new Date().toISOString() },
        // Test: avg 5 (worse)
        { dimension: "guided_start", value: 5, sessionId: "s4", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s5", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s6", variant: "test", timestamp: new Date().toISOString() },
      ];
      await writeExperiment(projectRoot, experiment!);

      const decision = await decideExperiment(projectRoot, exp!.id);
      expect(decision!.winner).toBe("baseline");
    });

    it("decides inconclusive when improvement < 10%", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      const experiment = await readExperiment(projectRoot, "prompt", exp!.id);
      experiment!.sessionsRun = 10;
      experiment!.metrics = [
        // Baseline: avg 7
        { dimension: "guided_start", value: 7, sessionId: "s1", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 7, sessionId: "s2", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 7, sessionId: "s3", variant: "baseline", timestamp: new Date().toISOString() },
        // Test: avg 7.5 (~7% improvement, below threshold)
        { dimension: "guided_start", value: 7, sessionId: "s4", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 8, sessionId: "s5", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 7, sessionId: "s6", variant: "test", timestamp: new Date().toISOString() },
      ];
      await writeExperiment(projectRoot, experiment!);

      const decision = await decideExperiment(projectRoot, exp!.id);
      expect(decision!.winner).toBe("inconclusive");
    });

    it("decides inconclusive when not enough datapoints per variant", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      const experiment = await readExperiment(projectRoot, "prompt", exp!.id);
      experiment!.sessionsRun = 10;
      experiment!.metrics = [
        // Only 2 baseline (need 3)
        { dimension: "guided_start", value: 5, sessionId: "s1", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s2", variant: "baseline", timestamp: new Date().toISOString() },
        // 3 test
        { dimension: "guided_start", value: 9, sessionId: "s3", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s4", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s5", variant: "test", timestamp: new Date().toISOString() },
      ];
      await writeExperiment(projectRoot, experiment!);

      const decision = await decideExperiment(projectRoot, exp!.id);
      expect(decision!.winner).toBe("inconclusive");
      expect(decision!.confidence).toBe("low");
    });

    it("sets experiment status to decided", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      const experiment = await readExperiment(projectRoot, "prompt", exp!.id);
      experiment!.sessionsRun = 10;
      experiment!.metrics = [
        { dimension: "guided_start", value: 5, sessionId: "s1", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s2", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s3", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s4", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s5", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s6", variant: "test", timestamp: new Date().toISOString() },
      ];
      await writeExperiment(projectRoot, experiment!);

      await decideExperiment(projectRoot, exp!.id);
      const updated = await readExperiment(projectRoot, "prompt", exp!.id);
      expect(updated!.status).toBe("decided");
    });
  });

  // ─── Promote / Discard ───────────────────────────────────────────────────

  describe("promote and discard", () => {
    async function createDecidedExperiment() {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });
      const experiment = await readExperiment(projectRoot, "prompt", exp!.id);
      experiment!.status = "decided";
      experiment!.decision = {
        winner: "test",
        baselineAvg: 5,
        testAvg: 8,
        improvement: 0.6,
        confidence: "high",
        decidedAt: new Date().toISOString(),
      };
      await writeExperiment(projectRoot, experiment!);
      return exp!.id;
    }

    it("promotes decided experiment", async () => {
      const id = await createDecidedExperiment();
      const result = await promoteExperiment(projectRoot, id);
      expect(result).toBe(true);

      const updated = await readExperiment(projectRoot, "prompt", id);
      expect(updated!.status).toBe("promoted");
    });

    it("discards decided experiment", async () => {
      const id = await createDecidedExperiment();
      const result = await discardExperiment(projectRoot, id);
      expect(result).toBe(true);

      const updated = await readExperiment(projectRoot, "prompt", id);
      expect(updated!.status).toBe("discarded");
    });

    it("returns false when promoting non-decided experiment", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });
      const result = await promoteExperiment(projectRoot, exp!.id);
      expect(result).toBe(false);
    });
  });

  // ─── Variant File ────────────────────────────────────────────────────────

  describe("variant file", () => {
    it("writes active variant file for active experiment", async () => {
      await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "baseline content",
      });

      const variant = await writeVariantFile(projectRoot, "session-1");
      expect(variant).not.toBeNull();
      expect(["baseline", "test"]).toContain(variant);

      const content = await readFile(
        join(experimentsDir, "active-variant.md"),
        "utf-8",
      );
      expect(content).toContain("Experiment:");
      expect(content).toContain("guided_start");
    });

    it("returns null and cleans up when no active experiments", async () => {
      // Write a stale variant file
      await writeFile(join(experimentsDir, "active-variant.md"), "stale");

      const variant = await writeVariantFile(projectRoot, "session-1");
      expect(variant).toBeNull();

      // File should be cleaned up
      const files = await readdir(experimentsDir);
      expect(files.includes("active-variant.md")).toBe(false);
    });

    it("cleanupVariantFile removes the file", async () => {
      await mkdir(experimentsDir, { recursive: true });
      await writeFile(join(experimentsDir, "active-variant.md"), "test");

      await cleanupVariantFile(projectRoot);

      const files = await readdir(experimentsDir);
      expect(files.includes("active-variant.md")).toBe(false);
    });

    it("cleanupVariantFile is silent when file does not exist", async () => {
      // Should not throw
      await cleanupVariantFile(projectRoot);
    });
  });

  // ─── Propose Experiments ─────────────────────────────────────────────────

  describe("proposeExperiments", () => {
    it("proposes experiment for degrading recurring dimension", async () => {
      const journal = makeJournal([
        { dimension: "guided_start", trend: "degrading", recurring: true },
      ]);

      const proposed = await proposeExperiments(projectRoot, journal);
      expect(proposed).toHaveLength(1);

      const registry = await readRegistry(projectRoot);
      expect(registry.experiments.prompt).toHaveLength(1);
    });

    it("does not propose for non-degrading dimensions", async () => {
      const journal = makeJournal([
        { dimension: "guided_start", trend: "stable", recurring: true },
        { dimension: "research_proof", trend: "improving", recurring: true },
      ]);

      const proposed = await proposeExperiments(projectRoot, journal);
      expect(proposed).toHaveLength(0);
    });

    it("does not propose for non-recurring dimensions", async () => {
      const journal = makeJournal([
        { dimension: "guided_start", trend: "degrading", recurring: false },
      ]);

      const proposed = await proposeExperiments(projectRoot, journal);
      expect(proposed).toHaveLength(0);
    });
  });

  // ─── Evaluate Experiments (integration) ──────────────────────────────────

  describe("evaluateExperiments", () => {
    it("records metrics and decides when ready", async () => {
      const exp = await createExperiment({
        projectRoot,
        dimension: "guided_start",
        baselineContent: "test",
      });

      // Manually set up experiment to be at threshold
      const experiment = await readExperiment(projectRoot, "prompt", exp!.id);
      experiment!.sessionsRun = 9; // One more will trigger decide
      experiment!.metrics = [
        { dimension: "guided_start", value: 5, sessionId: "s1", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s2", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s3", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s4", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 5, sessionId: "s5", variant: "baseline", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s6", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s7", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s8", variant: "test", timestamp: new Date().toISOString() },
        { dimension: "guided_start", value: 9, sessionId: "s9", variant: "test", timestamp: new Date().toISOString() },
      ];
      await writeExperiment(projectRoot, experiment!);

      // This 10th session triggers decision
      const card = makeReportCard("session-10", {}, { guided_start: 9 });
      const result = await evaluateExperiments(projectRoot, card);

      expect(result.metricsRecorded).toContain(exp!.id);
    });
  });
});
