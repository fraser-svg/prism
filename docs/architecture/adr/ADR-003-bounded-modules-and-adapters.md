# ADR-003: Bounded Modules And Adapters

## Status

Accepted

## Date

2026-03-27

## Context

Prism already contains useful deterministic scripts, review prompts, compiler assets, and a prototype app shell.

Without explicit module boundaries, those pieces will continue to blur:
- scripts become architecture
- app routes become orchestrators
- prompts become hidden domain models

That would make Prism fragile and hard to evolve into a desktop workspace.

## Decision

Prism Core will use bounded modules with adapters.

Primary modules:
- `core`
- `memory`
- `orchestrator`
- `execution`
- `guardian`
- `ui`

Existing shell scripts and prompt assets are allowed to remain, but should be treated as adapters or content inside those boundaries rather than the architecture itself.

## Consequences

### Positive

- improves long-term maintainability
- reduces hidden coupling
- supports gradual migration instead of rewrite chaos
- makes future Tauri desktop integration cleaner

### Negative

- adds structure before visible features
- requires discipline in where new code is placed

## Rule

If a new capability does not have a clear module owner, it is not ready to implement.
