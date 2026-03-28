import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, Checkpoint, EntityId } from "@prism/core";
import { CheckpointRepository } from "./checkpoint-repository";

let tmpDir: string;
let projectRoot: AbsolutePath;

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: `cp-${Date.now()}` as EntityId,
    phase: "execute",
    activeSpecId: "spec-1" as EntityId,
    progressSummary: "test",
    blockers: [],
    keyDecisions: [],
    nextRecommendedActions: [],
    approvalsPending: [],
    ...overrides,
  } as Checkpoint;
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "prism-cp-test-"));
  projectRoot = tmpDir as AbsolutePath;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("CheckpointRepository", () => {
  describe("write with indexed filenames", () => {
    it("archives using existing checkpoint's specId for filename prefix", async () => {
      const repo = new CheckpointRepository(projectRoot);

      // Write first checkpoint with specId "spec-A"
      const cp1 = makeCheckpoint({ activeSpecId: "spec-A" as EntityId });
      await repo.write(cp1, "# Checkpoint 1");

      // Write second checkpoint with specId "spec-B" — should archive cp1 under "spec-A--" prefix
      const cp2 = makeCheckpoint({ activeSpecId: "spec-B" as EntityId });
      await repo.write(cp2, "# Checkpoint 2");

      const historyDir = join(tmpDir, ".prism", "checkpoints", "history");
      const files = await readdir(historyDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      expect(jsonFiles.length).toBe(1);
      expect(jsonFiles[0]).toMatch(/^spec-A--.*\.json$/);

      // Verify archived content is cp1's data
      const content = JSON.parse(
        await readFile(join(historyDir, jsonFiles[0]!), "utf-8"),
      ) as Checkpoint;
      expect(content.activeSpecId).toBe("spec-A");
    });

    it("uses 'no-spec' prefix when existing checkpoint has null specId", async () => {
      const repo = new CheckpointRepository(projectRoot);

      // Write checkpoint with null specId
      const cp1 = makeCheckpoint({ activeSpecId: null as unknown as EntityId });
      await repo.write(cp1, "# Checkpoint 1");

      // Write second to trigger archive
      const cp2 = makeCheckpoint({ activeSpecId: "spec-X" as EntityId });
      await repo.write(cp2, "# Checkpoint 2");

      const historyDir = join(tmpDir, ".prism", "checkpoints", "history");
      const files = await readdir(historyDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      expect(jsonFiles[0]).toMatch(/^no-spec--.*\.json$/);
    });
  });

  describe("readLatestForSpec with indexed files", () => {
    it("finds checkpoint via indexed filename (fast path)", async () => {
      const repo = new CheckpointRepository(projectRoot);

      // Write two checkpoints: spec-A then spec-B
      const cp1 = makeCheckpoint({ activeSpecId: "spec-A" as EntityId });
      await repo.write(cp1, "# CP1");
      const cp2 = makeCheckpoint({ activeSpecId: "spec-B" as EntityId });
      await repo.write(cp2, "# CP2");

      // Latest is spec-B. Reading spec-A should find it in history via index
      const result = await repo.readLatestForSpec("spec-A" as EntityId);
      expect(result).not.toBeNull();
      expect(result!.activeSpecId).toBe("spec-A");
    });

    it("returns null when specId has no matches", async () => {
      const repo = new CheckpointRepository(projectRoot);

      const cp1 = makeCheckpoint({ activeSpecId: "spec-A" as EntityId });
      await repo.write(cp1, "# CP1");

      const result = await repo.readLatestForSpec("spec-nonexistent" as EntityId);
      expect(result).toBeNull();
    });

    it("falls back to full scan for pre-index checkpoints", async () => {
      const repo = new CheckpointRepository(projectRoot);

      // Manually create a non-indexed checkpoint in history (legacy format)
      const historyDir = join(tmpDir, ".prism", "checkpoints", "history");
      await mkdir(historyDir, { recursive: true });
      const legacyCp = makeCheckpoint({ activeSpecId: "spec-legacy" as EntityId });
      await writeFile(
        join(historyDir, "2026-03-28T00-00-00-000Z.json"),
        JSON.stringify(legacyCp),
        "utf-8",
      );

      // Write a current checkpoint with different specId
      const cp = makeCheckpoint({ activeSpecId: "spec-current" as EntityId });
      await repo.write(cp, "# Current");

      // Should find legacy checkpoint via fallback scan
      const result = await repo.readLatestForSpec("spec-legacy" as EntityId);
      expect(result).not.toBeNull();
      expect(result!.activeSpecId).toBe("spec-legacy");
    });

    it("returns latest checkpoint directly when specId matches", async () => {
      const repo = new CheckpointRepository(projectRoot);

      const cp = makeCheckpoint({ activeSpecId: "spec-direct" as EntityId });
      await repo.write(cp, "# Direct");

      const result = await repo.readLatestForSpec("spec-direct" as EntityId);
      expect(result).not.toBeNull();
      expect(result!.activeSpecId).toBe("spec-direct");
    });
  });

  describe("readLatest (no regression)", () => {
    it("returns null when no checkpoint exists", async () => {
      const repo = new CheckpointRepository(projectRoot);
      const result = await repo.readLatest();
      expect(result).toBeNull();
    });

    it("returns the most recent checkpoint", async () => {
      const repo = new CheckpointRepository(projectRoot);
      const cp = makeCheckpoint({ phase: "verify" });
      await repo.write(cp, "# Verify");

      const result = await repo.readLatest();
      expect(result).not.toBeNull();
      expect(result!.phase).toBe("verify");
    });
  });
});
