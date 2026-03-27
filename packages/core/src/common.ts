export type EntityId = string;
export type ISODateString = string;
export type RelativePath = string;
export type AbsolutePath = string;

export type ProjectStatus = "active" | "paused" | "blocked" | "archived";
export type SpecType = "product" | "change" | "task";
export type SpecStatus =
  | "draft"
  | "approved"
  | "superseded"
  | "implemented"
  | "verified"
  | "shipped";
export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "abandoned"
  | "blocked";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "aborted";
export type ReviewType =
  | "planning"
  | "engineering"
  | "qa"
  | "design"
  | "ship_readiness";
export type ReviewVerdict = "pass" | "hold" | "fail" | "not_applicable";
export type ReleaseDecision = "pending" | "ready" | "hold" | "shipped";
export type ApprovalMode = "automatic" | "approval_required";
export type ProductType =
  | "saas"
  | "internal_tool"
  | "workflow_system"
  | "client_portal"
  | "automation"
  | "other";
export type PrimaryPlatform = "macos" | "web" | "desktop" | "hybrid";

export interface AuditStamp {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface NamedEntity {
  id: EntityId;
  title: string;
}
