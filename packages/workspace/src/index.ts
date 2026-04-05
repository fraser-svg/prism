export { WorkspaceDatabase } from "./workspace-database";
export { WorkspaceManager } from "./workspace-manager";
export type { WorkspaceContext } from "./workspace-manager";
export { ProjectRegistry } from "./project-registry";
export type { ProjectRow, AutoDetectResult } from "./project-registry";
export { ClientRepository } from "./client-repository";
export type { ClientRow } from "./client-repository";
export { ContextRepository } from "./context-repository";
export type { ContextItemRow, KnowledgeRow, SummaryRow, EntityScope } from "./context-repository";
export { ExtractionPipeline, isTranscript } from "./extraction-pipeline";
export { EventLog, createEventLogWriteCallback } from "./event-log";
export type { EventRecord, EventQueryOptions } from "./event-log";
export { ArtifactSearch } from "./search";
export type { SearchResult } from "./search";
export { ProjectHealth } from "./health";
export { ResumeBuilder } from "./resume";
export { IntegrationCabinet } from "./integration-cabinet";
export type { IntegrationRow, HealthResult, HealthAdapter } from "./integration-cabinet";
export { buildProviderViews, PROVIDER_DISPLAY_NAMES } from "./provider-views";
export type { ProviderViewData } from "./provider-views";
export { ProjectTemplates } from "./templates";
export { UsageGate } from "./usage-gate";
export type { UsageStatus } from "./usage-gate";
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
