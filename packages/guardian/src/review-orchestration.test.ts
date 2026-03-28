import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId } from "@prism/core";
import {
  getRequiredReviewMatrix,
  checkRequiredReviews,
} from "./review-orchestration";

describe("getRequiredReviewMatrix", () => {
  it("returns full matrix for product specs", () => {
    const types = getRequiredReviewMatrix("product");
    expect(types).toEqual(["planning", "engineering", "qa", "design", "ship_readiness"]);
  });

  it("returns engineering + qa for change specs", () => {
    const types = getRequiredReviewMatrix("change");
    expect(types).toEqual(["engineering", "qa"]);
  });

  it("returns engineering only for task specs", () => {
    const types = getRequiredReviewMatrix("task");
    expect(types).toEqual(["engineering"]);
  });
});

describe("checkRequiredReviews", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;
  const specId = "spec-review-1" as EntityId;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-review-test-"));
    projectRoot = tmpDir as AbsolutePath;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  async function writeReview(reviewType: string, verdict: string) {
    const reviewDir = join(tmpDir, ".prism", "reviews", specId);
    await mkdir(reviewDir, { recursive: true });
    await writeFile(
      join(reviewDir, `${reviewType}.json`),
      JSON.stringify({ verdict }),
    );
  }

  it("with no reviews -> all missing", async () => {
    const result = await checkRequiredReviews(specId, "change", projectRoot);
    expect(result.required).toEqual(["engineering", "qa"]);
    expect(result.present).toEqual([]);
    expect(result.passing).toEqual([]);
    expect(result.missing).toEqual(["engineering", "qa"]);
    expect(result.failing).toEqual([]);
    expect(result.holding).toEqual([]);
    expect(result.complete).toBe(false);
  });

  it("with some reviews passing -> partial", async () => {
    await writeReview("engineering", "pass");

    const result = await checkRequiredReviews(specId, "change", projectRoot);
    expect(result.present).toEqual(["engineering"]);
    expect(result.passing).toEqual(["engineering"]);
    expect(result.missing).toEqual(["qa"]);
    expect(result.complete).toBe(false);
  });

  it("with all reviews passing -> complete=true", async () => {
    await writeReview("engineering", "pass");
    await writeReview("qa", "pass");

    const result = await checkRequiredReviews(specId, "change", projectRoot);
    expect(result.present).toEqual(["engineering", "qa"]);
    expect(result.passing).toEqual(["engineering", "qa"]);
    expect(result.missing).toEqual([]);
    expect(result.failing).toEqual([]);
    expect(result.holding).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("with a failing review -> complete=false", async () => {
    await writeReview("engineering", "fail");
    await writeReview("qa", "pass");

    const result = await checkRequiredReviews(specId, "change", projectRoot);
    expect(result.present).toEqual(["engineering", "qa"]);
    expect(result.passing).toEqual(["qa"]);
    expect(result.failing).toEqual(["engineering"]);
    expect(result.complete).toBe(false);
  });

  it("with a hold verdict -> complete=false", async () => {
    await writeReview("engineering", "hold");
    await writeReview("qa", "pass");

    const result = await checkRequiredReviews(specId, "change", projectRoot);
    expect(result.present).toEqual(["engineering", "qa"]);
    expect(result.passing).toEqual(["qa"]);
    expect(result.holding).toEqual(["engineering"]);
    expect(result.complete).toBe(false);
  });

  it("handles corrupt review JSON gracefully", async () => {
    const reviewDir = join(tmpDir, ".prism", "reviews", specId);
    await mkdir(reviewDir, { recursive: true });
    await writeFile(join(reviewDir, "engineering.json"), "not json{{{");

    const result = await checkRequiredReviews(specId, "task", projectRoot);
    expect(result.present).toEqual(["engineering"]);
    expect(result.passing).toEqual([]);
    expect(result.complete).toBe(false);
  });
});
