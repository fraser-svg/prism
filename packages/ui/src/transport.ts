import type { IpcResult } from "./types";

/**
 * Transport abstraction — decouples the store from Electron IPC vs HTTP fetch.
 * Each app provides its own implementation at store initialization.
 */
export interface PrismTransport {
  listPortfolio(): Promise<IpcResult>;
  createClient(name: string, notes?: string): Promise<IpcResult>;
  updateClient(id: string, fields: Record<string, unknown>): Promise<IpcResult>;
  createProject(name: string, rootPath: string, clientAccountId?: string): Promise<IpcResult>;
  linkProject(rootPath: string, clientAccountId?: string): Promise<IpcResult>;
  updateProject(id: string, fields: Record<string, unknown>): Promise<IpcResult>;
  getProjectPipeline(projectId: string): Promise<IpcResult>;
  getProjectTimeline(projectId: string): Promise<IpcResult>;
  runAction(projectId: string, action: string): Promise<IpcResult>;
  listProviders(): Promise<IpcResult>;
  checkProviderHealth(): Promise<IpcResult>;
}

/** Electron IPC transport — delegates to window.prism.* preload API */
export class IpcTransport implements PrismTransport {
  listPortfolio() { return window.prism.listPortfolio(); }
  createClient(name: string, notes?: string) { return window.prism.createClient(name, notes); }
  updateClient(id: string, fields: Record<string, unknown>) { return window.prism.updateClient(id, fields); }
  createProject(name: string, rootPath: string, clientAccountId?: string) { return window.prism.createProject(name, rootPath, clientAccountId); }
  linkProject(rootPath: string, clientAccountId?: string) { return window.prism.linkProject(rootPath, clientAccountId); }
  updateProject(id: string, fields: Record<string, unknown>) { return window.prism.updateProject(id, fields); }
  getProjectPipeline(projectId: string) { return window.prism.getProjectPipeline(projectId); }
  getProjectTimeline(projectId: string) { return window.prism.getProjectTimeline(projectId); }
  runAction(projectId: string, action: string) { return window.prism.runAction(projectId, action); }
  listProviders() { return window.prism.listProviders(); }
  checkProviderHealth() { return window.prism.checkProviderHealth(); }
}

/** HTTP fetch transport — calls Express API endpoints */
export class FetchTransport implements PrismTransport {
  constructor(private baseUrl = "") {}

  private async request(path: string, opts?: RequestInit): Promise<IpcResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api${path}`, {
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
    } catch {
      return { error: "Network error — is the server running?" };
    }

    if (!res.ok) {
      try {
        const body = await res.json();
        return { error: body.error || `HTTP ${res.status}` };
      } catch {
        return { error: `HTTP ${res.status}: ${res.statusText}` };
      }
    }

    try {
      return await res.json();
    } catch {
      return { error: "Invalid response from server" };
    }
  }

  listPortfolio() { return this.request("/portfolio"); }
  createClient(name: string, notes?: string) {
    return this.request("/clients", { method: "POST", body: JSON.stringify({ name, notes }) });
  }
  updateClient(id: string, fields: Record<string, unknown>) {
    return this.request(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  }
  createProject(name: string, rootPath: string, clientAccountId?: string) {
    return this.request("/projects", { method: "POST", body: JSON.stringify({ name, rootPath, clientAccountId }) });
  }
  linkProject(rootPath: string, clientAccountId?: string) {
    return this.request("/projects/link", { method: "POST", body: JSON.stringify({ rootPath, clientAccountId }) });
  }
  updateProject(id: string, fields: Record<string, unknown>) {
    return this.request(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  }
  getProjectPipeline(projectId: string) { return this.request(`/projects/${projectId}/pipeline`); }
  getProjectTimeline(projectId: string) { return this.request(`/projects/${projectId}/timeline`); }
  runAction(projectId: string, action: string) {
    return this.request(`/projects/${projectId}/actions`, { method: "POST", body: JSON.stringify({ action }) });
  }
  listProviders() { return this.request("/providers"); }
  checkProviderHealth() { return this.request("/providers/check-health", { method: "POST" }); }
}
