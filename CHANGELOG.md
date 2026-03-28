# Changelog

All notable changes to Prism are documented here.

## [4.0.4.0] - 2026-03-28

### Added
- **Stage 4.6: Codex Second Opinion** — mandatory multi-model review step when Codex CLI is available. Graceful degradation when not installed. Once-per-cycle guard prevents infinite loops.
- **Engineering review: cognitive patterns** — Review Mindset section with 5 engineering instincts (blast radius, boring by default, systems over heroes, essential vs accidental complexity, reversibility)
- **Engineering review: failure modes** — new section requiring reviewers to identify production failure scenarios for each significant codepath
- **Engineering review: scope drift** — new section comparing changed files against spec requirements
- **Engineering review: test path diagrams** — ASCII diagrams with coverage markers for significant new codepaths
- **Planning review: Step 0 scope challenge** — pre-review scope validation (existing code reuse, minimum changes, complexity smell, TODOS cross-ref, structural vs behavioral separation)
- **Planning review: failure modes** — section requiring failure scenario analysis for each new codepath
- **Ship readiness: Gate 9** — second opinion gate (GREEN/YELLOW/RED based on Codex availability and verdict)
- **Ship readiness: review summary** — consolidated review verdict listing in output format

### Added — Performance Audit (10 fixes)
- **Batch bridge CLI** — `batch` command executes multiple bridge operations in a single Node.js process, eliminating per-command cold start tax. Two-layer refactor: pure `exec*` functions (return data, throw on error) + `cmd*` wrappers (call `process.exit`). Batch calls the pure layer directly with per-command error isolation.
- **Checkpoint filename indexing** — History files now use `{specId}--{timestamp}.json` format. `readLatestForSpec()` filters by prefix for O(1) lookup instead of scanning all files. Backward-compatible: falls back to full scan for pre-index files.
- **Script timeout with SIGTERM→SIGKILL** — `execScriptWithJsonInput` accepts `timeoutMs` (default 30s). Sends SIGTERM on timeout, escalates to SIGKILL after 5s grace period.
- **Scan parity test** — `scripts/test-scan-parity.sh` with 17 checks validating consolidated jq output matches original behavior.
- **Checkpoint repository tests** — 8 new tests covering indexed write/read, corruption tolerance, fallback, and edge cases.
- **Batch CLI tests** — 4 new tests covering success, partial failure, unknown commands, and empty arrays.
- **Timeout tests** — 4 new tests covering normal completion, SIGTERM, SIGKILL escalation, and error format.

### Changed
- Stage 4 (QA) routing: non-UI products now flow to Stage 4.6 instead of Stage 5
- Stage 4.5 (Design Review) routing: already-ran-this-cycle skip now routes to Stage 4.6
- `ReviewType` union: added `"codex"` value
- `REVIEW_TYPES` validation array: added `"codex"` for `record-review` CLI acceptance
- `mapSkillStageToPhase()`: stage 4.6 now correctly maps to `"verify"` phase
- **Parallel gate evaluation** — `gate-evaluator.ts` uses `Promise.all` for independent spec/checkpoint/review reads instead of sequential awaits
- **Parallel resume reads** — `resume-engine.ts` parallelizes plan/spec/checkpoint reads with `Promise.all`
- **Consolidated scan script** — `prism-scan.sh` replaces N×jq loop with bash string concatenation; consolidates 3 registry reads into single jq call
- **requireArg throws instead of fail()** — Prevents batch process from being killed by a single malformed sub-command

### Fixed
- Checkpoint `readLatestForSpec` corruption tolerance — iterates all indexed files with per-file try/catch instead of failing on first corrupt file
- Duplicate `readdir` call eliminated — fast path and slow fallback now share a single directory read

## [4.0.3.2] - 2026-03-28

### Added
- **Core Design Principles** — explicit first-class principles added to VISION.md and architecture README: verify before trust, minimize LLM dependence, route by capability, build AI-native. Umbrella principle: protect the user.

### Changed
- Aspirational principles (model routing, verify-before-trust) qualified with current implementation status to prevent false safety guarantees

## [4.0.3.1] - 2026-03-28

### Added — YC Build Brain
- **CLAUDE.md** — always-on YC awareness layer loaded every Claude Code session. Contains deadline, priority stack, stop-building list, and pre-work gate directive.
- **/yc-brain command** — three-mode slash command (gate/review/retro) that evaluates proposed work against 6 YC readiness dimensions and returns BUILD/DEFER/STOP verdicts. Replaces the ChatGPT-based oversight workflow.
- **SCORECARD.md** — persistent YC readiness state with two-section structure: Current State (overwritten each review) and History (append-only trend log). Seeded with initial scores (15/30).

### Changed
- PLANS.md working rules now require `/yc-brain` gate before implementation and `/yc-brain review` after milestones
- OVERSIGHT.md dimension names unified across Required Output and Scoring sections; added Live Scorecard pointer

## [4.0.3.0] - 2026-03-28

### Added — M3: Skill-Bridge (Typed Core → SKILL.md)
- **Bridge CLI** — `packages/orchestrator/src/cli.ts` with 10 commands (`gate-check`, `write-spec`, `write-plan`, `write-task-graph`, `record-review`, `record-verification`, `check-reviews`, `checkpoint`, `resume`, `release-state`). All output JSON to stdout, exit 0 for success, exit 1 for errors. Top-level try/catch ensures crashes produce structured `{ "error": "..." }` JSON.
- **Bridge adapters** — `bridge-adapters.ts` with 6 converter functions (`skillSpecToCore`, `skillPlanToCore`, `skillReviewToCore`, `skillVerificationToCore`, `skillCheckpointToCore`, `mapSkillStageToPhase`). Gate-sufficient field mapping: exactly what the gate evaluator, review orchestration, and release-state derivation actually read.
- **SKILL.md dual-write integration** — 9 integration points wired at every stage transition: Stage 0 (resume), Stage 1→2 (write-spec + gate-check), Stage 2 (record-review + write-plan + write-task-graph), Stage 2.5 (record design review), Stage 3 per-worker (checkpoint), Stage 3 post-workers (record-verification + gate-check), Stage 4 (record QA review + verification), Stage 4.5 (record design review), Stage 5 (release-state + check-reviews). All calls are advisory-only (`|| true`).
- **Shell script contracts** — `docs/architecture/script-contracts.md` documenting JSON output formats for all 8 shell scripts
- **67 new tests** — CLI subprocess tests (22), bridge adapter unit tests (35), full lifecycle integration tests (10). Total: 153 tests across 11 files.

### Changed
- `recordReview()` now writes both `{reviewType}.json` (latest) and `{reviewType}-{timestamp}.json` (archive) to preserve review history across multiple runs
- `recordReview()` and `recordVerification()` accept pre-formed entities (with existing IDs) to prevent double ID generation when called from bridge adapters
- `services.ts` exports bridge-adapters module for external consumption
- PLANS.md updated: M2 marked LOCKED, M3 defined as Skill-Bridge
- TODOS.md: added 2 items (graduate gates to blocking, deprecate OpenSpec)

### Fixed
- `mapSkillStageToPhase` NaN fallthrough: `parseFloat("garbage")` returned NaN, all comparisons were false, defaulting to "release" instead of "understand". Added `Number.isNaN(n)` guard.
- CLI test timeout: subprocess tests using `npx tsx` exceeded default 5s vitest timeout. Added `vi.setConfig({ testTimeout: 30_000 })`.

## [4.0.2.0] - 2026-03-28

### Added — M2: Spec-Driven Lifecycle Enforcement
- **Artifact repositories** — `JsonArtifactRepository<T>` for single-JSON entities, `CompositeArtifactRepository` for multi-file artifacts (specs, plans, reviews), custom `CheckpointRepository` with history rotation
- **Entity repositories** — Thin wrappers for specs, plans, reviews, verifications, release-state, each backed by `.prism/` artifact directories
- **Gate evaluator** — `evaluateTransition(from, to, projectRoot)` enforces artifact-based requirements per phase transition. No approved spec means no plan phase. No plan means no execute. No reviews means no release.
- **Resume engine** — 4-tier fallback: checkpoint, artifact scan, legacy registry, cold start. Restores `approvalsPending` from checkpoint for durable approval state. Derives `activeSpecId` from artifact metadata.
- **Review orchestration** — Required review matrix per spec type (product: 5 reviews, change: 2, task: 1). `checkRequiredReviews()` aggregates pass/hold/fail verdicts from `<reviewType>.json` slots. `isReviewComplete()` gates release transitions.
- **Release-state derivation** — `deriveReleaseState()` aggregates 4 evidence dimensions: implementation (checkpoint), reviews (review matrix), verification (run results), approvals (workflow state). Returns ready/hold/pending decision.
- **Execution intent policy** — `checkExecutionIntent()` blocks push/deploy/delete when `approvalsPending` is non-empty. Save always allowed.
- **Canonical entity writers** — `createSpec`, `approveSpec`, `createPlan`, `recordVerification`, `recordReview`, `recordReleaseState` in orchestrator services. Each writes artifacts at canonical paths.
- **GateResult type** in `@prism/core` — `{ allowed, blockers, evidence }` contract for all gate checks
- **ExecutionIntent type** in `@prism/core` — typed intent declarations for policy enforcement
- **86 tests** — artifact repository bases (17), gate evaluator (18), resume engine (8), services (6), review orchestration (9), release-state (7), intent policy (6), E2E lifecycle (11), checkpoint repository (4)

### Changed
- `WorkflowPhase` and `WORKFLOW_PHASES` moved from `@prism/orchestrator` to `@prism/core` (correct dependency direction)
- `WorkflowState` and `WorkflowTransition` types moved to `@prism/core`
- `recordReview()` writes `<reviewType>.json` slots (not `metadata.json`) matching `isReviewComplete()` read contract
- `setWorkflowStage` and `RegistryStage` removed entirely (registry deprecated as workflow state store)
- Registry-related adapters (`readRegistryStatus`, `updateRegistryChange`) marked `@deprecated`
- Resume engine emits `console.warn` on legacy registry fallback

### Fixed
- Checkpoint archive used broad catch-all that swallowed partial archive failures. Now uses `exists()` check with best-effort markdown archive.
- Artifact resume returned `activeSpecId: null` even when spec metadata was available. Now extracts spec ID from scanned artifact metadata.

## [4.0.1.0] - 2026-03-27

### Added — Prism Core Architecture Foundation
- **5 TypeScript packages** — `@prism/core`, `@prism/memory`, `@prism/orchestrator`, `@prism/guardian`, `@prism/execution` with clean module boundaries and workspace references
- **Domain model** — Full entity definitions (Spec, Plan, ReviewFinding, Run, WorkflowState) with branded types for EntityId, AbsolutePath, ISODateString
- **Shared script utilities** — `@prism/core` extracts duplicated adapter code (parseScriptJson, execScriptWithJsonInput, execFileAsync, resolveScriptPath) from 4 packages into one
- **Path traversal prevention** — `validateEntityId()` blocks malicious entity IDs in all path-constructing functions (specPaths, planPaths, reviewPaths, runPaths)
- **Workflow state machine** — 8-phase lifecycle (understand, identify_problem, spec, plan, execute, verify, release, resume) with transition history tracking
- **Artifact path system** — Typed path resolvers for specs, plans, reviews, checkpoints, and runs under `.prism/`
- **Architecture documentation** — ADRs (Prism Core First, Hybrid Local Storage, Bounded Modules), module boundaries, storage layout, domain model spec, milestone tracker, quality gates

### Fixed
- `createExecutionPlan` called `planTaskGraph` twice in parallel instead of plan-then-read-status sequentially
- `resumeProject` failed to copy blockers into `workflow.blockers` (only populated in summary)
- `mapRegistryStageToWorkflowPhase` dead-ended unknown stages at "resume" instead of falling back to "understand" with a warning
- `mapRegistryStageToWorkflowPhase` missing case for "design" stage (now maps to "verify")
- `tsconfig.base.json` removed fragile `typeRoots` pointing at `app/node_modules/@types`
- Extracted `RegistryStage` as a named type export instead of inline union

## [4.0.0.0] - 2026-03-27

### Changed — The Owned Runtime

Prism transforms from a smart skill into an owned product-engineering system. Six phases executed in one session. 211 tests pass.

### Phase A: Unify the Truth
- **Registry reset command** — `prism-registry.sh reset` eliminates stale registry state when starting fresh builds
- **Smart init** — Registry init now detects different change names and auto-archives the old one instead of silently keeping stale state
- **Canonical stage mapping** — String stages (understand/plan/build/verify/ship) and numeric stages (1/2/3/4/5) are now auto-synced between registry and checkpoint via `STAGE_MAP`
- **OpenSpec fallback** — Spec generation falls back to `mkdir -p` when openspec CLI is not installed, matching scan's existing graceful degradation
- **Worker-level checkpoints** — Stage 3 now checkpoints after every worker completion, not just at stage transitions. Reduces context compaction blast radius.
- **Stale docs cleaned** — README project structure updated, DOGFOOD.md references fixed

### Phase B: Upgrade Product Memory
- **Split document model** — Product memory splits from a single PRODUCT.md into 5 purpose-specific files: product.md (what/why), architecture.md (technical shape), roadmap.md (sequencing), state.md (current status), decisions.md (ADR log)
- **`prism-state.sh`** — New script: read, update, migrate, status commands for managing split product memory
- **Templates** — 5 templates in `templates/` with HTML comment instructions for each section
- **Auto-migration** — `prism-state.sh migrate` converts legacy PRODUCT.md into split files without data loss
- **Scan integration** — `prism-scan.sh` now reports `product_memory.model` (split/legacy/none)

### Phase C: Build the Native Supervisor
- **`prism-supervisor.sh`** — Deterministic task graph manager: plan (validates DAG), next (returns unblocked tasks), status (counts), complete (marks done + unlocks), fail (retry/abandon)
- **Kahn's algorithm** — Pure bash+jq cycle detection prevents invalid dependency graphs
- **Transitive blocking** — When a task is abandoned (3 failed retries), all downstream dependents are automatically blocked
- **Idempotent operations** — Double-complete is a no-op. Status is always recoverable from persisted graph state.
- **SKILL.md integration** — Stage 3 now validates task graphs via supervisor before dispatching workers, and queries supervisor for next-ready tasks after each completion

### Phase D: Native Reviews and Verification
- **5 native review prompts** in `references/reviews/`: planning-review.md, engineering-review.md, qa-review.md, design-review.md, ship-readiness.md
- **Self-contained Agent prompts** — Each review works as a standalone prompt with defined inputs, output format, and example output
- **Canonical + adapter architecture** — Native reviews are the canonical Prism reviews. External gstack skills are optional enhanced adapters.
- **Automatic fallback** — If gstack skills are unavailable, Prism falls back to native reviews. No user action required.

### Phase E: Skill/Adapter Compiler
- **Canonical skill source schema** — `compiler/skill-schema.json` defines the standard format for any Prism skill
- **3 example skills** — spec-generator.yaml, build-worker.yaml, ship-readiness.yaml in canonical YAML format
- **`prism-compile.sh`** — Compiler with 4 commands: validate (schema check), claude (generates SKILL.md), codex (generates AGENTS.md), all (batch compile)
- **Cross-platform generation** — Same canonical source produces both Claude and Codex bundles

### Phase F: Safe Self-Improvement
- **`prism-telemetry.sh`** — Append-only JSONL telemetry: record, summary, failures with clustering
- **`prism-improve.sh`** — Improvement proposals with eval gates: propose, list, eval, promote, reject
- **`prism-eval.sh`** — Eval suite: run (pattern matching), baseline (snapshot), compare (regression detection)
- **Hard rule enforced** — No live production mutation without eval-backed promotion. Proposals must pass all eval cases before promotion is allowed.

### Added
- `scripts/prism-state.sh` — product memory management (30 tests)
- `scripts/prism-supervisor.sh` — task graph supervisor (44 tests)
- `scripts/prism-telemetry.sh` — build telemetry capture
- `scripts/prism-improve.sh` — safe improvement proposals
- `scripts/prism-eval.sh` — eval suite with baselines
- `compiler/skill-schema.json` — canonical skill source schema
- `compiler/prism-compile.sh` — skill compiler (35 tests)
- `compiler/skills/` — 3 canonical skill sources
- `references/reviews/` — 5 native review prompts
- `templates/product.md`, `architecture.md`, `roadmap.md`, `state.md`, `decisions.md`
- Test suite: 39 → 211 tests

## [3.0.1.0] - 2026-03-27

### Added
- **Stage progress counter** — Status bar now shows "Stage 1 of 5" instead of just "Stage 1", so users know how many stages remain and where they are in the workflow.
- **Three display routes** (A/B/C) mapping internal stage numbers to user-facing sequential numbers. Route A (non-UI, 5 stages), Route B (UI with DESIGN.md, 6 stages), Route C (UI without DESIGN.md, 7 stages).
- **Stage regression display** — When Prism sends a user back (e.g., QA fails), the counter honestly regresses with an explanatory message ("Stage 3 of 5 · fixing QA issues").
- **Checkpoint integration** — `stage_route` and `stage_total` persisted in checkpoint JSON so the display survives context compaction and session resume.
- **New project default** — Fresh projects (no PRODUCT.md) default to Route A. Route updates after Stage 1 determines the product type.
- Skipped stages keep the total fixed (counter jumps forward rather than changing the denominator).
- **Central API Key Vault** — Store API keys in macOS Keychain once, auto-inject into every project. Commands: `prism: connect`, `prism: disconnect`, `prism: status`, `prism: inject`. Supports 4 providers (Anthropic, OpenAI, Vercel, Stripe). Zero key copy-paste after initial setup.
- New reference file: `references/key-management.md` — full key vault protocol with security model, error handling, and credential precedence (Keychain > env var > localStorage)
- OS detection gate at Stage 0 — gracefully skips key vault on non-macOS systems

### Fixed
- Inject script uses bash 3.2 compatible syntax (macOS default) instead of associative arrays
- Inject hardened against Codex adversarial findings: temp file cleanup trap, end-marker validation, monorepo TARGET_DIR support, keychain lock detection, corrupt block reporting

## [3.0.0.0] - 2026-03-26

### Changed — The Reliability Rewrite
- **Brain/Body split:** SKILL.md rewritten from 840 → 357 lines. LLM handles judgment only (understanding, decomposition, diagnosis). Deterministic bookkeeping moved to 5 bash scripts.
- **Scripts replace subagents:** `prism-registry.sh` (JSON task registry with flock + .bak recovery), `prism-save.sh` (smart auto-save with blocklist, not allowlist), `prism-scan.sh` (project scan with graceful openspec degradation), `prism-verify.sh` (post-worker syntax verification), `prism-checkpoint.sh` (session context persistence). Full test suite at `scripts/test-scripts.sh` (39 tests).
- **Progressive disclosure:** Specs auto-generate silently, user sees a plain-English numbered checklist for approval. Raw spec hidden unless ambiguous or requested.
- **Blocklist-based save:** Replaces the extension allowlist. Any language's source files get saved. Credential files (`*credential*`, `*secret*`, `.env*`, `*.pem`, etc.) are blocked.
- **Inline builds for small changes:** 1-2 requirements build directly in conversation (no worker decomposition overhead).
- **Shared Artifact Bridging:** After each worker, contracts are extracted, validated via grep, and stored in `.prism/contracts/`. Dependent workers get validated type signatures, not raw context.
- **Registry with concurrency safety:** `.prism/registry.json` uses mkdir-based locking and atomic writes (write to tmp → mv). Auto-recovers from `.bak` on corruption.
- **Script-to-LLM interface:** Scripts write full JSON to temp files, print one-line summaries to stdout. SKILL.md uses Read tool on temp files for structured data.
- **Dependency-graph workers:** Independent workers dispatch simultaneously via multiple Agent calls in one message. Dependent workers wait.
- **Coherent rollback:** On parallel batch failure, checks cross-worker imports before partial rollback. Conservative default: roll back entire batch.

### Removed
- `references/build-mode.md` — merged into SKILL.md Stage 3
- `references/stage-routing.md` — merged into SKILL.md stage flow
- `references/session-context.md` — replaced by `prism-checkpoint.sh`
- `references/operation-log.md` — replaced by `prism-registry.sh`
- `references/auto-save.md` — replaced by `prism-save.sh`
- ~15 LLM subagent calls per build for bookkeeping (git, logging, verification, session context)

### Added
- `scripts/prism-registry.sh` — JSON task registry
- `scripts/prism-save.sh` — smart auto-save
- `scripts/prism-scan.sh` — project scan
- `scripts/prism-verify.sh` — post-worker syntax verification
- `scripts/prism-checkpoint.sh` — session context persistence
- `scripts/test-scripts.sh` — 39-test suite covering happy + error paths

## [2.2.0.0] - 2026-03-26

### Added
- **Auto-Update** — Prism checks for updates from GitHub on every invocation. If a newer version is available, it pulls it silently and shows "Updated: v{old} → v{new}" below the banner. No manual re-clone needed. If the fetch fails or Prism wasn't installed via git, it stays silent.
- **Enhanced Running Indicator** — Replaced the simple status prefix with a visually distinct status bar: thick left bar (▌), horizontal rule separator, and closing bar on longer messages. Creates an unmistakable visual block that makes it obvious you're inside Prism, not raw Claude Code.

### Changed
- Status format updated from `🔨 PRISM · Stage N · ...` to `▌ PRISM · Stage N · ...` with horizontal rule separator
- Longer messages now get a closing `── PRISM ──` bar for bookending

## [2.1.0.0] - 2026-03-26

### Added
- **Auto-Save Protocol** — Prism automatically commits and pushes WIP to a remote feature branch after every milestone: spec generation, spec approval, planning, design, each worker completion, and QA/design-review fixes. Crash = lose at most one worker's worth of work, not everything. Commits use `wip: {description} [prism auto-save]` format. Push failures are silent and non-blocking. (DOGFOOD #10)
- **Session Context Protocol** — Prism writes a structured session summary (`session-context.md`) capturing key decisions, user preferences, what was discussed, what was rejected, open questions, and planned next steps. Stage 0 Resume reads this file to provide rich context on re-entry, so returning feels like picking up a conversation instead of starting over. (DOGFOOD #11)
- New reference file: `references/auto-save.md` — full auto-save protocol
- New reference file: `references/session-context.md` — full session context protocol

### Changed
- Stage 0 Resume subagent now reads `session-context.md` and returns CONTEXT line with decisions, preferences, and next steps
- Resume messages enriched with session context (e.g., "We were building the login page — chose sessions over JWT. Two requirements left.")
- Every stage now includes auto-save and session-context update triggers
- Stage 3 (Build) auto-saves after each worker completion, not just at build end

## [2.0.1.0] - 2026-03-26

### Added
- **Session Awareness** — Three defenses against silent session loss: status prefix on every message (`PRISM · Stage N · what's happening`), session loss recovery (auto-resumes if last activity < 2 hours), and working directory anchor in every subagent prompt
- **Working directory anchor** — Every subagent prompt now includes `WORKING DIRECTORY: {project_root}` to prevent workers from accidentally operating on the skill directory or home directory instead of the user's project
- **Project root resolution** — On every invocation, Prism resolves and stores `{project_root}` via `git rev-parse --show-toplevel` before any other action

### Fixed
- Subagents could analyse the wrong directory (e.g., the Prism skill repo instead of the user's project) when the working directory was ambiguous
- No visible indicator that Prism was active after initial invocation — users could lose the session without knowing
- Session loss on Claude Code permission mode change left users thinking they were still in Prism

## [2.0.0.0] - 2026-03-23

### Changed
- **Stage 3 (Build): Two-Tier Context Split** — Operator decomposes spec requirements into isolated TaskPrompts and dispatches workers via Agent tool. Workers receive ONLY task description, relevant files, constraints, and shared types. User conversation, personality, and vision are never sent to workers. This firewall prevents context pollution that causes the 80% wall.
- **Stage 3 (Build): Guardian Pattern** — Replaces "retry once, go inline" with diagnose-rewrite-respawn. On worker failure, the Operator reads the error, diagnoses the cause, rewrites the TaskPrompt with failure context, and dispatches a new worker. Max 3 retries before escalating to user in plain English.
- **Stage 3 (Build): Status Relay** — After each worker completes, Operator translates the result into a plain-English progress update for the user. Workers are invisible; progress is visible.
- **references/build-mode.md** — Rewritten with TaskPrompt template, context firewall rules, Guardian protocol, and status relay pattern.

### Added
- Operation log metrics: worker_count, guardian_retries, failure_reasons for build validation
- DOGFOOD #9: v2 validation tests (context firewall test, 3 real builds, Guardian recovery test)
- Fallback guard: if Task Decomposer produces 0 tasks, falls back to v1.1.0.0 inline build

### Architecture
- Inspired by Elvis Sun's Zoe Agent Swarm Architecture. Core insight: separate the brain (Operator holds intent) from the hands (Workers get task-only prompts). Cross-model review (Claude + Codex) validated the approach but recommended proving the brain inside Claude Code before extracting to a standalone CLI.

## [1.1.0.0] - 2026-03-23

### Added
- Living Architecture Doc (PRODUCT.md): per-project product context that Prism creates, reads, and updates throughout the build lifecycle (DOGFOOD #8)
- Product-level sharpening questions for new products (vision, architecture, phases)
- Bootstrap protocol: synthesize PRODUCT.md from existing code/archived specs
- Silent context injection: PRODUCT.md read at every stage transition without ceremony
- Authority rule: archived specs = history ground truth, PRODUCT.md = direction
- Stale architecture detection via narrow heuristics (package.json, directory structure)
- Stage 2.5: auto-invoke /design-consultation for UI products before first build (DOGFOOD #1, #6)
- Stage 4.5: auto-invoke /design-review for UI products after QA (DOGFOOD #6)
- Resilience protocol: research alternatives before saying something isn't possible, implement after researching (DOGFOOD #5)
- PRODUCT.md update after Build completion (status: "built") and after Ship (status: "shipped")
- Next-phase suggestion after shipping
- UI product detection heuristic in stage routing
- New reference file: references/product-context.md

### Changed
- Stage 0 resume subagent now reads PRODUCT.md and returns product-aware routing (4 paths)
- Stage 1 now checks for PRODUCT.md before sharpening questions (product vs feature ceremony)
- Stage 2 passes architecture context to /plan-eng-review
- Stage 3 consults PRODUCT.md architecture for build decisions
- Stage 5 updates PRODUCT.md and suggests next phase after archiving
- Stage routing decision tree expanded with PRODUCT.md awareness
- Build mode now includes resilience protocol and PRODUCT.md consultation
- Skill catalog now includes /design-consultation and /design-review invocation patterns

## [1.0.1.0] - 2026-03-23

### Added
- Auto-advance: Prism auto-invokes /plan-eng-review, /qa, and /ship via the Skill tool instead of telling users to run them manually
- Operation log: verbose machine-readable log at openspec/changes/{name}/prism-log.md for diagnostics and cross-session resume
- Artifact verification (Part B.5): verifies spec files exist on disk before advancing, preventing silent data loss from subagent failures
- Fallback to guided mode if Skill tool invocation fails
- Context args: Prism constructs spec summaries to pass to each invoked skill

### Changed
- Stages 2, 4, 5 now auto-invoke gstack skills with announcements instead of prompting user to run manually
- Stage 0 resume now reads last 3 log entries for cross-session context
- Skill catalog rewritten for auto-invocation with skip handling and fallback sections
- OpenSpec guided-orchestration spec updated to reflect auto-invocation behavior

### Fixed
- Stale spec path in build-mode.md (was reading from wrong directory during active builds)
- Subagent trust issue: spec generation could report success without writing files to disk

## [1.0.0.0] - 2026-03-22

### Added
- Prism Autopilot: AI concierge that orchestrates OpenSpec + gstack for non-engineers
- OpenSpec CLI integration for structured spec generation, validation, and change tracking
- Guided gstack orchestration: recommends /plan-eng-review, /qa, /ship at each stage
- Subagent pattern: technical operations hidden from user's terminal
- 6-stage lifecycle: Resume → Understand → Plan → Build → Verify → Ship
- Drift detection: compares build state against OpenSpec requirements
- Cross-session resume via OpenSpec change tracking
- Backward stage transitions: user can go back to any stage at any time
- Post-ship confirmation before marking specs as shipped
- Spec validation on resume (malformed specs skipped gracefully)
- OpenSpec skills and commands for Claude Code (.claude/skills/, .claude/commands/)
- OpenSpec change specs for prism-autopilot-v1 (16 requirements, 28 scenarios)

### Changed
- SKILL.md rewritten from 254-line monolith to 262-line thin dispatcher with reference files
- Repositioned from "creative founder co-pilot" to "AI concierge for building software"
- Personality (The Operator) carried forward; all other v0.3 architecture replaced
- Spec format: OpenSpec strict (### Requirement / #### Scenario / SHALL / WHEN-THEN)

### Removed
- Old stage machine (VISIONING/CREATING/POLISHING/SHIPPING/DONE)
- Socratic visioning flow (references/visioning.md)
- .prism/ state management system (references/state-management.md)
- 6 invisible guardrails system (references/guardrails.md)
- Verification loop (references/verification.md) — replaced by OpenSpec validation
- Session init protocol (references/session-init.md) — replaced by OpenSpec resume
- Dashboard chat protocol (references/chat-and-handoff.md)
- Enforcement hooks (operator-boundary, research-gate, verification-gate)

## [0.3.0] - 2026-03-22

### Added
- Adaptive Socratic depth classification (Quick 2Q / Standard 5Q / Deep 10Q) with graceful exit at max rounds
- Two-layer acceptance criteria generation: user-facing (plain language) + machine-facing (testable assertions)
- Acceptance criteria self-check: validates each assertion can actually fail
- Smart verification loop: silent by default, interrupts only on problems (references/verification.md)
- Precedence hierarchy: tests > LLM advisory > user override (all logged)
- Socratic rejection UX for vague founder feedback ("it feels off")
- State migration for older sessions (generates criteria from existing intent.md)
- Per-feature verification tracking in state.json
- tdd-guide test generation step in Phase 4 blueprint
- Enforcement hooks: operator-boundary, research-gate, verification-gate (PreToolUse)
- Hook test suite (18 tests)
- The Operator personality layer (references/personality.md)
- Dashboard chat poller leak fix

### Changed
- Progressive disclosure: SKILL.md refactored from 879 to ~250 lines with 7 reference files
- Verification gate now requires ALL packages/domains to be verified (not just any one)
- Research gate: pure-local entries no longer count as research for subsequent files
- Operator-boundary hook only matches assistant turns (prevents false positives from founder text)
- All hooks fail-closed without jq (printf fallback for deny responses)
- Server reads PORT/PRISM_DIR from env vars (fixes prism-service.sh wiring)
- State templates preserve sessions array across rewrites
- Session-init uses jq fallback for session_start marker

### Fixed
- Path traversal hardening in dashboard server (resolve + stricter startsWith)
- Scoped npm package support in verification gate (@scope/pkg no longer strips to empty)
- Verification flow table: 2 silent fix attempts before escalation (was incorrectly 3)
- Deleted hardcoded plist (prism-service.sh generates dynamically)

## [0.2.0] - 2026-03-21

### Added
- Progressive disclosure refactor with reference files
- BLOCK-mode enforcement hooks + test suite
- Enforcement-first prompt reinforcement

## [0.1.0] - 2026-03-20

### Added
- Initial Prism skill: creative founder's AI co-pilot
- Stage machine (VISIONING > CREATING > POLISHING > SHIPPING > DONE)
- Live dashboard with infinite pan/zoom canvas
- Automatic git safety net
- Six invisible guardrails
