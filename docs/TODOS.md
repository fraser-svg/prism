# TODOS

## Deferred from Eng Review (2026-03-21)

### TODO-1: Hooks Specification (Plan B Enforcement)
- **What:** Write a concrete PreToolUse hook spec that scans for operator boundary violations in Bash commands (founder-directed instructions, "open another terminal", manual setup). Include settings.json format and test cases.
- **Why:** Prompt reinforcement has a known ceiling. If Fixes 1-4 fail after 3 dogfood sessions, hooks are the structural enforcement backup. Without a ready spec, you lose another iteration cycle.
- **Pros:** Ready to deploy immediately when needed.
- **Cons:** Engineering effort for something that may never be needed.
- **Depends on:** Fixes 1-4 shipping + 3 dogfood sessions showing continued violations.
- **Blocked by:** Nothing — can be specced anytime.

### TODO-2: Quantitative Success Metrics
- **What:** After each dogfood session, log pass/fail for 4 checks: (1) discovery before building, (2) research before committing, (3) no broken/unverified suggestions, (4) no manual terminal steps. Aggregate across sessions.
- **Why:** "Feels like gstack" is not a release gate. Need data on which fixes worked and which didn't to iterate effectively.
- **Pros:** Data-driven iteration instead of vibes-only validation.
- **Cons:** ~5 min manual logging per session.
- **Depends on:** Nothing — can be added to replay checklist anytime.
- **Blocked by:** Nothing.
