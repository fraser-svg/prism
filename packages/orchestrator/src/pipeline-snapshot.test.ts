import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AbsolutePath,
  Checkpoint,
  EntityId,
  ISODateString,
  LearningJournal,
  Prescription,
  Spec,
} from "@prism/core";
import { extractPipelineSnapshot } from "./pipeline-snapshot";

let testDir: string;

function abs(p: string): AbsolutePath {
  return p as AbsolutePath;
}

const SPEC_ID = "spec-1" as EntityId;
const now = () => new Date().toISOString() as ISODateString;

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: "chk-1" as EntityId,
    projectId: "proj-test" as EntityId,
    runId: null,
    activeSpecId: SPEC_ID,
    phase: "execute",
    stageRoute: null,
    stageTotal: null,
    progressSummary: "building feature",
    keyDecisions: ["chose TypeScript"],
    preferences: [],
    blockers: [],
    nextRecommendedActions: ["continue building", "add tests"],
    lastVerificationSummary: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    id: SPEC_ID,
    title: "test spec",
    projectId: "proj-test" as EntityId,
    type: "product",
    status: "approved",
    summary: "test",
    scope: [],
    nonGoals: [],
    acceptanceCriteria: [{ id: "ac-1" as EntityId, description: "must work", status: "unverified" }],
    verificationPlan: { checks: [], notes: [] },
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function makeJournal(overrides: Partial<LearningJournal> = {}): LearningJournal {
  return {
    schemaVersion: 1,
    lastUpdated: now(),
    totalSessions: 3,
    patterns: [
      {
        dimension: "guided_start",
        trend: "improving",
        avgScore: 7.5,
        occurrences: 3,
        recurring: false,
        firstRecurringAt: null,
        detail: "Guided start improving steadily",
        recentScores: [6, 7, 8],
      },
      {
        dimension: "research_proof",
        trend: "degrading",
        avgScore: 4.0,
        occurrences: 3,
        recurring: true,
        firstRecurringAt: now(),
        detail: "Research proof consistently low",
        recentScores: [5, 4, 3],
      },
    ],
    overallTrend: "stable",
    overallAvgScore: 5.75,
    ...overrides,
  };
}

function makePrescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    schemaVersion: 1,
    id: "rx-1" as EntityId,
    dimension: "research_proof",
    prescription: "Require SolutionThesis with >= 2 alternatives",
    severity: "high",
    createdAt: now(),
    status: "active",
    resolvedAt: null,
    basedOnSessions: 3,
    patternDetail: "Research proof consistently low",
    ...overrides,
  };
}

beforeEach(async () => {
  testDir = join(tmpdir(), `pipeline-snapshot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("extractPipelineSnapshot", () => {
  it("returns cold start snapshot when no .prism/ exists", async () => {
    const snapshot = await extractPipelineSnapshot(abs(testDir));

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.currentPhase).toBe("understand");
    expect(snapshot.resumeSource).toBe("cold_start");
    expect(snapshot.stages).toHaveLength(7);
    // On cold start with no .prism/, the gate blocks understand→identify_problem
    // so the first stage is "blocked" (gate says .prism/ doesn't exist)
    expect(snapshot.stages[0]!.status).toBe("blocked");
    expect(snapshot.stages[1]!.status).toBe("upcoming");
  });

  it("derives stage statuses from checkpoint phase", async () => {
    // Set up checkpoint at "execute" phase
    const prismDir = join(testDir, ".prism");
    const checkpointsDir = join(prismDir, "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });
    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint()),
    );

    const snapshot = await extractPipelineSnapshot(abs(testDir));

    expect(snapshot.currentPhase).toBe("execute");
    expect(snapshot.resumeSource).toBe("checkpoint");

    // understand, identify_problem, spec, plan should be completed
    const completed = snapshot.stages.filter(s => s.status === "completed");
    expect(completed.length).toBe(4);
    expect(completed.map(s => s.id)).toEqual(["understand", "identify_problem", "spec", "plan"]);

    // execute should be current
    expect(snapshot.stages.find(s => s.id === "execute")!.status).toBe("current");

    // verify, release should be upcoming
    expect(snapshot.stages.find(s => s.id === "verify")!.status).toBe("upcoming");
    expect(snapshot.stages.find(s => s.id === "release")!.status).toBe("upcoming");
  });

  it("marks current stage as blocked when checkpoint has blockers", async () => {
    const prismDir = join(testDir, ".prism");
    const checkpointsDir = join(prismDir, "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });
    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint({ blockers: ["test failure", "missing dependency"] })),
    );

    const snapshot = await extractPipelineSnapshot(abs(testDir));

    const executeStage = snapshot.stages.find(s => s.id === "execute")!;
    expect(executeStage.status).toBe("blocked");
    expect(executeStage.blockers).toEqual(["test failure", "missing dependency"]);
  });

  it("populates recommendations from prescriptions", async () => {
    const prismDir = join(testDir, ".prism");
    const checkpointsDir = join(prismDir, "checkpoints");
    const prescriptionsDir = join(prismDir, "dogfood", "prescriptions");
    await mkdir(checkpointsDir, { recursive: true });
    await mkdir(prescriptionsDir, { recursive: true });

    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint()),
    );
    await writeFile(
      join(prescriptionsDir, "rx-1.json"),
      JSON.stringify(makePrescription()),
    );

    const snapshot = await extractPipelineSnapshot(abs(testDir));

    const prescriptionRecs = snapshot.recommendations.filter(r => r.source === "prescription");
    expect(prescriptionRecs.length).toBe(1);
    expect(prescriptionRecs[0]!.text).toContain("SolutionThesis");
    expect(prescriptionRecs[0]!.severity).toBe("high");
  });

  it("populates recommendations from checkpoint next actions", async () => {
    const prismDir = join(testDir, ".prism");
    const checkpointsDir = join(prismDir, "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });
    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint({ nextRecommendedActions: ["add tests", "run verification"] })),
    );

    const snapshot = await extractPipelineSnapshot(abs(testDir));

    const checkpointRecs = snapshot.recommendations.filter(r => r.source === "checkpoint");
    expect(checkpointRecs.length).toBe(2);
    expect(checkpointRecs.map(r => r.text)).toEqual(["add tests", "run verification"]);
  });

  it("populates weaknesses from learning journal", async () => {
    const prismDir = join(testDir, ".prism");
    const checkpointsDir = join(prismDir, "checkpoints");
    const dogfoodDir = join(prismDir, "dogfood");
    await mkdir(checkpointsDir, { recursive: true });
    await mkdir(dogfoodDir, { recursive: true });

    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint()),
    );
    await writeFile(
      join(dogfoodDir, "learning-journal.json"),
      JSON.stringify(makeJournal()),
    );

    const snapshot = await extractPipelineSnapshot(abs(testDir));

    expect(snapshot.weaknesses).toHaveLength(2);
    expect(snapshot.weaknesses[0]!.dimension).toBe("guided_start");
    expect(snapshot.weaknesses[1]!.recurring).toBe(true);
    expect(snapshot.healthScore).toBe(58); // 5.75 * 10 = 57.5, rounded = 58
    expect(snapshot.healthTrend).toBe("stable");
  });

  it("handles corrupt learning journal gracefully", async () => {
    const prismDir = join(testDir, ".prism");
    const checkpointsDir = join(prismDir, "checkpoints");
    const dogfoodDir = join(prismDir, "dogfood");
    await mkdir(checkpointsDir, { recursive: true });
    await mkdir(dogfoodDir, { recursive: true });

    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint()),
    );
    await writeFile(
      join(dogfoodDir, "learning-journal.json"),
      "NOT VALID JSON {{{",
    );

    const snapshot = await extractPipelineSnapshot(abs(testDir));

    // Should not crash, weaknesses should be empty
    expect(snapshot.weaknesses).toEqual([]);
    expect(snapshot.healthScore).toBeNull();
    expect(snapshot.healthTrend).toBe("stable");
  });

  it("derives phase from artifacts when checkpoint is missing", async () => {
    const prismDir = join(testDir, ".prism");
    const specsDir = join(prismDir, "specs", SPEC_ID);
    await mkdir(specsDir, { recursive: true });
    await writeFile(
      join(specsDir, "metadata.json"),
      JSON.stringify(makeSpec()),
    );

    const snapshot = await extractPipelineSnapshot(abs(testDir));

    // Approved spec → should derive "plan" phase
    expect(snapshot.currentPhase).toBe("plan");
    expect(snapshot.resumeSource).toBe("artifacts");
  });

  it("populates gate requirements for current→next transition", async () => {
    const prismDir = join(testDir, ".prism");
    const checkpointsDir = join(prismDir, "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });

    // Set phase to "spec" — gate to "plan" requires approved spec
    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify(makeCheckpoint({ phase: "spec" })),
    );

    const snapshot = await extractPipelineSnapshot(abs(testDir));

    const specStage = snapshot.stages.find(s => s.id === "spec")!;
    // Should have gate requirements (blockers since there's no approved spec)
    expect(specStage.gateRequirements.length).toBeGreaterThan(0);
  });

  it("includes all 7 workflow phases as stages", async () => {
    const snapshot = await extractPipelineSnapshot(abs(testDir));

    expect(snapshot.stages.map(s => s.id)).toEqual([
      "understand",
      "identify_problem",
      "spec",
      "plan",
      "execute",
      "verify",
      "release",
    ]);

    // Each stage has label and description
    for (const stage of snapshot.stages) {
      expect(stage.label).toBeTruthy();
      expect(stage.description).toBeTruthy();
    }
  });
});
