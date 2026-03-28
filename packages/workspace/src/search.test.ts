import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceContext } from "./workspace-manager";
import { ArtifactSearch } from "./search";

describe("ArtifactSearch", () => {
  let tmpDir: string;
  let ctx: WorkspaceContext;
  let search: ArtifactSearch;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-search-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    ctx = WorkspaceManager.initialize(home);
    search = new ArtifactSearch(ctx.db.inner);

    // Insert test projects
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-1", "Project Alpha", "project-alpha", "/tmp/proj-alpha");
    ctx.db.inner
      .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
      .run("proj-2", "Project Beta", "project-beta", "/tmp/proj-beta");
  });

  afterEach(async () => {
    ctx.db.close();
    await rm(tmpDir, { recursive: true });
  });

  it("finds indexed artifacts by title", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Login Feature",
      contentPreview: "Users should be able to login with email",
    });

    const results = search.search("login");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Login Feature");
    expect(results[0].projectName).toBe("Project Alpha");
  });

  it("finds artifacts by content preview", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Auth Feature",
      contentPreview: "Password reset flow with email verification",
    });

    const results = search.search("verification");
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe("spec-1");
  });

  it("returns results from multiple projects", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Auth Login",
    });
    search.upsertIndex({
      projectId: "proj-2",
      entityType: "spec",
      entityId: "spec-2",
      title: "OAuth Login",
    });

    const results = search.search("login");
    expect(results).toHaveLength(2);
    const projectNames = results.map((r) => r.projectName).sort();
    expect(projectNames).toEqual(["Project Alpha", "Project Beta"]);
  });

  it("returns empty array for empty query", () => {
    expect(search.search("")).toEqual([]);
    expect(search.search("   ")).toEqual([]);
  });

  it("returns empty array when no matches", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Login Feature",
    });

    const results = search.search("nonexistent");
    expect(results).toHaveLength(0);
  });

  it("handles FTS special characters in user input", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Test Feature",
    });

    // Quotes in user input should be stripped safely
    const results = search.search('"test"');
    expect(results).toHaveLength(1);
  });

  it("handles FTS operators (OR, AND, NOT, NEAR, *) in user input", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Auth Feature",
      contentPreview: "Login with authentication",
    });

    // Wildcard should be stripped, not treated as FTS operator
    expect(() => search.search("auth*")).not.toThrow();
    // OR/AND/NOT should be stripped
    expect(() => search.search("login OR signup")).not.toThrow();
    expect(() => search.search("NOT test")).not.toThrow();
    // Parentheses should be stripped
    expect(() => search.search("(auth)")).not.toThrow();
  });

  it("excludes archived projects from results", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Search Feature",
    });

    // Archive the project
    ctx.db.inner
      .prepare("UPDATE projects SET status = 'archived' WHERE id = ?")
      .run("proj-1");

    const results = search.search("search");
    expect(results).toHaveLength(0);
  });

  it("upsert updates existing index entry", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Old Title",
    });
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "New Title",
    });

    const results = search.search("new");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("New Title");

    // Old title should not match
    const oldResults = search.search("old");
    expect(oldResults).toHaveLength(0);
  });

  it("removeIndex deletes from search", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Removable Feature",
    });

    search.removeIndex("proj-1", "spec", "spec-1");

    const results = search.search("removable");
    expect(results).toHaveLength(0);
  });

  it("AND semantics — multi-word query requires all tokens", () => {
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-1",
      title: "Login Feature",
      contentPreview: "Users authenticate via email",
    });
    search.upsertIndex({
      projectId: "proj-1",
      entityType: "spec",
      entityId: "spec-2",
      title: "Payment Feature",
      contentPreview: "Users pay via credit card",
    });

    // "login" + "email" should only match spec-1
    const results = search.search("login email");
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe("spec-1");
  });
});
