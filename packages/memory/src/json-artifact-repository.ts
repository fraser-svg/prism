import type { AbsolutePath, EntityId } from "@prism/core";
import { validateEntityId } from "@prism/core";
import { mkdir, readFile, writeFile, readdir, rm, access } from "node:fs/promises";
import type { ArtifactWriteCallback } from "./contracts";

export interface JsonPathResolver {
  (id: EntityId): { dir: AbsolutePath; file: AbsolutePath };
}

export interface ListPathResolver {
  (): AbsolutePath;
}

export class JsonArtifactRepository<T> {
  constructor(
    private pathResolver: JsonPathResolver,
    private listDir: ListPathResolver,
    private onWrite?: ArtifactWriteCallback,
    private entityType?: string,
  ) {}

  async exists(id: EntityId): Promise<boolean> {
    const { file } = this.pathResolver(validateEntityId(id));
    try {
      await access(file);
      return true;
    } catch {
      return false;
    }
  }

  async read(id: EntityId): Promise<T | null> {
    const { file } = this.pathResolver(validateEntityId(id));
    try {
      const content = await readFile(file, "utf-8");
      return JSON.parse(content) as T;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(`Failed to read artifact at ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async write(id: EntityId, entity: T): Promise<void> {
    const validId = validateEntityId(id);
    const { dir, file } = this.pathResolver(validId);
    await mkdir(dir, { recursive: true });
    const content = JSON.stringify(entity, null, 2) + "\n";
    await writeFile(file, content, "utf-8");

    if (this.onWrite) {
      try {
        this.onWrite({
          action: "write",
          entityType: this.entityType ?? "",
          entityId: validId,
          projectId: "" as EntityId,
          contentPreview: content.slice(0, 500),
        });
      } catch {
        // Callback failure is non-fatal — artifact is already saved
      }
    }
  }

  async list(): Promise<EntityId[]> {
    const dir = this.listDir();
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name as EntityId);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async delete(id: EntityId): Promise<void> {
    const validId = validateEntityId(id);
    const { dir } = this.pathResolver(validId);
    try {
      await rm(dir, { recursive: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    if (this.onWrite) {
      try {
        this.onWrite({
          action: "delete",
          entityType: this.entityType ?? "",
          entityId: validId,
          projectId: "" as EntityId,
        });
      } catch {
        // Callback failure is non-fatal
      }
    }
  }
}
