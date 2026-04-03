# TODOS

## Deferred from Eng Review (2026-03-21)

### TODO-1: Hooks Specification (Plan B Enforcement)
- **What:** Write a concrete PreToolUse hook spec that scans for operator boundary violations in Bash commands (founder-directed instructions, "open another terminal", manual setup). Include settings.json format and test cases.
- **Why:** Prompt reinforcement has a known ceiling. If Fixes 1-4 fail after 3 dogfood sessions, hooks are the structural enforcement backup. Without a ready spec, you lose another iteration cycle.
- **Pros:** Ready to deploy immediately when needed.
- **Cons:** Engineering effort for something that may never be needed.
- **Depends on:** Fixes 1-4 shipping + 3 dogfood sessions showing continued violations.
- **Blocked by:** Nothing — can be specced anytime.

### TODO-3: BETTER_AUTH_SECRET Validation Guard
- **What:** Add a startup guard in `apps/web/server/index.ts` that crashes with a clear error if `BETTER_AUTH_SECRET` is missing or shorter than 32 characters when `NODE_ENV !== "development"`.
- **Why:** Silently using a weak or missing secret in production means sessions are trivially forgeable. The existing `SKIP_AUTH` guard pattern is the right model.
- **Fix:** `if (process.env.NODE_ENV !== "development" && (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)) { console.error("FATAL: BETTER_AUTH_SECRET must be set to a 32+ char secret in production"); process.exit(1); }`
- **Blocked by:** Nothing.

### TODO-4: Crash on Workspace Init Failure
- **What:** In `apps/web/server/index.ts`, if `facade` or `clients` fails to initialize, the process currently logs an error but stays alive with no listener. Add `process.exit(1)` after the error log.
- **Why:** A zombie process that never listens is a silent failure. It will look healthy to process monitors but serve no requests.
- **Blocked by:** Nothing.

### TODO-2: Quantitative Success Metrics
- **What:** After each dogfood session, log pass/fail for 4 checks: (1) discovery before building, (2) research before committing, (3) no broken/unverified suggestions, (4) no manual terminal steps. Aggregate across sessions.
- **Why:** "Feels like gstack" is not a release gate. Need data on which fixes worked and which didn't to iterate effectively.
- **Pros:** Data-driven iteration instead of vibes-only validation.
- **Cons:** ~5 min manual logging per session.
- **Depends on:** Nothing — can be added to replay checklist anytime.
- **Blocked by:** Nothing.
