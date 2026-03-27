# Release Gates

Prism should earn the right to say work is complete.

These gates apply to major milestones and release-worthy changes in Prism Core.

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
