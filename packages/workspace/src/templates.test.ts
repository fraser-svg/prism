import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { ProjectTemplates } from "./templates";

describe("ProjectTemplates", () => {
  let tmpDir: string;
  let templatesDir: string;
  let templates: ProjectTemplates;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-templates-"));
    templatesDir = join(tmpDir, "templates");
    templates = new ProjectTemplates(templatesDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("saves a project as a template", async () => {
    const projDir = join(tmpDir, "source-project");
    await mkdir(join(projDir, ".prism", "memory"), { recursive: true });
    await writeFile(
      join(projDir, ".prism", "memory", "product.md"),
      "# Product\nTest product",
      "utf-8",
    );

    templates.saveAsTemplate(projDir, "my-template");

    const list = templates.listTemplates();
    expect(list).toContain("my-template");
  });

  it("lists available templates", async () => {
    const projDir = join(tmpDir, "source");
    await mkdir(join(projDir, ".prism", "memory"), { recursive: true });
    await writeFile(join(projDir, ".prism", "memory", "product.md"), "test", "utf-8");

    templates.saveAsTemplate(projDir, "template-a");
    templates.saveAsTemplate(projDir, "template-b");

    const list = templates.listTemplates();
    expect(list.sort()).toEqual(["template-a", "template-b"]);
  });

  it("returns empty array when no templates exist", () => {
    expect(templates.listTemplates()).toEqual([]);
  });

  it("creates project from template", async () => {
    const projDir = join(tmpDir, "source");
    await mkdir(join(projDir, ".prism", "memory"), { recursive: true });
    await writeFile(
      join(projDir, ".prism", "memory", "product.md"),
      "# Product\nOriginal",
      "utf-8",
    );

    templates.saveAsTemplate(projDir, "starter");

    const newDir = join(tmpDir, "new-project");
    templates.createFromTemplate("starter", newDir);

    expect(existsSync(join(newDir, ".prism", "memory", "product.md"))).toBe(
      true,
    );
  });

  it("rewrites paths in metadata.json files", async () => {
    const projDir = join(tmpDir, "source");
    await mkdir(join(projDir, ".prism", "memory"), { recursive: true });
    await writeFile(
      join(projDir, ".prism", "memory", "metadata.json"),
      JSON.stringify({ path: projDir + "/some/file" }),
      "utf-8",
    );

    templates.saveAsTemplate(projDir, "rewrite-test");

    const newDir = join(tmpDir, "new-project");
    templates.createFromTemplate("rewrite-test", newDir);

    const content = await readFile(
      join(newDir, ".prism", "memory", "metadata.json"),
      "utf-8",
    );
    const parsed = JSON.parse(content);
    expect(parsed.path).toBe(newDir + "/some/file");
  });

  it("throws when template name already exists", async () => {
    const projDir = join(tmpDir, "source");
    await mkdir(join(projDir, ".prism"), { recursive: true });

    templates.saveAsTemplate(projDir, "existing");

    expect(() => templates.saveAsTemplate(projDir, "existing")).toThrow(
      "already exists",
    );
  });

  it("throws when template not found", () => {
    expect(() =>
      templates.createFromTemplate("nonexistent", join(tmpDir, "new")),
    ).toThrow("not found");
  });

  it("throws when no .prism directory in source", async () => {
    const projDir = join(tmpDir, "no-prism");
    await mkdir(projDir);

    expect(() => templates.saveAsTemplate(projDir, "bad")).toThrow(
      "No .prism directory",
    );
  });
});
