# Prism TODOs

## Doc Drift Lint (P2)

**What:** A validation script or CI check that greps for stale references (deleted files, Tauri, Prismatic, hosted-web-app language) across all active docs.

**Why:** Doc drift is what created the cleanup need addressed in the `first10-users-audit` branch. Without automated checks, the same drift will recur as new docs are added. The validation commands already exist — this makes them permanent.

**When:** After the doc cleanup PR lands.

**How:** Add a `scripts/lint-docs.sh` that runs the 5 grep-based validation commands from the cleanup plan. Wire into CI or pre-commit. Expect zero matches for: Tauri in active docs, Prismatic, deleted file references, creator-as-primary-ICP language. Allowlist: CHANGELOG.md (historical context), TODOS.md itself (describes what to grep for), references/ (external personality configs).

**Depends on:** Doc cleanup PR (`fraser-svg/first10-users-audit`).

## ~~Reduce verbose logs to milestone-only~~ — DONE in v3
Replaced by `prism-registry.sh` JSON events. Only significant actions are logged.

## ~~Active Review Orchestration (deferred to M3)~~ — DONE in v4.0.3.0

M3 bridge CLI wires `record-review`, `check-reviews`, and `release-state` through SKILL.md at all 9 integration points. Guardian's review matrix is now exercised at every stage transition via the dual-write bridge.

## Git Worktree Workers (deferred from v3)

**What:** `prism-worktree.sh` — true parallel file isolation via git worktrees for large builds (6+ requirements).

**Why:** When multiple workers modify the same files, merge conflicts arise. Worktrees give each worker an isolated copy. Deferred from v3 because there's no evidence users regularly hit 6+ requirement builds.

**When:** After data shows >10% of builds have 6+ requirements.

**How:** `git worktree add .prism/worktrees/{name} -b prism/worker/{name}` per worker, merge back with conflict reporting. Workers would run in isolated directories.

## ~~Prompt Learning (deferred from v3)~~ — SUPERSEDED by Continuous Intelligence Layer

Superseded by the Skill Catalogue (`.prism/skill-catalogue.json`). The catalogue records proven libraries, patterns, and approaches with confidence labels (emerging/established/proven). It's broader than prompt learning — it covers packages, skills, and implementation patterns, not just prompts.

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

## Gemini Compile Target (P3)

**What:** Add `cmd_gemini()` to `compiler/prism-compile.sh` for consistent Gemini prompt format.

**Why:** Currently `prism-gemini-worker.sh` constructs prompts inline. A compiler target ensures consistency when there are multiple Gemini-dispatched skills.

**When:** After a second Gemini-dispatched skill justifies it.

**How:** Add a `gemini` case to the compiler's dispatch, generating a system prompt optimized for Gemini's JSON mode.

**Depends on:** Gemini provider adapter PR + a second Gemini-dispatched skill.

## Provider Quality Comparison (P3)

**What:** Build a comparison view showing verification pass rates, token usage, and latency per provider per task type.

**Why:** Data-driven model routing. Without comparison data, the `route_hint` rules are informed guesses. After collecting telemetry from 10+ builds with both providers, we can tune routing for quality, not just provider availability.

**When:** After 10+ builds with both Gemini and Claude producing telemetry data.

**How:** Aggregate from `.prism/telemetry.jsonl`, filter by `worker_complete` events with provider metadata, group by `route_hint` and provider, compute pass/fail rates and token usage.

**Depends on:** Gemini provider adapter PR + sufficient telemetry data.

## Deprecate OpenSpec for Core Spec Storage (post-M3)

**What:** Migrate from OpenSpec (`openspec/changes/{name}/specs/`) as primary spec format to `.prism/specs/{specId}/` as the single source of truth. Remove the dual-write once the core is the canonical system.

**Why:** Dual-write exists because both systems need to work in M3. Once the core proves reliable, maintaining two spec storage locations is unnecessary complexity.

**When:** After M3 gates are graduated to blocking and the core is trusted.

**How:** Update SKILL.md to write specs to `.prism/specs/` only. Update the spec-generator subagent. Migrate existing OpenSpec specs during a one-time migration pass. Keep OpenSpec archived as historical records.

**Depends on:** Graduate Bridge Gates to Blocking.

## IntakeBrief Entity (P2 — Tier 1)

**What:** Add an `IntakeBrief` entity to `packages/core/src/entities.ts` and a basic repository in `packages/memory/`. Persists structured Socratic discovery output: client context, workflow described, pain/failure captured, assumptions, unresolved questions.

**Why:** Currently, discovery output lives only in prompt history — it's not persisted as a structured artifact. For the agency workflow (intake → clarify → shape), this is the #1 artifact gap. Without it, the `clarify` stage has no durable output and sessions aren't resumable from discovery. Part of the 9-stage lifecycle vision (see `docs/designs/prism-os-roadmap.md`).

**When:** After Patrick session validates the current flow works without it.

**How:** Add `IntakeBrief` type to entities.ts (fields: projectId, clientContext, workflowDescription, painPoints, assumptions, unresolvedQuestions, operatorId). Add `IntakeBriefRepository` to memory package. Wire into Socratic discovery output path.

**Depends on:** Nothing — additive entity.

## Typed DeploymentEntity in packages/core (P2 — Tier 1)

**What:** Add a `Deployment` entity to `packages/core/src/entities.ts` with a repository in `packages/memory/`. Track deployment URL, Vercel project ID, environment, timestamp, and status per spec/change.

**Why:** The JSON file (`deploy-state.json`) works for v1 but doesn't integrate with the bridge, resume engine, or release gates. A typed entity enables: bridge queries for deployment status, resume engine knowing what's live, release gates including deployment as a gate, and multi-provider support. For agency operators, "is the client's site live and healthy?" is a first-class question — it can't stay as a field on ShipReceipt. Part of the 9-stage lifecycle vision (see `docs/designs/prism-os-roadmap.md`).

**When:** After prism-deploy.sh proves reliable in 2+ dogfood sessions.

**How:** Add `Deployment` type to `packages/core/src/entities.ts`, add a memory repository, and wire it to the deploy flow.

**Depends on:** This PR (prism-deploy.sh + deploy sections in SKILL.md) shipped first.

## Deploy Rollback Support (P3)

**What:** After a deploy fails or breaks, offer to rollback via the platform CLI (e.g., `vercel rollback`, `netlify rollback`).

**Why:** Deploy-trigger only handles the forward path. If a deploy breaks production, Prism should help the user recover quickly rather than requiring manual intervention.

**When:** After deploy-trigger is proven reliable across 2+ dogfood sessions.

**How:** Add `execDeployRollback` to deploy.ts. Detect current deploy ID from platform CLI, offer rollback to previous deployment. Requires platform-specific rollback commands.

**Depends on:** Ship Stage v2.0 (deploy-detect + deploy-trigger).

## Ship Telemetry Dashboard (P2)

**What:** Aggregate ship receipts from `.prism/ships/*/receipt.json` into a velocity dashboard showing ship frequency, review pass rates, and deploy success rates.

**Why:** Ship receipts are durable artifacts. Aggregating them gives users and teams visibility into build velocity and quality trends over time.

**When:** After 5+ ship receipts exist from real dogfood sessions.

**How:** Add a `ship-stats` bridge command that reads all receipt files, computes aggregates (ships/week, avg review score, deploy success rate), and returns structured JSON. Surface in SKILL.md resume flow.

**Depends on:** Ship Stage v2.0 (ship receipts).

## Changelog Auto-Generation (P3)

**What:** Append a CHANGELOG.md entry at ship time with the spec summary, requirements, and PR link.

**Why:** Users requested it during CEO review. Deferred because the format needs design (Keep a Changelog vs custom) and there's no demo value for Patrick's session.

**When:** After ship receipts are proven and a changelog format is chosen.

**How:** Add `--changelog` flag to `$BRIDGE ship`. Read spec entity, format entry, prepend to CHANGELOG.md. Needs format design first.

**Depends on:** Ship Stage v2.0 (spec entity reading).

## PR Template Detection (P3)

**What:** Detect `.github/PULL_REQUEST_TEMPLATE.md` and merge Prism's rich PR body content into the template structure.

**Why:** Teams with PR templates expect them to be respected. Currently Prism generates its own PR body format which may conflict with existing templates.

**When:** When a user reports their PR template is being overwritten.

**How:** In ship.ts, before generating PR body, check for template file. If found, parse template sections and inject Prism content into matching sections (or append if no match). Fallback to current behavior if no template exists.

**Depends on:** Ship Stage v2.0 (rich PR body generation).

## Cross-User Catalogue Sharing (deferred from Continuous Intelligence Layer)

**What:** Export/import skill catalogue entries between workspaces. Community seed catalogue with battle-tested packages for common domains (auth, payments, file upload, etc.).

**Why:** Accepted as scope expansion during CEO review but deferred. Build the catalogue first, prove it works in single-user mode, then add sharing.

**When:** After the Skill Catalogue has 50+ proven entries from real builds.

**How:** `prism-catalogue.sh export` → JSON file. `prism-catalogue.sh import` with dedup + conflict resolution. Community seed published as a starter catalogue. Confidence labels reset to "emerging" on import (trust must be earned locally).

**Depends on:** Continuous Intelligence Layer stable + Skill Catalogue proven useful.

## Auto-Tune Red Team Aggressiveness (P3)

**What:** Track Red Team false alarm rate (concerns raised that turned out wrong). If >50%, reduce aggressiveness. If <10%, increase it. Adjust the prompt dynamically.

**Why:** The "at least one concern" rule could produce noise over time. Auto-tuning keeps the signal-to-noise ratio high without manual prompt editing.

**When:** After 20+ Red Team runs with outcome data.

**How:** Correlate Red Team concerns with build outcomes (did the concern materialise?). Adjust prompt temperature or add "your last 5 reviews had X% false alarm rate" context.

**Depends on:** Better Solution Finding feature shipped + 20+ builds with telemetry.

## Cross-Build Confidence Trending (P2)

**What:** Aggregate confidence scores across builds to answer: do builds with higher initial confidence have fewer QA failures? Do builds where the user overrode low confidence have more issues?

**Why:** Validates whether the confidence scoring system actually predicts build quality. If it doesn't correlate, the scoring needs recalibration.

**When:** After 10+ builds with confidence scores.

**How:** Read `.prism/ships/*/receipt.json` confidence fields. Correlate with QA pass/fail rates and post-ship issue reports.

**Depends on:** Better Solution Finding feature shipped + 10+ builds with confidence data.

## Red Team Replay Eval (P1)

**What:** Build an eval that replays the marketing verification scenario. Give Prism a task requiring JS execution to detect content. Verify: (1) taxonomy flags "js-rendering," (2) Red Team catches static approach blind spots, (3) confidence reflects the gap.

**Why:** Without this eval, you can't prove the system works. The development logs are ground truth.

**When:** After Better Solution Finding is shipped + seed taxonomy is populated.

**How:** Add to `evals/` directory. Script that simulates the marketing verification task inputs and asserts Red Team + taxonomy outputs.

**Depends on:** Better Solution Finding feature shipped + seed taxonomy entries.
