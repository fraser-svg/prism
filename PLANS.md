# Prism Build Plan

## Current Phase

Phase 4: Local-First Workspace Substrate (complete)

Purpose:
- multi-project workspace management with SQLite, FTS5 search, health badges, and resume
- write-through indexing from artifact repos into workspace-level SQLite
- cross-project search and project templates

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
- M3 bridge CLI wiring review, gate-check, and release-state through SKILL.md (M3 complete)
- M4 local-first workspace substrate with SQLite, FTS5, health badges, and resume (M4 complete)
- Continuous Intelligence Layer: skill catalogue, research phase, approach comparison, Guardian learning, discovery nudges, targeted QA (v4.0.9.0)
- Trust-First Self-Healing Engine: session report cards, learning journal, advisory prescriptions, HEALTH.md dashboard, auto-dogfood entries (v4.0.13.0)
- Pipeline Visualizer: interactive HTML dashboard of 7-stage workflow, PipelineSnapshot JSON contract for future Electron IPC (v4.0.16.0)

What is still missing:
- graduating bridge gates from advisory to blocking (post-M3 TODO)
- deprecating OpenSpec for core spec storage (post-M3 TODO)
- user proof from real dogfood sessions (critical YC gap)
- Patrick-ready demo walkthrough

## Architecture Direction

This repo becomes the owned Prism Core first. See `docs/DOCTRINE.md` for the strategic doctrine (4 layers, 3 horizons, Decision Rubric) that governs architecture choices.

Primary ICP: agency operators and owners delivering software outcomes for clients. Semi-technical creators are the expansion play post-traction.

Prism Core responsibilities:
- domain models
- workflow orchestration
- product memory
- artifact management
- review and verification
- execution coordination
- provider abstraction

The future desktop app (Electron) is a client shell on top of this core, not a substitute for it. See `docs/designs/prism-os-roadmap.md` for the full target architecture.

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

### M5. Direction Reset + Hardening ← NEXT

Goal:
- align repo docs to agency-first ICP and Electron shell decision
- harden gate evaluator and resume engine for real user sessions
- add structured session logging for user proof evidence
- write vision doc for the Prism OS roadmap (9-stage lifecycle, entity expansion, desktop shell)

Exit criteria:
- repo tells one coherent story (agency operators, Electron, 9-stage target)
- gate evaluator and resume engine handle corrupt/missing artifacts gracefully
- Patrick session produces structured evidence via session logging
- vision doc committed to docs/designs/prism-os-roadmap.md

## Priority Stack

### Now

- M5 Direction Reset + Hardening (gate/resume resilience, session logging, doc alignment)
- Patrick session — first real user proof
- Record a demo-ready walkthrough of the agency workflow
- Sharpen the one-liner and YC application narrative around agency operators

### Next

- Graduate bridge gates from advisory to blocking (post-M3)
- Deprecate OpenSpec for core spec storage
- Implement 9-stage lifecycle migration (see docs/designs/prism-os-roadmap.md)
- Deployment entity (Tier 1) — IntakeBrief shipped in v4.0.13.0

### Later

- Agency entity expansion (ClientAccount, FeedbackRecord — Tier 2) — SolutionThesis shipped in v4.0.13.0
- App-facing service layer (packages/ui AppService facade)
- Electron desktop shell
- Sync/cloud features

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

1. Ship M5 hardening (gate/resume resilience, session logging, doc alignment).
2. Get Patrick through a full Prism session with structured session logging.
3. Record demo walkthrough: Socratic discovery → spec → research → build → verification → ship.
4. Sharpen YC one-liner around agency operators hitting the 80% wall.
5. Collect user proof from real dogfood sessions.

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
