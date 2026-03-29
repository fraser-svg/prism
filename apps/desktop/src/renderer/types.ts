/**
 * Renderer-local type definitions mirroring core entity shapes.
 * These duplicate just enough structure for the UI to render.
 * The actual types live in @prism/workspace — these are renderer-safe copies.
 */

export type ProjectBadge =
  | "healthy"
  | "stale"
  | "blocked"
  | "needs-review"
  | "unreachable"
  | "new";

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  rootPath: string;
  badge: ProjectBadge;
  lastAccessedAt: string | null;
}

export interface WorkspaceStatus {
  workspace: {
    id: string;
    projectCount: number;
    activeProjectId: string | null;
  };
  projects: ProjectSummary[];
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

export interface ProjectDetail {
  project: {
    id: string;
    name: string;
    slug: string;
    rootPath: string;
    status: string;
  };
  badge: ProjectBadge;
  resume: ProjectResume | null;
  specs: ArtifactEntry[];
  plans: ArtifactEntry[];
  recentRuns: Array<{
    entityId: string;
    title: string | null;
    updatedAt: string;
  }>;
}

export interface ArtifactEntry {
  entityId: string;
  title: string | null;
  contentPreview: string | null;
  updatedAt: string;
}
