# Prism Architecture

## Purpose

This directory defines the architecture of Prism Core.

Prism Core is the owned local-first product brain that will later power the Prism Electron desktop workspace.

This is not a generic app folder.
This is the contract for how Prism should think, remember, plan, execute, verify, and evolve.
Its job is to help users discover the real problem and engineer the real solution properly, not just automate the first request.

## Current Architecture Status

Prism Core exists as five cooperating layers, implemented across `packages/`:

### 1. Core Domain Layer (`packages/core`)
- 14 typed entities with branded types
- Workflow enums and artifact schemas
- Shared contracts
- Provider-agnostic domain model

### 2. Memory Layer (`packages/memory`)
- Local artifact layout under `.prism/`
- Product memory reads/writes
- Project continuity logic
- Write-through indexing to workspace SQLite

### 3. Orchestration Layer (`packages/orchestrator`)
- Lifecycle engine with gate evaluator
- Checkpoint history and resume engine
- Bridge CLI (10 commands) connecting SKILL.md to typed core
- Approval boundary handling

### 4. Execution Layer (`packages/execution`)
- Intent policy
- Execution adapters
- Worker execution contracts

### 5. Guardian Layer (`packages/guardian`)
- Review matrix and review orchestration
- Release-state derivation from evidence
- Verification policy

### Shell Scripts (alongside packages)

Existing deterministic scripts (`scripts/`) handle bookkeeping: task registry, auto-save, project scanning, verification, and checkpointing. These run alongside the typed core via the dual-write bridge. The scripts are adapters, not the architecture.

## Workspace Layer (`packages/workspace`)

Added in M4:
- SQLite workspace database (better-sqlite3, WAL mode)
- Multi-project registry with auto-detect
- Cross-project FTS5 search
- Health badges and resume
- Write-through indexing via onWrite callbacks

## Stage Lifecycle

The current codebase uses an 8-phase lifecycle:

```
understand → identify_problem → spec → plan → execute → verify → release → resume
```

The target lifecycle is 9 stages (see `docs/designs/prism-os-roadmap.md`):

```
intake → clarify → shape → spec → plan → build → verify → deploy → observe
```

Old phase names exist in code and will be migrated additively. `resume` becomes a cross-cutting capability rather than a stage. See the roadmap for the full migration plan.

## Storage Principles

Prism is local-first.

Preferred storage characteristics:
- durable local state
- file-based artifacts for transparency
- SQLite for indexed operational state (proven in M4)
- explicit project directories
- no hidden state that only exists in model context

Current storage split:
- files for durable artifacts and human-readable memory (`.prism/` per project)
- SQLite for indexed runtime state, queues, and lookup-friendly metadata (workspace-level)

## Artifact Principles

Artifacts are first-class product infrastructure.

Prism preserves:
- product memory
- decisions
- specs
- plans
- task graphs
- reviews
- verification results
- progress state
- release state

Artifacts are:
- durable
- inspectable
- updateable
- resumable
- usable without re-prompting a model for hidden context

Artifacts also make it clear why Prism is building a particular solution, especially when it differs from the user's initial framing.

## Delivery Principle

The order is fixed:

1. understand
2. identify the real problem
3. specify
4. plan
5. execute
6. verify
7. release
8. resume and extend

Prism can loop backward, but it should not skip forward irresponsibly.

## Core Design Principles

These principles are non-negotiable commitments that govern how Prism is built.

1. **Verify before trust.** LLM-generated output should pass through deterministic checks or review before it reaches the user or influences downstream work. The guardian layer is not a final gate — verification is a posture that should run through every stage. (Current coverage: verification gates enforce review/verification at release; earlier stages check artifact existence only. Closing this gap is an active priority.)

2. **Minimize LLM dependence.** Use deterministic scripts and structured data wherever they produce correct results. LLM calls are reserved for tasks that require generation, reasoning, or judgment. This reduces cost, latency, and hallucination surface.

3. **Route by capability.** Model selection should be per-task, not global. Simple tasks get simple models. Complex reasoning gets capable models. The orchestration layer should decide, not the user and not a default. (Partially implemented — `route_hint` field on task nodes routes visual/UI tasks to Gemini via `prism-gemini-worker.sh`, with automatic Claude fallback. General per-task model routing remains future work.)

4. **Build AI-native.** Prism is expert at structuring work for AI tools — prompt decomposition, output verification, context management, failure recovery. This expertise is embedded in the orchestration and guardian layers, not left to individual prompts.

## Current Architectural Biases

Bias toward:
- TypeScript for core logic
- shell scripts where deterministic and simpler
- local-first state
- Electron readiness for future desktop shell
- bounded workers
- provider abstraction

Bias against:
- giant prompts
- prompt-only memory
- terminal-first UX
- self-modifying behavior without gates
- architecture shaped around developers as the primary user

## ADRs

Durable architectural decisions belong in `docs/architecture/adr/`.
