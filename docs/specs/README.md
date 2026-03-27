# Prism Spec Workflow

## Purpose

Prism is spec-driven by default.

Specs exist to reduce ambiguity before implementation and to make execution, review, and resume reliable.

## Minimum Artifact Ladder

For non-trivial work, create or update these in order:

1. Product context
2. Scoped spec or task note
3. Plan or milestone linkage
4. Acceptance criteria
5. Decision record if architecture changes

## Spec Types

### Product Spec

Use for:
- new products
- major feature areas
- foundational architecture work

Should capture:
- problem
- target user
- desired outcome
- constraints
- success criteria

### Change Spec

Use for:
- bounded implementation work
- feature additions
- significant fixes
- architectural refactors

Should capture:
- goal
- scope
- non-goals
- dependencies
- acceptance criteria
- verification plan

### Task Note

Use for:
- small bounded tasks
- clear low-risk implementation work

Should capture:
- intent
- files/surfaces affected
- checks to run

## Required Questions Before Implementation

Every spec or task artifact should answer:
- what problem are we solving?
- why now?
- what is in scope?
- what is explicitly out of scope?
- what could go wrong?
- how will we know it worked?

## Acceptance Criteria Rules

Acceptance criteria should be:
- specific
- testable
- scoped
- understandable later

Bad:
- "works well"

Better:
- "project can resume with last completed milestone, active blockers, and next recommended action visible"

## Verification Plan

Every meaningful spec should name likely verification:
- lint
- typecheck
- unit/integration tests
- script tests
- QA review
- design review
- ship-readiness review

## Relationship To Existing Prism Artifacts

Existing Prism assets already provide useful building blocks:
- `templates/`
- `references/reviews/`
- `scripts/`
- `planning/`

Future work should consolidate around these rather than bypassing them.

## Rule

If implementation feels unclear, the answer is usually not "prompt harder."
The answer is "tighten the artifact."
