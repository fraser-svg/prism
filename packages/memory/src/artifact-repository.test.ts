import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId } from "@prism/core";
import { JsonArtifactRepository } from "./json-artifact-repository";
import { CompositeArtifactRepository } from "./composite-artifact-repository";

interface TestEntity {
  name: string;
  value: number;
}

describe("JsonArtifactRepository", () => {
  let tmpDir: string;
  let repo: JsonArtifactRepository<TestEntity>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-json-"));
    repo = new JsonArtifactRepository<TestEntity>(
      (id: EntityId) => ({
        dir: join(tmpDir, "items", id) as AbsolutePath,
        file: join(tmpDir, "items", id, "data.json") as AbsolutePath,
      }),
      () => join(tmpDir, "items") as AbsolutePath,
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("returns false for exists on missing entity", async () => {
    expect(await repo.exists("missing-id" as EntityId)).toBe(false);
  });

  it("returns null for read on missing entity", async () => {
    expect(await repo.read("missing-id" as EntityId)).toBeNull();
  });

  it("writes and reads an entity", async () => {
    const entity: TestEntity = { name: "test", value: 42 };
    await repo.write("item-1" as EntityId, entity);

    const result = await repo.read("item-1" as EntityId);
    expect(result).toEqual(entity);
  });

  it("returns true for exists after write", async () => {
    await repo.write("item-1" as EntityId, { name: "test", value: 1 });
    expect(await repo.exists("item-1" as EntityId)).toBe(true);
  });

  it("lists entities as directory names", async () => {
    await repo.write("alpha" as EntityId, { name: "a", value: 1 });
    await repo.write("beta" as EntityId, { name: "b", value: 2 });

    const ids = await repo.list();
    expect(ids.sort()).toEqual(["alpha", "beta"]);
  });

  it("returns empty array when listing nonexistent directory", async () => {
    const ids = await repo.list();
    expect(ids).toEqual([]);
  });

  it("deletes an entity", async () => {
    await repo.write("item-1" as EntityId, { name: "test", value: 1 });
    await repo.delete("item-1" as EntityId);

    expect(await repo.exists("item-1" as EntityId)).toBe(false);
    expect(await repo.read("item-1" as EntityId)).toBeNull();
  });

  it("delete on missing entity is a no-op", async () => {
    await expect(repo.delete("nonexistent" as EntityId)).resolves.toBeUndefined();
  });

  it("throws on corrupt JSON", async () => {
    const dir = join(tmpDir, "items", "corrupt");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "data.json"), "not-json{{{", "utf-8");

    await expect(repo.read("corrupt" as EntityId)).rejects.toThrow("Failed to read artifact");
  });

  it("throws on invalid entity ID with path traversal", async () => {
    await expect(repo.read("../etc/passwd" as EntityId)).rejects.toThrow("Invalid entity ID");
  });

  it("writes valid JSON with trailing newline", async () => {
    await repo.write("item-1" as EntityId, { name: "test", value: 1 });
    const raw = await readFile(join(tmpDir, "items", "item-1", "data.json"), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(JSON.parse(raw)).toEqual({ name: "test", value: 1 });
  });
});

describe("CompositeArtifactRepository", () => {
  let tmpDir: string;
  let repo: CompositeArtifactRepository<TestEntity>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-composite-"));
    repo = new CompositeArtifactRepository<TestEntity>(
      (id: EntityId) => ({
        dir: join(tmpDir, "composites", id) as AbsolutePath,
        metadataFile: join(tmpDir, "composites", id, "metadata.json") as AbsolutePath,
      }),
      () => join(tmpDir, "composites") as AbsolutePath,
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("returns false for exists on missing entity", async () => {
    expect(await repo.exists("missing-id" as EntityId)).toBe(false);
  });

  it("returns null for readMetadata on missing entity", async () => {
    expect(await repo.readMetadata("missing-id" as EntityId)).toBeNull();
  });

  it("writes and reads metadata", async () => {
    const entity: TestEntity = { name: "composite", value: 99 };
    await repo.writeMetadata("comp-1" as EntityId, entity);

    const result = await repo.readMetadata("comp-1" as EntityId);
    expect(result).toEqual(entity);
  });

  it("returns true for exists after writeMetadata", async () => {
    await repo.writeMetadata("comp-1" as EntityId, { name: "test", value: 1 });
    expect(await repo.exists("comp-1" as EntityId)).toBe(true);
  });

  it("writes and reads file slots", async () => {
    await repo.writeFile("comp-1" as EntityId, "spec.md", "# My Spec\n");
    const content = await repo.readFile("comp-1" as EntityId, "spec.md");
    expect(content).toBe("# My Spec\n");
  });

  it("returns null for readFile on missing slot", async () => {
    await repo.writeMetadata("comp-1" as EntityId, { name: "test", value: 1 });
    expect(await repo.readFile("comp-1" as EntityId, "nonexistent.md")).toBeNull();
  });

  it("lists entities as directory names", async () => {
    await repo.writeMetadata("alpha" as EntityId, { name: "a", value: 1 });
    await repo.writeMetadata("beta" as EntityId, { name: "b", value: 2 });

    const ids = await repo.list();
    expect(ids.sort()).toEqual(["alpha", "beta"]);
  });

  it("returns empty array when listing nonexistent directory", async () => {
    const ids = await repo.list();
    expect(ids).toEqual([]);
  });

  it("deletes an entity and all its files", async () => {
    await repo.writeMetadata("comp-1" as EntityId, { name: "test", value: 1 });
    await repo.writeFile("comp-1" as EntityId, "spec.md", "content");
    await repo.delete("comp-1" as EntityId);

    expect(await repo.exists("comp-1" as EntityId)).toBe(false);
    expect(await repo.readMetadata("comp-1" as EntityId)).toBeNull();
    expect(await repo.readFile("comp-1" as EntityId, "spec.md")).toBeNull();
  });

  it("delete on missing entity is a no-op", async () => {
    await expect(repo.delete("nonexistent" as EntityId)).resolves.toBeUndefined();
  });

  it("throws on corrupt metadata JSON", async () => {
    const dir = join(tmpDir, "composites", "corrupt");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "metadata.json"), "{{bad json", "utf-8");

    await expect(repo.readMetadata("corrupt" as EntityId)).rejects.toThrow("Failed to read metadata");
  });

  it("throws on invalid entity ID with path traversal", async () => {
    await expect(repo.readMetadata("../etc/passwd" as EntityId)).rejects.toThrow("Invalid entity ID");
  });
});
