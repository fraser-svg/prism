# Prism Core Rebuild Milestones

## M0. Build Brain

Objective:
- establish architecture, planning, and quality scaffolding

Key outputs:
- repo operating rules
- truth report
- target architecture
- ADR foundation
- definition of done
- release gates
- spec workflow docs

## M1. Core Domain Model

Objective:
- define the canonical entities Prism Core operates on

Candidate entities:
- project
- project brief
- product memory
- spec
- plan
- task graph
- checkpoint
- review
- verification result
- release state
- integration connection

Exit criteria:
- schemas/contracts are defined
- artifact ownership is explicit

## M2. Spec-Driven Workflow Engine ✓ LOCKED (v4.0.2.0, 2026-03-28)

Objective:
- formalize the build lifecycle and make it enforceable at runtime

Scope:
- lifecycle states
- transitions
- artifact gates
- regressions and retries
- approval pauses
- checkpoint semantics
- release-state semantics
- resume from canonical artifacts

Exit criteria:
- lifecycle is explicit and durable ✓ (8-phase WorkflowPhase, gate evaluator, checkpoint history)
- execution cannot start without required artifacts ✓ (evaluateTransition blocks on missing spec/plan)
- release decisions are derived from review, verification, memory, and approval evidence ✓ (deriveReleaseState aggregates 4 dimensions)

## M3. Skill-Bridge (Dual-Write) ✓ LOCKED (v4.0.3.0, 2026-03-28)

Objective:
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

## M4. Local-First Workspace Substrate ✓ LOCKED (v4.0.6.0, 2026-03-28)

Objective:
- support multiple projects with durable memory and operational state

Scope:
- local project registry with auto-detect + confirm
- SQLite workspace database (better-sqlite3, WAL mode)
- artifact location strategy with write-through indexing
- integrations cabinet model with health check adapters
- cross-project FTS5 search
- project health badges and "where was I?" resume
- workspace changelog and project templates

Exit criteria:
- multi-project local-first use is structurally supported ✓ (packages/workspace, 281 tests)

## M5. Desktop Enablement ← NEXT

Objective:
- prepare Prism Core for an Electron desktop shell

Scope:
- app-facing APIs
- shell integration boundaries
- packaging constraints
- macOS-first assumptions

Exit criteria:
- desktop shell can consume the core cleanly

## MVP Boundary Reminder

MVP is:
- macOS first
- single-user
- local-first
- desktop-first
- online-provider compatible

MVP is not:
- enterprise governance
- broad collaboration
- browser-first product strategy
- every provider and integration
