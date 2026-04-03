// PrismAPI and Window.prism declaration live in @prism/ui/types.ts
// Local types only — view interfaces for desktop-specific components

export type { IpcResult } from "@prism/ui";

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
