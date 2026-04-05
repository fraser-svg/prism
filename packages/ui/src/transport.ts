import type { IpcResult, UsageStatus } from "./types";

/**
 * Transport abstraction — decouples the store from Electron IPC vs HTTP fetch.
 * Each app provides its own implementation at store initialization.
 */
export interface PrismTransport {
  listPortfolio(): Promise<IpcResult>;
  createClient(name: string, notes?: string): Promise<IpcResult>;
  updateClient(id: string, fields: Record<string, unknown>): Promise<IpcResult>;
  createProject(name: string, rootPath?: string, clientAccountId?: string): Promise<IpcResult>;
  linkProject(rootPath: string, clientAccountId?: string): Promise<IpcResult>;
  updateProject(id: string, fields: Record<string, unknown>): Promise<IpcResult>;
  getProjectPipeline(projectId: string): Promise<IpcResult>;
  getProjectTimeline(projectId: string): Promise<IpcResult>;
  runAction(projectId: string, action: string): Promise<IpcResult>;
  // Providers
  listProviders(): Promise<IpcResult>;
  checkProviderHealth(): Promise<IpcResult>;
  // Context dump
  getContextItems(entityType: "project" | "client", entityId: string): Promise<IpcResult>;
  addContextItem(item: { entityType: "project" | "client"; entityId: string; itemType: string; title: string; content?: string; sourcePath?: string; fileSizeBytes?: number; mimeType?: string; file?: File }): Promise<IpcResult>;
  deleteContextItem(id: string): Promise<IpcResult>;
  reExtractItem(id: string): Promise<IpcResult>;
  getKnowledge(entityType: "project" | "client", entityId: string): Promise<IpcResult>;
  getSummary(entityType: "project" | "client", entityId: string): Promise<IpcResult>;
  flagKnowledge(knowledgeId: string): Promise<IpcResult>;
  applyToBrief(projectId: string, knowledgeId: string): Promise<IpcResult>;
  // Usage & billing
  getUsage(): Promise<IpcResult>;
  createCheckout(): Promise<IpcResult>;
  getBillingPortal(): Promise<IpcResult>;
  // Vault
  saveProviderKey(provider: string, apiKey: string): Promise<IpcResult>;
  removeProviderKey(provider: string): Promise<IpcResult>;
  getGitHubStatus(): Promise<IpcResult>;
  disconnectGitHub(): Promise<IpcResult>;
}

/** Electron IPC transport — delegates to window.prism.* preload API */
export class IpcTransport implements PrismTransport {
  listPortfolio() { return window.prism.listPortfolio(); }
  createClient(name: string, notes?: string) { return window.prism.createClient(name, notes); }
  updateClient(id: string, fields: Record<string, unknown>) { return window.prism.updateClient(id, fields); }
  createProject(name: string, rootPath?: string, clientAccountId?: string) { return window.prism.createProject(name, rootPath ?? "", clientAccountId); }
  linkProject(rootPath: string, clientAccountId?: string) { return window.prism.linkProject(rootPath, clientAccountId); }
  updateProject(id: string, fields: Record<string, unknown>) { return window.prism.updateProject(id, fields); }
  getProjectPipeline(projectId: string) { return window.prism.getProjectPipeline(projectId); }
  getProjectTimeline(projectId: string) { return window.prism.getProjectTimeline(projectId); }
  runAction(projectId: string, action: string) { return window.prism.runAction(projectId, action); }
  listProviders() { return window.prism.listProviders(); }
  checkProviderHealth() { return window.prism.checkProviderHealth(); }
  getContextItems(entityType: "project" | "client", entityId: string) { return window.prism.getContextItems(entityType, entityId); }
  addContextItem(item: { entityType: "project" | "client"; entityId: string; itemType: string; title: string; content?: string; sourcePath?: string; fileSizeBytes?: number; mimeType?: string; file?: File }) { return window.prism.addContextItem(item); }
  deleteContextItem(id: string) { return window.prism.deleteContextItem(id); }
  reExtractItem(id: string) { return window.prism.reExtractItem(id); }
  getKnowledge(entityType: "project" | "client", entityId: string) { return window.prism.getKnowledge(entityType, entityId); }
  getSummary(entityType: "project" | "client", entityId: string) { return window.prism.getSummary(entityType, entityId); }
  flagKnowledge(knowledgeId: string) { return window.prism.flagKnowledge(knowledgeId); }
  applyToBrief(projectId: string, knowledgeId: string) { return window.prism.applyToBrief(projectId, knowledgeId); }
  getUsage() { return Promise.resolve({ error: "Not available in desktop mode" }); }
  createCheckout() { return Promise.resolve({ error: "Not available in desktop mode" }); }
  getBillingPortal() { return Promise.resolve({ error: "Not available in desktop mode" }); }
  saveProviderKey() { return Promise.resolve({ error: "Not available in desktop mode" }); }
  removeProviderKey() { return Promise.resolve({ error: "Not available in desktop mode" }); }
  getGitHubStatus() { return Promise.resolve({ error: "Not available in desktop mode" }); }
  disconnectGitHub() { return Promise.resolve({ error: "Not available in desktop mode" }); }
}

/** HTTP fetch transport — calls Express API endpoints */
export class FetchTransport implements PrismTransport {
  constructor(private baseUrl = "") {}

  private async request(path: string, opts?: RequestInit): Promise<IpcResult> {
    let res: Response;
    try {
      // Don't set Content-Type for FormData — browser sets it with multipart boundary
      const headers: Record<string, string> = opts?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" };
      res = await fetch(`${this.baseUrl}/api${path}`, {
        headers,
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
  createProject(name: string, rootPath?: string, clientAccountId?: string) {
    const body: Record<string, string> = { name };
    if (rootPath) body.rootPath = rootPath;
    if (clientAccountId) body.clientAccountId = clientAccountId;
    return this.request("/projects", { method: "POST", body: JSON.stringify(body) });
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
  getContextItems(entityType: "project" | "client", entityId: string) {
    return this.request(`/context/${entityType}/${entityId}/items`);
  }
  addContextItem(item: { entityType: "project" | "client"; entityId: string; itemType: string; title: string; content?: string; sourcePath?: string; fileSizeBytes?: number; mimeType?: string; file?: File }) {
    if (item.file) {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("itemType", item.itemType);
      formData.append("title", item.title);
      if (item.mimeType) formData.append("mimeType", item.mimeType);
      return this.request(`/context/${item.entityType}/${item.entityId}/items`, { method: "POST", body: formData });
    }
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
  getUsage() { return this.request("/usage"); }
  createCheckout() { return this.request("/billing/checkout", { method: "POST" }); }
  getBillingPortal() { return this.request("/billing/portal", { method: "POST" }); }
  saveProviderKey(provider: string, apiKey: string) {
    return this.request(`/vault/providers/${provider}`, { method: "PUT", body: JSON.stringify({ apiKey }) });
  }
  removeProviderKey(provider: string) {
    return this.request(`/vault/providers/${provider}`, { method: "DELETE" });
  }
  getGitHubStatus() { return this.request("/vault/github"); }
  disconnectGitHub() { return this.request("/vault/github", { method: "DELETE" }); }
}
