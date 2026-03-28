# Prism Core M2: Spec-Driven Lifecycle Enforcement

Status: Proposed
Date: 2026-03-27
Milestone: M2

## Findings First

### Most Important Risks

1. The typed core model exists, but the runtime does not enforce it.
   - `packages/core/src/entities.ts` defines `Spec`, `Plan`, `TaskGraph`, `Checkpoint`, `Review`, `VerificationResult`, and `ReleaseState`, but the active services do not require those entities before advancing work.

2. Orchestration still depends on transitional registry and script outputs instead of canonical Prism Core entities.
   - `packages/orchestrator/src/services.ts` resumes from registry stage strings and never resolves an active spec.
   - `packages/orchestrator/src/adapters.ts` exposes legacy registry and supervisor payloads directly as the orchestration contract.

3. Spec-driven development is described in docs but not enforced in code.
   - `docs/specs/README.md`, `docs/quality/definition-of-done.md`, and `docs/quality/release-gates.md` define an artifact ladder and gates that the services do not currently check.

4. Approval boundaries are not yet architecture-level gates.
   - `packages/orchestrator/src/workflow.ts` only checks `blockers` and `approvalsPending` arrays.
   - `packages/orchestrator/src/services.ts` can save progress without verifying approval state.
   - `scripts/prism-save.sh` can create branches, commit, and push without an orchestrator-owned release decision.

5. Guardian currently verifies syntax health, not completion readiness.
   - `packages/guardian/src/adapters.ts` only wraps file checks, lint, and compile.
   - The review and release-gate model exists in docs and references, but not in the Guardian package API.

## Core OS Audit

### What Is Strong

- Product direction is unusually clear and consistent across repo guidance.
- Module boundaries are explicit and sane.
- The core entity vocabulary is a good foundation for durable state.
- Artifact path contracts match the intended local-first storage model.
- The shell runtime is mature enough to preserve rather than replace.
- The shell-script suite is validated end to end. `bash scripts/test-scripts.sh` passed `211/211`.

### What Is Weak

- The domain model is mostly type definitions, not an enforced persistence and transition system.
- Memory owns path contracts and a few script adapters, but not canonical spec/plan/review/run repositories.
- Orchestrator services are convenience wrappers around scripts, not the owner of lifecycle truth.
- Guardian lacks native review orchestration, release-state derivation, and failure classification.
- Execution lacks approval-aware intents for save, commit, push, or external side effects.

### What Is Conflicting

- Docs say registry-driven state is transitional, but the runtime still treats it as the main source of lifecycle truth.
- Docs say Prism is spec-driven, but execution planning can proceed without checking for an approved spec or plan.
- Docs say release requires review, verification, memory, and approval integrity, but no runtime gate composes those checks yet.

### What Is Missing

- Canonical repositories for specs, plans, task graphs, checkpoints, reviews, verification results, and release state.
- A gate evaluator that blocks transitions when required artifacts are absent or invalid.
- Approval pause handling that sits above execution and save/push operations.
- Resume logic that restores active spec, plan, blockers, and next actions from canonical artifacts.
- End-to-end lifecycle tests for `understand -> identify_problem -> spec -> plan -> execute -> verify -> release -> resume`.

### Highest-Leverage Next Move

Build the enforcement layer before expanding capability.

The next stage should turn the current domain model, artifact rules, and deterministic scripts into one spec-driven lifecycle engine that:
- refuses execution without an approved spec and plan
- refuses release without review, verification, memory, and approval evidence
- resumes from durable artifacts rather than hidden prompt context or transitional registry state

## Stage Definition

### Objective

Make Prism Core's lifecycle explicit and enforceable, not just documented.

Prism should be able to move one project through:
- discovery
- problem identification
- spec approval
- plan approval
- bounded execution
- verification
- release readiness
- resumable continuation

with durable artifacts and gate checks at each step.

### Why It Matters

This is the stage that prevents Prism from collapsing back into prompt-led behavior.

Without lifecycle enforcement:
- the typed domain model is decorative
- the release gates are advisory only
- the system can still build from vague intent or hidden state
- desktop work would be built on a control plane that cannot defend its own rules

### In Scope

- lifecycle transition policy for all workflow phases
- canonical artifact repositories for spec, plan, task graph, checkpoint, review, verification result, and release state
- transition gate evaluation for scope, architecture, verification, review, memory, and approval integrity
- approval pause handling for externally consequential actions
- canonical resume semantics from durable artifacts
- structured Guardian review orchestration contracts
- end-to-end tests for lifecycle advancement, regression, pause, and resume

### Out Of Scope

- replacing the current shell runtime wholesale
- broad provider expansion
- workspace-wide SQLite indexing
- desktop shell work
- major UI work

### Required Artifacts This Stage Should Produce

- a locked M2 lifecycle spec
- canonical repository/service contracts for lifecycle artifacts
- a transition-and-gates matrix
- a release-state derivation contract
- a migration note for transitional registry usage
- lifecycle integration tests and fixtures

### Must Be True When Done

1. Prism cannot enter `execute` without an approved spec, a linked plan, and a task graph derived from them.
2. Prism cannot enter `verify` or `release` without recorded verification and review evidence.
3. Prism cannot claim release readiness without a derived `ReleaseState`.
4. Prism cannot trigger save/push or other consequential execution paths without approval-aware orchestration.
5. Resume can recover active spec, active phase, blockers, next actions, and last verification state from durable artifacts.
6. One reference project can traverse the full lifecycle without relying on hidden chat context.

## Spec-Driven Enforcement Plan

### Required Artifacts

- product context when direction changes
- approved spec before execution planning
- approved plan before task-graph creation
- checkpoint updates during lifecycle progression
- review artifacts before release decisions
- verification results before pass/fail release outcomes
- release state derived from evidence, not manual optimism

### Gating Rules

1. `understand -> identify_problem`
   - requires project context and active problem framing
2. `identify_problem -> spec`
   - requires bounded scope and explicit non-goals
3. `spec -> plan`
   - requires approved spec with acceptance criteria and verification plan
4. `plan -> execute`
   - requires approved plan, decomposed task graph, approval requirements recorded
5. `execute -> verify`
   - requires checkpoint, changed-artifact summary, and implementation evidence
6. `verify -> release`
   - requires verification results plus required review verdicts
7. `release -> shipped/next resume`
   - requires release-state pass and any required user approval

### Change Lifecycle

1. Create or update product context.
2. Draft and approve spec.
3. Draft and approve plan.
4. Derive task graph.
5. Execute bounded tasks.
6. Run deterministic verification.
7. Run required review lenses.
8. Derive release state.
9. Save checkpoint and resume metadata.

### Approval Points

- paid or external dependencies
- destructive operations
- account/security changes
- irreversible release actions
- auto-save push behavior when it would create external side effects

### Where Enforcement Lives

- `packages/core`
  - canonical lifecycle vocabulary, gate result types, release-state contract
- `packages/memory`
  - repositories for artifact read/write and canonical lookup
- `packages/orchestrator`
  - transition evaluator, approval pause logic, resume engine, lifecycle services
- `packages/guardian`
  - review orchestration, verification aggregation, release-state evidence
- `packages/execution`
  - execution intents only; never decides whether a phase is allowed

## Ordered Plan

### 1. Lock the lifecycle contract

Purpose:
- turn M2 from a vague workflow milestone into an enforceable stage definition

Output:
- approved lifecycle spec, milestone alignment, gate matrix

Dependencies:
- current architecture docs and domain model

Verification:
- doc review for consistency against `AGENTS.md`, `PLANS.md`, architecture docs, and quality gates

### 2. Define canonical lifecycle repositories

Purpose:
- make spec, plan, checkpoint, review, verification, and release artifacts first-class runtime inputs

Output:
- repository interfaces and artifact metadata contracts

Dependencies:
- locked lifecycle contract

Verification:
- type-level contract checks and repository fixture tests

### 3. Define transition gate evaluation

Purpose:
- centralize the logic that decides whether a workflow phase may advance, pause, or regress

Output:
- gate evaluator contract and transition result model

Dependencies:
- lifecycle repositories

Verification:
- unit tests for pass, hold, fail, and regression cases

### 4. Refactor resume around canonical artifacts

Purpose:
- stop resume from depending on registry stage strings as primary truth

Output:
- resume service that resolves active spec, phase, blockers, next actions, and evidence from artifacts

Dependencies:
- lifecycle repositories and gate evaluator

Verification:
- integration tests for cold resume, in-progress resume, and verification-failed resume

### 5. Add Guardian review and release-state orchestration

Purpose:
- make review and release evidence native to the control plane

Output:
- review orchestration API, release-state derivation contract, required review matrix

Dependencies:
- gate evaluator and canonical repositories

Verification:
- tests covering missing review, failed verification, and ready-to-release scenarios

### 6. Make execution approval-aware

Purpose:
- ensure commits, pushes, and other consequential operations are requested through orchestrator policy

Output:
- execution intent contracts and approval pause enforcement

Dependencies:
- gate evaluator and release-state derivation

Verification:
- tests proving blocked operations cannot run without required approval state

### 7. Prove one end-to-end lifecycle

Purpose:
- demonstrate that Prism Core OS can govern one full project flow without hidden state

Output:
- reference lifecycle fixture and end-to-end test coverage

Dependencies:
- all prior changes

Verification:
- lifecycle integration suite plus existing shell-script regression suite

## Entry / Exit Criteria

### Entry Criteria

- M0 and M1 artifacts exist and are accepted
- module boundaries remain locked
- shell-script substrate remains available behind adapters
- lifecycle stage is defined as a Core OS stage, not a desktop-shell stage

### Exit Criteria

- M2 lifecycle spec is reflected in repo plans
- lifecycle repositories exist for all required artifacts
- orchestrator advances only through gate evaluation
- guardian contributes review and release evidence, not just syntax checks
- execution side effects respect approval pauses
- lifecycle tests prove durable resume and gated progression

### Definition Of Not Done

M2 is not done if any of these remain true:
- execution can start without an approved spec and plan
- release readiness is still inferred from ad hoc status checks
- registry state is still the primary workflow authority
- review artifacts remain reference content instead of runtime evidence
- save or push behavior can bypass approval policy
- successful progress still depends on hidden prompt context
