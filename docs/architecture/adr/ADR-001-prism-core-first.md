# ADR-001: Prism Core First

## Status

Accepted

## Date

2026-03-27

## Context

Prism currently contains three overlapping identities:
- a skill-driven orchestration system
- an exploratory app prototype
- a growing set of deterministic scripts and review assets

Without a locked architectural direction, the repo risks becoming a mix of:
- prototype UI experiments
- implicit prompt behavior
- fragmented runtime logic

This would make Prism feel impressive in demos but weak in continuity, maintainability, and trust.

The product direction provided by the founder is clear:
- this repo should become the owned Prism Core first
- the future desktop app should sit on top of that core later
- local-first, spec-driven, architecture-led behavior is non-negotiable

## Decision

Prism will be built as an owned local-first core system first.

This means:
- the repo's primary responsibility is the product brain, not the polished app shell
- durable artifacts and typed domain models are preferred over implicit prompt behavior
- orchestration, memory, execution, and verification are separate responsibilities
- the desktop product is a later client layer on top of the core

## Consequences

### Positive

- Creates a durable foundation for the desktop product
- Preserves product memory and continuity as first-class concerns
- Makes verification and review easier to standardize
- Reduces reliance on giant prompts and hidden state
- Keeps model-provider support pluggable

### Negative

- Slower visible UI progress in the short term
- Requires architectural discipline before feature acceleration
- Forces cleanup of blurred boundaries between prototype UI and core logic

### Tradeoffs Accepted

- We choose boring infrastructure progress over flashy but unstable product demos
- We choose artifact-first clarity over prompt-only speed
- We choose future desktop leverage over presentational shortcuts

## Follow-On Decisions Needed

- canonical module layout for Prism Core
- local storage contract
- domain entity schemas
- workflow state machine
- provider adapter interface
- legacy script adoption versus replacement strategy
