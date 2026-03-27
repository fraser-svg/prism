# Prism Build Plan

## Current Phase

Phase 2: Spec-Driven Workflow Enforcement

Purpose:
- turn the documented lifecycle into an enforced control plane
- make specs, plans, reviews, and release state runtime requirements
- prevent drift back into hidden-state or prompt-led execution

## Repo Truth

What exists now:
- a strong product thesis and vision
- substantial deterministic shell infrastructure
- compiler, hooks, review references, and planning notes
- an exploratory app shell with early Forge-style UI ideas
- typed core packages for domain, memory, orchestration, guardian, and execution
- passing shell-script regression coverage for the current runtime substrate

What is still missing:
- executable lifecycle gates tied to canonical artifacts
- canonical repositories for specs, plans, reviews, runs, and release state
- approval-aware execution policy
- review and release orchestration inside the guardian layer
- resume semantics that rely on durable artifacts instead of transitional registry state

## Architecture Direction

This repo becomes the owned Prism Core first.

Prism Core responsibilities:
- domain models
- workflow orchestration
- product memory
- artifact management
- review and verification
- execution coordination
- provider abstraction

The future desktop app is a client shell on top of this core, not a substitute for it.

## Milestones

### M0. Build Brain

Goal:
- establish the planning and architecture scaffolding for the repo

Deliverables:
- root `AGENTS.md`
- `PLANS.md`
- truth report
- target architecture
- initial ADRs
- quality gates
- spec workflow docs

Exit criteria:
- future work has a clear operating model
- architecture direction is explicit
- definition of done is written

### M1. Prism Core Domain Model

Goal:
- define the core product and orchestration entities

Scope:
- project
- product memory
- spec
- plan
- task
- checkpoint
- review
- run
- release state

Exit criteria:
- durable schemas and artifact contracts exist
- memory and orchestration stop depending on implicit prompt structure

### M2. Spec-Driven Workflow Engine

Goal:
- make `discover -> spec -> plan -> execute -> verify -> ship -> resume` explicit and enforceable

Scope:
- state machine
- workflow transitions
- artifact gating
- approval boundaries
- checkpoint and release-state semantics
- resumability rules
- registry-to-entity transition policy

Exit criteria:
- one project can move through the lifecycle with durable state
- execution is blocked without required artifacts
- release readiness is derived from evidence, not optimism

### M3. Execution and Guardian

Goal:
- execute bounded work safely and verify it properly

Scope:
- provider adapters
- worker boundaries
- execution contracts
- review pipeline
- QA and recovery loop

Exit criteria:
- Prism can perform bounded build work with meaningful validation and retries

### M4. Local-First Workspace Foundation

Goal:
- support multi-project local-first use

Scope:
- local storage layout
- project switching
- integrations cabinet model
- progress and history surfaces

Exit criteria:
- Prism Core can power a real desktop workspace without losing continuity

### M5. Desktop Shell Enablement

Goal:
- prepare the core for a Tauri-powered desktop product

Scope:
- app-facing APIs
- desktop integration boundaries
- packaging constraints
- macOS-first decisions

Exit criteria:
- desktop shell can be built on top without re-architecting the core

## Priority Stack

### Now

- lock M2 as the spec-driven workflow enforcement stage
- define canonical lifecycle repositories and gate evaluation
- move resume and phase transitions onto durable artifacts
- make approvals and release evidence first-class runtime inputs

### Next

- expand guardian review orchestration and release-state derivation
- make execution intents approval-aware
- prove one end-to-end lifecycle with durable resume

### Later

- evolve execution adapters
- introduce desktop-facing APIs
- build polished workspace UX
- add sync/cloud features

### Not Now

- full team collaboration
- enterprise governance
- broad provider explosion
- browser-first product strategy

## Active Bets

1. Local-first owned artifacts are a moat, not an inconvenience.
2. Typed workflow and memory models will outperform prompt-only coordination.
3. Bounded workers plus deterministic scripts produce better reliability than giant agent prompts.
4. Calm UX requires aggressive hiding of technical churn, not reduction of internal rigor.

## Risks

1. Repo drift between exploratory UI and core architecture
2. Over-indexing on visual metaphor before orchestration reliability
3. Hidden prompt logic outgrowing durable artifacts
4. Too much dependence on legacy patterns from external systems
5. Architecture sprawl without explicit module boundaries

## Immediate Next Moves

1. Lock the M2 lifecycle contract and gate matrix in a durable spec.
2. Define canonical repositories for spec, plan, checkpoint, review, verification, and release artifacts.
3. Refactor orchestration to advance from canonical artifact state rather than registry strings.
4. Add guardian-driven review and release evidence before any desktop-facing expansion.

## Working Rules

Before major implementation:
- link work to a milestone
- create or update a spec/plan artifact
- note architectural impact
- define verification expectations

After major implementation:
- run verification
- update memory/planning artifacts
- record architecture decisions if they changed
