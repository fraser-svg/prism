# Definition Of Done

Work is not done when code exists.
Work is done when Prism can trust the result.

## Universal Done Criteria

All meaningful work must satisfy these:

1. The purpose of the change is clear.
2. The work is linked to a spec, plan, or scoped task artifact.
3. Architecture impact has been considered.
4. The implementation is bounded to the stated scope.
5. Relevant verification has been run.
6. Relevant review has been completed.
7. Durable artifacts and memory were updated if reality changed.
8. No known critical regression is left unacknowledged.
9. Approval boundaries were respected.
10. The result can be resumed and understood later.

## For Specs And Planning

Done means:
- the problem is clearly framed
- the real problem has been distinguished from the user's first request when they differ
- assumptions are explicit
- scope is bounded
- acceptance criteria are testable
- dependencies and risks are named
- the next implementation step is obvious

## For Architecture Changes

Done means:
- the boundary or decision is documented
- an ADR exists when the decision is durable
- alternatives were considered
- impact on memory, orchestration, execution, and verification was considered
- migration impact is understood

## For Implementation

Done means:
- code changes match the scoped plan
- interfaces and ownership boundaries remain coherent
- complexity did not increase without reason
- no hidden magic state was introduced
- relevant docs and artifacts were updated

## For Verification

Done means the relevant checks passed for the risk profile.

Possible checks:
- lint
- typecheck
- unit tests
- integration tests
- script tests
- manual QA
- design review
- engineering review
- ship-readiness review

If a check is skipped, the skip must be intentional and explainable.

## For User-Facing Milestones

Done means:
- the milestone outcome is understandable in plain English
- meaningful decisions are recorded
- blockers are clear
- the product can continue from this point without re-discovery

## Not Done

Work is not done if any of these are true:
- "it probably works"
- no verification was run
- memory/docs are stale after a directional change
- architecture changed silently
- approval-required actions were taken without approval
- we only implemented the initial ask without validating that it was the right solution
- the result only makes sense if a model remembers hidden context
