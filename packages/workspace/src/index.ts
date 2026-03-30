export { WorkspaceDatabase } from "./workspace-database";
export { WorkspaceManager } from "./workspace-manager";
export type { WorkspaceContext } from "./workspace-manager";
export { ProjectRegistry } from "./project-registry";
export type { ProjectRow, AutoDetectResult } from "./project-registry";
export { EventLog, createEventLogWriteCallback } from "./event-log";
export type { EventRecord, EventQueryOptions } from "./event-log";
export { ArtifactSearch } from "./search";
export type { SearchResult } from "./search";
export { ProjectHealth } from "./health";
export { ResumeBuilder } from "./resume";
export { IntegrationCabinet } from "./integration-cabinet";
export type { IntegrationRow, HealthResult, HealthAdapter } from "./integration-cabinet";
export { ProjectTemplates } from "./templates";
export { WorkspaceFacade } from "./workspace-facade";
export type {
  WorkspaceSettings,
  ProjectBadge,
  WorkspaceEventType,
  ArtifactEventType,
  WorkspaceStatus,
  ProjectResume,
} from "./types";
export { DEFAULT_SETTINGS } from "./types";
