## 1. Setup & Migration Prep

- [x] 1.1 Create directory structure: `~/.claude/skills/prism/references/` and `~/.claude/skills/prism/templates/`
- [x] 1.2 Copy `references/personality.md` from `/Users/foxy/prism/` to `~/.claude/skills/prism/references/`
- [x] 1.3 Verify the old Prism skill at `/Users/foxy/prism/SKILL.md` still works (baseline before replacement)

## 2. Spec Engine (spec-generation, spec-lifecycle)

- [x] 2.1 Create `templates/spec.md` — blank spec template with all 6 required sections and 5-state status model
- [x] 2.2 Create `references/spec-format.md` — spec generation rules: always require Requirements + Scenarios, use user's own words, plain English only
- [x] 2.3 Write spec generation logic in SKILL.md: 2-4 sharpening questions → spec file creation at `openspec/specs/{feature}/spec.md`
- [x] 2.4 Add spec approval flow: show plain-English summary, allow revisions before proceeding
- [x] 2.5 Add spec status transitions: draft → planned → building → verified → shipped
- [x] 2.6 Add spec change flow: user describes change → update spec → re-enter build cycle

## 3. Session Resume (session-resume)

- [x] 3.1 Add Stage 0 resume logic: scan `openspec/specs/` for specs with status != `shipped`
- [x] 3.2 Add spec validation: check required sections exist before offering resume
- [x] 3.3 Handle edge cases: no `openspec/` directory (create it), malformed specs (skip with warning), corrupted files (graceful skip)
- [x] 3.4 Add resume prompt: "You have an in-progress build: {name}. Pick up where you left off, or start something new?"

## 4. Guided Orchestration (guided-orchestration)

- [x] 4.1 Create `references/skill-catalog.md` — gstack skill recommendations with plain-English recommendation text for Plan, Verify, Ship stages
- [x] 4.2 Create `references/stage-routing.md` — decision tree: user intent → guided skill sequence
- [x] 4.3 Wire up guided recommendations at Plan stage: "Run /plan-eng-review now"
- [x] 4.4 Wire up guided recommendations at Verify stage: "Run /qa now"
- [x] 4.5 Wire up guided recommendations at Ship stage: "Run /ship now"
- [x] 4.6 Add post-ship confirmation: "Did the deploy succeed?" — only mark shipped after confirmation
- [x] 4.7 Add stage skip support: user can skip Plan, Verify, or Ship stages

## 5. Build Mode (build-mode)

- [x] 5.1 Create `references/build-mode.md` — Build stage instructions: read spec, write code, check requirements
- [x] 5.2 Add drift detection: compare build state against spec requirements, surface divergence as question
- [x] 5.3 Add requirement tracking: note which requirements are done vs remaining during build
- [x] 5.4 Add plain-English error surfacing: build failures described without jargon
- [x] 5.5 Add drift response handling: user confirms (update spec) or rejects (revert)

## 6. Orchestrator Shell (SKILL.md)

- [x] 6.1 Write SKILL.md as thin routing dispatcher: stage definitions, transitions, reference file loading (< 500 lines)
- [x] 6.2 Add frontmatter: name, description, allowed-tools
- [x] 6.3 Add Operator personality integration: reference `references/personality.md`
- [x] 6.4 Verify SKILL.md is under 500 lines

## 7. Dogfood & Verify

- [ ] 7.1 Test full lifecycle: invoke `/prism build me a countdown timer` → sharpening → spec → plan → build → verify → ship
- [ ] 7.2 Test cross-session resume: close Claude Code, reopen, invoke /prism, verify spec discovery
- [ ] 7.3 Test spec change flow: request change to shipped spec, verify update + rebuild cycle
- [ ] 7.4 Test edge cases: no openspec dir, malformed spec, stage skips, drift detection
- [ ] 7.5 Archive old Prism: `git tag archive/v0.3-pre-autopilot` in `/Users/foxy/prism/` (only after dogfood succeeds)
