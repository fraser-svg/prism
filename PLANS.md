# Prism Build Plan

## Current Phase

Phase 6: Web App MVP (active)

Purpose:
- operator completes intake → discovery → spec → build → verify → ship entirely in the browser
- no CLI fallback required for the core workflow
- Fraser dogfoods daily for real client work

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

The web app (`apps/web/`) is the current client on top of this core. Desktop app (Electron) is on hold indefinitely — web-only for now. See `docs/designs/prism-os-roadmap.md` for the full target architecture.

## Milestones

### M0. Build Brain ✓ COMPLETE

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

### M1. Prism Core Domain Model ✓ COMPLETE

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
- Prism Core can power a real multi-project workspace without losing continuity ✓

### M5. Electron Portfolio MVP 🚫 SUPERSEDED

> Superseded by web-only pivot on 2026-04-04. Desktop shell is on hold indefinitely. See [strategic course correction](docs/designs/strategic-course-correction.md).

Original goal was to build the desktop app as the YC demo. The web app is now the product and the demo.

### M6. Web App MVP ← ACTIVE

Goal:
- operator completes intake → discovery → spec → build → verify → ship entirely in the browser
- no CLI fallback required for the core workflow
- Fraser dogfoods daily for real client work

Scope:
- Web app at `apps/web/` (React SPA + Express API + SQLite)
- Full Prism workflow accessible through browser UI
- Session persistence, project management, artifact viewing
- Deploy pipeline from browser

Exit criteria:
- an operator can go from brief to deployed software without leaving the browser
- Fraser uses it for real client work and captures evidence
- demo-ready for YC application

## Priority Stack

### Now

- M6 Web App MVP — the web app IS the product and the YC demo
- Fraser dogfoods daily — use the web app for real client work
- Reddit + ProductHunt launch with Fraser's proof
- YC application with public traction data
- Sharpen the one-liner: "AI builds fast. Prism builds right."

### Next

- Graduate bridge gates from advisory to blocking (post-M3)
- Deprecate OpenSpec for core spec storage
- Deployment entity (Tier 1) — IntakeBrief shipped in v4.0.13.0

### Later

- FeedbackRecord entity (Tier 2) — SolutionThesis shipped in v4.0.13.0
- 9-stage lifecycle migration (see docs/designs/prism-os-roadmap.md)
- Sync/cloud features

### Not Now

- Desktop app / Electron shell (on hold indefinitely)
- Full team collaboration
- Enterprise governance
- Broad provider explosion
- Agent runtime / execution infrastructure

## Active Bets

1. The judgment/orchestration layer above agents is the durable value, not the agent itself.
2. Typed workflow and memory models will outperform prompt-only coordination.
3. Bounded workers plus deterministic scripts produce better reliability than giant agent prompts.
4. Calm UX requires aggressive hiding of technical churn, not reduction of internal rigor.
5. Better AI agents make Prism MORE powerful, not less relevant.

## Risks

1. Hidden prompt logic outgrowing durable artifacts
2. Too much dependence on legacy patterns from external systems
3. Architecture sprawl without explicit module boundaries

## Immediate Next Moves

1. Make the web app work end-to-end (intake → discovery → spec → build → verify → ship in browser).
2. Fraser dogfoods daily for real client work — every broken thing becomes a bug.
3. Get Patrick through a full Prism session with structured session logging.
4. Record demo walkthrough using the web app.
5. Reddit + ProductHunt launch with real proof. Then YC application.

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
