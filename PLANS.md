# Prism Build Plan

## Current Phase

Phase 0: Build Brain and Repo Operating System

Purpose:
- lock the architecture direction
- formalize operating rules
- make future work artifact-first
- prevent a reckless rewrite

## Repo Truth

What exists now:
- a strong product thesis and vision
- substantial deterministic shell infrastructure
- compiler, hooks, review references, and planning notes
- an exploratory app shell with early Forge-style UI ideas

What is still missing:
- a repo-wide operating system
- a locked target architecture for Prism Core
- a durable milestone structure
- explicit quality gates and definition of done
- a clean separation between prototype UI exploration and owned core architecture

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

### M2. Workflow Engine

Goal:
- make `discover -> spec -> plan -> execute -> verify -> ship -> resume` explicit

Scope:
- state machine
- workflow transitions
- approval boundaries
- checkpoint model
- resumability rules

Exit criteria:
- one project can move through the lifecycle with durable state

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

- finalize repo operating docs
- lock architecture and milestones
- map existing scripts and artifacts into the target system
- define core entities and artifact contracts

### Next

- choose Prism Core package/module layout
- define local storage and memory model
- define workflow state machine and checkpoint semantics

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

1. Convert existing Prism mechanisms into a formal Prism Core map.
2. Define the canonical domain entities and storage/artifact layout.
3. Decide package boundaries for core, memory, orchestration, guardian, and execution.
4. Identify which current scripts remain canonical versus which become adapters or legacy compatibility.

## Working Rules

Before major implementation:
- link work to a milestone
- create or update a spec/plan artifact
- note architectural impact
- define verification expectations
- decide whether the upcoming work changes Prism's YC readiness profile

After major implementation:
- run verification
- update memory/planning artifacts
- record architecture decisions if they changed
- run the YC oversight review at milestone boundaries and after major strategic changes
