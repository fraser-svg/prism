import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceContext } from "./workspace-manager";
import { ClientRepository } from "./client-repository";

describe("ClientRepository", () => {
  let tmpDir: string;
  let ctx: WorkspaceContext;
  let repo: ClientRepository;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-clients-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    ctx = WorkspaceManager.initialize(home);
    repo = new ClientRepository(ctx.db.inner);
  });

  afterEach(async () => {
    ctx.db.close();
    await rm(tmpDir, { recursive: true });
  });

  it("creates a client with name and slug", () => {
    const client = repo.create("Acme Corp");
    expect(client.name).toBe("Acme Corp");
    expect(client.slug).toBe("acme-corp");
    expect(client.status).toBe("active");
    expect(client.notes).toBeNull();
    expect(client.id).toBeTruthy();
  });

  it("creates a client with notes", () => {
    const client = repo.create("Globex", "Monorail project");
    expect(client.notes).toBe("Monorail project");
  });

  it("lists active clients sorted by name", () => {
    repo.create("Zebra Co");
    repo.create("Acme Corp");
    repo.create("Beta LLC");

    const list = repo.list();
    expect(list.map((c) => c.name)).toEqual(["Acme Corp", "Beta LLC", "Zebra Co"]);
  });

  it("get returns null for unknown id", () => {
    expect(repo.get("does-not-exist")).toBeNull();
  });

  it("update changes name and notes", () => {
    const original = repo.create("Old Name");
    const updated = repo.update(original.id, { name: "New Name", notes: "Added note" });
    expect(updated?.name).toBe("New Name");
    expect(updated?.notes).toBe("Added note");
  });

  it("update returns null for unknown id", () => {
    expect(repo.update("ghost-id", { name: "X" })).toBeNull();
  });

  it("archive removes client from active list but not includeArchived list", () => {
    const client = repo.create("To Archive");
    repo.archive(client.id);

    expect(repo.list()).toHaveLength(0);
    expect(repo.list({ includeArchived: true })).toHaveLength(1);
  });

  it("deduplicates slugs for same-named clients", () => {
    const a = repo.create("Acme");
    const b = repo.create("Acme");
    expect(a.slug).toBe("acme");
    expect(b.slug).toBe("acme-2");
  });
});
