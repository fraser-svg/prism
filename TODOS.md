# Prism TODOs

## ~~Reduce verbose logs to milestone-only~~ — DONE in v3
Replaced by `prism-registry.sh` JSON events. Only significant actions are logged.

## Git Worktree Workers (deferred from v3)

**What:** `prism-worktree.sh` — true parallel file isolation via git worktrees for large builds (6+ requirements).

**Why:** When multiple workers modify the same files, merge conflicts arise. Worktrees give each worker an isolated copy. Deferred from v3 because there's no evidence users regularly hit 6+ requirement builds.

**When:** After data shows >10% of builds have 6+ requirements.

**How:** `git worktree add .prism/worktrees/{name} -b prism/worker/{name}` per worker, merge back with conflict reporting. Workers would run in isolated directories.

## Prompt Learning (deferred from v3)

**What:** `prism-learn.sh` — store successful prompt patterns and reuse them in future builds.

**Why:** After 3+ successes with the same task type, mark the prompt pattern as "proven." Deferred from v3 because pattern reuse mechanism needs more design (staleness detection, selection logic).

**When:** After v3 is stable and we have data on which prompt patterns succeed vs fail.

**How:** Read/write patterns section of `.prism/registry.json`. Feed proven patterns into worker prompt generation.

## Multi-Factor Complexity Heuristic (v3.1)

**What:** Replace simple requirement-count heuristic (1-2 = inline, 3+ = workers) with multi-factor: requirement count + estimated files touched + coupling to existing code.

**Why:** One requirement can touch 40 files. Requirement count alone is a poor proxy for build complexity.

**When:** After v3 dogfooding reveals cases where the heuristic chose wrong.

## Tool Routing (P2)

**What:** During product decomposition, Prism identifies phases it can't handle well and recommends external tools (Lovable for complex frontends, etc.).

**Why:** User explicitly requested. Prism should be humble about its limits rather than attempting everything and producing poor results. When PRODUCT.md phases include complex frontend work, Prism should say "this phase would be better done in Lovable" instead of building a bad UI.

**How:** Add a tool-routing check to Stage 1 when reading PRODUCT.md phases. Match phase descriptions against known tool capabilities. Present recommendation to user with rationale.

**Depends on:** Living Architecture Doc (PRODUCT.md) shipping — needs the phase breakdown to know what to route.

## Checkpoint Integration (P2)

**What:** Named git tags at phase boundaries so the user can say "go back to before we added auth" and Prism can restore that state.

**Why:** Natural companion to PRODUCT.md phases. Each completed phase gets a named checkpoint (e.g., `prism/encounter/phase-1-data-model`). Cheap safety net for multi-phase products.

**How:** After Stage 5 (Ship), create a git tag: `git tag "prism/{product}/{phase-description}"`. On resume, show available checkpoints. On request, restore via `git checkout {tag}`.

**Depends on:** Living Architecture Doc (PRODUCT.md) shipping — needs phase boundaries to know when to checkpoint.

## Parallel Workstreams (P3)

**What:** Support multiple build tracks running simultaneously (e.g., content pipeline + app build). Currently Prism is single-threaded: understand, plan, build, verify, ship, repeat.

**Why:** DOGFOOD #8 gap 4. Real products have independent tracks that could run in parallel. Deferred from the Living Doc implementation because it requires fundamentally different orchestration.

**How:** TBD — would need multiple active OpenSpec changes tracked in PRODUCT.md with independent lifecycles. Significant complexity increase.

**Depends on:** Living Architecture Doc (PRODUCT.md) stable + at least 3 successful dogfood runs with the sequential flow.
