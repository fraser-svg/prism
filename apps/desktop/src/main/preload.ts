import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Portfolio
  listPortfolio: () => ipcRenderer.invoke("portfolio:list"),

  // Clients
  createClient: (name: string, notes?: string) =>
    ipcRenderer.invoke("clients:create", name, notes),
  updateClient: (id: string, fields: Record<string, unknown>) =>
    ipcRenderer.invoke("clients:update", id, fields),

  // Projects
  createProject: (
    name: string,
    rootPath: string,
    clientAccountId?: string,
  ) => ipcRenderer.invoke("projects:create", name, rootPath, clientAccountId),
  linkProject: (rootPath: string, clientAccountId?: string) =>
    ipcRenderer.invoke("projects:link", rootPath, clientAccountId),
  updateProject: (id: string, fields: Record<string, unknown>) =>
    ipcRenderer.invoke("projects:update", id, fields),

  // Pipeline
  getProjectPipeline: (projectId: string) =>
    ipcRenderer.invoke("projects:getPipeline", projectId),

  // Timeline
  getProjectTimeline: (projectId: string) =>
    ipcRenderer.invoke("projects:getTimeline", projectId),

  // Session actions
  runAction: (projectId: string, action: string) =>
    ipcRenderer.invoke("sessions:runAction", projectId, action),

  // Events subscription
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on("prism:event", handler);
    return () => ipcRenderer.removeListener("prism:event", handler);
  },

  // Context dump
  getContextItems: (entityType: string, entityId: string) =>
    ipcRenderer.invoke("context:getItems", entityType, entityId),
  addContextItem: (item: Record<string, unknown>) =>
    ipcRenderer.invoke("context:addItem", item),
  deleteContextItem: (id: string) =>
    ipcRenderer.invoke("context:deleteItem", id),
  reExtractItem: (id: string) =>
    ipcRenderer.invoke("context:reExtract", id),
  getKnowledge: (entityType: string, entityId: string) =>
    ipcRenderer.invoke("context:getKnowledge", entityType, entityId),
  getSummary: (entityType: string, entityId: string) =>
    ipcRenderer.invoke("context:getSummary", entityType, entityId),
  flagKnowledge: (knowledgeId: string) =>
    ipcRenderer.invoke("context:flagKnowledge", knowledgeId),
  applyToBrief: (projectId: string, knowledgeId: string) =>
    ipcRenderer.invoke("context:applyToBrief", projectId, knowledgeId),

  // Dialog
  selectDirectory: () => ipcRenderer.invoke("dialog:selectDirectory"),

  // Providers
  listProviders: () => ipcRenderer.invoke("providers:list"),
  checkProviderHealth: () => ipcRenderer.invoke("providers:check-health"),
};

contextBridge.exposeInMainWorld("prism", api);
