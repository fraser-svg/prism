/**
 * prescription-manager.test.ts — Tests for prescription lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AbsolutePath,
  EntityId,
  LearningJournalPattern,
  Prescription,
} from "@prism/core";
import {
  createPrescription,
  readActivePrescriptions,
  checkPrescriptionResolution,
  dismissPrescription,
} from "./prescription-manager";

describe("prescription-manager", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;
  let prescriptionsDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-"));
    projectRoot = tmpDir as AbsolutePath;
    prescriptionsDir = join(tmpDir, ".prism", "dogfood", "prescriptions");
    await mkdir(prescriptionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makePattern(
    dimension: string,
    overrides: Partial<LearningJournalPattern> = {},
  ): LearningJournalPattern {
    return {
      dimension,
      trend: "stable",
      avgScore: 3,
      occurrences: 4,
      recurring: true,
      firstRecurringAt: new Date().toISOString(),
      detail: `Score <= 5 in 4/5 sessions`,
      recentScores: [3, 4, 2, 5, 3],
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // 1. Create prescription
  // -------------------------------------------------------------------------

  it("creates prescription JSON file from pattern", async () => {
    const pattern = makePattern("guided_start");
    const prescription = await createPrescription(projectRoot, pattern);

    expect(prescription.schemaVersion).toBe(1);
    expect(prescription.id).toBeTruthy();
    expect(prescription.dimension).toBe("guided_start");
    expect(prescription.status).toBe("active");
    expect(prescription.resolvedAt).toBeNull();
    expect(prescription.prescription).toContain("IntakeBrief");
    expect(prescription.basedOnSessions).toBe(4);

    // Verify file on disk
    const files = await readdir(prescriptionsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    expect(jsonFiles).toHaveLength(1);
    expect(jsonFiles[0]).toContain("guided_start");

    const onDisk = JSON.parse(
      await readFile(join(prescriptionsDir, jsonFiles[0]!), "utf-8"),
    );
    expect(onDisk.dimension).toBe("guided_start");
  });

  // -------------------------------------------------------------------------
  // 2. Read active prescriptions: sorted by severity, max 3
  // -------------------------------------------------------------------------

  it("returns only active prescriptions, sorted by severity, max 3", async () => {
    // Create 4 prescriptions with different severities
    await createPrescription(
      projectRoot,
      makePattern("guided_start", { occurrences: 4 }),
    ); // medium
    await createPrescription(
      projectRoot,
      makePattern("research_proof", { occurrences: 6 }),
    ); // high
    await createPrescription(
      projectRoot,
      makePattern("stress_verification", { occurrences: 10 }),
    ); // critical
    await createPrescription(
      projectRoot,
      makePattern("evidence_quality", { occurrences: 3 }),
    ); // medium

    const active = await readActivePrescriptions(projectRoot);

    expect(active).toHaveLength(3);
    expect(active[0]!.severity).toBe("critical");
    expect(active[1]!.severity).toBe("high");
    expect(active[2]!.severity).toBe("medium");
  });

  // -------------------------------------------------------------------------
  // 3. Resolution: resolves after 3 consecutive >= 7
  // -------------------------------------------------------------------------

  it("resolves prescription after 3 consecutive scores >= 7", async () => {
    await createPrescription(
      projectRoot,
      makePattern("guided_start", { occurrences: 4 }),
    );

    const patterns: LearningJournalPattern[] = [
      makePattern("guided_start", {
        recentScores: [3, 4, 8, 9, 7],
      }),
    ];

    const resolved = await checkPrescriptionResolution(
      projectRoot,
      patterns,
    );

    expect(resolved).toContain("guided_start");

    // Verify the file was updated
    const active = await readActivePrescriptions(projectRoot);
    expect(active.filter((p) => p.dimension === "guided_start")).toHaveLength(
      0,
    );
  });

  it("does not resolve when consecutive streak is < 3", async () => {
    await createPrescription(
      projectRoot,
      makePattern("guided_start", { occurrences: 4 }),
    );

    const patterns: LearningJournalPattern[] = [
      makePattern("guided_start", {
        recentScores: [3, 4, 8, 9, 3],
      }),
    ];

    const resolved = await checkPrescriptionResolution(
      projectRoot,
      patterns,
    );

    expect(resolved).not.toContain("guided_start");
  });

  // -------------------------------------------------------------------------
  // 4. Null transparency (10A): nulls don't break consecutive streak
  // -------------------------------------------------------------------------

  it("nulls in recentScores are transparent and don't break consecutive streak", async () => {
    await createPrescription(
      projectRoot,
      makePattern("guided_start", { occurrences: 4 }),
    );

    const patterns: LearningJournalPattern[] = [
      makePattern("guided_start", {
        // nulls are filtered out, leaving [8, 9, 7] which is 3 consecutive >= 7
        recentScores: [null, 8, null, 9, 7],
      }),
    ];

    const resolved = await checkPrescriptionResolution(
      projectRoot,
      patterns,
    );

    expect(resolved).toContain("guided_start");
  });

  // -------------------------------------------------------------------------
  // 5. Dismiss
  // -------------------------------------------------------------------------

  it("dismisses prescription with status and timestamp", async () => {
    const prescription = await createPrescription(
      projectRoot,
      makePattern("guided_start"),
    );

    const result = await dismissPrescription(projectRoot, prescription.id);
    expect(result).toBe(true);

    // Verify it's no longer in active list
    const active = await readActivePrescriptions(projectRoot);
    expect(active.filter((p) => p.id === prescription.id)).toHaveLength(0);

    // Verify the file was updated with dismissed status
    const files = await readdir(prescriptionsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const onDisk = JSON.parse(
      await readFile(join(prescriptionsDir, jsonFiles[0]!), "utf-8"),
    ) as Prescription;
    expect(onDisk.status).toBe("dismissed");
    expect(onDisk.dismissedAt).toBeTruthy();
  });

  it("returns false when dismissing non-existent prescription", async () => {
    const result = await dismissPrescription(projectRoot, "nonexistent-id");
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. Severity mapping
  // -------------------------------------------------------------------------

  it("maps 3-4 occurrences to medium severity", async () => {
    const p = await createPrescription(
      projectRoot,
      makePattern("guided_start", { occurrences: 3 }),
    );
    expect(p.severity).toBe("medium");

    const p2 = await createPrescription(
      projectRoot,
      makePattern("research_proof", { occurrences: 4 }),
    );
    expect(p2.severity).toBe("medium");
  });

  it("maps 5-7 occurrences to high severity", async () => {
    const p = await createPrescription(
      projectRoot,
      makePattern("guided_start", { occurrences: 5 }),
    );
    expect(p.severity).toBe("high");

    const p2 = await createPrescription(
      projectRoot,
      makePattern("research_proof", { occurrences: 7 }),
    );
    expect(p2.severity).toBe("high");
  });

  it("maps 8+ occurrences to critical severity", async () => {
    const p = await createPrescription(
      projectRoot,
      makePattern("guided_start", { occurrences: 8 }),
    );
    expect(p.severity).toBe("critical");

    const p2 = await createPrescription(
      projectRoot,
      makePattern("research_proof", { occurrences: 15 }),
    );
    expect(p2.severity).toBe("critical");
  });
});
