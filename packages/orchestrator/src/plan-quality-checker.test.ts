import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId, Spec, Plan, TaskGraph, TaskNode } from "@prism/core";
import { evaluatePlanQuality } from "./plan-quality-checker";
import { skillPlanToCore } from "./bridge-adapters";

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    id: "spec-1" as EntityId,
    title: "Test Spec",
    projectId: "proj-1" as EntityId,
    type: "change",
    status: "approved",
    summary: "test",
    scope: [],
    nonGoals: [],
    acceptanceCriteria: [
      { id: "ac-0" as EntityId, description: "First requirement", status: "unverified" },
      { id: "ac-1" as EntityId, description: "Second requirement", status: "unverified" },
      { id: "ac-2" as EntityId, description: "Third requirement", status: "unverified" },
    ],
    verificationPlan: { checks: [], notes: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1" as EntityId,
    title: "Test Plan",
    projectId: "proj-1" as EntityId,
    specId: "spec-1" as EntityId,
    phases: [],
    risks: [],
    approvals: [],
    sequencingRationale: "test",
    planVersion: 2,
    scopeMode: "exact",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: "task-1" as EntityId,
    title: "Test Task",
    description: "test",
    ownerType: "agent",
    status: "pending",
    dependsOn: [],
    verificationRequirements: [],
    artifactsTouched: [],
    files: ["src/foo.ts"],
    action: "Create foo module",
    verify: "npx tsc --noEmit",
    done: "foo.ts exists and compiles",
    mustHaves: {
      truths: [
        { id: "ac-0" as EntityId, statement: "First requirement met", verifiedBy: "test" },
      ],
      artifacts: [{ path: "src/foo.ts", provides: "foo module" }],
      keyLinks: [],
    },
    wave: 0,
    contextBudgetPct: 5,
    ...overrides,
  };
}

function makeTaskGraph(tasks: TaskNode[]): TaskGraph {
  return {
    id: "tg-1" as EntityId,
    projectId: "proj-1" as EntityId,
    specId: "spec-1" as EntityId,
    planId: "plan-1" as EntityId,
    status: "pending",
    tasks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function setupProject(
  tmpDir: string,
  spec: Spec,
  plan: Plan,
  taskGraph: TaskGraph,
): Promise<void> {
  const specDir = join(tmpDir, ".prism", "specs", spec.id);
  const planDir = join(tmpDir, ".prism", "plans", plan.id);
  await mkdir(specDir, { recursive: true });
  await mkdir(planDir, { recursive: true });
  await writeFile(join(specDir, "metadata.json"), JSON.stringify(spec, null, 2) + "\n");
  await writeFile(join(planDir, "metadata.json"), JSON.stringify(plan, null, 2) + "\n");
  await writeFile(join(planDir, "task-graph.json"), JSON.stringify(taskGraph, null, 2) + "\n");
}

describe("evaluatePlanQuality", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-quality-test-"));
    projectRoot = tmpDir as AbsolutePath;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  // --- Test 1: Legacy bypass ---

  it("returns legacy result when planVersion is missing", async () => {
    const spec = makeSpec();
    const plan = makePlan({ planVersion: undefined });
    const taskGraph = makeTaskGraph([makeTask()]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    expect(result.legacy).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(50);
  });

  it("returns legacy result when planVersion is 1", async () => {
    const spec = makeSpec();
    const plan = makePlan({ planVersion: 1 });
    const taskGraph = makeTaskGraph([makeTask()]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    expect(result.legacy).toBe(true);
    expect(result.passed).toBe(true);
  });

  // --- Test 2-3: Requirement coverage (dim 1) ---

  it("fails when spec ACs are not covered by task truths", async () => {
    const spec = makeSpec();
    // Task only covers ac-0, missing ac-1 and ac-2
    const task = makeTask();
    const plan = makePlan();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    expect(result.passed).toBe(false);
    const reqDim = result.dimensions.find((d) => d.name === "Requirement Coverage");
    expect(reqDim?.hasBlocker).toBe(true);
    expect(result.traceability.filter((t) => t.coverage === "missing")).toHaveLength(2);
  });

  it("passes when all spec ACs are covered", async () => {
    const spec = makeSpec();
    const tasks = [
      makeTask({
        id: "task-1" as EntityId,
        mustHaves: {
          truths: [
            { id: "ac-0" as EntityId, statement: "First", verifiedBy: "test" },
            { id: "ac-1" as EntityId, statement: "Second", verifiedBy: "test" },
          ],
          artifacts: [],
          keyLinks: [],
        },
      }),
      makeTask({
        id: "task-2" as EntityId,
        title: "Task 2",
        mustHaves: {
          truths: [
            { id: "ac-2" as EntityId, statement: "Third", verifiedBy: "test" },
          ],
          artifacts: [],
          keyLinks: [],
        },
      }),
    ];
    const plan = makePlan();
    const taskGraph = makeTaskGraph(tasks);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const reqDim = result.dimensions.find((d) => d.name === "Requirement Coverage");
    expect(reqDim?.passed).toBe(true);
    expect(reqDim?.hasBlocker).toBe(false);
    expect(result.traceability.every((t) => t.coverage === "full")).toBe(true);
  });

  // --- Test 4-5: Task completeness (dim 2) ---

  it("blocks when task has no structured fields at all", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const task = makeTask({
      files: undefined,
      action: undefined,
      verify: undefined,
      done: undefined,
      mustHaves: undefined,
    });
    const plan = makePlan();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Task Completeness");
    expect(dim?.hasBlocker).toBe(true);
    expect(dim?.score).toBe(0);
  });

  it("passes when all tasks have complete structured fields", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const task = makeTask();
    const plan = makePlan();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Task Completeness");
    expect(dim?.passed).toBe(true);
  });

  // --- Test 6-7: Dependency correctness (dim 3) ---

  it("blocks on circular dependencies", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const tasks = [
      makeTask({ id: "t-1" as EntityId, dependsOn: ["t-2" as EntityId] }),
      makeTask({ id: "t-2" as EntityId, title: "Task 2", dependsOn: ["t-1" as EntityId] }),
    ];
    const plan = makePlan();
    const taskGraph = makeTaskGraph(tasks);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Dependency Correctness");
    expect(dim?.hasBlocker).toBe(true);
    expect(dim?.details).toContain("Circular dependency");
  });

  it("blocks on invalid dependsOn reference", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const task = makeTask({ dependsOn: ["nonexistent" as EntityId] });
    const plan = makePlan();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Dependency Correctness");
    expect(dim?.hasBlocker).toBe(true);
    expect(dim?.details).toContain("unknown task");
  });

  it("allows same-wave dependencies", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const tasks = [
      makeTask({ id: "t-1" as EntityId, wave: 0, dependsOn: [] }),
      makeTask({ id: "t-2" as EntityId, title: "Task 2", wave: 0, dependsOn: ["t-1" as EntityId] }),
    ];
    const plan = makePlan();
    const taskGraph = makeTaskGraph(tasks);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Dependency Correctness");
    expect(dim?.passed).toBe(true);
    expect(dim?.hasBlocker).toBe(false);
  });

  // --- Test 8: Key links (dim 4) ---

  it("blocks when phase requiredWiring not covered by tasks", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const plan = makePlan({
      phases: [{
        id: "p-1" as EntityId,
        title: "Phase 1",
        description: "",
        dependsOn: [],
        requiredWiring: [{ from: "a.ts", to: "b.ts", via: "import", pattern: "import.*from" }],
      }],
    });
    const task = makeTask();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Key Links Planned");
    expect(dim?.hasBlocker).toBe(true);
    expect(dim?.details).toContain("Uncovered wiring");
  });

  // --- Test 9: Scope sanity (dim 5) ---

  it("warns when exact mode has too many tasks", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({ id: `task-${i}` as EntityId, title: `Task ${i}` }),
    );
    const plan = makePlan({ scopeMode: "exact" });
    const taskGraph = makeTaskGraph(tasks);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Scope Sanity");
    expect(dim?.passed).toBe(true); // warning, not blocker
    expect(dim?.score).toBe(6.25); // half credit
    expect(dim?.details).toContain("exceeds");
  });

  // --- Test 10: Verification derivation (dim 6) ---

  it("blocks when task has empty verify", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const task = makeTask({ verify: "" });
    const plan = makePlan();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Verification Derivation");
    expect(dim?.hasBlocker).toBe(true);
  });

  // --- Test 11-12: Context budget (dim 7) ---

  it("warns when single task exceeds 25% context", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const task = makeTask({ contextBudgetPct: 30 });
    const plan = makePlan({ totalContextBudgetPct: 30 });
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Context Budget");
    expect(dim?.hasBlocker).toBe(false); // warning, not blocker
    expect(dim?.score).toBe(6.25);
    expect(dim?.details).toContain("30%");
  });

  it("warns when total context budget exceeds 50%", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const task = makeTask({ contextBudgetPct: 20 });
    const plan = makePlan({ totalContextBudgetPct: 55 });
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Context Budget");
    expect(dim?.score).toBe(6.25);
    expect(dim?.details).toContain("55%");
  });

  // --- Test 13: Artifact completeness (dim 8) ---

  it("warns when phase requiredArtifacts not in task files", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const plan = makePlan({
      phases: [{
        id: "p-1" as EntityId,
        title: "Phase 1",
        description: "",
        dependsOn: [],
        requiredArtifacts: [{ path: "src/missing.ts", provides: "missing module" }],
      }],
    });
    const task = makeTask();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    const dim = result.dimensions.find((d) => d.name === "Artifact Completeness");
    expect(dim?.score).toBe(6.25); // half credit warning
    expect(dim?.details).toContain("src/missing.ts");
  });

  // --- Test 14: Full pass ---

  it("passes with complete plan covering all requirements", async () => {
    const spec = makeSpec();
    const tasks = [
      makeTask({
        id: "task-1" as EntityId,
        mustHaves: {
          truths: [
            { id: "ac-0" as EntityId, statement: "First", verifiedBy: "test" },
            { id: "ac-1" as EntityId, statement: "Second", verifiedBy: "test" },
          ],
          artifacts: [{ path: "src/foo.ts", provides: "foo" }],
          keyLinks: [],
        },
      }),
      makeTask({
        id: "task-2" as EntityId,
        title: "Task 2",
        wave: 1,
        mustHaves: {
          truths: [
            { id: "ac-2" as EntityId, statement: "Third", verifiedBy: "test" },
          ],
          artifacts: [{ path: "src/bar.ts", provides: "bar" }],
          keyLinks: [],
        },
      }),
    ];
    const plan = makePlan();
    const taskGraph = makeTaskGraph(tasks);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  // --- Test 15: Plain-English summary ---

  it("returns descriptive summary without numeric scores", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    const task = makeTask();
    const plan = makePlan();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    expect(result.summary).not.toMatch(/\d+\/100/);
    expect(result.summary.length).toBeGreaterThan(10);
  });

  // --- Test 16: Traceability matrix ---

  it("produces correct traceability matrix", async () => {
    const spec = makeSpec();
    // Only cover ac-0 and ac-1, leave ac-2 missing
    const task = makeTask({
      mustHaves: {
        truths: [
          { id: "ac-0" as EntityId, statement: "First", verifiedBy: "test" },
          { id: "ac-1" as EntityId, statement: "Second", verifiedBy: "test" },
        ],
        artifacts: [],
        keyLinks: [],
      },
    });
    const plan = makePlan();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    expect(result.traceability).toHaveLength(3);
    expect(result.traceability.filter((t) => t.coverage === "full")).toHaveLength(2);
    expect(result.traceability.filter((t) => t.coverage === "missing")).toHaveLength(1);
    const missing = result.traceability.find((t) => t.coverage === "missing");
    expect(missing?.criterionId).toBe("ac-2");
  });

  // --- Test 17: Blocker forces fail (Codex catch) ---

  it("fails when one dimension has blocker even if total score > 70", async () => {
    const spec = makeSpec({ acceptanceCriteria: [] });
    // Task has all structured fields BUT empty verify → verification derivation blocker
    const task = makeTask({ verify: "" });
    const plan = makePlan();
    const taskGraph = makeTaskGraph([task]);
    await setupProject(tmpDir, spec, plan, taskGraph);

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    // 7 dimensions pass (12.5 each = 87.5), 1 blocks (0) = total 87.5 > 70
    // But hasBlocker should force fail
    expect(result.passed).toBe(false);
    expect(result.dimensions.some((d) => d.hasBlocker)).toBe(true);
  });

  // --- Test 18: Malformed JSON ---

  it("fails for v2 plan with malformed task-graph.json", async () => {
    const spec = makeSpec();
    const plan = makePlan();
    const planDir = join(tmpDir, ".prism", "plans", plan.id);
    const specDir = join(tmpDir, ".prism", "specs", spec.id);
    await mkdir(specDir, { recursive: true });
    await mkdir(planDir, { recursive: true });
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(spec, null, 2) + "\n");
    await writeFile(join(planDir, "metadata.json"), JSON.stringify(plan, null, 2) + "\n");
    await writeFile(join(planDir, "task-graph.json"), "not json");

    const result = await evaluatePlanQuality(projectRoot, plan.id, spec.id);
    expect(result.legacy).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.summary).toContain("invalid JSON");
  });

  // --- Test 19: Bridge adapter defaults ---

  it("skillPlanToCore defaults: scopeMode=exact, planVersion=2, deviationRules=DEFAULT", async () => {
    const result = skillPlanToCore(
      { title: "Test", specId: "spec-1" },
      "plan-1" as EntityId,
    );

    expect(result.scopeMode).toBe("exact");
    expect(result.planVersion).toBe(2);
    expect(result.deviationRules).toBeDefined();
    expect(result.deviationRules).toHaveLength(4);
    expect(result.deviationRules![0].severity).toBe("auto_fix");
    expect(result.deviationRules![3].severity).toBe("ask_user");
    expect(result.totalContextBudgetPct).toBe(0);
  });
});
