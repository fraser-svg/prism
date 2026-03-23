# Changelog

All notable changes to Prism are documented here.

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
