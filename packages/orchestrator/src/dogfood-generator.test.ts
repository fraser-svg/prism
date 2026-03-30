/**
 * dogfood-generator.test.ts — Tests for DOGFOOD.md auto-generation from recurring patterns.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AbsolutePath,
  DogfoodIndex,
  LearningJournalPattern,
} from "@prism/core";
import { generateDogfoodEntries } from "./dogfood-generator";

describe("generateDogfoodEntries", () => {
  let tmpDir: string;
  let projectRoot: AbsolutePath;
  let dogfoodDir: string;
  let dogfoodPath: string;
  let indexPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-"));
    projectRoot = tmpDir as AbsolutePath;
    dogfoodDir = join(tmpDir, ".prism", "dogfood");
    dogfoodPath = join(tmpDir, "DOGFOOD.md");
    indexPath = join(dogfoodDir, "dogfood-index.json");
    await mkdir(dogfoodDir, { recursive: true });
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
  // 1. Creates DOGFOOD.md if it doesn't exist
  // -------------------------------------------------------------------------

  it("creates DOGFOOD.md if it doesn't exist", async () => {
    const patterns = [makePattern("guided_start")];
    const count = await generateDogfoodEntries(
      projectRoot,
      ["guided_start"],
      patterns,
    );

    expect(count).toBe(1);

    // Verify file was created
    await access(dogfoodPath);
    const content = await readFile(dogfoodPath, "utf-8");
    expect(content).toContain("# Prism Dogfood Feedback");
    expect(content).toContain("guided start");
    expect(content).toContain("## 1.");
    expect(content).toContain("OPEN");
  });

  // -------------------------------------------------------------------------
  // 2. Appends entries for newly recurring dimensions
  // -------------------------------------------------------------------------

  it("appends entries for newly recurring dimensions", async () => {
    // First entry
    const patterns1 = [makePattern("guided_start")];
    await generateDogfoodEntries(
      projectRoot,
      ["guided_start"],
      patterns1,
    );

    // Second entry (reset index to allow adding for new dimension)
    const index: DogfoodIndex = JSON.parse(
      await readFile(indexPath, "utf-8"),
    );
    // The first entry is for guided_start, we now add research_proof
    const patterns2 = [
      makePattern("guided_start"),
      makePattern("research_proof"),
    ];
    const count = await generateDogfoodEntries(
      projectRoot,
      ["research_proof"],
      patterns2,
    );

    expect(count).toBe(1);

    const content = await readFile(dogfoodPath, "utf-8");
    expect(content).toContain("## 1.");
    expect(content).toContain("## 2.");
    expect(content).toContain("research proof");
  });

  // -------------------------------------------------------------------------
  // 3. Dedup (8A): suppresses entry if OPEN entry exists for same dimension
  // -------------------------------------------------------------------------

  it("suppresses entry if OPEN entry exists for same dimension in index", async () => {
    // Create initial entry
    const patterns = [makePattern("guided_start")];
    await generateDogfoodEntries(
      projectRoot,
      ["guided_start"],
      patterns,
    );

    // Try to add the same dimension again
    const count = await generateDogfoodEntries(
      projectRoot,
      ["guided_start"],
      patterns,
    );

    expect(count).toBe(0);

    // Verify only one entry in index
    const index: DogfoodIndex = JSON.parse(
      await readFile(indexPath, "utf-8"),
    );
    expect(
      index.entries.filter((e) => e.dimension === "guided_start"),
    ).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 4. Entry numbering: finds highest existing number and increments
  // -------------------------------------------------------------------------

  it("finds highest existing number and increments", async () => {
    // Pre-populate DOGFOOD.md with existing entries
    const existingContent = `# Prism Dogfood Feedback

Collected during active use.

---

## 5. some existing issue (auto-detected 2026-01-01)

**What happened:** Some issue

**Expected:** Something better

**Severity:** medium

**Status:** OPEN (auto-detected by self-healing system)

## 10. another issue (auto-detected 2026-01-02)

**What happened:** Another issue

**Expected:** Fix it

**Severity:** high

**Status:** RESOLVED
`;
    await writeFile(dogfoodPath, existingContent);

    const patterns = [makePattern("stress_verification")];
    await generateDogfoodEntries(
      projectRoot,
      ["stress_verification"],
      patterns,
    );

    const content = await readFile(dogfoodPath, "utf-8");
    // Should start at 11 (highest existing is 10)
    expect(content).toContain("## 11.");
    expect(content).toContain("stress verification");
  });

  // -------------------------------------------------------------------------
  // 5. Index update: adds entries to dogfood-index.json
  // -------------------------------------------------------------------------

  it("adds entries to dogfood-index.json", async () => {
    const patterns = [
      makePattern("guided_start"),
      makePattern("research_proof"),
    ];

    await generateDogfoodEntries(
      projectRoot,
      ["guided_start", "research_proof"],
      patterns,
    );

    const index: DogfoodIndex = JSON.parse(
      await readFile(indexPath, "utf-8"),
    );

    expect(index.entries).toHaveLength(2);
    expect(index.entries[0]!.dimension).toBe("guided_start");
    expect(index.entries[0]!.dogfoodNumber).toBe(1);
    expect(index.entries[0]!.status).toBe("OPEN");
    expect(index.entries[0]!.createdAt).toBeTruthy();
    expect(index.entries[1]!.dimension).toBe("research_proof");
    expect(index.entries[1]!.dogfoodNumber).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Edge case: returns 0 when no newly recurring dimensions
  // -------------------------------------------------------------------------

  it("returns 0 when newlyRecurringDimensions is empty", async () => {
    const count = await generateDogfoodEntries(projectRoot, [], []);
    expect(count).toBe(0);

    // DOGFOOD.md should not exist
    let exists = true;
    try {
      await access(dogfoodPath);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
