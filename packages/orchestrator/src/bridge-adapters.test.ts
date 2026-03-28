import { describe, it, expect } from "vitest";
import type { EntityId } from "@prism/core";
import {
  skillSpecToCore,
  skillPlanToCore,
  skillProblemToCore,
  skillReviewToCore,
  skillVerificationToCore,
  skillCheckpointToCore,
} from "./bridge-adapters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isISOString(value: string): boolean {
  return !isNaN(Date.parse(value)) && value.includes("T");
}

// ---------------------------------------------------------------------------
// skillSpecToCore
// ---------------------------------------------------------------------------

describe("skillSpecToCore", () => {
  const specId = "spec-test-1" as EntityId;

  it("maps all fields from valid full input", () => {
    const result = skillSpecToCore(
      {
        title: "Full Spec",
        type: "change",
        status: "draft",
        summary: "A comprehensive spec",
        scope: ["src/", "tests/"],
        nonGoals: ["performance", "i18n"],
        acceptanceCriteria: ["Users can log in", "Session persists across refresh"],
        projectId: "proj-abc",
      },
      specId,
    );

    expect(result.id).toBe(specId);
    expect(result.title).toBe("Full Spec");
    expect(result.type).toBe("change");
    expect(result.status).toBe("draft");
    expect(result.summary).toBe("A comprehensive spec");
    expect(result.scope).toEqual(["src/", "tests/"]);
    expect(result.nonGoals).toEqual(["performance", "i18n"]);
    expect(result.projectId).toBe("proj-abc");
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });

  it("maps acceptanceCriteria strings to AcceptanceCriterion objects", () => {
    const result = skillSpecToCore(
      {
        title: "AC Spec",
        acceptanceCriteria: ["First criterion", "Second criterion"],
      },
      specId,
    );

    expect(result.acceptanceCriteria).toHaveLength(2);
    expect(result.acceptanceCriteria[0]).toEqual({
      id: "ac-0",
      description: "First criterion",
      status: "unverified",
    });
    expect(result.acceptanceCriteria[1]).toEqual({
      id: "ac-1",
      description: "Second criterion",
      status: "unverified",
    });
  });

  it("applies defaults for minimal input (title only)", () => {
    const result = skillSpecToCore({ title: "Minimal Spec" }, specId);

    expect(result.id).toBe(specId);
    expect(result.title).toBe("Minimal Spec");
    expect(result.type).toBe("change");
    expect(result.status).toBe("approved");
    expect(result.summary).toBe("Minimal Spec"); // falls back to title
    expect(result.scope).toEqual([]);
    expect(result.nonGoals).toEqual([]);
    expect(result.acceptanceCriteria).toEqual([]);
    expect(result.projectId).toBe("unknown");
    expect(result.verificationPlan).toEqual({ checks: [], notes: [] });
  });

  it("generates truthy id and ISO timestamps", () => {
    const result = skillSpecToCore({ title: "Timestamp Check" }, specId);

    expect(result.id).toBeTruthy();
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// skillPlanToCore
// ---------------------------------------------------------------------------

describe("skillPlanToCore", () => {
  const planId = "plan-test-1" as EntityId;

  it("maps all fields from valid input with phases", () => {
    const result = skillPlanToCore(
      {
        title: "Full Plan",
        specId: "spec-xyz",
        phases: [
          { id: "ph-1", title: "Phase One", description: "First phase", dependsOn: [] },
          { id: "ph-2", title: "Phase Two", description: "Second phase", dependsOn: ["ph-1"] },
        ],
        risks: ["timeline slip", "API instability"],
        sequencingRationale: "Sequential due to data dependency",
        projectId: "proj-abc",
      },
      planId,
    );

    expect(result.id).toBe(planId);
    expect(result.title).toBe("Full Plan");
    expect(result.specId).toBe("spec-xyz");
    expect(result.projectId).toBe("proj-abc");
    expect(result.risks).toEqual(["timeline slip", "API instability"]);
    expect(result.sequencingRationale).toBe("Sequential due to data dependency");
    expect(result.approvals).toEqual([]);
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });

  it("maps phase fields correctly", () => {
    const result = skillPlanToCore(
      {
        title: "Plan With Phases",
        specId: "spec-1",
        phases: [
          { id: "ph-a", title: "Alpha", description: "Start here", dependsOn: ["ph-x"] },
        ],
      },
      planId,
    );

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]).toEqual({
      id: "ph-a",
      title: "Alpha",
      description: "Start here",
      dependsOn: ["ph-x"],
    });
  });

  it("generates phase ids when not provided", () => {
    const result = skillPlanToCore(
      {
        title: "Auto-ID Plan",
        specId: "spec-1",
        phases: [
          { title: "Phase Without ID" },
          { title: "Another Phase" },
        ],
      },
      planId,
    );

    expect(result.phases[0].id).toBe("phase-0");
    expect(result.phases[1].id).toBe("phase-1");
  });

  it("applies defaults for minimal input (title and specId only)", () => {
    const result = skillPlanToCore({ title: "Minimal Plan", specId: "spec-min" }, planId);

    expect(result.id).toBe(planId);
    expect(result.title).toBe("Minimal Plan");
    expect(result.specId).toBe("spec-min");
    expect(result.projectId).toBe("unknown");
    expect(result.phases).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.sequencingRationale).toBe("");
    expect(result.approvals).toEqual([]);
  });

  it("generates truthy id and ISO timestamps", () => {
    const result = skillPlanToCore({ title: "T", specId: "s" }, planId);

    expect(result.id).toBeTruthy();
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// skillReviewToCore
// ---------------------------------------------------------------------------

describe("skillReviewToCore", () => {
  const specId = "spec-review-1" as EntityId;

  it("maps all fields from valid input with findings", () => {
    const result = skillReviewToCore(
      {
        verdict: "pass",
        summary: "Code looks good",
        findings: [
          {
            severity: "p1",
            category: "security",
            title: "SQL injection risk",
            details: "Line 42 uses raw SQL",
            filePath: "src/db.ts",
            line: 42,
          },
          {
            severity: "p2",
            category: "style",
            title: "Missing type annotation",
            details: "Function return type not specified",
          },
        ],
        projectId: "proj-abc",
      },
      specId,
      "engineering",
    );

    expect(result.id).toBeTruthy();
    expect(result.specId).toBe(specId);
    expect(result.reviewType).toBe("engineering");
    expect(result.verdict).toBe("pass");
    expect(result.summary).toBe("Code looks good");
    expect(result.projectId).toBe("proj-abc");
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });

  it("maps findings fields correctly including optional filePath and line", () => {
    const result = skillReviewToCore(
      {
        verdict: "pass",
        findings: [
          {
            severity: "p1",
            category: "security",
            title: "Auth bypass",
            details: "Session token not validated",
            filePath: "src/auth.ts",
            line: 10,
          },
        ],
      },
      specId,
      "design",
    );

    expect(result.findings[0]).toEqual({
      severity: "p1",
      category: "security",
      title: "Auth bypass",
      details: "Session token not validated",
      filePath: "src/auth.ts",
      line: 10,
    });
  });

  it("applies finding defaults when severity and category are omitted", () => {
    const result = skillReviewToCore(
      {
        verdict: "fail",
        findings: [{ title: "Some issue" }],
      },
      specId,
      "engineering",
    );

    expect(result.findings[0].severity).toBe("p2");
    expect(result.findings[0].category).toBe("general");
    expect(result.findings[0].details).toBe("");
  });

  it("handles empty findings array", () => {
    const result = skillReviewToCore(
      { verdict: "pass", findings: [] },
      specId,
      "design",
    );

    expect(result.findings).toEqual([]);
  });

  it("handles missing findings field (defaults to empty)", () => {
    const result = skillReviewToCore({ verdict: "pass" }, specId, "design");

    expect(result.findings).toEqual([]);
    expect(result.summary).toBe("");
    expect(result.projectId).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// skillVerificationToCore
// ---------------------------------------------------------------------------

describe("skillVerificationToCore", () => {
  const runId = "run-test-1" as EntityId;

  it("maps passed=true with checksRun", () => {
    const result = skillVerificationToCore(
      {
        specId: "spec-1",
        passed: true,
        checksRun: ["lint", "test", "type-check"],
        failures: [],
        projectId: "proj-abc",
      },
      runId,
    );

    expect(result.id).toBeTruthy();
    expect(result.specId).toBe("spec-1");
    expect(result.runId).toBe(runId);
    expect(result.passed).toBe(true);
    expect(result.checksRun).toEqual(["lint", "test", "type-check"]);
    expect(result.failures).toEqual([]);
    expect(result.projectId).toBe("proj-abc");
    expect(isISOString(result.timestamp)).toBe(true);
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });

  it("maps passed=false with failures", () => {
    const result = skillVerificationToCore(
      {
        specId: "spec-fail",
        passed: false,
        checksRun: ["test"],
        failures: [
          { check: "test", details: "3 tests failed" },
          { check: "lint", details: "2 lint errors" },
        ],
      },
      runId,
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toEqual({ check: "test", details: "3 tests failed" });
    expect(result.failures[1]).toEqual({ check: "lint", details: "2 lint errors" });
  });

  it("applies default details empty string when failure details omitted", () => {
    const result = skillVerificationToCore(
      {
        specId: "spec-1",
        passed: false,
        failures: [{ check: "typecheck" }],
      },
      runId,
    );

    expect(result.failures[0]).toEqual({ check: "typecheck", details: "" });
  });

  it("applies defaults for minimal input", () => {
    const result = skillVerificationToCore(
      { specId: "spec-min", passed: true },
      runId,
    );

    expect(result.checksRun).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.projectId).toBe("unknown");
  });

  it("generates truthy id and ISO timestamps", () => {
    const result = skillVerificationToCore({ specId: "s", passed: true }, runId);

    expect(result.id).toBeTruthy();
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
    expect(isISOString(result.timestamp)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// skillCheckpointToCore
// ---------------------------------------------------------------------------

describe("skillCheckpointToCore", () => {
  it("maps all fields from full input", () => {
    const result = skillCheckpointToCore({
      projectId: "proj-abc",
      runId: "run-1",
      activeSpecId: "spec-1",
      phase: "execute",
      progress: "Implementation 60% complete",
      decisions: ["Use PostgreSQL", "Deploy to AWS"],
      preferences: ["TypeScript strict mode"],
      nextSteps: ["Write migration", "Update tests"],
      blockers: ["Waiting for API key"],
      lastVerificationSummary: "3 of 5 checks passing",
    });

    expect(result.id).toBeTruthy();
    expect(result.projectId).toBe("proj-abc");
    expect(result.runId).toBe("run-1");
    expect(result.activeSpecId).toBe("spec-1");
    expect(result.phase).toBe("execute");
    expect(result.progressSummary).toBe("Implementation 60% complete");
    expect(result.keyDecisions).toEqual(["Use PostgreSQL", "Deploy to AWS"]);
    expect(result.nextRecommendedActions).toEqual(["Write migration", "Update tests"]);
    expect(result.blockers).toEqual(["Waiting for API key"]);
    expect(result.lastVerificationSummary).toBe("3 of 5 checks passing");
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });

  it("applies defaults for minimal input", () => {
    const result = skillCheckpointToCore({});

    expect(result.id).toBeTruthy();
    expect(result.projectId).toBe("unknown");
    expect(result.runId).toBeNull();
    expect(result.activeSpecId).toBeNull();
    expect(result.progressSummary).toBe("");
    expect(result.keyDecisions).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.nextRecommendedActions).toEqual([]);
    expect(result.lastVerificationSummary).toBeNull();
  });

  it("generates truthy id and ISO timestamps", () => {
    const result = skillCheckpointToCore({});

    expect(result.id).toBeTruthy();
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });

  describe("stage-to-phase mapping", () => {
    it("maps stage=0 to 'understand'", () => {
      expect(skillCheckpointToCore({ stage: 0 }).phase).toBe("understand");
    });

    it("maps stage=1 to 'spec'", () => {
      expect(skillCheckpointToCore({ stage: 1 }).phase).toBe("spec");
    });

    it("maps stage=2 to 'plan'", () => {
      expect(skillCheckpointToCore({ stage: 2 }).phase).toBe("plan");
    });

    it("maps stage=2.5 to 'plan'", () => {
      expect(skillCheckpointToCore({ stage: 2.5 }).phase).toBe("plan");
    });

    it("maps stage=3 to 'execute'", () => {
      expect(skillCheckpointToCore({ stage: 3 }).phase).toBe("execute");
    });

    it("maps stage=4 to 'verify'", () => {
      expect(skillCheckpointToCore({ stage: 4 }).phase).toBe("verify");
    });

    it("maps stage=4.5 to 'verify'", () => {
      expect(skillCheckpointToCore({ stage: 4.5 }).phase).toBe("verify");
    });

    it("maps stage=4.6 to 'verify'", () => {
      expect(skillCheckpointToCore({ stage: 4.6 }).phase).toBe("verify");
    });

    it("maps stage=5 to 'release'", () => {
      expect(skillCheckpointToCore({ stage: 5 }).phase).toBe("release");
    });

    it("maps stage > 5 to 'release'", () => {
      expect(skillCheckpointToCore({ stage: 99 }).phase).toBe("release");
    });

    it("maps string stage '2.5' to 'plan'", () => {
      expect(skillCheckpointToCore({ stage: "2.5" }).phase).toBe("plan");
    });

    it("maps string stage '3' to 'execute'", () => {
      expect(skillCheckpointToCore({ stage: "3" }).phase).toBe("execute");
    });

    it("maps undefined stage to 'understand'", () => {
      expect(skillCheckpointToCore({}).phase).toBe("understand");
    });

    it("explicit phase field overrides stage mapping", () => {
      // When phase is provided directly, it takes precedence over stage
      expect(skillCheckpointToCore({ phase: "release", stage: 1 }).phase).toBe("release");
    });
  });
});

// ---------------------------------------------------------------------------
// skillProblemToCore
// ---------------------------------------------------------------------------

describe("skillProblemToCore", () => {
  const problemId = "problem-test-1" as EntityId;

  it("maps all fields from valid full input", () => {
    const result = skillProblemToCore(
      {
        projectId: "proj-1",
        specId: "spec-1",
        originalRequest: "Build me an X crawler",
        realProblem: "Monitor brand mentions on X",
        targetUser: "Marketing team",
        assumptions: ["X API access", "Real-time not required"],
        reframed: true,
        reframeDetails: "Reframed from crawler to API monitoring",
      },
      problemId,
    );

    expect(result.id).toBe(problemId);
    expect(result.projectId).toBe("proj-1");
    expect(result.specId).toBe("spec-1");
    expect(result.originalRequest).toBe("Build me an X crawler");
    expect(result.realProblem).toBe("Monitor brand mentions on X");
    expect(result.targetUser).toBe("Marketing team");
    expect(result.assumptions).toEqual(["X API access", "Real-time not required"]);
    expect(result.reframed).toBe(true);
    expect(result.reframeDetails).toBe("Reframed from crawler to API monitoring");
    expect(isISOString(result.createdAt)).toBe(true);
    expect(isISOString(result.updatedAt)).toBe(true);
  });

  it("defaults optional fields correctly", () => {
    const result = skillProblemToCore(
      {
        originalRequest: "Add logout",
        realProblem: "Users need to log out",
        targetUser: "All users",
        reframed: false,
      },
      problemId,
    );

    expect(result.projectId).toBe("unknown");
    expect(result.specId).toBeNull();
    expect(result.assumptions).toEqual([]);
    expect(result.reframeDetails).toBeNull();
  });

  it("handles null specId explicitly", () => {
    const result = skillProblemToCore(
      {
        specId: null,
        originalRequest: "test",
        realProblem: "test",
        targetUser: "user",
        reframed: false,
      },
      problemId,
    );

    expect(result.specId).toBeNull();
  });
});
