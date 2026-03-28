import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId } from "@prism/core";
import {
  createSpec,
  approveSpec,
  createPlan,
  recordVerification,
  recordReview,
  recordReleaseState,
} from "./services";

describe("canonical entity writers", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-services-test-"));
    projectRoot = tmpDir as AbsolutePath;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  describe("createSpec", () => {
    it("writes metadata to .prism/specs/<id>/metadata.json", async () => {
      const spec = await createSpec(projectRoot, {
        title: "Test Spec",
        projectId: "proj-1" as EntityId,
        type: "change",
        status: "draft",
        summary: "A test spec",
        scope: ["scope-1"],
        nonGoals: [],
        acceptanceCriteria: [
          { id: "ac-1" as EntityId, description: "criterion 1", status: "unverified" },
        ],
        verificationPlan: { checks: ["lint"], notes: [] },
      });

      expect(spec.id).toBeTruthy();
      expect(spec.createdAt).toBeTruthy();
      expect(spec.updatedAt).toBeTruthy();
      expect(spec.title).toBe("Test Spec");

      const filePath = join(tmpDir, ".prism", "specs", spec.id, "metadata.json");
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.title).toBe("Test Spec");
      expect(parsed.status).toBe("draft");
    });
  });

  describe("approveSpec", () => {
    it("changes status to approved", async () => {
      const spec = await createSpec(projectRoot, {
        title: "Approve Me",
        projectId: "proj-1" as EntityId,
        type: "change",
        status: "draft",
        summary: "test",
        scope: [],
        nonGoals: [],
        acceptanceCriteria: [
          { id: "ac-1" as EntityId, description: "c1", status: "unverified" },
        ],
        verificationPlan: { checks: [], notes: [] },
      });

      const approved = await approveSpec(projectRoot, spec.id);
      expect(approved.status).toBe("approved");
      expect(approved.updatedAt).toBeTruthy();

      const filePath = join(tmpDir, ".prism", "specs", spec.id, "metadata.json");
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.status).toBe("approved");
    });

    it("throws when spec not found", async () => {
      await expect(approveSpec(projectRoot, "nonexistent" as EntityId)).rejects.toThrow(
        "Spec nonexistent not found",
      );
    });
  });

  describe("createPlan", () => {
    it("writes metadata to .prism/plans/<id>/metadata.json", async () => {
      const plan = await createPlan(projectRoot, {
        title: "Test Plan",
        projectId: "proj-1" as EntityId,
        specId: "spec-1" as EntityId,
        phases: [],
        risks: [],
        approvals: [],
        sequencingRationale: "test order",
      });

      expect(plan.id).toBeTruthy();
      const filePath = join(tmpDir, ".prism", "plans", plan.id, "metadata.json");
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.title).toBe("Test Plan");
      expect(parsed.specId).toBe("spec-1");
    });
  });

  describe("recordVerification", () => {
    it("writes to .prism/runs/<runId>/verification.json", async () => {
      const runId = "run-abc" as EntityId;
      const result = await recordVerification(projectRoot, {
        projectId: "proj-1" as EntityId,
        specId: "spec-1" as EntityId,
        runId,
        checksRun: ["lint", "test"],
        passed: true,
        failures: [],
        timestamp: new Date().toISOString(),
      });

      expect(result.id).toBeTruthy();
      const filePath = join(tmpDir, ".prism", "runs", runId, "verification.json");
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.passed).toBe(true);
      expect(parsed.runId).toBe(runId);
    });
  });

  describe("recordReview", () => {
    it("writes to .prism/reviews/<specId>/<reviewType>.json", async () => {
      const specId = "spec-review-1" as EntityId;
      const review = await recordReview(projectRoot, {
        projectId: "proj-1" as EntityId,
        specId,
        reviewType: "engineering",
        verdict: "pass",
        findings: [],
        summary: "Looks good",
      });

      expect(review.id).toBeTruthy();
      const filePath = join(tmpDir, ".prism", "reviews", specId, "engineering.json");
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.verdict).toBe("pass");
      expect(parsed.specId).toBe(specId);
      expect(parsed.reviewType).toBe("engineering");
    });
  });

  describe("recordReleaseState", () => {
    it("writes to .prism/release-state/<specId>/state.json", async () => {
      const specId = "spec-release-1" as EntityId;
      const state = await recordReleaseState(projectRoot, {
        projectId: "proj-1" as EntityId,
        specId,
        implementationComplete: true,
        reviewsComplete: true,
        verificationComplete: true,
        approvalsComplete: false,
        decision: "pending",
      });

      expect(state.id).toBeTruthy();
      const filePath = join(tmpDir, ".prism", "release-state", specId, "state.json");
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.decision).toBe("pending");
      expect(parsed.specId).toBe(specId);
    });
  });
});
