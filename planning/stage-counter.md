<!-- /autoplan restore point: ~/.gstack/projects/fraser-svg-prism/fraser-svg-prism-stage-counter-autoplan-restore-20260327-102837.md -->
# Plan: Show Stage Progress ("Stage X of Y")

## Problem
When Prism runs through its stages, the status bar shows `Stage {N}` with no indication of total stages. The user has no sense of progress or how far along they are. "Stage 1" means nothing without knowing there are 5 stages total.

## Current Behavior
```
▌ PRISM · Stage 1 · understanding your request
```

## Desired Behavior
```
▌ PRISM · Stage 1 of 5 · understanding your request
```

## Design Considerations

### Stage inventory
Prism has 6 core stages (0-5) plus 2 conditional stages for UI products:

**Non-UI product flow:** Stage 0 → 1 → 2 → 3 → 4 → 5 (6 stages)
**UI product flow:** Stage 0 → 1 → 2 → 2.5 → 3 → 4 → 4.5 → 5 (8 stages)

### User-facing display
Stage 0 (Resume) is an automatic routing step, not a "real" stage the user perceives. And stages 2.5/4.5 have awkward numbering. Two options:

**Option A — Keep internal numbering, add total:**
`Stage 1 of 5` (skip Stage 0 from count, map 2.5/4.5 as separate steps)

**Option B — Renumber for display only:**
Map stages to sequential display numbers:
- Non-UI: 1=Understand, 2=Plan, 3=Build, 4=Verify, 5=Ship → "Step 1 of 5"
- UI: 1=Understand, 2=Plan, 3=Design, 4=Build, 5=Verify, 6=Design Review, 7=Ship → "Step 1 of 7"

### Where the total is determined
The total depends on whether it's a UI product (has PRODUCT.md with UI indicators) and whether DESIGN.md already exists. This is known after Stage 0 scan completes.

## Proposed Implementation

1. **SKILL.md status bar** — Change format from `Stage {N}` to `Stage {N} of {total}`
2. **Stage display mapping** — Add three canonical route maps to SKILL.md (see below)
3. **Route determination** — At Stage 0, determine the route and include it in checkpoint JSON
4. **Status bar update** — Update the template and add instructions for using the mapping
5. **Resume handling** — On resume, read route from checkpoint. First message uses stored route.
6. **Skip handling** — Skipped stages don't change total. Counter jumps forward.

### Display Mapping Tables (to add to SKILL.md)

**Route A — Non-UI (total = 5):**

| Internal Stage | Display | Label |
|---------------|---------|-------|
| 0 | — | Starting up... |
| 1 | 1 | Understand |
| 2 | 2 | Plan |
| 3 | 3 | Build |
| 4 | 4 | Verify |
| 5 | 5 | Ship |

**Route B — UI with DESIGN.md (total = 6):**

| Internal Stage | Display | Label |
|---------------|---------|-------|
| 0 | — | Starting up... |
| 1 | 1 | Understand |
| 2 | 2 | Plan |
| 3 | 3 | Build |
| 4 | 4 | Verify |
| 4.5 | 5 | Design Review |
| 5 | 6 | Ship |

**Route C — UI without DESIGN.md (total = 7):**

| Internal Stage | Display | Label |
|---------------|---------|-------|
| 0 | — | Starting up... |
| 1 | 1 | Understand |
| 2 | 2 | Plan |
| 2.5 | 3 | Design |
| 3 | 4 | Build |
| 4 | 5 | Verify |
| 4.5 | 6 | Design Review |
| 5 | 7 | Ship |

### Checkpoint Integration
After Stage 0 determines the route, include in checkpoint JSON:
```json
{"stage_route": "A|B|C", "stage_total": 5|6|7}
```
This is a snapshot. Never recompute from filesystem mid-session.

## Files Changed
- `SKILL.md` — status bar format + stage mapping tables + route determination instructions + checkpoint field

## Out of Scope
- Changing stage numbering internally (0-5 with .5 variants stays)
- Progress bars or percentage indicators
- Time estimates per stage
- Richer per-stage sub-messages (separate feature, partially exists in Stage 3 worker relay)
- Stage names in status bar ("Step 1: Understand") — possible follow-up

## Stage Regression Handling
When Prism sends a user back (e.g., Stage 4 → Stage 3 for QA fixes, Stage 2 → Stage 1 for plan issues), the status bar should show the regressed stage with context:
```
▌ PRISM · Stage 3 of 5 · fixing QA issues
```
The counter regresses but the message explains why. This is honest and expected.

## Three-Case Total Calculation
After Stage 0 scan:
- **Non-UI product:** total = 5 (Understand, Plan, Build, Verify, Ship)
- **UI product with DESIGN.md:** total = 6 (Understand, Plan, Build, Verify, Design Review, Ship)
- **UI product without DESIGN.md:** total = 7 (Understand, Plan, Design, Build, Verify, Design Review, Ship)

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Skip /office-hours | P6: action | Simple format change, design doc not needed | Running office-hours |
| 2 | CEO | Handle 3 total cases (5/6/7) not 2 | P1: completeness | UI+DESIGN.md case was missed in original plan | Two-case model |
| 3 | CEO | Keep "Stage X of Y" (user's request) | P5: explicit | User explicitly asked for this. Milestone messages are orthogonal | Replace with milestone-only |
| 4 | CEO | Add regression display handling | P1: completeness | Both voices flagged stages can go backward | Ignore regression case |
| 5 | CEO | Mode: SELECTIVE EXPANSION | P3: pragmatic | Tight scope, one file, clear ask | SCOPE EXPANSION |
| 6 | CEO | Defer stage names in status bar | P3: pragmatic | User didn't ask for it, can follow up | Include stage names |
| 7 | Eng | Total is snapshot, not recomputed | P5: explicit | DESIGN.md created mid-session would change total | Recompute each time |
| 8 | Eng | Define 3 explicit mapping tables | P1: completeness | Both voices flagged missing mapping | Leave as prose |
| 9 | Eng | Skipped stages don't change total | P5: explicit | Dynamic totals are confusing; counter jumps instead | Adjust total on skip |
| 10 | Eng | Fix contradictory two-case text | P3: pragmatic | Old text said 2 cases, new section says 3 | Leave inconsistency |
| 11 | Eng | Resume reads route from checkpoint | P5: explicit | First message needs N/Y immediately | Re-derive on resume |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | 0 unresolved (5 premises checked, regression + 3-case total added) |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | clean | 0 unresolved (mapping tables defined, checkpoint integration added) |
| CEO Voices | `/autoplan` dual | Independent challenge | 1 | clean | Codex: 8 concerns, Subagent: 5 issues. Consensus: 4/6 confirmed, 2 disagree |
| Eng Voices | `/autoplan` dual | Independent challenge | 1 | clean | Codex: 5 findings, Subagent: 8 findings. Consensus: 6/6 confirmed |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | skipped | No UI scope |

**VERDICT:** APPROVED — all reviews clean, 11 auto-decisions logged, 0 taste decisions. Ready for `/ship` when implemented.
