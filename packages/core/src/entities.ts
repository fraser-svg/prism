import type {
  AbsolutePath,
  ApprovalMode,
  AuditStamp,
  EntityId,
  ISODateString,
  NamedEntity,
  PrimaryPlatform,
  ProductType,
  ProjectStatus,
  ReleaseDecision,
  RelativePath,
  ReviewType,
  ReviewVerdict,
  RunStatus,
  SpecStatus,
  SpecType,
  TaskStatus,
  WorkflowPhase,
} from "./common";

export interface Workspace extends AuditStamp {
  id: EntityId;
  userId: EntityId;
  homePath: AbsolutePath;
  activeProjectId: EntityId | null;
  settingsPath: AbsolutePath | null;
  runtimeDatabasePath: AbsolutePath | null;
}

export interface Project extends AuditStamp {
  id: EntityId;
  name: string;
  slug: string;
  status: ProjectStatus;
  rootPath: AbsolutePath;
  primaryPlatform: PrimaryPlatform;
  productType: ProductType;
}

export interface ProductBrief extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  summary: string;
  targetUser: string;
  jobsToBeDone: string[];
  userPromise: string;
  currentScopePosture: string;
}

export interface ProductMemoryFileSet {
  product: RelativePath;
  architecture: RelativePath;
  roadmap: RelativePath;
  state: RelativePath;
  decisions: RelativePath;
}

export interface ProductMemory extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  files: ProductMemoryFileSet;
}

export interface AcceptanceCriterion {
  id: EntityId;
  description: string;
  status: "unverified" | "passing" | "failing";
}

export interface VerificationPlan {
  checks: string[];
  notes: string[];
}

export interface Spec extends AuditStamp, NamedEntity {
  projectId: EntityId;
  type: SpecType;
  status: SpecStatus;
  summary: string;
  scope: string[];
  nonGoals: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  verificationPlan: VerificationPlan;
}

export interface PlanPhase {
  id: EntityId;
  title: string;
  description: string;
  dependsOn: EntityId[];
}

export interface Plan extends AuditStamp, NamedEntity {
  projectId: EntityId;
  specId: EntityId;
  phases: PlanPhase[];
  risks: string[];
  approvals: ApprovalRequirement[];
  sequencingRationale: string;
}

export interface ApprovalRequirement {
  id: EntityId;
  title: string;
  mode: ApprovalMode;
  reason: string;
}

export interface TaskNode {
  id: EntityId;
  title: string;
  description: string;
  ownerType: "human" | "agent" | "script";
  status: TaskStatus;
  dependsOn: EntityId[];
  verificationRequirements: string[];
  artifactsTouched: RelativePath[];
}

export interface TaskGraph extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId: EntityId;
  planId: EntityId | null;
  status: TaskStatus;
  tasks: TaskNode[];
}

export interface WorkflowRun extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId: EntityId;
  phase: WorkflowPhase;
  status: RunStatus;
  initiator: "user" | "system";
  startedAt: ISODateString;
  endedAt: ISODateString | null;
}

export interface Checkpoint extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  runId: EntityId | null;
  activeSpecId: EntityId | null;
  phase: WorkflowPhase;
  progressSummary: string;
  keyDecisions: string[];
  blockers: string[];
  nextRecommendedActions: string[];
  lastVerificationSummary: string | null;
  approvalsPending?: ApprovalRequirement[];
}

export interface ReviewFinding {
  severity: "p1" | "p2";
  category: string;
  title: string;
  details: string;
  filePath?: RelativePath;
  line?: number;
}

export interface Review extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId: EntityId;
  reviewType: ReviewType;
  verdict: ReviewVerdict;
  findings: ReviewFinding[];
  summary: string;
}

export interface VerificationFailure {
  check: string;
  details: string;
}

export interface VerificationResult extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId: EntityId;
  runId: EntityId;
  checksRun: string[];
  passed: boolean;
  failures: VerificationFailure[];
  timestamp: ISODateString;
}

export interface ReleaseState extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId: EntityId;
  implementationComplete: boolean;
  reviewsComplete: boolean;
  verificationComplete: boolean;
  approvalsComplete: boolean;
  decision: ReleaseDecision;
}

export interface IntegrationConnection extends AuditStamp {
  id: EntityId;
  workspaceId: EntityId;
  provider: string;
  status: "disconnected" | "connected" | "needs_reauth";
  scope: string[];
  approvalRequired: boolean;
  secretReference: string | null;
  lastValidatedAt: ISODateString | null;
}

export interface ProviderProfile extends AuditStamp {
  id: EntityId;
  workspaceId: EntityId;
  provider: string;
  capabilities: string[];
  authMethod: "env" | "keychain" | "token" | "other";
  configReference: string | null;
  availabilityStatus: "available" | "degraded" | "unavailable";
}

export interface WorkflowTransition {
  from: WorkflowPhase;
  to: WorkflowPhase;
  reason:
    | "progress"
    | "regression"
    | "approval_pause"
    | "resume"
    | "verification_failure";
}

export interface WorkflowState {
  phase: WorkflowPhase;
  projectId: EntityId;
  activeSpecId: EntityId | null;
  approvalsPending: ApprovalRequirement[];
  blockers: string[];
  transitionHistory: WorkflowTransition[];
}
