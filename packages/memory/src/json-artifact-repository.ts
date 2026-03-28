import type { AbsolutePath, EntityId } from "@prism/core";
import { validateEntityId } from "@prism/core";
import { mkdir, readFile, writeFile, readdir, rm, access } from "node:fs/promises";

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
    const { dir, file } = this.pathResolver(validateEntityId(id));
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(entity, null, 2) + "\n", "utf-8");
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
