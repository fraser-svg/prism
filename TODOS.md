# Prism TODOs

## ~~Path-Free Project Creation for Web~~ — UX FRICTION RESOLVED in fraser-svg/fix-project-folder-picker

Server now auto-creates project directories under `~/Prismatic/{slug}` when `rootPath` is omitted. Users just type a project name and submit. Broken native Finder dialog removed.

### Remaining: Decouple project identity from filesystem paths (P2)

**What:** Projects are still identified by filesystem paths on the server. For full path-free support, decouple project identity from `rootPath` entirely (e.g., support URL-only projects, GitHub repo URLs, or virtual projects with no filesystem backing).

**Why:** Remote users on Railway still depend on the server's ephemeral filesystem. Auto-create under ~/Prismatic/ solves the UX problem but not the architectural coupling.

**When:** Before multi-tenant or hosted deployment where server filesystem is not user-owned.

## ~~Portfolio MVP — Shared UI + Web App~~ — DONE in fraser-svg/portfolio-mvp

`packages/ui/` extracted as shared React component library. `apps/web/` created (Vite + Express). `apps/desktop/` refactored to import from `@prism/ui`. Transport adapter pattern (`IpcTransport` / `FetchTransport`) enables both apps to share the same Zustand store.

### P1 deferred items from portfolio-mvp

- **Favicon**: Add `apps/web/public/favicon.svg` + `apps/desktop/` icon
- **Skeleton loading**: Show placeholder cards while portfolio loads instead of blank screen
- **Keyboard shortcuts**: `⌘K` to focus search, `⌘N` to open new project dialog
- **Zustand persist**: Persist `searchQuery` + `activeProjectId` across page reloads in web app
- **`dev:app` script**: Add root-level `npm run dev:app` that starts both web server and Vite concurrently

## Canonical Orchestration Spec — YAML Compiler (P1)

**What:** Extract root SKILL.md into `compiler/skills/prism-orchestrator.yaml`. Phase 1: manifest + static sections. Phase 2: stage logic extraction. Phase 3: Codex AGENTS.md compile target. CLI manifest stub at `compiler/output/cli/prism-orchestrator/manifest.json`.

**Why:** Planned as part of the LLM Decoupling work but deferred from the first PR to keep scope manageable. The adapter/routing/dashboard work shipped, but the compiler extraction is the highest YC narrative impact item: proving Prism's orchestration logic is portable across model runtimes.

**When:** Next PR after decouple-prism-llm lands.

**How:** See the CEO plan at `~/.gstack/projects/fraser-svg-prism/ceo-plans/2026-04-03-decouple-prism-llm.md` for full phased extraction plan with gate checks.

**Depends on:** LLM Decoupling PR 1 (fraser-svg/decouple-prism-llm) shipped. Deferred from plan: `2026-04-03-decouple-prism-llm.md`.

## Batch Portfolio Endpoint (P3)

**What:** Add `GET /api/portfolio/full` endpoint that returns portfolio data + all pipeline snapshots in a single response, replacing the current N+1 request pattern.

**Why:** The Portfolio page currently fires one `GET /api/portfolio` then N separate `GET /api/projects/:id/pipeline` requests (one per project). At demo scale (<20 projects on localhost), latency is negligible. At real scale or over a network, this becomes a visible page load delay.

**When:** When page load on the Portfolio page is noticeably slow, or when the web app is used over a network (not localhost).

**How:** Add a new Express route that calls `facade.registry.list()`, `clients.list()`, and `extractPipelineSnapshot()` for each project server-side, returning the combined result. Update `FetchTransport.listPortfolioFull()` to call it. Keep the existing separate endpoints for granular refresh.

**Depends on:** Web app MVP shipped (`apps/web/`).

## Monorepo Target Directory Resolution (P2)

**What:** Add framework detection to `scripts/prism-inject.sh` for monorepo projects where `.env.local` needs to go in a subdirectory (e.g., `app/`, `packages/web/`).

**Why:** Auto-inject uses `$PROJECT_ROOT` which is correct for single-app projects. Monorepo users would get `.env.local` in the wrong directory where their framework won't read it.

**When:** When an internal user reports inject targeting the wrong directory.

**How:** Look for `next.config.*`, `vite.config.*`, or `package.json` with framework deps in subdirectories. `scripts/prism-deploy.sh` already has app-root detection logic (line 119) that could be extracted into `prism-helpers.sh`. Fall back to `$PROJECT_ROOT` if no framework detected. Manual `prism: inject <dir>` override remains available.

**Depends on:** Auto-inject PR (fraser-svg/api-key-vault).

## Per-Project Key Scoping (P3)

**What:** Allow projects to specify which providers they need, so inject only writes relevant keys instead of all connected keys.

**Why:** Currently all connected keys are injected into every project (e.g., `STRIPE_SECRET_KEY` in projects that don't use Stripe). Accepted for M1 (internal users, gitignored file, known threat model) but violates least-privilege principle.

**When:** When internal users report wanting per-project control, or when expanding beyond 2-5 internal users.

**How:** Options: (a) `prism: inject --only anthropic openai` flag, (b) `.prism/config.json` in project root specifying required providers, (c) auto-detect by grepping source for env var references. Option (c) is cleanest UX but most complex to implement.

**Depends on:** Auto-inject PR (fraser-svg/api-key-vault) + evidence from internal users.

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

## ~~IntakeBrief Entity (P2 — Tier 1)~~ — DONE in v4.0.13.0

Added `IntakeBrief` type to `packages/core/src/entities.ts` and `IntakeBriefRepository` to `packages/memory/`. Part of the Trust-First Self-Healing Engine. **Completed:** v4.0.13.0 (2026-03-30)

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

**How:** Add to `evals/` directory. Script that simulates the marketing verification task inputs and asserts Red Team + taxonomy outputs. **Note (from 80% wall hardening review):** Also verify that confidence scoring incorporates build-time signals (guardian_dispatch count, qa_regression count, test failures) — not just pre-build assessment.

**Depends on:** Better Solution Finding feature shipped + seed taxonomy entries + 80% Wall Hardening (confidence scoring changes).

## Graduate Advisory Prescriptions to Auto-Tightening Gates (P2)

**What:** After 5+ consecutive sessions where a prescription's advice is followed (dimension scores >= 7), automatically tighten the corresponding gate to enforce the behavior instead of just advising it.

**Why:** Self-healing v1 prescriptions are advisory-only (CEO review decision — safe starting point). Once prescription accuracy is proven across real sessions, the natural graduation is enforcing the behavior in gates. Without this, prescriptions become noise that operators learn to ignore.

**When:** After 5+ sessions with accurate prescriptions (recentScores show the advice was followed and scores improved).

**How:** Add a `prescription.promotable` flag computed from recentScores. When promotable, the gate evaluator reads active promotable prescriptions and adds the requirement as a blocker (e.g., "IntakeBrief required before plan stage"). Requires a confirmation prompt before first auto-tighten to build operator trust.

**Depends on:** Self-healing system (Slices C-E) shipped + 5+ sessions with accurate prescription scoring.

## Autoresearch Level 2: Workflow Experiments (P2)

**What:** Extend the experiment system beyond prompt variants to test workflow changes (gate thresholds, stage ordering, retry strategies).

**Why:** Level 1 (Prompt Evolution) only covers one dimension of Prism's behavior. Workflow experiments would let Prism self-optimize its own pipeline structure, not just its prompts. Deferred from autoresearch v1 to keep scope tight for the first implementation.

**When:** After Level 1 has run 20+ experiments with at least 3 promotions, proving the infrastructure works.

**How:** Add `workflow` to ExperimentLevel. Define workflow variant templates targeting gate thresholds and stage transitions. Requires careful rollback semantics since workflow changes affect multiple stages.

**Depends on:** Autoresearch Level 1 (Prompt Evolution) shipped and proven reliable.

## Reduce Experiment Decision Threshold (P3)

**What:** Lower the >10% improvement threshold after collecting real data on score variance across sessions.

**Why:** The 10% threshold is conservative for launch. Real session score variance may be much tighter, meaning 5% improvement could be statistically meaningful. Need data first to calibrate properly.

**When:** After 50+ experiment metrics are recorded from real sessions.

**How:** Analyze metric variance from `.prism/experiments/` data. If the standard deviation of dimension scores is <3%, a 5% threshold would be appropriate. Consider making the threshold configurable per experiment.

**Depends on:** Autoresearch Level 1 running in production with real session data.

## Experiment Dashboard in Pipeline Visualizer (P3)

**What:** Add an experiment status panel to PIPELINE.html showing active experiments, their metrics, and decisions.

**Why:** Currently experiment state is only visible via JSON files. A visual panel would let operators see at a glance which experiments are running, how they're trending, and what was recently promoted or discarded.

**When:** After pipeline visualizer sparklines TODO is complete (builds on the same rendering infrastructure).

**How:** Add `activeExperiments` field to `PipelineSnapshot`. Read experiment registry + active experiments, include metric summaries. Render as a table in the HTML with baseline vs test averages and session counts.

**Depends on:** Autoresearch Level 1 shipped + Pipeline Visualizer Session History Sparklines.

## Electron Auto-Update + Code Signing (P2)

**What:** Add electron-updater with code signing for macOS distribution.

**Why:** Without auto-update, every bug fix requires users to manually download a new build. Without code signing, macOS Gatekeeper blocks the app entirely. Not needed for the YC demo (run from dev mode or local build), but required before any external user touches it.

**When:** After MVP is shipped and before first external user.

**How:** Add electron-updater, configure GitHub Releases as update source, set up Apple Developer signing with notarization. Build pipeline via electron-builder.

**Depends on:** Electron Portfolio MVP shipped.

## Event-Log Schema Versioning (P2)

**What:** Add a schemaVersion field to event-log entries and a migration path for desktop event types.

**Why:** The unified event-log now serves both orchestrator internals and desktop UI. If the schema changes again, old entries need to remain readable. Without versioning, unrecognized entries could crash the drawer.

**When:** Before the next event-log schema change after MVP.

**How:** Add `schemaVersion: 1` to event entries. On read, check version and apply transforms for older entries. Keep a version changelog in event-log.ts comments.

**Depends on:** Event-log desktop extension (Electron MVP PR).

## Pipeline Visualizer: Session History Sparklines (P2)

**What:** Embed the last 5 session report card scores as mini sparklines per dimension directly in the pipeline HTML, so you can see health trends without opening HEALTH.md.

**Why:** Fraser is dyslexic — switching between HEALTH.md (markdown) and PIPELINE.html (visual) to see trends is friction. Sparklines in the pipeline view create a single-pane-of-glass for pipeline state + health trends. Also useful for demos.

**When:** After pipeline visualizer is shipped and proven useful in daily use.

**How:** Add report card reading to `extractPipelineSnapshot()` (same pattern as `health-dashboard.ts` — readdir reports dir, parse JSON, sort by timestamp, take last 5). Add a `recentReportCards` field to `PipelineSnapshot`. Render sparklines per dimension in the HTML stage detail panel. The `sparkline()` function is already exported from `health-dashboard.ts`.

**Depends on:** Pipeline visualizer shipped (pipeline-snapshot.ts + pipeline-visualizer.ts).

## Stitch Pipeline Integration (P2)

**What:** Feed Stitch-generated HTML into Prism's worker/verification pipeline so Stitch output gets the same quality gates as Gemini worker output.

**Why:** Currently Stitch output bypasses Prism's Guardian, QA review, and engineering review stages. For agency operators delivering to clients, unverified output is a risk. Integrating Stitch into the pipeline means Stitch screens get the same confidence scoring, QA, and design review as any other build artifact.

**When:** After evidence that Stitch is actively used in real builds.

**How:** After Stitch generates HTML via `getHtml`, pass it through the existing verification pipeline as a build artifact. Requires adapting the worker output format to accept Stitch HTML alongside Gemini code output.

**Depends on:** Stitch SDK integration PR (fraser-svg/add-stitch-sdk) + evidence Stitch is used in real sessions.

## Stitch Orchestrator Routing (P3)

**What:** Automatic routing of frontend tasks to Stitch or Gemini worker based on task characteristics, without user intervention.

**Why:** Currently the user or Prism operator must decide whether to use Stitch or Gemini for a frontend task. Automatic routing based on task type (standalone screen vs integrated code) would reduce friction and improve output quality by always picking the right tool.

**When:** After Stitch SDK integration is shipped and the Tool Routing TODO is implemented.

**How:** Extend the tool routing check in Stage 1 to classify frontend phases as "standalone screen" (→ Stitch) or "integrated code" (→ Gemini worker). Use heuristics: presence of existing project files, whether the output is a full page vs a component, user intent signals.

**Depends on:** Stitch SDK integration PR (fraser-svg/add-stitch-sdk) + Tool Routing TODO.

## Provider Dashboard E2E Tests (P1)

**What:** Playwright E2E tests for the Providers tab: render with 2+ providers, refresh triggers health checks and badge updates, provider disconnect turns badge red.

**Why:** The Providers dashboard is the YC demo surface for LLM agnosticism. Untested UI is demo risk. Unit tests cover adapters and router logic, but the full stack (IPC -> cabinet -> adapters -> UI badges) needs integration coverage. Eng review identified 3 E2E gaps.

**When:** After Phase 3 (Provider Dashboard) implementation is complete, before YC demo.

**How:** Add Playwright tests targeting the Electron app's Providers route. Test: (1) tab renders with provider list from cabinet, (2) refresh button calls `providers:check-health` IPC and updates badges, (3) simulated provider disconnect (mock adapter returning unavailable) shows red badge. Follows the same Electron E2E pattern as any future desktop tests.

**Depends on:** LLM Decoupling PR 1 (fraser-svg/decouple-prism-llm) — Phase 3 dashboard shipped.

## Proof-Check Gate Accuracy Tracking (P2)

**What:** After 10+ sessions with proof_check_pass/fix telemetry, analyse the fix rate and false positive rate to determine if the gate is effective.

**Why:** The Proof-Check Gate (added in the Consultant Communication update) asks the Operator to self-review build output before advancing to QA. Without tracking accuracy, you cannot tell if the gate is catching real issues or rubber-stamping. If fix rate is <5%, the gate may not be adding value. If >50%, it may indicate systemic build quality issues.

**When:** After 10+ Prism sessions with proof-check telemetry recorded in `.prism/telemetry.jsonl`.

**How:** Read `proof_check_pass` and `proof_check_fix` events from telemetry. Compute: total runs, fix count, fix rate (fixes/total), category breakdown (coherence vs ux vs fidelity). If fix rate is very low, consider simplifying the gate. If high, investigate whether the gate is catching genuine issues or being overly cautious.

**Depends on:** Consultant Communication + Self-Review shipped + 10 sessions with telemetry data.

## Orphaned Context File Cleanup (P3)

**What:** A background scan that finds files in `~/.prism/clients/*/context/` and `{project}/.prism/context/` that don't have matching `context_items` rows in the DB.

**Why:** The DB-first delete strategy intentionally leaves orphaned files on disk when `fs.unlink` fails. Over time these accumulate and waste disk space silently.

**When:** After Phase 1 of Context Dump is shipped and in regular use.

**How:** On app startup (or manual trigger), scan managed context directories. For each file, check if a `context_items` row exists with matching `file_path`. If not, delete the orphan. Log count of cleaned files.

**Depends on:** Context Dump Phase 1 (fraser-svg/context-dump).

## IntakeBrief → ExtractedKnowledge Migration (P3)

**What:** When IntakeBrief data exists for a project, auto-convert `clientContext`, `painPoints`, and `assumptions` into `ExtractedKnowledge` entries so the context system benefits from historical session data.

**Why:** IntakeBrief captures per-session discovery data that's currently ephemeral. Converting these to persistent knowledge means returning clients benefit from all previous Prism sessions, not just dropped files.

**When:** After Context Dump Phase 2 (extraction pipeline) is shipped and proven.

**How:** Map IntakeBrief fields to ExtractedKnowledge categories: `painPoints` → category 'business', `assumptions` → category 'business', `clientContext` → category 'business'. Set confidence to 0.7 (lower than AI extraction since these are user-reported, not verified). Run as a one-time migration or on-demand per project.

**Depends on:** Context Dump Phase 2 (fraser-svg/context-dump) + IntakeBrief having real data from sessions.

## Client Data Retention & Encryption Policy (P2)

**What:** Define and implement retention limits, redaction capability, and at-rest encryption for client transcripts and documents stored in the context system.

**Why:** Context Dump persists client transcripts, documents, and extracted knowledge indefinitely with no retention policy or encryption. Fine for internal use (single developer on localhost). Required before any external user touches the system. Flagged by Codex adversarial review during eng review (2026-04-04).

**When:** Before first external user. Not blocking for v1 internal use.

**How:** Three components: (1) configurable retention limits per client (auto-delete context items older than N days), (2) "delete all client data" API endpoint for GDPR-style requests (delete context_items + CASCADE + unlink files + purge summaries), (3) at-rest encryption for stored files using workspace-level key. Start with (2) since it's the most legally important.

**Depends on:** Context Dump backend shipped (fraser-svg/littlebird-research).

## Context API Route Integration Tests (P2)

**What:** Integration tests for the 8 Express context routes covering auth middleware, multer file upload, Zod validation, and error responses.

**Why:** The 41-case unit test plan covers repository and extraction logic, but the Express routes handle auth, file upload parsing, and input validation at the system boundary. These are where integration bugs live. Flagged by Codex adversarial review.

**When:** After Context Dump web routes are implemented and working manually.

**How:** Add `test/context-routes.test.ts` using supertest against the Express app. Test: auth required (401 without session), file upload via multipart (201 + item created), oversized file (413), missing required fields (400), re-extract triggers pipeline, flag/apply endpoints work. ~8-10 test cases.

**Depends on:** Context Dump backend shipped (fraser-svg/littlebird-research).

## Free-Trial Abuse Prevention (P3)

**What:** Rate limiting and abuse detection for the free 50-action tier. Options include IP-based rate limiting, email verification before free tier activation, CAPTCHA on sign-up, and fingerprinting repeat sign-ups.

**Why:** The current free tier relies on user_id from auth. A motivated abuser could create multiple accounts to get unlimited free actions. Low priority because early beta volume is tiny, but should be addressed before broad marketing.

**When:** Before any paid marketing campaign or public launch that could attract abuse.

**How:** Simplest: require email verification (Better Auth supports this). Medium: add IP-based daily caps. Full: device fingerprinting + anomaly detection. Start with email verification.

**Depends on:** Vault + usage-gated paywall shipped (fraser-svg/onboarding-api-keys).

## Subscription Tier Configuration (P1)

**What:** Allow YC advisory board to configure subscription tiers with custom usage limits, pricing, and feature gates. Move hardcoded FREE_LIMIT (50) and PAID_DAILY_CAP (500) to a configurable tiers table.

**Why:** Fraser wants his YC advisory board to define subscription tiers with usage limits, not hardcoded values. This enables experimentation with pricing and tier structure without code changes.

**When:** Before YC application submission (May 3, 2026) so advisors can adjust tiers.

**How:** Create a `subscription_tiers` table with columns: tier_id, name, monthly_price_cents, action_limit, daily_cap, features (JSON). Update UsageGate to read limits from this table instead of constants. Add an admin API for tier CRUD. Frontend: tiers dropdown in Vault upgrade flow.

**Depends on:** Vault + usage-gated paywall shipped (fraser-svg/onboarding-api-keys).
