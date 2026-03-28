# Release Gates

Prism should earn the right to say work is complete.

These gates apply to major milestones and release-worthy changes in Prism Core.

## Plan Quality Gate (plan → execute)

Before a plan may advance to execution, Prism runs an automated 8-dimension quality check on all v2 plans (plans with `planVersion: 2`). A plan must score ≥ 70/100 and have no blocking dimensions to proceed.

The 8 dimensions (12.5 points each):

1. **Requirement Coverage** — every spec acceptance criterion is traced to at least one task's `mustHaves.truths`
2. **Task Completeness** — every task has `files`, `action`, and `mustHaves` (required); `verify` and `done` (blocking if missing)
3. **Dependency Correctness** — no invalid `dependsOn` references, no circular dependencies, wave ordering is consistent
4. **Key Links Planned** — all `requiredWiring` declared in plan phases is covered by a task's `mustHaves.keyLinks`
5. **Scope Sanity** — task count is within the limit for the plan's `scopeMode` (exact/minimum_viable: 8, targeted: 15, full_build: 20)
6. **Verification Derivation** — every task has a `verify` step and `done` criteria
7. **Context Budget** — no single task exceeds 25% context; total across all tasks does not exceed 50%
8. **Artifact Completeness** — all `requiredArtifacts` declared in plan phases appear in at least one task's `files` or `artifactsTouched`

Legacy plans (`planVersion` absent or `1`) bypass this gate with an advisory note.

Fail if:
- any dimension has a blocker (`hasBlocker: true`)
- total score < 70

## Gate 1: Scope Integrity

Required:
- linked plan/spec exists
- scope matches the artifact
- no unexplained scope creep

Fail if:
- implementation outran planning
- acceptance criteria are vague

## Gate 2: Architecture Integrity

Required:
- architectural impact assessed
- boundaries remain coherent
- durable decisions documented when needed

Fail if:
- core responsibilities blurred further
- hidden coupling increased without justification

## Gate 3: Verification Integrity

Required:
- relevant automated checks run
- failing checks resolved or explicitly accepted

Typical checks:
- lint
- typecheck
- script tests
- unit/integration tests

Fail if:
- "done" is claimed without evidence
- known failures are ignored

## Gate 4: Review Integrity

Required:
- relevant review lens applied

Possible review lenses:
- planning review
- engineering review
- QA review
- design review
- ship-readiness review

Fail if:
- risky work had no review pass
- critical findings remain unresolved without explicit acceptance

## Gate 5: Memory Integrity

Required:
- product memory updated if direction changed
- planning artifacts updated if progress changed
- decisions recorded if they matter later

Fail if:
- future resume would lose important context
- architecture or sequencing changed silently

## Gate 6: Approval Integrity

Required:
- approval-required actions paused correctly
- irreversible or external side effects were not triggered automatically

Fail if:
- Prism crossed approval boundaries silently

## Gate 7: UX Integrity

Required:
- outputs remain calm and understandable
- product concepts stay non-technical at the surface

Fail if:
- implementation complexity leaks into the user experience without need

## Release Decision

A change is release-ready only when:
- all required gates pass
- any accepted residual risk is explicit
- the next resume point is clear
