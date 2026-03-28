import type { AbsolutePath, EntityId } from "@prism/core";
import { validateEntityId } from "@prism/core";
import { mkdir, readFile, writeFile, readdir, rm, access } from "node:fs/promises";
import { join } from "node:path";

export interface CompositePathResolver {
  (id: EntityId): { dir: AbsolutePath; metadataFile: AbsolutePath };
}

export interface CompositeListPathResolver {
  (): AbsolutePath;
}

export class CompositeArtifactRepository<T> {
  constructor(
    private pathResolver: CompositePathResolver,
    private listDir: CompositeListPathResolver,
  ) {}

  async exists(id: EntityId): Promise<boolean> {
    const { dir } = this.pathResolver(validateEntityId(id));
    try {
      await access(dir);
      return true;
    } catch {
      return false;
    }
  }

  async readMetadata(id: EntityId): Promise<T | null> {
    const { metadataFile } = this.pathResolver(validateEntityId(id));
    try {
      const content = await readFile(metadataFile, "utf-8");
      return JSON.parse(content) as T;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(`Failed to read metadata at ${metadataFile}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async readFile(id: EntityId, slot: string): Promise<string | null> {
    const { dir } = this.pathResolver(validateEntityId(id));
    const filePath = join(dir, slot) as AbsolutePath;
    try {
      return await readFile(filePath, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(`Failed to read file ${slot} at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async writeMetadata(id: EntityId, entity: T): Promise<void> {
    const { dir, metadataFile } = this.pathResolver(validateEntityId(id));
    await mkdir(dir, { recursive: true });
    await writeFile(metadataFile, JSON.stringify(entity, null, 2) + "\n", "utf-8");
  }

  async writeFile(id: EntityId, slot: string, content: string): Promise<void> {
    const { dir } = this.pathResolver(validateEntityId(id));
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, slot) as AbsolutePath;
    await writeFile(filePath, content, "utf-8");
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
    const { dir } = this.pathResolver(validateEntityId(id));
    try {
      await rm(dir, { recursive: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }
}
