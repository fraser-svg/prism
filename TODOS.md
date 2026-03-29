# Prism TODOs

## ~~Reduce verbose logs to milestone-only~~ — DONE in v3
Replaced by `prism-registry.sh` JSON events. Only significant actions are logged.

## ~~Active Review Orchestration (deferred to M3)~~ — DONE in v4.0.3.0

M3 bridge CLI wires `record-review`, `check-reviews`, and `release-state` through SKILL.md at all 9 integration points. Guardian's review matrix is now exercised at every stage transition via the dual-write bridge.

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

## Graduate Bridge Gates to Blocking (post-M3)

**What:** After M3 dual-write bridge proves reliable across 2+ dogfood sessions, switch gates from advisory to blocking. The skill can't advance stages if the core says artifacts are missing.

**Why:** M3 bridge is advisory-only to earn trust first. Once gate checks reliably match the skill's own state, graduating to blocking makes the core's lifecycle enforcement real.

**When:** After 2+ successful dogfood sessions with full typed artifact trails.

**How:** Change the SKILL.md bridge call pattern from `|| true` (silent failure) to checking the exit code and blocking on gate-check failures. Add user-facing messaging when a gate blocks.

**Depends on:** M3 complete with proven reliability.

## Database Recovery UX for Desktop (M5.2)

**What:** When `WorkspaceDatabase.open()` throws (corrupt DB, missing FTS5), show a recovery dialog instead of crashing: "Your workspace data needs repair. [Repair] [Start Fresh]."

**Why:** Non-developer users can't debug SQLite errors. A crashed Electron window with no explanation is the worst possible UX. The backup-before-migrate mechanism already exists (WorkspaceDatabase.backupBeforeMigrate), so "Repair" can attempt re-open with a fresh DB, and "Start Fresh" can offer to restore from the most recent backup.

**How:** Wrap `WorkspaceFacade` construction in the main process with try/catch. On failure, show a native Electron dialog (`dialog.showMessageBox`) with recovery options. Implement repair logic: (1) try re-running migrations, (2) if that fails, rename corrupt DB and create fresh, (3) offer backup restore if backup files exist.

**Depends on:** M5.1 (Electron scaffold exists). Should be implemented during M5.2 when the renderer and error states are being built.

## Reduced-Motion Accessibility (M5.2+)

**What:** Add `prefers-reduced-motion` media query support. When enabled: show text instantly (no thought-pace animation), skip 300ms pane transitions, disable phase indicator dot animations, remove background darkening on >3s wait.

**Why:** Some users experience motion sickness or vestibular disorders. WCAG 2.1 AAA requires reduced-motion support. M5.2 introduces several motion behaviors (text write-in at ~40 chars/sec, pane slide transitions, phase dot color transitions) that all need static fallbacks.

**How:** CSS `@media (prefers-reduced-motion: reduce)` for transition/animation overrides. For the JS-driven text write-in, check `window.matchMedia('(prefers-reduced-motion: reduce)')` and render text instantly if true.

**Depends on:** M5.2 (motion behaviors must exist to have fallbacks for).

## High-Contrast Mode (M5.2+)

**What:** Support macOS high-contrast accessibility setting (`prefers-contrast: more`). When enabled: increase border widths from 1px to 2px, boost text contrast ratios, make focus rings thicker (3px), increase tonal separation between surfaces.

**Why:** DESIGN.md's warm dark palette relies on subtle tonal differences (e.g., `#1A1917` vs `#242320` — only 10 lightness units apart). Low-vision users need stronger visual boundaries.

**How:** CSS `@media (prefers-contrast: more)` overrides for border-width, outline-width, and swap subtle surface colors for higher-contrast alternatives (e.g., `#1A1917` base stays, but elevated surfaces move from `#242320` to `#38352F` for more separation).

**Depends on:** M5.2 (base components must exist).

## Deprecate OpenSpec for Core Spec Storage (post-M3)

**What:** Migrate from OpenSpec (`openspec/changes/{name}/specs/`) as primary spec format to `.prism/specs/{specId}/` as the single source of truth. Remove the dual-write once the core is the canonical system.

**Why:** Dual-write exists because both systems need to work in M3. Once the core proves reliable, maintaining two spec storage locations is unnecessary complexity.

**When:** After M3 gates are graduated to blocking and the core is trusted.

**How:** Update SKILL.md to write specs to `.prism/specs/` only. Update the spec-generator subagent. Migrate existing OpenSpec specs during a one-time migration pass. Keep OpenSpec archived as historical records.

**Depends on:** Graduate Bridge Gates to Blocking.
