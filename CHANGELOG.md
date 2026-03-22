# Changelog

All notable changes to Prism are documented here.

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
