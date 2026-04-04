# TODOS — Prism Triad MVP

## Post-Phase 1

### Verification calibration loop
**What:** After 3-5 real builds, review instrumentation logs (verification outcomes, override rates, false positive rates) and tune the LLM comparison prompt.
**Why:** First-version LLM self-evaluation prompts are notoriously noisy. Without calibration, users either learn to ignore warnings (defeating the purpose) or get frustrated by false alarms. The instrumentation data from Issue 9 tells you exactly where to adjust.
**Pros:** Targeted improvement with real data instead of guessing.
**Cons:** Requires 3-5 real sessions before it's actionable.
**Context:** The precedence hierarchy (tests > LLM advisory > user override) means false positives from the LLM layer are advisories, not blockers. But too many advisories train users to ignore them. The calibration pass adjusts the comparison prompt sensitivity based on observed false positive rates.
**Depends on:** Phase 1 implementation + at least 3 real builds with instrumentation logging.
**Added:** 2026-03-20 (eng review)

### Prompt precedence documentation
**What:** Define a precedence section in SKILL.md for when behavioral layers conflict (e.g., drift detection fires during verification, scope protection triggers during Socratic questioning).
**Why:** The skill has 6 existing guardrails + communication rules + stage behaviors. The triad adds Socratic depth, verification loops, and smart interrupts. Without explicit precedence, Claude makes inconsistent choices across sessions.
**Pros:** Consistent behavior across sessions. Debuggable when things go wrong.
**Cons:** Requires thinking through ~6 potential pairwise conflicts.
**Context:** Codex flagged this: "no one has defined prompt precedence when these behaviors conflict." Best done after Phase 1 when the actual behaviors exist and conflicts can be observed rather than predicted.
**Depends on:** Phase 1 implementation (need to observe actual conflicts before defining rules).
**Added:** 2026-03-20 (eng review)

## Web Server Testability

### Extract createApp() factory from web server
**What:** Refactor `apps/web/server/index.ts` to export a `createApp()` factory that returns the Express app without binding to a port or opening a DB connection. The current top-level module does both on import.
**Why:** Side effects on import make it impossible to write integration tests for route handlers without starting a real server. Every new endpoint (including `select-directory`) can only be tested by mocking `child_process`, not by actually hitting the route.
**Pros:** Enables proper route-level integration tests. Standard Express testing pattern.
**Cons:** Small refactor (~20 lines moved into a factory function).
**Context:** Prior learning [server-side-effects-block-tests] flagged this. The pattern is: export `createApp(facade, clients)`, call it in `index.ts` for production, import it in tests with test fixtures.
**Depends on:** Nothing. Can be done independently.
**Added:** 2026-04-03 (eng review, autofill-file-path branch)

## Included in Phase 1 (from eng review)

### Acceptance criteria self-check
**What:** During criteria generation, Claude validates each machine-layer assertion: "Could this actually fail? Is it specific enough to catch a real problem?"
**Why:** Addresses the critical gap where vague assertions cascade into weak tests. The two-layer criteria system is only as good as the machine-layer translation.
**Status:** Include in Phase 1 implementation (not deferred).
**Added:** 2026-03-20 (eng review)
