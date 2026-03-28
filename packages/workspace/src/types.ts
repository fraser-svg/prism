export interface WorkspaceSettings {
  workspaceId: string;
  defaultProjectId: string | null;
  stalenessThresholdDays: number;
  autoDetectProjects: boolean;
}

export const DEFAULT_SETTINGS: Omit<WorkspaceSettings, "workspaceId"> = {
  defaultProjectId: null,
  stalenessThresholdDays: 14,
  autoDetectProjects: true,
};

export type ProjectBadge =
  | "healthy"
  | "stale"
  | "blocked"
  | "needs-review"
  | "unreachable"
  | "new";

export type WorkspaceEventType =
  | "project:registered"
  | "project:archived"
  | "project:switched"
  | "integration:registered"
  | "integration:removed";

export type ArtifactEventType = "artifact:written" | "artifact:deleted";

export interface WorkspaceStatus {
  workspace: {
    id: string;
    projectCount: number;
    activeProjectId: string | null;
  };
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    rootPath: string;
    badge: ProjectBadge;
    lastAccessedAt: string | null;
  }>;
  activeProjectResume: ProjectResume | null;
  recentEvents: Array<{
    eventType: string;
    summary: string;
    projectId: string | null;
    timestamp: string;
  }>;
}

export interface ProjectResume {
  projectId: string;
  projectName: string;
  lastCheckpointSummary: string | null;
  openBlockers: string[];
  pendingReviews: string[];
  recommendedNextAction: string;
}
