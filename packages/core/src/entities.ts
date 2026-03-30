import type {
  AbsolutePath,
  ApprovalMode,
  AuditStamp,
  DeviationSeverity,
  EntityId,
  ISODateString,
  ModelProvider,
  NamedEntity,
  PrimaryPlatform,
  ProductType,
  ProjectStatus,
  ReleaseDecision,
  RelativePath,
  ReviewType,
  ReviewVerdict,
  RouteHint,
  RunStatus,
  ScopeMode,
  SpecStatus,
  SpecType,
  TaskStatus,
  WorkflowPhase,
  EvidenceConfidence,
  EvidenceDirection,
  VerificationScenarioType,
  TrendDirection,
  PrescriptionSeverity,
  PrescriptionStatus,
  ReportCardDimensionSource,
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

export interface ProblemStatement extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId: EntityId | null;
  originalRequest: string;
  realProblem: string;
  targetUser: string;
  assumptions: string[];
  reframed: boolean;
  reframeDetails: string | null;
}

export interface AcceptanceCriterion {
  id: EntityId;
  description: string;
  status: "unverified" | "passing" | "failing";
}

export interface VerificationPlan {
  checks: string[];
  notes: string[];
  scenarios?: VerificationScenario[];
  handoffCriteria?: string[];
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
  goal?: string;
  observableTruths?: ObservableTruth[];
  requiredArtifacts?: ArtifactRequirement[];
  requiredWiring?: KeyLink[];
}

export interface Plan extends AuditStamp, NamedEntity {
  projectId: EntityId;
  specId: EntityId;
  phases: PlanPhase[];
  risks: string[];
  approvals: ApprovalRequirement[];
  sequencingRationale: string;
  scopeMode?: ScopeMode;
  alternatives?: ImplementationAlternative[];
  selectedAlternative?: string;
  deviationRules?: DeviationRule[];
  planVersion?: 1 | 2;
  totalContextBudgetPct?: number;
  goalBackwardTrace?: string;
}

export interface ArtifactRequirement {
  path: RelativePath;
  provides: string;
}

export interface KeyLink {
  from: RelativePath;
  to: RelativePath;
  via: string;
  pattern: string;
}

export interface ObservableTruth {
  id: EntityId;
  statement: string;
  verifiedBy: string;
}

export interface MustHaves {
  truths: ObservableTruth[];
  artifacts: ArtifactRequirement[];
  keyLinks: KeyLink[];
}

export interface DeviationRule {
  severity: DeviationSeverity;
  description: string;
  action: string;
}

export interface ImplementationAlternative {
  name: string;
  description: string;
  effort: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  pros: string[];
  cons: string[];
}

export interface PlanQualityDimension {
  name: string;
  passed: boolean;
  hasBlocker: boolean;
  score: number;
  details: string;
}

export interface PlanQualityResult {
  passed: boolean;
  legacy: boolean;
  score: number;
  dimensions: PlanQualityDimension[];
  summary: string;
  traceability: TraceabilityEntry[];
}

export interface TraceabilityEntry {
  criterionId: EntityId;
  criterionDescription: string;
  matchingTaskIds: EntityId[];
  coverage: "full" | "partial" | "missing";
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
  files?: RelativePath[];
  action?: string;
  verify?: string;
  done?: string;
  avoidAndWhy?: string[];
  failureScenario?: string;
  mustHaves?: MustHaves;
  wave?: number;
  contextBudgetPct?: number;
  routeHint?: RouteHint;
  providerUsed?: ModelProvider;
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
  stageRoute: string | null;
  stageTotal: number | null;
  progressSummary: string;
  keyDecisions: string[];
  preferences: string[];
  blockers: string[];
  nextRecommendedActions: string[];
  lastVerificationSummary: string | null;
  approvalsPending?: ApprovalRequirement[];
  currentSessionId?: string;
}

export interface ReviewFinding {
  severity: "p1" | "p2";
  category: string;
  title: string;
  details: string;
  filePath?: RelativePath;
  line?: number;
  evidenceDirection?: EvidenceDirection;
  evidenceConfidence?: EvidenceConfidence;
  evidenceBasis?: string;
  verificationObservationIds?: EntityId[];
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
  scenarioResults?: VerificationScenarioResult[];
  confidence?: "high" | "medium" | "low";
  knownRisks?: string[];
  handoffSummary?: string;
  observations?: VerificationObservation[];
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

export interface ShipReceipt extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId: EntityId;
  prUrl: string | null;
  commitSha: string;
  commitMessage: string;
  branch: string;
  baseBranch: string;
  tagName: string | null;
  deployUrl: string | null;
  deployPlatform: string | null;
  deployHealthStatus: string | null;
  specSummary: string;
  reviewVerdicts: Record<string, string | null>;
  changelogUpdated: boolean;
  shippedAt: ISODateString;
  confidence?: {
    level: 'high' | 'medium' | 'low' | 'unknown' | 'user-accepted-low';
    method: string;
    concerns: string[];
    escalated: boolean;
    escalationCount: number;
    checksRun: string[];
    checksSkipped: string[];
  };
}

export interface VerificationObservation {
  id: EntityId;
  subject: string;
  direction: EvidenceDirection;
  confidence: EvidenceConfidence;
  source: string;
  details?: string;
  relatedCheck?: string;
}

export interface VerificationScenario {
  id: EntityId;
  type: VerificationScenarioType;
  description: string;
  method: string;
  required: boolean;
}

export interface VerificationScenarioResult {
  scenarioId: EntityId;
  type: VerificationScenarioType;
  passed: boolean;
  details: string;
}

export interface IntakeBrief extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId?: EntityId;
  clientContext: string;
  workflowDescription: string;
  painPoints: string[];
  assumptions: string[];
  unresolvedQuestions: string[];
  operatorId?: EntityId;
}

export interface SolutionAlternative {
  name: string;
  description: string;
  effort: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  pros: string[];
  cons: string[];
}

export interface SolutionThesis extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId?: EntityId;
  recommendation: string;
  recommendationReason: string;
  alternatives: SolutionAlternative[];
}

export interface ReportCardDimension {
  score: number | null;
  source: ReportCardDimensionSource;
  evidence: string | null;
}

export interface SessionReportCard {
  schemaVersion: 1;
  sessionId: string;
  projectId: EntityId;
  timestamp: ISODateString;
  dimensions: {
    guided_start: ReportCardDimension;
    research_proof: ReportCardDimension;
    stress_verification: ReportCardDimension;
    evidence_quality: ReportCardDimension;
    post_handoff_bugs: ReportCardDimension;
    user_corrections: ReportCardDimension;
  };
  overallScore: number | null;
  summary: string;
  replaySessionId: string;
  crashRecovery: boolean;
  capabilitiesAvailable: string[];
}

export interface LearningJournalPattern {
  dimension: string;
  trend: TrendDirection;
  avgScore: number;
  occurrences: number;
  recurring: boolean;
  firstRecurringAt: ISODateString | null;
  detail: string;
  recentScores: (number | null)[];
}

export interface LearningJournal {
  schemaVersion: 1;
  lastUpdated: ISODateString;
  totalSessions: number;
  patterns: LearningJournalPattern[];
  overallTrend: TrendDirection;
  overallAvgScore: number;
}

export interface Prescription {
  schemaVersion: 1;
  id: EntityId;
  dimension: string;
  prescription: string;
  severity: PrescriptionSeverity;
  createdAt: ISODateString;
  status: PrescriptionStatus;
  resolvedAt: ISODateString | null;
  dismissedAt?: ISODateString | null;
  basedOnSessions: number;
  patternDetail: string;
}

export interface DogfoodIndexEntry {
  dimension: string;
  dogfoodNumber: number;
  status: "OPEN" | "RESOLVED";
  createdAt: ISODateString;
}

export interface DogfoodIndex {
  entries: DogfoodIndexEntry[];
}
