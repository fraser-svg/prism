/**
 * report-card-generator.test.ts — Tests for SessionReportCard generation and crash recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId, SessionReportCard } from "@prism/core";
import { generateReportCard, recoverPendingReports } from "./report-card-generator";
import type { ReportCardInput } from "./report-card-generator";
import { writeFile } from "node:fs/promises";

describe("generateReportCard", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-"));
    projectRoot = tmpDir as AbsolutePath;
    await mkdir(join(tmpDir, ".prism", "dogfood", "reports"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------

  it("generates report card with all auto dimensions scored", async () => {
    const input: ReportCardInput = {
      projectRoot,
      projectId: "proj-1" as EntityId,
      sessionId: "sess-happy",
      events: [
        {
          eventType: "artifact:created",
          metadata: {
            entityType: "intake_brief",
            unresolvedQuestionCount: 0,
          },
        },
        {
          eventType: "artifact:created",
          metadata: {
            entityType: "solution_thesis",
            alternativeCount: 3,
            hasRecommendationReason: true,
          },
        },
        {
          eventType: "artifact:created",
          metadata: {
            entityType: "verification_result",
            hasStressScenario: true,
            hasEdgeScenario: true,
            scenarioCount: 4,
          },
        },
        {
          eventType: "artifact:created",
          metadata: {
            entityType: "review",
            totalFindings: 5,
            highConfidenceCount: 5,
            hasUnsupportedAbsence: false,
          },
        },
      ],
      availableCapabilities: [
        "intake_brief",
        "solution_thesis",
        "verification_scenario",
        "review_finding",
      ],
    };

    const card = await generateReportCard(input);

    expect(card.schemaVersion).toBe(1);
    expect(card.sessionId).toBe("sess-happy");
    expect(card.projectId).toBe("proj-1");
    expect(card.crashRecovery).toBe(false);
    expect(card.dimensions.guided_start.score).toBe(10);
    expect(card.dimensions.research_proof.score).toBe(10);
    expect(card.dimensions.stress_verification.score).toBe(10);
    expect(card.dimensions.evidence_quality.score).toBe(10);
    expect(card.dimensions.guided_start.source).toBe("auto");
    expect(card.dimensions.post_handoff_bugs.score).toBeNull();
    expect(card.dimensions.user_corrections.score).toBeNull();
    expect(card.overallScore).not.toBeNull();
    expect(card.timestamp).toBeTruthy();

    // Verify file written to disk
    const reportPath = join(
      tmpDir,
      ".prism",
      "dogfood",
      "reports",
      "sess-happy.json",
    );
    await access(reportPath);
    const onDisk = JSON.parse(await readFile(reportPath, "utf-8"));
    expect(onDisk.sessionId).toBe("sess-happy");
  });

  // -------------------------------------------------------------------------
  // 2. Capability check (3A): dimensions score null when prerequisite missing
  // -------------------------------------------------------------------------

  it("scores dimensions null when prerequisite entity type is unavailable", async () => {
    const input: ReportCardInput = {
      projectRoot,
      projectId: "proj-1" as EntityId,
      sessionId: "sess-cap",
      events: [],
      availableCapabilities: [], // No capabilities wired
    };

    const card = await generateReportCard(input);

    expect(card.dimensions.guided_start.score).toBeNull();
    expect(card.dimensions.guided_start.evidence).toContain(
      'Prerequisite "intake_brief" not yet available',
    );
    expect(card.dimensions.research_proof.score).toBeNull();
    expect(card.dimensions.stress_verification.score).toBeNull();
    expect(card.dimensions.evidence_quality.score).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. Overall score computation
  // -------------------------------------------------------------------------

  it("computes overallScore as average of non-null dimensions * 10", async () => {
    const input: ReportCardInput = {
      projectRoot,
      projectId: "proj-1" as EntityId,
      sessionId: "sess-avg",
      events: [
        {
          eventType: "artifact:created",
          metadata: {
            entityType: "intake_brief",
            unresolvedQuestionCount: 0,
          },
        },
        {
          eventType: "artifact:created",
          metadata: {
            entityType: "solution_thesis",
            alternativeCount: 1,
            hasRecommendationReason: false,
          },
        },
      ],
      availableCapabilities: [
        "intake_brief",
        "solution_thesis",
        "verification_scenario",
        "review_finding",
      ],
    };

    const card = await generateReportCard(input);

    // guided_start=10, research_proof=5, stress_verification=0, evidence_quality=5
    // Average = (10 + 5 + 0 + 5) / 4 = 5
    // overallScore = round(5 * 10) = 50
    expect(card.dimensions.guided_start.score).toBe(10);
    expect(card.dimensions.research_proof.score).toBe(5);
    expect(card.dimensions.stress_verification.score).toBe(0);
    expect(card.dimensions.evidence_quality.score).toBe(5);
    expect(card.overallScore).toBe(50);
  });

  // -------------------------------------------------------------------------
  // 4. All-null edge case
  // -------------------------------------------------------------------------

  it("returns overallScore null when all dimensions are null", async () => {
    const input: ReportCardInput = {
      projectRoot,
      projectId: "proj-1" as EntityId,
      sessionId: "sess-allnull",
      events: [],
      availableCapabilities: [],
    };

    const card = await generateReportCard(input);

    expect(card.overallScore).toBeNull();
    expect(card.summary).toContain("Insufficient data");
  });

  // -------------------------------------------------------------------------
  // 5. Crash recovery
  // -------------------------------------------------------------------------

  it("sets crashRecovery flag and source to crash_recovery", async () => {
    const input: ReportCardInput = {
      projectRoot,
      projectId: "proj-1" as EntityId,
      sessionId: "sess-crash",
      events: [
        {
          eventType: "artifact:created",
          metadata: {
            entityType: "intake_brief",
            unresolvedQuestionCount: 2,
          },
        },
      ],
      availableCapabilities: ["intake_brief"],
      crashRecovery: true,
    };

    const card = await generateReportCard(input);

    expect(card.crashRecovery).toBe(true);
    expect(card.dimensions.guided_start.source).toBe("crash_recovery");
  });

  // -------------------------------------------------------------------------
  // 6. Pending marker
  // -------------------------------------------------------------------------

  it("writes pending marker before scoring and removes it after", async () => {
    const pendingPath = join(
      tmpDir,
      ".prism",
      "dogfood",
      "reports",
      "sess-pending.pending",
    );

    const input: ReportCardInput = {
      projectRoot,
      projectId: "proj-1" as EntityId,
      sessionId: "sess-pending",
      events: [],
      availableCapabilities: [],
    };

    await generateReportCard(input);

    // After completion, pending file should be removed
    let pendingExists = true;
    try {
      await access(pendingPath);
    } catch {
      pendingExists = false;
    }
    expect(pendingExists).toBe(false);

    // But the report card should exist
    const reportPath = join(
      tmpDir,
      ".prism",
      "dogfood",
      "reports",
      "sess-pending.json",
    );
    await access(reportPath); // throws if missing
  });

  // -------------------------------------------------------------------------
  // 7. Idempotent recovery
  // -------------------------------------------------------------------------

  it("recoverPendingReports skips sessions that already have completed reports", async () => {
    const reportsDir = join(tmpDir, ".prism", "dogfood", "reports");

    // Write a pending marker
    await writeFile(
      join(reportsDir, "sess-idem.pending"),
      JSON.stringify({ startedAt: new Date().toISOString() }),
    );

    // Write a completed report for the same session
    const completedCard: SessionReportCard = {
      schemaVersion: 1,
      sessionId: "sess-idem",
      projectId: "proj-1" as EntityId,
      timestamp: new Date().toISOString(),
      dimensions: {
        guided_start: { score: 10, source: "auto", evidence: null },
        research_proof: { score: 10, source: "auto", evidence: null },
        stress_verification: { score: 10, source: "auto", evidence: null },
        evidence_quality: { score: 10, source: "auto", evidence: null },
        post_handoff_bugs: { score: null, source: "manual_on_resume", evidence: null },
        user_corrections: { score: null, source: "manual_on_resume", evidence: null },
      },
      overallScore: 100,
      summary: "Perfect",
      replaySessionId: "sess-idem",
      crashRecovery: false,
      capabilitiesAvailable: [],
    };
    await writeFile(
      join(reportsDir, "sess-idem.json"),
      JSON.stringify(completedCard, null, 2),
    );

    const recovered = await recoverPendingReports(
      projectRoot,
      "proj-1" as EntityId,
      [],
      [],
    );

    // Should not re-generate since report already exists
    expect(recovered).toEqual([]);

    // Pending marker should have been cleaned up
    let pendingExists = true;
    try {
      await access(join(reportsDir, "sess-idem.pending"));
    } catch {
      pendingExists = false;
    }
    expect(pendingExists).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. Scoring formulas
  // -------------------------------------------------------------------------

  describe("scoring formulas", () => {
    const baseInput = (
      events: ReportCardInput["events"],
    ): ReportCardInput => ({
      projectRoot,
      projectId: "proj-1" as EntityId,
      sessionId: `sess-formula-${Date.now()}`,
      events,
      availableCapabilities: [
        "intake_brief",
        "solution_thesis",
        "verification_scenario",
        "review_finding",
      ],
    });

    // --- guided_start ---

    it("scoreGuidedStart: 10 when intake brief has 0 unresolved questions", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: { entityType: "intake_brief", unresolvedQuestionCount: 0 },
          },
        ]),
      );
      expect(card.dimensions.guided_start.score).toBe(10);
    });

    it("scoreGuidedStart: 5 when intake brief has unresolved questions", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: { entityType: "intake_brief", unresolvedQuestionCount: 3 },
          },
        ]),
      );
      expect(card.dimensions.guided_start.score).toBe(5);
    });

    it("scoreGuidedStart: 0 when no intake brief events", async () => {
      const card = await generateReportCard(baseInput([]));
      expect(card.dimensions.guided_start.score).toBe(0);
    });

    // --- research_proof ---

    it("scoreResearchProof: 10 when >= 2 alternatives and has reason", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: {
              entityType: "solution_thesis",
              alternativeCount: 2,
              hasRecommendationReason: true,
            },
          },
        ]),
      );
      expect(card.dimensions.research_proof.score).toBe(10);
    });

    it("scoreResearchProof: 5 when < 2 alternatives", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: {
              entityType: "solution_thesis",
              alternativeCount: 1,
              hasRecommendationReason: true,
            },
          },
        ]),
      );
      expect(card.dimensions.research_proof.score).toBe(5);
    });

    it("scoreResearchProof: 5 when missing recommendation reason", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: {
              entityType: "solution_thesis",
              alternativeCount: 3,
              hasRecommendationReason: false,
            },
          },
        ]),
      );
      expect(card.dimensions.research_proof.score).toBe(5);
    });

    it("scoreResearchProof: 0 when no solution thesis events", async () => {
      const card = await generateReportCard(baseInput([]));
      expect(card.dimensions.research_proof.score).toBe(0);
    });

    // --- stress_verification ---

    it("scoreStressVerification: 10 when stress + edge scenarios present", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: {
              entityType: "verification_result",
              hasStressScenario: true,
              hasEdgeScenario: true,
              scenarioCount: 5,
            },
          },
        ]),
      );
      expect(card.dimensions.stress_verification.score).toBe(10);
    });

    it("scoreStressVerification: 5 when only happy_path scenarios", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: {
              entityType: "verification_result",
              hasStressScenario: false,
              hasEdgeScenario: false,
              scenarioCount: 2,
            },
          },
        ]),
      );
      expect(card.dimensions.stress_verification.score).toBe(5);
    });

    it("scoreStressVerification: 0 when no verification events", async () => {
      const card = await generateReportCard(baseInput([]));
      expect(card.dimensions.stress_verification.score).toBe(0);
    });

    // --- evidence_quality ---

    it("scoreEvidenceQuality: 10 when all findings high confidence", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: {
              entityType: "review",
              totalFindings: 4,
              highConfidenceCount: 4,
              hasUnsupportedAbsence: false,
            },
          },
        ]),
      );
      expect(card.dimensions.evidence_quality.score).toBe(10);
    });

    it("scoreEvidenceQuality: proportional for mixed confidence", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: {
              entityType: "review",
              totalFindings: 4,
              highConfidenceCount: 2,
              hasUnsupportedAbsence: false,
            },
          },
        ]),
      );
      // round((10 * 2) / 4) = 5
      expect(card.dimensions.evidence_quality.score).toBe(5);
    });

    it("scoreEvidenceQuality: 0 when unsupported absence claims", async () => {
      const card = await generateReportCard(
        baseInput([
          {
            eventType: "artifact:created",
            metadata: {
              entityType: "review",
              totalFindings: 4,
              highConfidenceCount: 4,
              hasUnsupportedAbsence: true,
            },
          },
        ]),
      );
      expect(card.dimensions.evidence_quality.score).toBe(0);
    });

    it("scoreEvidenceQuality: 5 (neutral) when no review events", async () => {
      const card = await generateReportCard(baseInput([]));
      expect(card.dimensions.evidence_quality.score).toBe(5);
    });
  });
});
