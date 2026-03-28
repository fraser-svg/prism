import type { AbsolutePath, Checkpoint, EntityId } from "@prism/core";
import { mkdir, readFile, readdir, writeFile, copyFile, access } from "node:fs/promises";
import { checkpointPaths } from "./paths";

export class CheckpointRepository {
  private paths: ReturnType<typeof checkpointPaths>;

  constructor(projectRoot: AbsolutePath) {
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
    // Check if the current latest checkpoint matches the specId
    const latest = await this.readLatest();
    if (latest?.activeSpecId === specId) return latest;

    // Scan history for the most recent checkpoint matching this specId
    try {
      const files = await readdir(this.paths.historyDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();
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
    } catch {
      // History dir may not exist
    }

    return null;
  }

  async write(checkpoint: Checkpoint, markdown: string): Promise<void> {
    await mkdir(this.paths.checkpointsDir, { recursive: true });

    // Archive current latest to history if it exists
    const hasExisting = await this.exists();
    if (hasExisting) {
      await mkdir(this.paths.historyDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await copyFile(
        this.paths.latestJson,
        `${this.paths.historyDir}/${timestamp}.json` as AbsolutePath
      );
      // Markdown archive is best-effort (may not exist)
      try {
        await copyFile(
          this.paths.latestMarkdown,
          `${this.paths.historyDir}/${timestamp}.md` as AbsolutePath
        );
      } catch {
        // Markdown file may not exist — that's fine
      }
    }

    await writeFile(
      this.paths.latestJson,
      JSON.stringify(checkpoint, null, 2) + "\n",
      "utf-8"
    );
    await writeFile(this.paths.latestMarkdown, markdown, "utf-8");
  }
}

export function createCheckpointRepository(projectRoot: AbsolutePath) {
  return new CheckpointRepository(projectRoot);
}
