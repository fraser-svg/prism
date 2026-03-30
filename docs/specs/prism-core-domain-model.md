# Prism Core Domain Model

## Purpose

This spec defines the canonical entities Prism Core must operate on.

Prism should not depend on hidden prompt state to understand:
- what a project is
- what stage it is in
- what is being built
- what decisions have been made
- what is blocked
- what was verified
- what is safe to do next

These entities are the durable product brain.

## Scope

In scope:
- canonical entity definitions
- ownership boundaries
- required relationships between entities
- minimum persistence expectations

Out of scope:
- full TypeScript implementation
- final database schema details
- UI decisions

## Principles

1. Human-readable product truth belongs in durable artifacts.
2. Operational truth belongs in structured records.
3. Product memory and execution state are related but not identical.
4. Entities should be model-provider agnostic.
5. Every entity should support resuming work later without conversational reconstruction.

## Entities

### 1. Workspace

The top-level local Prism environment for one user.

Owns:
- project registry
- workspace settings
- provider configuration references
- integrations cabinet state
- local runtime metadata

Notes:
- MVP is single-user, so workspace is singular in practice
- multi-project behavior starts here

### 2. Project

A durable software product Prism is helping the user create or maintain.

Required fields:
- `project_id`
- `name`
- `slug`
- `status`
- `created_at`
- `updated_at`
- `root_path`
- `primary_platform`
- `product_type`

Status values:
- `active`
- `paused`
- `blocked`
- `archived`

Product should not be inferred from a current chat alone.

### 3. Product Brief

The concise articulation of what the product is and who it is for.

Captures:
- dream-state summary
- target user / ICP
- primary jobs to be done
- user-facing promise
- scope posture for current phase

Purpose:
- preserve the user’s intent in stable language
- anchor future specs and planning

### 4. Product Memory

The long-lived memory Prism keeps for a project.

Subdomains:
- `product`
  - what the product is
  - who it serves
  - why it exists
- `architecture`
  - technical shape
  - constraints
  - key patterns
- `roadmap`
  - sequencing and major milestones
- `state`
  - current progress, blockers, next actions
- `decisions`
  - durable architectural and product decisions

Purpose:
- continuity over time
- decision preservation
- cross-session context

### 5. Spec

A durable description of a bounded change or feature area before implementation.

Required fields:
- `spec_id`
- `project_id`
- `title`
- `type`
- `status`
- `summary`
- `scope`
- `non_goals`
- `acceptance_criteria`
- `verification_plan`

Type values:
- `product`
- `change`
- `task`

Status values:
- `draft`
- `approved`
- `superseded`
- `implemented`
- `verified`
- `shipped`

### 6. Plan

The execution shape Prism intends to follow for a spec.

Captures:
- ordered milestones or phases (with `goal`, `observableTruths`, `requiredArtifacts`, `requiredWiring`)
- task decomposition
- dependencies
- sequencing rationale
- identified risks
- required approvals
- `scopeMode` — controls task count limits (`full_build`, `targeted`, `exact`, `minimum_viable`)
- `alternatives` — structured implementation alternatives with effort/risk/pros/cons
- `selectedAlternative` — the chosen approach
- `deviationRules` — 4-tier escalation rules governing agent behaviour during execution
- `planVersion` — `1` for legacy format, `2` for structured format with quality gate enforcement
- `totalContextBudgetPct` — aggregate context budget across all tasks
- `goalBackwardTrace` — narrative linking spec goal to plan shape

Purpose:
- bridge from intent to execution
- make major changes legible before code exists
- enforce quality constraints before a single line of code is written

### 7. Task Graph

The bounded execution graph for implementation work.

Required fields:
- `task_graph_id`
- `project_id`
- `spec_id`
- `tasks`
- `dependencies`
- `status`

Each task should capture:
- `task_id`
- `title`
- `description`
- `owner_type`
- `status`
- `depends_on`
- `verification_requirements`
- `artifacts_touched`
- `files` — specific files the task will modify (required in v2 format)
- `action` — concrete implementation instruction (required in v2 format)
- `verify` — executable command or concrete check (required in v2 format)
- `done` — measurable acceptance criteria (required in v2 format)
- `mustHaves` — `ObservableTruths`, `ArtifactRequirements`, and `KeyLinks` with AC ID traceability
- `wave` — execution wave for parallel scheduling
- `contextBudgetPct` — estimated context window consumption
- `avoidAndWhy` — explicit anti-patterns for this task
- `failureScenario` — likely failure mode and why it fails
- `routeHint` — provider routing hint (`visual`, `backend`, `any`)
- `providerUsed` — records which model provider executed the task

Task status values:
- `pending`
- `ready`
- `running`
- `completed`
- `failed`
- `abandoned`
- `blocked`

### 8. Workflow Run

A concrete execution attempt for a plan or task graph.

Captures:
- `run_id`
- `project_id`
- `spec_id`
- `phase`
- `started_at`
- `ended_at`
- `status`
- `initiator`

Purpose:
- distinguish durable product truth from a specific attempt to make progress
- support retries and diagnostics

### 9. Checkpoint

The resumable summary of where Prism currently is.

Captures:
- current phase
- active change/spec
- progress summary
- key decisions in this run
- open blockers
- next recommended actions
- last successful verification state

Purpose:
- session recovery
- context compaction resilience
- user-facing continuity

### 10. Review

A formal judgment artifact produced by Prism’s Guardian layer.

Review types:
- `planning`
- `engineering`
- `qa`
- `design`
- `ship_readiness`
- `codex`

Required fields:
- `review_id`
- `project_id`
- `spec_id`
- `review_type`
- `verdict`
- `findings`
- `created_at`

Verdict values:
- `pass`
- `hold`
- `fail`
- `not_applicable`

### 11. Verification Result

The structured output of deterministic checks.

Captures:
- `verification_id`
- `project_id`
- `spec_id`
- `run_id`
- `checks_run`
- `passed`
- `failures`
- `timestamp`

Check families:
- file checks
- lint
- typecheck
- tests
- build
- script suite
- custom gate checks

### 12. Release State

The ship/readiness status for a bounded piece of work.

Captures:
- implementation completion
- review completion
- verification completion
- approval completion
- release decision

Purpose:
- prevent “built” from being confused with “ready”

### 13. Integration Connection

A record of an external system Prism may need to use.

Captures:
- provider identity
- connection status
- scope
- approval requirements
- secret reference
- last validation time

Purpose:
- separate “we know about this integration” from “it is safe to use it now”

### 14. Provider Profile

A workspace-level definition of which model or service providers are available.

Captures:
- provider name
- capabilities
- auth method
- local config reference
- availability status

Purpose:
- preserve model-provider agnosticism in the architecture

### 15. Ship Receipt

A durable record of a shipped piece of work.

Captures:
- `receipt_id`
- `spec_id`
- `pr_url`
- `commit_sha`
- `deploy_status`
- `review_verdicts`
- `timestamps`

Purpose:
- persistent evidence that work was shipped and how

### 16. Intake Brief

A structured capture of the initial client brief before discovery transforms it.

Captures:
- `brief_id`
- `project_id`
- `raw_request`
- `client_context`
- `constraints`
- `created_at`

Purpose:
- preserve the original request so Prism can track how discovery reshaped it

### 17. Solution Thesis

A shaped solution proposal linking the real problem to a concrete approach.

Captures:
- `thesis_id`
- `project_id`
- `problem_statement_id`
- `proposed_approach`
- `alternatives`
- `selected_alternative`
- `rationale`

Purpose:
- bridge between discovery (the real problem) and spec (what to build)

### 18. Verification Scenario

A structured verification plan derived from acceptance criteria.

Captures:
- `scenario_id`
- `spec_id`
- `description`
- `type` (automated, manual, observational)
- `observations` (list of verification observations)

Purpose:
- make verification traceable to specific acceptance criteria

### 19. Session Report Card

A post-session quality assessment generated by the self-healing engine.

Captures:
- `session_id`
- `spec_id`
- `dimensions` (guided start, research proof, stress verification, evidence quality)
- `overall_score`
- `patterns_detected`
- `timestamp`

Purpose:
- structured evidence of session quality for learning and improvement

## Relationships

- A `Workspace` owns many `Projects`.
- A `Project` has one active `Product Brief`.
- A `Project` has one evolving `Product Memory`.
- A `Project` has many `Specs`.
- A `Spec` may have one or more `Plans`.
- A `Plan` may produce one or more `Task Graphs`.
- A `Task Graph` may produce multiple `Workflow Runs`.
- A `Workflow Run` may emit `Checkpoints`, `Verification Results`, and `Reviews`.
- A `Release State` summarizes whether a `Spec` or bounded delivery unit is safe to advance.
- `Integration Connections` and `Provider Profiles` inform execution but do not redefine product truth.
- A `Project` may have one or more `Intake Briefs`.
- A `Project` may have one or more `Solution Theses`.
- A `Spec` may have one or more `Verification Scenarios`.
- A `Workflow Run` may produce `Session Report Cards` via the self-healing engine.

## Required Behavioral Rules

1. A project cannot be considered implementation-ready without a `Spec` or approved bounded task artifact.
2. A `Plan` cannot silently replace a `Spec`; it refines it.
3. A `Checkpoint` cannot be the only source of truth for product direction.
4. `Review` artifacts must remain separate from `Verification Results`.
5. `Release State` must be derived from evidence, not optimism.
6. `Task Graph` execution status must never overwrite product memory.
7. External-provider configuration must remain decoupled from user-facing project intent.

## Acceptance Criteria

### Requirement: Prism Core has a canonical project model
The system SHALL define durable entities for workspace, project, product brief, and product memory.

#### Scenario: project continuity
- **WHEN** Prism resumes work on an existing project
- **THEN** it can recover what the product is, where it stands, and what happens next without relying on hidden chat context

### Requirement: Prism Core separates planning from execution
The system SHALL represent specs, plans, task graphs, and workflow runs as distinct entities.

#### Scenario: retries do not corrupt product truth
- **WHEN** an implementation run fails and is retried
- **THEN** the run state can change without destroying the original spec, plan, or product memory

### Requirement: Prism Core separates review from verification
The system SHALL model reviews and deterministic verification results independently.

#### Scenario: ship decision
- **WHEN** Prism evaluates whether work is ready to ship
- **THEN** it can inspect both review verdicts and deterministic checks instead of collapsing them into one opaque status
