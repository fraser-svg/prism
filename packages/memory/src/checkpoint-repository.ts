import type { AbsolutePath, Checkpoint, EntityId } from "@prism/core";
import { mkdir, readFile, readdir, writeFile, copyFile, access } from "node:fs/promises";
import type { ArtifactWriteCallback } from "./contracts";
import { checkpointPaths } from "./paths";

export class CheckpointRepository {
  private paths: ReturnType<typeof checkpointPaths>;

  constructor(projectRoot: AbsolutePath, private onWrite?: ArtifactWriteCallback) {
    this.paths = checkpointPaths(projectRoot);
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.paths.latestJson);
      return true;
    } catch {
      return false;
    }
  }

  async readLatest(): Promise<Checkpoint | null> {
    try {
      const content = await readFile(this.paths.latestJson, "utf-8");
      return JSON.parse(content) as Checkpoint;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(
        `Failed to read checkpoint at ${this.paths.latestJson}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async readLatestMarkdown(): Promise<string | null> {
    try {
      return await readFile(this.paths.latestMarkdown, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(
        `Failed to read checkpoint markdown at ${this.paths.latestMarkdown}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async readLatestForSpec(specId: EntityId): Promise<Checkpoint | null> {
    const latest = await this.readLatest();
    if (latest?.activeSpecId === specId) return latest;

    // Read history directory once and use for both fast and slow paths
    let historyFiles: string[];
    try {
      historyFiles = await readdir(this.paths.historyDir);
    } catch {
      // History dir may not exist
      return null;
    }

    // Fast path: indexed files with specId prefix
    const indexed = historyFiles
      .filter((f) => f.startsWith(`${specId}--`) && f.endsWith(".json"))
      .sort()
      .reverse();
    for (const file of indexed) {
      try {
        const content = await readFile(
          `${this.paths.historyDir}/${file}`,
          "utf-8",
        );
        return JSON.parse(content) as Checkpoint;
      } catch {
        continue; // Corrupted file — try next most recent
      }
    }

    // Slow fallback: scan non-indexed files (backward compat with pre-index checkpoints)
    const jsonFiles = historyFiles.filter((f) => f.endsWith(".json") && !f.includes("--")).sort().reverse();
    for (const file of jsonFiles) {
      try {
        const content = await readFile(
          `${this.paths.historyDir}/${file}`,
          "utf-8",
        );
        const checkpoint = JSON.parse(content) as Checkpoint;
        if (checkpoint.activeSpecId === specId) return checkpoint;
      } catch {
        continue;
      }
    }

    return null;
  }

  async write(checkpoint: Checkpoint, markdown: string): Promise<void> {
    await mkdir(this.paths.checkpointsDir, { recursive: true });

    const hasExisting = await this.exists();
    if (hasExisting) {
      await mkdir(this.paths.historyDir, { recursive: true });

      // Read EXISTING checkpoint's specId for indexed filename (not the new one)
      let existingSpecId = "no-spec";
      try {
        const existingContent = await readFile(this.paths.latestJson, "utf-8");
        const parsed = JSON.parse(existingContent) as Checkpoint;
        existingSpecId = parsed.activeSpecId ?? "no-spec";
      } catch { /* first checkpoint or corrupted — use fallback prefix */ }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await copyFile(
        this.paths.latestJson,
        `${this.paths.historyDir}/${existingSpecId}--${timestamp}.json` as AbsolutePath
      );
      try {
        await copyFile(
          this.paths.latestMarkdown,
          `${this.paths.historyDir}/${existingSpecId}--${timestamp}.md` as AbsolutePath
        );
      } catch {
        // Markdown file may not exist — that's fine
      }
    }

    const content = JSON.stringify(checkpoint, null, 2) + "\n";
    await writeFile(this.paths.latestJson, content, "utf-8");
    await writeFile(this.paths.latestMarkdown, markdown, "utf-8");

    if (this.onWrite) {
      try {
        this.onWrite({
          action: "write",
          entityType: "checkpoint",
          entityId: checkpoint.id,
          projectId: checkpoint.projectId,
          contentPreview: markdown.slice(0, 500),
        });
      } catch {
        // Callback failure is non-fatal
      }
    }
  }
}

export function createCheckpointRepository(projectRoot: AbsolutePath, onWrite?: ArtifactWriteCallback) {
  return new CheckpointRepository(projectRoot, onWrite);
}
