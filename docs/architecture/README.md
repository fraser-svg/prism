# Prism Architecture

## Purpose

This directory defines the architecture of Prism Core.

Prism Core is the owned local-first product brain that will later power the Prism desktop workspace.

This is not a generic app folder.
This is the contract for how Prism should think, remember, plan, execute, verify, and evolve.
Its job is to help users discover the real problem and engineer the real solution properly, not just automate the first request.

## Architecture Truth Report

### Strong

- The product thesis is unusually clear.
- The repo already contains meaningful deterministic infrastructure.
- Product memory, review prompts, hooks, compiler assets, and supervisor logic already exist.

### Weak

- The repo does not yet have a formal top-level architecture.
- Core responsibilities are spread across prompts, scripts, and docs.
- There is no locked domain model for projects, specs, plans, checkpoints, reviews, or releases.

### Missing

- repo-wide operating rules
- definition of done
- release gates
- ADR history
- canonical module boundaries
- local-first storage and artifact contracts

### Highest-Leverage Move

Lock the architecture and operating model before major feature work.

## Target Architecture

Prism should be designed as five cooperating layers.

### 1. Experience Layer

What users experience:
- calm workspace
- project list
- discovery flows
- checkpoints
- progress
- previews
- shipped changes

This layer must stay non-technical.

### 2. Core Domain Layer

The canonical product model:
- project
- product brief
- product memory
- spec
- plan
- task graph
- checkpoint
- review
- verification result
- release state

This layer should be typed and provider-agnostic.
It should preserve the difference between:
- what the user first asked for
- what problem Prism determined they actually need solved
- what solution Prism is intentionally building

### 3. Orchestration Layer

Responsible for:
- workflow state machine
- phase transitions
- approval boundaries
- worker coordination
- checkpointing
- resumability

This layer should decide what happens next.

### 4. Execution and Provider Layer

Responsible for:
- model-provider adapters
- tool and shell invocation
- bounded worker execution
- future sandbox/runtime adapters

This layer should not own product truth.

### 5. Guardian Layer

Responsible for:
- engineering review
- QA review
- ship readiness
- verification policy
- regression prevention
- recovery loops

This layer decides whether work is safe to call complete.

## Proposed Module Boundaries

Initial target boundaries:

- `packages/core`
  - domain types
  - workflow enums
  - artifact schemas
  - shared contracts

- `packages/memory`
  - local artifact layout
  - product memory reads/writes
  - project continuity logic

- `packages/orchestrator`
  - lifecycle engine
  - approval boundary handling
  - task graph coordination

- `packages/execution`
  - shell adapters
  - model adapters
  - worker execution contracts

- `packages/guardian`
  - verification policy
  - review orchestration
  - release gates

## Storage Principles

Prism is local-first.

Preferred storage characteristics:
- durable local state
- file-based artifacts for transparency
- simple local DB for indexed operational state
- explicit project directories
- no hidden state that only exists in model context

Expected MVP storage split:
- files for durable artifacts and human-readable memory
- SQLite for indexed runtime state, queues, and lookup-friendly metadata

## Artifact Principles

Artifacts are first-class product infrastructure.

Prism should preserve:
- product memory
- decisions
- specs
- plans
- task graphs
- reviews
- verification results
- progress state
- release state

Artifacts should be:
- durable
- inspectable
- updateable
- resumable
- usable without re-prompting a model for hidden context

Artifacts should also make it clear why Prism is building a particular solution, especially when it differs from the user's initial framing.

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
- Tauri readiness
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
