import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId, Spec, Plan } from "@prism/core";
import { evaluateTransition } from "./gate-evaluator";

describe("evaluateTransition", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-gate-test-"));
    projectRoot = tmpDir as AbsolutePath;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  // --- understand -> identify_problem ---

  it("understand -> identify_problem: allowed when .prism/ dir exists", async () => {
    await mkdir(join(tmpDir, ".prism"), { recursive: true });
    const result = await evaluateTransition("understand", "identify_problem", projectRoot);
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.evidence).toContain(".prism/ directory exists");
  });

  it("understand -> identify_problem: blocked when .prism/ dir missing", async () => {
    const result = await evaluateTransition("understand", "identify_problem", projectRoot);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain(".prism/ directory does not exist");
  });

  // --- identify_problem -> spec ---

  it("identify_problem -> spec: allowed (lightweight)", async () => {
    const result = await evaluateTransition("identify_problem", "spec", projectRoot);
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  // --- spec -> plan ---

  it("spec -> plan: blocked when no active spec ID", async () => {
    const result = await evaluateTransition("spec", "plan", projectRoot);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("no active spec ID provided");
  });

  it("spec -> plan: blocked when spec not found", async () => {
    await mkdir(join(tmpDir, ".prism", "specs"), { recursive: true });
    const result = await evaluateTransition("spec", "plan", projectRoot, "nonexistent-spec");
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("spec nonexistent-spec not found");
  });

  it("spec -> plan: blocked when spec is draft", async () => {
    const specId = "test-spec-1" as EntityId;
    const specDir = join(tmpDir, ".prism", "specs", specId);
    await mkdir(specDir, { recursive: true });
    const spec: Spec = {
      id: specId,
      title: "Test Spec",
      projectId: "proj-1" as EntityId,
      type: "change",
      status: "draft",
      summary: "test",
      scope: [],
      nonGoals: [],
      acceptanceCriteria: [
        { id: "ac-1" as EntityId, description: "some criterion", status: "unverified" },
      ],
      verificationPlan: { checks: [], notes: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(spec, null, 2) + "\n");

    const result = await evaluateTransition("spec", "plan", projectRoot, specId);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain('spec status is "draft", expected "approved"');
  });

  it("spec -> plan: blocked when spec has no acceptance criteria", async () => {
    const specId = "test-spec-2" as EntityId;
    const specDir = join(tmpDir, ".prism", "specs", specId);
    await mkdir(specDir, { recursive: true });
    const spec: Spec = {
      id: specId,
      title: "Test Spec",
      projectId: "proj-1" as EntityId,
      type: "change",
      status: "approved",
      summary: "test",
      scope: [],
      nonGoals: [],
      acceptanceCriteria: [],
      verificationPlan: { checks: [], notes: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(spec, null, 2) + "\n");

    const result = await evaluateTransition("spec", "plan", projectRoot, specId);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("spec has no acceptance criteria");
  });

  it("spec -> plan: allowed when spec is approved with acceptance criteria", async () => {
    const specId = "test-spec-3" as EntityId;
    const specDir = join(tmpDir, ".prism", "specs", specId);
    await mkdir(specDir, { recursive: true });
    const spec: Spec = {
      id: specId,
      title: "Test Spec",
      projectId: "proj-1" as EntityId,
      type: "change",
      status: "approved",
      summary: "test",
      scope: [],
      nonGoals: [],
      acceptanceCriteria: [
        { id: "ac-1" as EntityId, description: "some criterion", status: "unverified" },
      ],
      verificationPlan: { checks: [], notes: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(spec, null, 2) + "\n");

    const result = await evaluateTransition("spec", "plan", projectRoot, specId);
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.evidence).toContain("spec is approved with acceptance criteria");
  });

  // --- plan -> execute ---

  it("plan -> execute: blocked when no plan exists", async () => {
    await mkdir(join(tmpDir, ".prism", "plans"), { recursive: true });
    const result = await evaluateTransition("plan", "execute", projectRoot, "spec-1");
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("no plan found for spec");
  });

  it("plan -> execute: blocked when no task graph", async () => {
    const specId = "spec-1" as EntityId;
    const planId = "plan-1" as EntityId;
    const planDir = join(tmpDir, ".prism", "plans", planId);
    await mkdir(planDir, { recursive: true });
    const plan: Plan = {
      id: planId,
      title: "Test Plan",
      projectId: "proj-1" as EntityId,
      specId,
      phases: [],
      risks: [],
      approvals: [],
      sequencingRationale: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(planDir, "metadata.json"), JSON.stringify(plan, null, 2) + "\n");

    const result = await evaluateTransition("plan", "execute", projectRoot, specId);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("task graph file does not exist");
  });

  it("plan -> execute: allowed when plan and task graph exist", async () => {
    const specId = "spec-1" as EntityId;
    const planId = "plan-1" as EntityId;
    const planDir = join(tmpDir, ".prism", "plans", planId);
    await mkdir(planDir, { recursive: true });
    const plan: Plan = {
      id: planId,
      title: "Test Plan",
      projectId: "proj-1" as EntityId,
      specId,
      phases: [],
      risks: [],
      approvals: [],
      sequencingRationale: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(planDir, "metadata.json"), JSON.stringify(plan, null, 2) + "\n");
    await writeFile(join(planDir, "task-graph.json"), JSON.stringify({ tasks: [] }) + "\n");

    const result = await evaluateTransition("plan", "execute", projectRoot, specId);
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  // --- execute -> verify ---

  it("execute -> verify: blocked when no checkpoint", async () => {
    await mkdir(join(tmpDir, ".prism", "checkpoints"), { recursive: true });
    const result = await evaluateTransition("execute", "verify", projectRoot);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("no checkpoint found");
  });

  it("execute -> verify: allowed when checkpoint exists", async () => {
    const checkpointsDir = join(tmpDir, ".prism", "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });
    const checkpoint = {
      id: "cp-1",
      projectId: "proj-1",
      runId: null,
      activeSpecId: null,
      phase: "execute",
      progressSummary: "done",
      keyDecisions: [],
      blockers: [],
      nextRecommendedActions: [],
      lastVerificationSummary: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(checkpointsDir, "latest.json"), JSON.stringify(checkpoint, null, 2) + "\n");

    const result = await evaluateTransition("execute", "verify", projectRoot);
    expect(result.allowed).toBe(true);
    expect(result.evidence).toContain("checkpoint exists");
  });

  // --- verify -> release ---

  it("verify -> release: blocked when no active spec ID", async () => {
    const result = await evaluateTransition("verify", "release", projectRoot);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("no active spec ID provided");
  });

  it("verify -> release: blocked when reviews incomplete", async () => {
    const specId = "spec-vr-1" as EntityId;
    const specDir = join(tmpDir, ".prism", "specs", specId);
    await mkdir(specDir, { recursive: true });
    const spec: Spec = {
      id: specId,
      title: "Test Spec",
      projectId: "proj-1" as EntityId,
      type: "task",
      status: "approved",
      summary: "test",
      scope: [],
      nonGoals: [],
      acceptanceCriteria: [
        { id: "ac-1" as EntityId, description: "criterion", status: "unverified" },
      ],
      verificationPlan: { checks: [], notes: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(spec, null, 2) + "\n");

    const result = await evaluateTransition("verify", "release", projectRoot, specId);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("required reviews incomplete or not passing");
  });

  it("verify -> release: allowed when reviews and verification pass", async () => {
    const specId = "spec-vr-2" as EntityId;
    const runId = "run-vr-1" as EntityId;

    // Write spec
    const specDir = join(tmpDir, ".prism", "specs", specId);
    await mkdir(specDir, { recursive: true });
    const spec: Spec = {
      id: specId,
      title: "Test Spec",
      projectId: "proj-1" as EntityId,
      type: "task",
      status: "approved",
      summary: "test",
      scope: [],
      nonGoals: [],
      acceptanceCriteria: [
        { id: "ac-1" as EntityId, description: "criterion", status: "unverified" },
      ],
      verificationPlan: { checks: [], notes: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(specDir, "metadata.json"), JSON.stringify(spec, null, 2) + "\n");

    // Write passing engineering review
    const reviewDir = join(tmpDir, ".prism", "reviews", specId);
    await mkdir(reviewDir, { recursive: true });
    await writeFile(join(reviewDir, "engineering.json"), JSON.stringify({ verdict: "pass" }));

    // Write checkpoint with runId
    const checkpointsDir = join(tmpDir, ".prism", "checkpoints");
    await mkdir(checkpointsDir, { recursive: true });
    await writeFile(
      join(checkpointsDir, "latest.json"),
      JSON.stringify({
        id: "cp-1", projectId: "proj-1", runId, activeSpecId: specId,
        phase: "verify", progressSummary: "done", keyDecisions: [],
        blockers: [], nextRecommendedActions: [], lastVerificationSummary: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, null, 2) + "\n",
    );

    // Write passing verification
    const runDir = join(tmpDir, ".prism", "runs", runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "verification.json"),
      JSON.stringify({
        id: "v-1", projectId: "proj-1", specId, runId,
        checksRun: ["test"], passed: true, failures: [],
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, null, 2) + "\n",
    );

    const result = await evaluateTransition("verify", "release", projectRoot, specId);
    expect(result.allowed).toBe(true);
    expect(result.evidence).toContain("all required reviews passing");
    expect(result.evidence).toContain("verification passed");
  });

  // --- regression ---

  it("regression (execute -> plan): allowed", async () => {
    const result = await evaluateTransition("execute", "plan", projectRoot);
    expect(result.allowed).toBe(true);
    expect(result.evidence).toContain("regression allowed");
  });

  // --- invalid ---

  it("invalid (understand -> release): blocked", async () => {
    const result = await evaluateTransition("understand", "release", projectRoot);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("invalid transition from understand to release");
  });

  // --- error resilience ---

  it("spec -> plan: returns blocker instead of throwing on corrupt spec JSON", async () => {
    const specId = "spec-corrupt" as EntityId;
    const specDir = join(tmpDir, ".prism", "specs", specId);
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "metadata.json"), "NOT VALID JSON{{{");

    const result = await evaluateTransition("spec", "plan", projectRoot, specId);
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.includes("artifact read error"))).toBe(true);
  });
});
