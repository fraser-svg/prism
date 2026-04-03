export interface PrismAPI {
  listPortfolio: () => Promise<IpcResult>;
  createClient: (name: string, notes?: string) => Promise<IpcResult>;
  updateClient: (id: string, fields: Record<string, unknown>) => Promise<IpcResult>;
  createProject: (name: string, rootPath: string, clientAccountId?: string) => Promise<IpcResult>;
  linkProject: (rootPath: string, clientAccountId?: string) => Promise<IpcResult>;
  updateProject: (id: string, fields: Record<string, unknown>) => Promise<IpcResult>;
  getProjectPipeline: (projectId: string) => Promise<IpcResult>;
  getProjectTimeline: (projectId: string) => Promise<IpcResult>;
  runAction: (projectId: string, action: string) => Promise<IpcResult>;
  onEvent: (callback: (event: unknown) => void) => () => void;
  selectDirectory: () => Promise<IpcResult>;

  // Context dump
  getContextItems: (entityType: string, entityId: string) => Promise<IpcResult>;
  addContextItem: (item: Record<string, unknown>) => Promise<IpcResult>;
  deleteContextItem: (id: string) => Promise<IpcResult>;
  reExtractItem: (id: string) => Promise<IpcResult>;
  getKnowledge: (entityType: string, entityId: string) => Promise<IpcResult>;
  getSummary: (entityType: string, entityId: string) => Promise<IpcResult>;
  flagKnowledge: (knowledgeId: string) => Promise<IpcResult>;
  applyToBrief: (projectId: string, knowledgeId: string) => Promise<IpcResult>;
}

export interface IpcResult {
  data?: unknown;
  error?: string;
}

declare global {
  interface Window {
    prism: PrismAPI;
  }
}

// Pipeline types matching PipelineSnapshot from @prism/orchestrator
export interface StageView {
  id: string;
  label: string;
  description: string;
  status: "completed" | "current" | "blocked" | "upcoming";
  gateRequirements: Array<{ description: string; met: boolean }>;
  artifacts: Array<{ name: string; present: boolean; path: string }>;
  blockers: string[];
}

export interface PipelineView {
  schemaVersion: number;
  generatedAt: string;
  projectRoot: string;
  activeSpecId: string | null;
  currentPhase: string;
  resumeSource: string;
  stages: StageView[];
  recommendations: Array<{
    source: string;
    severity: string;
    text: string;
  }>;
  weaknesses: Array<{
    dimension: string;
    trend: string;
    avgScore: number;
    detail: string;
    recurring: boolean;
  }>;
  healthScore: number | null;
  healthTrend: string;
  error?: string;
}

export interface ProjectView {
  id: string;
  name: string;
  slug: string;
  rootPath: string;
  status: string;
  clientAccountId: string | null;
  primaryPlatform: string | null;
  productType: string | null;
  riskState: string | null;
  deployUrl: string | null;
  registeredAt: string;
  lastAccessedAt: string | null;
}

export interface ClientView {
  id: string;
  name: string;
  slug: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioGroup {
  client: ClientView | null;
  projects: ProjectView[];
}

export interface TimelineEvent {
  id: number;
  projectId: string | null;
  eventType: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}
