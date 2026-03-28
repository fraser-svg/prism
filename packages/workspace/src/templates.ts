import {
  existsSync,
  mkdirSync,
  readdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export class ProjectTemplates {
  constructor(private templatesDir: string) {}

  saveAsTemplate(
    projectRoot: string,
    templateName: string,
  ): void {
    const absRoot = resolve(projectRoot);
    const prismDir = join(absRoot, ".prism");

    if (!existsSync(prismDir)) {
      throw new Error(`No .prism directory found at ${absRoot}`);
    }

    const templateDir = join(this.templatesDir, templateName);
    if (existsSync(templateDir)) {
      throw new Error(
        `Template "${templateName}" already exists. Remove it first.`,
      );
    }

    mkdirSync(templateDir, { recursive: true });

    // Copy .prism/memory/ if it exists
    const memoryDir = join(prismDir, "memory");
    if (existsSync(memoryDir)) {
      cpSync(memoryDir, join(templateDir, "memory"), { recursive: true });
    }

    // Copy config.json if it exists
    const configFile = join(prismDir, "config.json");
    if (existsSync(configFile)) {
      cpSync(configFile, join(templateDir, "config.json"));
    }

    // Store source path for path rewriting
    writeFileSync(
      join(templateDir, ".template-meta.json"),
      JSON.stringify({ sourceRoot: absRoot }, null, 2) + "\n",
      "utf-8",
    );
  }

  listTemplates(): string[] {
    if (!existsSync(this.templatesDir)) return [];

    return readdirSync(this.templatesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  createFromTemplate(
    templateName: string,
    newProjectRoot: string,
  ): void {
    const templateDir = join(this.templatesDir, templateName);
    if (!existsSync(templateDir)) {
      throw new Error(`Template "${templateName}" not found`);
    }

    const absNewRoot = resolve(newProjectRoot);
    const targetPrismDir = join(absNewRoot, ".prism");

    if (existsSync(targetPrismDir)) {
      throw new Error(`.prism directory already exists at ${absNewRoot}`);
    }

    // Read source root for path rewriting
    const metaFile = join(templateDir, ".template-meta.json");
    let sourceRoot: string | null = null;
    if (existsSync(metaFile)) {
      const meta = JSON.parse(readFileSync(metaFile, "utf-8")) as {
        sourceRoot: string;
      };
      sourceRoot = meta.sourceRoot;
    }

    // Copy to temp dir first for atomicity
    const tempDir = join(tmpdir(), `prism-template-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });

    // Copy template contents (excluding meta file)
    const entries = readdirSync(templateDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".template-meta.json") continue;
      const src = join(templateDir, entry.name);
      const dest = join(tempDir, entry.name);
      cpSync(src, dest, { recursive: true });
    }

    // Rewrite paths in metadata.json files only
    if (sourceRoot) {
      this.rewritePaths(tempDir, sourceRoot, absNewRoot);
    }

    // Atomically move to target
    mkdirSync(absNewRoot, { recursive: true });
    cpSync(tempDir, targetPrismDir, { recursive: true });

    // Cleanup temp
    try {
      rmSync(tempDir, { recursive: true });
    } catch {
      // Best-effort cleanup
    }
  }

  private rewritePaths(
    dir: string,
    oldRoot: string,
    newRoot: string,
  ): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        this.rewritePaths(fullPath, oldRoot, newRoot);
      } else if (entry.name === "metadata.json") {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const rewritten = content.replaceAll(oldRoot, newRoot);
          if (rewritten !== content) {
            writeFileSync(fullPath, rewritten, "utf-8");
          }
        } catch {
          // Skip files that can't be read/written
        }
      }
    }
  }
}
