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
  // Context dump
  getContextItems(entityType: "project" | "client", entityId: string): Promise<IpcResult>;
  addContextItem(item: { entityType: "project" | "client"; entityId: string; itemType: string; title: string; content?: string; sourcePath?: string; fileSizeBytes?: number; mimeType?: string }): Promise<IpcResult>;
  deleteContextItem(id: string): Promise<IpcResult>;
  reExtractItem(id: string): Promise<IpcResult>;
  getKnowledge(entityType: "project" | "client", entityId: string): Promise<IpcResult>;
  getSummary(entityType: "project" | "client", entityId: string): Promise<IpcResult>;
  flagKnowledge(knowledgeId: string): Promise<IpcResult>;
  applyToBrief(projectId: string, knowledgeId: string): Promise<IpcResult>;
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
  getContextItems(entityType: "project" | "client", entityId: string) { return window.prism.getContextItems(entityType, entityId); }
  addContextItem(item: { entityType: "project" | "client"; entityId: string; itemType: string; title: string; content?: string; sourcePath?: string; fileSizeBytes?: number; mimeType?: string }) { return window.prism.addContextItem(item); }
  deleteContextItem(id: string) { return window.prism.deleteContextItem(id); }
  reExtractItem(id: string) { return window.prism.reExtractItem(id); }
  getKnowledge(entityType: "project" | "client", entityId: string) { return window.prism.getKnowledge(entityType, entityId); }
  getSummary(entityType: "project" | "client", entityId: string) { return window.prism.getSummary(entityType, entityId); }
  flagKnowledge(knowledgeId: string) { return window.prism.flagKnowledge(knowledgeId); }
  applyToBrief(projectId: string, knowledgeId: string) { return window.prism.applyToBrief(projectId, knowledgeId); }
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
  getContextItems(entityType: "project" | "client", entityId: string) {
    return this.request(`/context/${entityType}/${entityId}/items`);
  }
  addContextItem(item: { entityType: "project" | "client"; entityId: string; itemType: string; title: string; content?: string; sourcePath?: string; fileSizeBytes?: number; mimeType?: string }) {
    return this.request(`/context/${item.entityType}/${item.entityId}/items`, { method: "POST", body: JSON.stringify(item) });
  }
  deleteContextItem(id: string) {
    return this.request(`/context/items/${id}`, { method: "DELETE" });
  }
  reExtractItem(id: string) {
    return this.request(`/context/items/${id}/re-extract`, { method: "POST" });
  }
  getKnowledge(entityType: "project" | "client", entityId: string) {
    return this.request(`/context/${entityType}/${entityId}/knowledge`);
  }
  getSummary(entityType: "project" | "client", entityId: string) {
    return this.request(`/context/${entityType}/${entityId}/summary`);
  }
  flagKnowledge(knowledgeId: string) {
    return this.request(`/context/knowledge/${knowledgeId}/flag`, { method: "POST" });
  }
  applyToBrief(projectId: string, knowledgeId: string) {
    return this.request(`/context/knowledge/${knowledgeId}/apply`, { method: "POST", body: JSON.stringify({ projectId }) });
  }
}
