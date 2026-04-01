export type EntityId = string;
export type ISODateString = string;
export type RelativePath = string;
export type AbsolutePath = string;

export const WORKFLOW_PHASES = [
  "understand",
  "identify_problem",
  "spec",
  "plan",
  "execute",
  "verify",
  "release",
  "resume",
] as const;

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

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
  | "ship_readiness"
  | "codex";
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
export type ScopeMode = "full_build" | "targeted" | "exact" | "minimum_viable";
export type DeviationSeverity = "auto_fix" | "auto_fix_critical" | "auto_fix_blocking" | "ask_user";

export type ModelProvider = "anthropic" | "openai" | "google";
export type ServiceProvider = "vercel" | "stripe" | "stitch";
export type RouteHint = "visual" | "backend" | "any";

export interface AuditStamp {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface NamedEntity {
  id: EntityId;
  title: string;
}

export type EvidenceConfidence = "high" | "medium" | "not_confirmed";
export type EvidenceDirection = "present" | "absent";
export type VerificationScenarioType = "happy_path" | "edge_case" | "stress" | "regression";
export type TrendDirection = "improving" | "stable" | "degrading";
export type PrescriptionSeverity = "low" | "medium" | "high" | "critical";
export type PrescriptionStatus = "active" | "resolved" | "dismissed";
export type ReportCardDimensionSource = "auto" | "manual_on_resume" | "crash_recovery";
