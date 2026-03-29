/// <reference types="vite/client" />

import type { Result } from "../shared/result";

/**
 * Renderer-side type for window.prism.
 * Duplicates the shape from preload — this avoids pulling @prism/workspace
 * types into the renderer's tsconfig (they're Node-only).
 */
interface PrismWorkspaceApi {
  status(): Promise<Result<unknown>>;
  onChanged(callback: () => void): () => void;
}

interface PrismProjectApi {
  list(): Promise<Result<unknown>>;
  detail(id: string): Promise<Result<unknown>>;
  register(rootPath: string, name?: string): Promise<Result<{ project: { id: string; name: string } }>>;
  setActive(id: string): Promise<Result<void>>;
  remove(id: string): Promise<Result<void>>;
  health(id: string): Promise<Result<string>>;
}

interface PrismAppApi {
  selectFolder(): Promise<Result<string | null>>;
}

interface PrismRendererApi {
  workspace: PrismWorkspaceApi;
  project: PrismProjectApi;
  app: PrismAppApi;
}

declare global {
  interface Window {
    prism: PrismRendererApi;
  }
}
