# Prism Build Plan

## Current Phase

Phase 4: Local-First Workspace Substrate (complete)

Purpose:
- wire the typed core into the existing skill lifecycle via dual-write bridge
- prove that core artifacts and skill artifacts can coexist and stay consistent
- earn trust in gate checking before graduating to blocking enforcement

## Repo Truth

What exists now:
- a strong product thesis and vision
- substantial deterministic shell infrastructure
- compiler, hooks, review references, and planning notes
- typed core packages for domain, memory, orchestration, guardian, and execution
- passing shell-script regression coverage for the current runtime substrate
- explicit 8-phase lifecycle with gate evaluator, checkpoint history, and release-state derivation (M2 complete)
- artifact gating that blocks execution without required spec/plan
- release readiness derived from review, verification, memory, and approval evidence

What is still missing:
- bridge wiring between typed core and existing skill lifecycle
- dual-write producing typed artifacts alongside existing OpenSpec/script artifacts
- gate checking at stage transitions (advisory mode first)
- review evidence capture from gstack skills into typed artifacts
- resume from typed checkpoints in real dogfood sessions

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

### M2. Spec-Driven Workflow Engine ✓ LOCKED

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

### M3. Skill-Bridge (Dual-Write) ✓ LOCKED

Goal:
- wire typed core into the existing skill lifecycle via dual-write bridge

Scope:
- bridge CLI in orchestrator package (10 commands)
- gate checking at stage transitions (advisory, not blocking)
- typed artifact dual-write (.prism/specs/, reviews/, plans/, runs/)
- review evidence capture from gstack skills
- resume from typed checkpoints

Exit criteria:
- SKILL.md calls bridge at all 9 integration points
- dual-write produces valid typed artifacts alongside existing OpenSpec/script artifacts
- gate checks fire at stage transitions (advisory)
- at least one dogfood session produces full typed artifact trail

### M4. Local-First Workspace Substrate ✓ LOCKED

Goal:
- support multi-project local-first use

Scope:
- SQLite workspace database (better-sqlite3, WAL mode)
- project registry with auto-detect + confirm
- cross-project FTS5 search
- health badges and resume
- workspace changelog and templates
- write-through indexing via onWrite callbacks

Exit criteria:
- Prism Core can power a real desktop workspace without losing continuity ✓

### M5. Desktop Shell Enablement ← NEXT

Goal:
- prepare the core for an Electron-powered desktop product

Scope:
- app-facing APIs
- desktop integration boundaries
- packaging constraints
- macOS-first decisions

Exit criteria:
- desktop shell can consume the core cleanly

## Priority Stack

### Now

- build bridge CLI in orchestrator package (10 commands)
- wire SKILL.md to call bridge at all 9 integration points
- implement typed artifact dual-write (.prism/specs/, reviews/, plans/, runs/)

### Next

- add advisory gate checks at stage transitions
- capture review evidence from gstack skills into typed artifacts
- prove resume from typed checkpoints in dogfood session

### Later

- graduate bridge gates from advisory to blocking
- deprecate OpenSpec for core spec storage
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

1. Hidden prompt logic outgrowing durable artifacts
2. Too much dependence on legacy patterns from external systems
3. Architecture sprawl without explicit module boundaries

## Immediate Next Moves

1. Build the bridge CLI in the orchestrator package with 10 commands for lifecycle integration.
2. Update SKILL.md to call the bridge at all 9 integration points (dual-write mode).
3. Implement typed artifact dual-write so .prism/ artifacts are produced alongside existing OpenSpec/script artifacts.
4. Add advisory gate checks at stage transitions that log warnings but do not block.

## Working Rules

Before major implementation:
- link work to a milestone
- create or update a spec/plan artifact
- note architectural impact
- define verification expectations
- run `/yc-brain` before starting implementation — if the verdict is DEFER or STOP, the work goes to TODOS.md, not the current sprint

After major implementation:
- run verification
- update memory/planning artifacts
- record architecture decisions if they changed
- run `/yc-brain review` after completing any milestone for a full YC readiness audit
- run `/yc-brain retro` after individual sessions to update the scorecard
