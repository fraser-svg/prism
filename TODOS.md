# Prism TODOs

## Reduce verbose logs to milestone-only

**What:** Switch Prism's operation log from verbose (every action) to milestone-only (stage transitions only).

**Why:** Verbose logging adds subagent overhead and creates noise in the change directory. It's useful now for diagnosing Prism's behavior while the autopilot pipeline is being developed, but should be trimmed once stable.

**When:** After 3-5 successful full-lifecycle dogfood runs with the auto-advance pipeline working reliably.

**How:** Update `references/operation-log.md` to remove per-requirement and per-drift log entries. Keep only: stage transitions, skill invocations, skips, errors, backsteps.

**Depends on:** Auto-advance pipeline (Commit 2) being stable and tested.
