import type { AbsolutePath, EntityId } from "@prism/core";

// --- Write-through indexing callback ---

export type ArtifactWriteEvent = {
  action: "write" | "delete";
  entityType: string;
  entityId: EntityId;
  projectId: EntityId;
  contentPreview?: string;
};

export type ArtifactWriteCallback = (event: ArtifactWriteEvent) => void;

// --- Workspace paths ---

export interface WorkspacePaths {
  workspaceHome: AbsolutePath;
  dbPath: AbsolutePath;
  settingsPath: AbsolutePath;
  templatesDir: AbsolutePath;
}

// --- Project paths ---

export interface PrismProjectPaths {
  projectRoot: AbsolutePath;
  prismDir: AbsolutePath;
  memoryDir: AbsolutePath;
  specsDir: AbsolutePath;
  plansDir: AbsolutePath;
  reviewsDir: AbsolutePath;
  runsDir: AbsolutePath;
  checkpointsDir: AbsolutePath;
  evalsDir: AbsolutePath;
  proposalsDir: AbsolutePath;
  releaseStateDir: AbsolutePath;
  problemsDir: AbsolutePath;
  telemetryFile: AbsolutePath;
  registryFile: AbsolutePath;
  taskGraphFile: AbsolutePath;
}

export interface ProblemArtifactPaths {
  problemDir: AbsolutePath;
  metadataFile: AbsolutePath;
}

export interface MemoryFileContract {
  key: "product" | "architecture" | "roadmap" | "state" | "decisions";
  relativePath: `.prism/memory/${string}.md`;
  required: boolean;
}

export interface SpecArtifactPaths {
  specDir: AbsolutePath;
  specFile: AbsolutePath;
  metadataFile: AbsolutePath;
}

export interface PlanArtifactPaths {
  planDir: AbsolutePath;
  planFile: AbsolutePath;
  metadataFile: AbsolutePath;
  taskGraphFile: AbsolutePath;
}

export interface ReviewArtifactPaths {
  reviewDir: AbsolutePath;
  planningReview: AbsolutePath;
  engineeringReview: AbsolutePath;
  qaReview: AbsolutePath;
  designReview: AbsolutePath;
  shipReadinessReview: AbsolutePath;
}

export interface CheckpointArtifactPaths {
  checkpointsDir: AbsolutePath;
  latestJson: AbsolutePath;
  latestMarkdown: AbsolutePath;
  historyDir: AbsolutePath;
}

export interface RunArtifactPaths {
  runDir: AbsolutePath;
  summaryFile: AbsolutePath;
  verificationFile: AbsolutePath;
  reviewIndexFile: AbsolutePath;
}

export interface ReleaseStateArtifactPaths {
  releaseStateDir: AbsolutePath;
  stateFile: AbsolutePath;
}

export interface ProjectArtifactLocator {
  projectPaths(projectRoot: AbsolutePath): PrismProjectPaths;
  specPaths(projectRoot: AbsolutePath, specId: EntityId): SpecArtifactPaths;
  planPaths(projectRoot: AbsolutePath, planId: EntityId): PlanArtifactPaths;
  reviewPaths(projectRoot: AbsolutePath, specId: EntityId): ReviewArtifactPaths;
  checkpointPaths(projectRoot: AbsolutePath): CheckpointArtifactPaths;
  runPaths(projectRoot: AbsolutePath, runId: EntityId): RunArtifactPaths;
  releaseStatePaths(projectRoot: AbsolutePath, specId: EntityId): ReleaseStateArtifactPaths;
}
