# Prism Operating System Roadmap

## Status

Direction document. Captures the target architecture and product thesis for Prism's evolution from a Claude Code skill into a local-first desktop operating system. Implementation is post-YC validation — this document guides sequencing, not current sprint work.

Generated from CEO review on 2026-03-30, branch `fraser-svg/doc-review-plan`.

## Product Thesis

Prism gives every agency operator a world-class founding team — one that handles intake, shaping, building, deploying, and iterating for their clients. The operator speaks in briefs and direction. Prism translates that into delivered client software through an invisible team of experts.

Prism is durable against frontier-model progress because it owns what models will not: the intake-to-observe workflow, hard stage gates, durable memory, deployment state, and post-launch iteration loops.

## Locked Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary ICP | Agency operators and owners delivering software outcomes for clients | Tighter wedge than "all creators." Repeatable workflow, built-in monetization, portfolio retention moat. Creators are the expansion play. |
| Platform posture | Desktop-first, local-first, single-user V1 | Cloud is additive later. Local-first artifacts are the moat. |
| Desktop shell | Electron with Node runtime | better-sqlite3 consumed directly. No WASM bridging needed. Decided during M4 CEO review. |
| Near-term bias | User proof before architecture expansion | 0/5 user proof is the existential gap. Architecture follows validation. |
| Storage model | SQLite + file artifacts | Proven in M4. WAL mode. File artifacts are human-readable truth. |
| Legacy posture | Dual-write stays during migration; no new capability depends on OpenSpec (the `openspec/changes/` directory structure) or hidden prompt state (SKILL.md inline context that isn't persisted as artifacts) | |

## ICP: Agency Operators

**Primary user:** Agency operators, freelancers, and studio owners who use AI coding tools to deliver client software. They know what their clients need. The problem is the build breaks at 80%, nobody defined "done" before starting, and there's no durable record of what was delivered.

**Why agencies, not all creators:**
- Money follows delivery — every project has a dollar value attached
- Repeatable workflow — intake → shape → build → deploy → iterate maps to how agencies already work
- Portfolio = retention moat — an agency with 5 active client projects can't leave
- Narrower = more defensible — "the operating system for AI-first agencies" is a category Prism can own

**Expansion play:** Semi-technical creators (frustrated vibe coders, designers, domain experts, solo founders) remain the broader market. The "dream team" narrative works for both. Agency operators are the beachhead, not the ceiling.

## Canonical Lifecycle: 9 Stages

### Target State

```
intake → clarify → shape → spec → plan → build → verify → deploy → observe
```

`resume` is a cross-cutting capability, not a stage. The resume *capability* (reopen a project mid-lifecycle and pick up where it left off) is preserved and central to Prism's value. Only the *stage value* `"resume"` in the `WorkflowPhase` type is retired — it was an awkward fit as a lifecycle stage when it's actually a system operation that can target any stage.

### Migration Path from Current 8 Phases

```
  CURRENT (8 phases)              TARGET (9 stages)
  ═══════════════════             ═══════════════════
  understand ─────────────────→   intake
  identify_problem ───┬───────→   clarify
                      └───────→   shape (NEW — split from identify_problem)
  spec ───────────────────────→   spec
  plan ───────────────────────→   plan
  execute ────────────────────→   build (rename)
  verify ─────────────────────→   verify
  release ────────────┬───────→   deploy
                      └───────→   observe (NEW — split from release)
  resume ─────────────────────→   (cross-cutting, removed as stage)
```

**Migration strategy:** Additive. Add new stage values to the `WorkflowPhase` union type. Map old values in existing checkpoints and artifacts. Deprecate old names over 2 releases. Never break resume — old checkpoint files must resolve to valid new stages.

**Programmatic phase→stage mapping (for resume-engine and checkpoint migration):**

```typescript
function migratePhase(old: string): Stage {
  switch (old) {
    case "understand":        return "intake";
    case "identify_problem":  return "clarify";  // shape did not exist; safest default
    case "spec":              return "spec";
    case "plan":              return "plan";
    case "execute":           return "build";
    case "verify":            return "verify";
    case "release":           return "deploy";   // observe did not exist; safest default
    case "resume":            return "intake";    // resume is no longer a stage; restart at intake
    default:                  return "intake";    // unknown → cold start
  }
}
```

**`resume` removal:** Keep `"resume"` in the `WorkflowPhase` union type during the migration window so old checkpoints can be deserialized. The migration function maps it to `"intake"`. After all known checkpoints have been migrated (verified by a migration script scanning `.prism/checkpoints/`), remove `"resume"` from the type. The `VALID_TRANSITIONS` map in `gate-evaluator.ts` must be rewritten to use the 9-stage names, with backward-compat entries for old phase names during the migration window.

### Stage Gates

Every transition between stages is gated. Gates are listed in order. Gates marked "lightweight" check only for directory/artifact existence (matching current behavior for early stages). Gates marked "strict" require specific artifact content.

```
  INTAKE → CLARIFY (lightweight)
  ├── Required: .prism/ directory exists
  └── Mirrors current understand→identify_problem gate

  Gate A: CLARIFY → SHAPE (strict — NEW)
  ├── Required: IntakeBrief artifact exists with non-empty fields:
  │             operatorId, workflowDescription, painPoints (≥1), assumptions (≥1)
  ├── Required: unresolvedQuestions array is empty (all questions addressed)
  └── Blocks if: IntakeBrief missing, any required field empty, or unresolved questions remain
  └── Depends on: IntakeBrief entity (Tier 1) — gate cannot be strict until entity exists

  Gate B: SHAPE → SPEC (strict — NEW)
  ├── Required: SolutionThesis artifact OR ProblemStatement with reframed=true
  │             (SolutionThesis is Tier 2; at Tier 1 the ProblemStatement serves as the shaping output)
  ├── Required: includedScope (≥1), excludedScope (≥1), successCriteria (≥1)
  └── Blocks if: scope not bounded or success criteria missing

  Gate C: SPEC → PLAN (strict — extends existing spec→plan gate)
  ├── Required: Spec artifact with status="approved" and acceptanceCriteria.length > 0
  └── Mirrors current gate-evaluator.ts spec→plan logic

  Gate D: PLAN → BUILD (strict — extends existing plan→execute gate)
  ├── Required: approved Spec, Plan with specId match, TaskGraph file exists
  ├── Required: Plan.verificationPlan has ≥1 check (the "verification plan")
  ├── Required: Plan.phases includes ≥1 phase mentioning deploy/ship (the "deployment intention")
  │             (Note: "deployment plan" means the Plan artifact addresses deployment, not a separate entity)
  ├── Required: Plan quality gate passes (8-dimension checker)
  └── Blocks if: any artifact missing, unapproved, or quality gate fails

  Gate E: BUILD → DEPLOY (strict — extends existing verify→release gate)
  ├── Required: VerificationResult with passed=true
  ├── Required: All required reviews complete (isReviewComplete returns true)
  ├── Required: All ApprovalRequirements in Plan.approvals are satisfied
  │             (Note: "approval integrity" means every approval in the plan has a matching approval record)
  └── Blocks if: verification failed, reviews incomplete, or approvals unsatisfied

  Gate F: DEPLOY → OBSERVE (strict — NEW)
  ├── Required: Deployment artifact with status="live" and url is non-empty
  ├── Required: Deployment.healthStatus is "healthy", "unknown", or "degraded" (not "failing")
  │             (Note: "degraded" warns but passes; "failing" blocks)
  └── Blocks if: no Deployment artifact, deploy not live, or deploy health is "failing"
  └── Depends on: Deployment entity (Tier 1) — gate cannot be strict until entity exists
  └── Note: FeedbackRecord and IterationPlan are NOT gate requirements — they are
            outputs of the observe stage, not prerequisites to enter it
```

**Gate dependency on entities:** Gates A and F depend on Tier 1 entities (IntakeBrief, Deployment). Implementation order: Tier 1 entities ship in the same milestone as their gates. During migration, these gates run in advisory mode (warn but don't block) until the entities are populated.

Gates C, D, and E extend existing gate logic in `gate-evaluator.ts` with minimal changes. The INTAKE→CLARIFY gate mirrors the existing lightweight check.

## Entity Expansion Tiers

New entities are tiered by when they become necessary:

### Tier 1: Needed for User Proof (implement first)

| Entity | Purpose | Extends/Replaces |
|--------|---------|-----------------|
| `IntakeBrief` | Structured output from Socratic discovery — persists client context, workflow, pain points (see field list below) | NEW — currently discovery output is prompt-only |
| `Deployment` | First-class deploy tracking — URL, environment, health, linked build, approval record | Extracts from `ShipReceipt.deployUrl/deployPlatform/deployHealthStatus` |

**IntakeBrief field list:**

```typescript
// AuditStamp is defined in packages/core/src/common.ts: { createdAt: ISODateString; updatedAt: ISODateString }
interface IntakeBrief extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  operatorId: string;                  // who submitted this brief (agency team member)
  clientContext: string;               // who is the client, what do they do
  workflowDescription: string;         // what workflow or process is being addressed
  painPoints: string[];                // concrete pain/failure descriptions (≥1 required)
  assumptions: string[];               // what we assume to be true (≥1 required)
  unresolvedQuestions: string[];        // questions that need answers before shaping (must be empty to pass Gate A)
  desiredOutcome: string;              // what success looks like from the client's perspective
  constraints: string[];               // budget, timeline, technical constraints
}
```

**Deployment field list:**

```typescript
interface Deployment extends AuditStamp {
  id: EntityId;
  projectId: EntityId;
  specId: EntityId;
  buildRunId: EntityId | null;         // links to the build that produced this deploy
  platform: string;                     // "vercel" | "netlify" | "railway" | "fly" | "manual"
  url: string;                          // live URL
  environment: string;                  // "production" | "staging" | "preview"
  status: "pending" | "deploying" | "live" | "failed" | "rolled_back";
  healthStatus: "healthy" | "degraded" | "failing" | "unknown";
  healthCheckUrl: string | null;        // URL to check for health
  approvalRecord: EntityId | null;      // links to the approval that authorized this deploy
  launchNotes: string | null;           // operator notes at deploy time
}
```

### Tier 2: Needed for Agency Workflow (implement after validation)

| Entity | Purpose | Extends/Replaces |
|--------|---------|-----------------|
| `ClientAccount` | Agency-facing client identity — links projects to client context | NEW |
| `SolutionThesis` | Structured output from shaping — the "what we're building and why" artifact | NEW |
| `FeedbackRecord` | Client feedback, defects, analytics summaries per deployment | NEW |

### Tier 3: Nice-to-Have (implement when needed)

| Entity | Purpose | Extends/Replaces |
|--------|---------|-----------------|
| `ProviderRun` | Per-provider execution tracking for model routing analytics | Extends `WorkflowRun` |
| `GateDecision` | Durable record of gate evaluations | Extends existing `GateResult` return type |
| `Environment` | Named deployment targets (staging, production, client-preview) | NEW |
| `DecisionEntry` | Structured decision log entry with rationale and alternatives | NEW |
| `Assumption` | Tracked assumption with validation status | Currently a `string[]` on `ProblemStatement` |
| `IterationPlan` | Post-observe plan for next build cycle | NEW |
| `BuildRun` | Richer execution tracking than `WorkflowRun` | Extends `WorkflowRun` |

### Extending `Project` for Agencies

```typescript
// Added fields to existing Project entity
interface Project extends AuditStamp {
  // ... existing fields ...
  clientAccountId: EntityId | null;    // links to ClientAccount
  owner: string | null;                 // agency team member responsible
  priority: "critical" | "high" | "normal" | "low";
  liveUrls: string[];                   // denormalized from Deployment entities (read-only cache)
  riskState: "healthy" | "at_risk" | "blocked";
}
```

**Authority rule for URLs:** `Deployment.url` is the source of truth. `Project.liveUrls` is a denormalized read cache populated by a write-through callback in the `Deployment` repository's `save()` method. On project load, `liveUrls` is recomputed from `Deployment` entities as a read-through fallback (handles any missed writes). The desktop shell reads `Project.liveUrls` for the portfolio view (fast) and `Deployment` entities for the detail pane (authoritative).

### Artifact Lineage

```
IntakeBrief → ProblemStatement → [SolutionThesis] → Spec → Plan →
TaskGraph → WorkflowRun/VerificationResult → Deployment → [FeedbackRecord] → [IterationPlan]
                                                                │
                                                                └──→ (next cycle: back to Shape or Spec)

Brackets indicate entities that may not exist at all tiers:
  - At Tier 1: IntakeBrief → ProblemStatement (with reframed=true) → Spec (SolutionThesis skipped; ProblemStatement.reframed=true serves as the shaping output)
  - At Tier 2: Full chain including SolutionThesis and FeedbackRecord
  - At Tier 3: Full chain including BuildRun, IterationPlan, GateDecision
```

Every downstream artifact carries a `parentId` or `specId` reference to its parent. Lineage is queryable: "show me everything that traces back to this intake brief." At Tier 1, the lineage is shorter but unbroken — `ProblemStatement.specId` connects to `Spec`, which connects forward.

## App-Facing Service Layer

`packages/ui` becomes the sole application boundary. The desktop shell must not import `memory`, `orchestrator`, or `guardian` directly.

### AppService Facade

```
Portfolio:    listProjects · createProject · openProject · workspaceStatus
Shaping:      saveIntakeBrief · saveProblemStatement · saveSolutionThesis
Delivery:     startSpec · approveSpec · approvePlan · runBuild · runVerify · runDeploy
Observe:      saveFeedbackRecord · saveIterationPlan · getDeploymentHealth
Continuity:   getProjectTimeline · getGateStatus · getDecisionLog · getDeploymentStatus · resumeProject
```

All methods return plain serializable objects (no class instances). Error types are explicit union types, not thrown exceptions. Note: `AbsolutePath` in the current codebase is `type AbsolutePath = string` — already serializable. This constraint anticipates future branded-type changes and ensures the contract stays stable.

Full method signatures will be defined when `packages/ui` is created in M8. The names above establish the shape of the API surface.

### IPC Contract

Typed request/response pairs for every `AppService` method. Event streams for: project updates, run status, gate failures, deployment health. All payloads are plain JSON — no branded types cross the IPC boundary.

## Desktop Shell (Electron)

### Minimum Viable Shell

| Pane | Priority | Shows |
|------|----------|-------|
| Portfolio view | 1st (default) | Which client projects need attention |
| Project control room | 2nd (on select) | Current stage, blockers, next action, live URLs |
| Artifact pane | On demand | Specs, plans, reviews for selected project |
| Decision/assumption pane | On demand (requires Tier 3 entities — deferred past MVP shell) | Decision log, tracked assumptions |
| Runs/logs pane | On demand | Build history, verification results |
| Deployment/health pane | On demand | Deploy status, health checks, environment state |

### Design Principles

- **Calm and non-technical on the surface.** Stage timeline, blockers, recommendations, live URLs, and next actions. Hide implementation churn by default.
- **Agency-native information hierarchy.** First: which clients need attention. Second: what's the status. Third: details on demand.
- **Empty states are features.** Zero projects, one project, fifteen projects — all feel intentional.

### Not in V1

- Full collaboration / multi-user
- Authentication / billing
- Cloud sync
- Plugin marketplace

## Non-Goals

- No cloud-first auth/billing in V1
- No collaboration suite in V1
- No plugin marketplace
- No broad consumer no-code positioning — Prism is for agency operators, not everyone
- No provider explosion — support Anthropic and Google, not all providers

## Verification Scenarios (for future implementation)

When this roadmap is implemented, these test scenarios must pass:

1. **Migration tests:** Old 8-phase checkpoint files resume correctly into the 9-stage lifecycle
2. **Gate tests:** Each gate (A-F) refuses progression for the exact missing inputs defined above
3. **Artifact lineage tests:** Every downstream artifact links back to the shaping artifacts that justified it
4. **Runtime tests:** Build, verify, deploy, and observe records persist correctly through retries and resume
5. **Desktop contract tests:** Every `AppService` method is JSON-serializable and IPC-safe
6. **End-to-end tests:** One project completes `intake → observe` with a live deployment record (iteration plan deferred to Tier 3)
7. **UX smoke tests:** Portfolio and control-room views show stage, blockers, live URL, and next action without exposing terminal detail
8. **Backward-compat tests:** Existing SKILL.md-driven sessions (the "skill-bridge" path where the Claude Code skill calls the bridge CLI for dual-write) still function during migration; no new core behavior depends on them

## Milestone Exit Criteria

| Milestone | Exit Criteria |
|-----------|--------------|
| M5 (Direction + Hardening) | Repo docs aligned. Vision doc committed. Gate/resume resilience shipped. Patrick session completed with structured evidence. |
| M6 (Lifecycle + Tier 1 Entities) | 9-stage lifecycle is canonical. Tier 1 entities (IntakeBrief, Deployment) exist with repositories. Gates A-F in advisory mode. Migration from 8-phase data works via `scripts/migrate-phases.ts`. At least one test project populates IntakeBrief and Deployment through the gates in advisory mode. Note: gates and their required entities ship together — no gate depends on an entity from a later milestone. Advisory mode exits when M7 graduates gates to blocking. |
| M7 (Agency Entities + Strict Gates) | Tier 2 entities (ClientAccount, SolutionThesis, FeedbackRecord). Gates A-F graduated to blocking. Agency project fields populated. |
| M8 (App Service Layer) | `packages/ui` AppService facade powers a shell without direct package coupling. IPC event streams (project updates, run status, gate failures, deploy health) owned by this milestone. |
| M9 (Desktop Shell) | Electron shell runs one full project loop end to end. |
| M10 (Dogfood + Demo) | Two agency-style projects validate the full intake-to-observe loop. |

## Assumptions

- Electron is the desktop shell unless a hard technical blocker appears; do not reopen this choice during implementation.
- Keep SQLite + file artifacts as the local-first storage model.
- Preserve existing scripts and adapters where they already work; wrap them rather than rewrite unless they block canonical ownership.
- Do not pursue hosted-web product work until the desktop control plane can complete one full intake-to-observe loop locally.
