# Prism Repo Guide

## Mission

Prism is the product-engineering system for people who dream in ideas, not code.
Prism exists to help non-developers build the real solution to the real problem, not just the first thing they asked for.

This repository is the owned Prism core first:
- the orchestration brain
- the runtime and artifact system
- the product memory layer
- the review and verification engine
- the internal substrate that will later power the desktop product

Do not treat this repo like a generic AI app scaffold.
Do not optimize for fast demos at the expense of product coherence.

## Product Stance

Prism must feel calm, simple, structured, and non-technical on the surface.
Under the hood it must be:
- spec-driven
- architecture-led
- review-heavy
- test-heavy
- self-checking
- maintainable

Prism is not allowed to become AI slop.
Prism is not a random app generator.
It should behave like an unaffordable dream team made usable for non-developers:
- product thinker
- technical architect
- senior engineer
- designer
- QA lead
- engineering manager

## Non-Negotiable Rules

1. No code before understanding.
2. No implementation before the real problem is understood well enough to propose the right solution.
3. No large change without decomposition.
4. No "done" without validation.
5. No silent assumptions when they affect product, architecture, risk, or user trust.
6. No giant god prompts, god files, or magic hidden state.
7. No random code generation without a clear artifact, purpose, and acceptance criteria.
8. Prefer boring reliability over clever chaos.
9. Preserve owned runtime and owned artifacts.
10. Optimize for long-term coherence, not short-term novelty.

## Decision Boundary

### Automatic

Prism should be autonomous for:
- discovery and clarification
- spec drafting
- architecture proposals
- task decomposition
- bounded local code changes
- lint, type, and unit test runs
- review passes
- QA checks
- artifact and memory updates
- progress summaries and checkpointing

### Approval Required

Prism must pause for approval before:
- production deployments
- actions involving money or billing
- destructive data operations
- risky schema migrations against real data
- secret rotation
- domain or DNS changes
- external API actions with real-world side effects
- account-level auth or security changes
- major architecture pivots after momentum exists

### Hard Rule

If an action is irreversible, risky, expensive, destructive, or externally consequential, ask first.

## Required Delivery Flow

Every meaningful change should follow this flow:

1. Understand
2. Identify the real problem and shape the right solution
3. Spec
4. Plan
5. Implement
6. Review and verify
7. Update memory and planning artifacts

Do not skip straight from a request to implementation unless the change is trivial and low-risk.

## Required Artifacts

Before implementation begins on any non-trivial change, there should be a durable artifact for the work:
- product context update, if direction changed
- spec or scoped task note
- plan or milestone linkage
- acceptance criteria
- decision record if architecture changed

Artifact-first is the default.

## Change Sizing

### Small changes

A small change may proceed with a short scoped plan if all are true:
- single concern
- low architectural impact
- reversible
- easy to verify

### Large changes

A large change must be decomposed if any are true:
- touches multiple subsystems
- changes architecture or interfaces
- introduces new runtime behavior
- affects project memory or orchestration semantics
- affects user trust, continuity, or approval boundaries
- risks building the user's first ask instead of the actual needed solution

## Architecture Rules

1. Keep product experience, orchestration, execution, memory, and verification logically separate.
2. Prefer typed domain models over prompt-only behavior.
3. File-based durable artifacts are a feature, not legacy baggage.
4. Local-first is the default. Cloud and sync are additive later.
5. Model-provider support must stay architecture-level pluggable.
6. Bounded workers are preferred over one overloaded agent.
7. New subsystems need an explicit ownership boundary and reason to exist.
8. Architecture should support discovery, shaping, engineering, review, and continuity as first-class concerns, not as prompt afterthoughts.

## Documentation Rules

Update docs when reality changes:
- `PLANS.md` for milestone and priority changes
- `docs/architecture/` for architecture changes
- `docs/quality/` for verification or release policy changes
- `docs/specs/` for spec workflow changes
- `CHANGELOG.md` for shipped Prism-core changes

Create or update an ADR when a decision is:
- durable
- architectural
- costly to reverse
- likely to shape future implementation

## Verification Rules

No task is complete until the relevant verification passes.

Possible verification includes:
- lint
- typecheck
- unit tests
- integration tests
- script tests
- manual QA notes
- review artifacts
- release-gate checks

Match the verification to the risk.

## UX Rules

Even when building internal Prism core:
- optimize for calm, structured outputs
- hide technical churn from future end users
- keep user-facing concepts plain-English first
- avoid surfacing implementation detail unless it changes a meaningful decision

Do not let internal architecture leak unnecessary complexity into the product model.
Do not let the user experience collapse into "describe an app and hope."

## Repo Direction

Near-term focus:
- formalize Prism Core
- strengthen artifacts and memory
- strengthen orchestration boundaries
- strengthen verification and review
- prepare for future Tauri desktop evolution

Not the near-term focus:
- polishing the final desktop shell
- building a browser-first product
- adding broad integrations without clear milestone need

## When In Doubt

If a proposed change feels impressive but makes the system harder to reason about, slower to recover, or easier to misuse, do the simpler thing.
