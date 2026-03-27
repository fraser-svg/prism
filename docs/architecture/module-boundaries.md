# Prism Core Module Boundaries

## Purpose

This document turns the target architecture into concrete ownership boundaries for implementation.

The goal is to stop Prism Core from becoming one mixed layer of prompts, scripts, app code, and runtime state.

## Boundary Map

### `packages/core`

Owns:
- domain types
- enums and state vocabularies
- artifact schemas
- shared contracts
- identifiers and metadata standards

Does not own:
- filesystem access
- shell execution
- provider-specific logic
- UI rendering

### `packages/memory`

Owns:
- project memory reads and writes
- artifact path resolution
- migration between legacy and current memory formats
- checkpoint persistence contracts

Does not own:
- workflow decisions
- execution scheduling
- UI concerns

### `packages/orchestrator`

Owns:
- lifecycle state machine
- stage transitions
- approval boundary handling
- plan-to-task-graph coordination
- resume logic

Does not own:
- low-level shell execution
- long-term memory file formats
- review scoring logic

### `packages/execution`

Owns:
- shell/script adapters
- model-provider adapters
- worker invocation
- runtime command contracts
- future sandbox adapters

Does not own:
- product direction
- release decisions
- canonical domain truth

### `packages/guardian`

Owns:
- review orchestration
- deterministic verification policy
- release gate evaluation
- recovery loop inputs and outputs

Does not own:
- project planning
- product memory
- raw provider execution

### `packages/ui`

Owns:
- view models
- app-facing contracts
- workspace presentation primitives for future desktop shell

Does not own:
- domain truth
- execution logic
- artifact persistence

## Interaction Rules

1. `core` is the source of vocabulary and shared contracts.
2. `memory`, `orchestrator`, `execution`, `guardian`, and `ui` depend on `core`.
3. `orchestrator` may call `memory`, `execution`, and `guardian`.
4. `guardian` may read from `memory` and `core`, and may trigger `execution` of checks through adapters.
5. `ui` should talk to orchestrated app-facing services, not directly to shell scripts.
6. `execution` should return structured results, not redefine workflow state.

## Transitional Rule

During migration, existing scripts may remain shell-based, but they should conceptually sit behind adapters.

That means:
- script behavior can remain
- ownership should become explicit
- app code should stop treating scripts as architecture

## Anti-Patterns

Do not allow:
- business workflow logic inside UI components
- product-memory truth hidden in provider prompts
- release decisions embedded inside build scripts
- shell scripts redefining canonical domain models
- app routes becoming the main orchestrator of Prism Core

## First Implementation Implication

When we start coding M1, the first package to materialize should be `packages/core`, followed by:
- `packages/memory`
- `packages/orchestrator`

`execution` and `guardian` can then wrap today’s shell assets behind clearer contracts.
