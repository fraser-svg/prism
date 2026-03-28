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

## M3. Guardian And Verification

Objective:
- make review and validation native, not optional

Scope:
- verification runner policy
- review orchestration
- failure classification
- recovery loop contracts

Exit criteria:
- Prism can detect and report incomplete or unsafe work reliably

## M4. Local-First Workspace Substrate

Objective:
- support multiple projects with durable memory and operational state

Scope:
- local project registry
- local DB strategy
- artifact location strategy
- integrations cabinet model

Exit criteria:
- multi-project local-first use is structurally supported

## M5. Desktop Enablement

Objective:
- prepare Prism Core for a Tauri desktop shell

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
