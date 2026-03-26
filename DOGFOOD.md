# Prism Dogfood Feedback

Collected during active use. Don't fix yet — finish dogfooding first, then batch the fixes.

---

## 1. Rushes into building without design thinking (2026-03-23)

**What happened:** Prism jumped from spec straight to writing code without considering what the frontend would look like, proposing visual designs, or giving options to decide on architecture.

**Expected:** Before building anything with a UI, Prism should pause and:
- Discuss what it will look like
- Propose design approaches or layout options
- Let the user choose before writing any code

**Severity:** High — this is a core experience gap. The whole point of Prism is thoughtful building, not rushing.

**Status:** FIXED in v1.1.0.0 — UI products now get automatic /design-consultation before first build (Stage 2.5) and product-level questions include "What should it look like?"

---

## 2. Had to manually trigger reviews and shipping (2026-03-23)

**What happened:** User had to manually type `/plan-eng-review`, `/qa`, and `/ship` at each stage. Prism told them what to run but didn't run it.

**Status:** FIXED in v1.0.1.0 — Prism now auto-invokes gstack skills via Skill tool.

---

## 3. Session artifacts not persisted (2026-03-23)

**What happened:** Went through Understand stage, Prism said spec was saved, but nothing was written to disk. New session found empty openspec/changes/ directory.

**Status:** FIXED in v1.0.1.0 — Added Part B.5 artifact verification. Prism now confirms files exist before claiming they're saved.

---

## 4. No operation log for debugging (2026-03-23)

**What happened:** No way to see what Prism actually did, in what order, or what logic it followed.

**Status:** FIXED in v1.0.1.0 — Verbose operation log at openspec/changes/{name}/prism-log.md.

---

## 5. Gives up too early, then doesn't act on its own research (2026-03-23)

**What happened:** Prism said something wasn't possible and stopped. When pushed to research a solution, it found one — but then just described how it *could* be done instead of actually implementing it.

**Expected:** Two problems here:
1. **Don't give up prematurely.** Before telling the user something isn't possible, Prism should automatically research alternatives. The user shouldn't have to ask for that.
2. **Research should lead to action.** When Prism finds a viable solution, it should implement it — not present a report. "Here's how we could do it" is not building. Building is building.

**Severity:** High — this breaks the core autopilot promise. Prism should be biased toward finding a way and doing it, not explaining why it can't.

**Status:** FIXED in v1.1.0.0 — Added Resilience protocol to build-mode.md: research alternatives before saying no, implement after researching.

---

## 6. No design consultation or design review before first build (2026-03-23)

**What happened:** Prism built v1 without running /design-consultation or /design-review. The result looked bad. No design system, no visual direction, no review of the output before shipping.

**Expected:** For any build with a UI, Prism should:
- Run /design-consultation (or equivalent) before building to establish visual direction
- Run /design-review after building to catch visual issues before shipping
- These should be automatic, not something the user has to remember to ask for

**Related to:** #1 (rushes into building without design thinking). This is the same root problem — Prism skips the design stage entirely.

**Severity:** High — if the first thing you build looks bad, trust in the tool drops immediately.

**Status:** FIXED in v1.1.0.0 — UI products now auto-invoke /design-consultation before first build (Stage 2.5) and /design-review after QA (Stage 4.5).

---

## 7. Use Anthropic's skill-creator when Prism creates skills (2026-03-23)

**What happened:** Prism creates/modifies its own skill files (SKILL.md, reference files) by hand-writing markdown. There's no standardization or quality check on the skill format.

**Expected:** Any time Prism creates or modifies a skill, it should use the `/skill-creator` skill (Anthropic's official tool for creating and optimizing skills). This ensures proper format, triggering accuracy, and quality.

**Severity:** Medium — not user-facing, but affects Prism's own reliability and maintainability.

---

## 8. No product-level planning — Prism only thinks in single features (2026-03-23)

**What happened:** Prism treats every build as an independent feature change. When building a whole product (like Encounter), there's no step where it looks at the full vision, designs a foundation, and sequences the build order. Each change gets its own isolated spec/plan/build cycle with no awareness of what came before or what comes next.

**Four specific gaps:**

1. **No product decomposition.** Prism jumps from understanding to spec to build. No stage to look at a whole product, identify foundational architecture, and sequence the build order so later features don't force rewrites.

2. **No change sequencing.** When a product has 5 changes that must be built in order (foundation first, then features that depend on it), Prism treats each as independent. No dependency graph, no shared architecture doc across changes.

3. **No architectural continuity.** Each change gets its own spec, eng review, and build. Nothing carries forward architectural decisions from Change 1 into Change 2's planning. The model abstraction layer from the foundation is invisible when planning the next feature — leading to contradictory decisions or duplicated work.

4. **No parallel workstreams.** Real products have tracks that run simultaneously (e.g., content pipeline + app build). Prism is single-threaded: understand, plan, build, verify, ship, repeat.

**Expected:** A "Stage 0.5: Product Decomposition" where Prism:
- Takes a full product vision
- Designs the architecture
- Sequences changes with dependencies
- Maintains a living architecture document that informs every subsequent change

**Severity:** Critical — this is the difference between "build me a feature" and "build me a product." Without this, Prism is a feature builder, not a product builder.

**Status:** FIXED in v1.1.0.0 — Living Architecture Doc (PRODUCT.md). Prism creates and maintains a per-project PRODUCT.md with vision, architecture, build history, and phase sequencing. Read at every stage transition, updated after Build and Ship. Gaps 1-3 addressed. Gap 4 (parallel workstreams) deferred to TODOS.md.

---

## 9. v2 Validation: Two-Tier Context Split + Guardian (2026-03-23)

**What:** Prism v2 introduces a two-tier context split (Operator holds user intent, Workers get task-only prompts) and a Guardian pattern (diagnose failures, rewrite prompts, respawn). Validate this architecture on 3 real builds.

**Validation tests:**

- [ ] 9.1 **Context firewall test:** During validation build 1, after dispatching the first worker, instruct the worker to report what context it received. Verify it contains ONLY: task description, file list, constraints, shared types. Verify it does NOT contain: personality text ("The Operator"), user conversation history, vision statements, or PRODUCT.md Vision content.
- [ ] 9.2 **Validation build 1:** Build a real tool using Prism v2. Record: worker_count, guardian_retries, failure_reasons, user_interventions. Did the 80% wall appear?
- [ ] 9.3 **Validation build 2:** Build a second real tool. Compare metrics to build 1. Is recovery better than v1.1.0.0?
- [ ] 9.4 **Validation build 3:** Build a third real tool. Compare all 3 builds. Overall: fewer user interventions? Better failure recovery?
- [ ] 9.5 **Guardian recovery test:** During one of the validation builds, verify the Guardian diagnoses a worker failure, rewrites the prompt, and successfully recovers on retry.

**Success criteria:**
- At least 2 of 3 builds complete without hitting the 80% wall
- Guardian successfully recovers from at least 1 worker failure
- User intervention needed fewer times than with v1.1.0.0

**If validation fails:** Iterate the context split and Guardian inside Claude Code (cheap) before considering standalone CLI extraction (expensive).

---

## 10. No auto-push — laptop crash lost all work (2026-03-26)

**What happened:** User's laptop crashed mid-build. All work was lost because nothing had been committed or pushed to GitHub. Git operations only happen at Stage 5 (Ship), so everything before that — specs, code from workers, QA fixes — sits uncommitted on disk.

**Expected:** Prism should automatically commit and push work-in-progress to a remote branch at every milestone (spec generated, each worker completed, QA fixes, etc.). The user should never lose more than one worker's worth of work.

**Severity:** Critical — data loss is the worst possible UX failure.

**Status:** FIXED in v2.1.0.0 — Auto-save protocol added. Prism commits and pushes WIP to a feature branch after every milestone. See references/auto-save.md.

---

## 11. Context loss on re-entry — Prism forgets everything (2026-03-26)

**What happened:** Every time context is cleared or the user returns to the repo, Prism has no idea what was discussed. It doesn't remember decisions, preferences, what was tried, or what was about to happen. Stage 0 Resume only reads the last 3 log entries (which are action summaries, not conversation context).

**Expected:** Prism should capture a structured session summary (decisions made, user preferences, what was discussed, what was rejected, open questions, next steps) and read it back on resume. Returning should feel like picking up a conversation.

**Severity:** High — makes Prism feel "stupid and slow" because it re-asks questions already answered and loses the thread of discussion.

**Status:** FIXED in v2.1.0.0 — Session context protocol added. Prism writes session-context.md at key milestones and reads it during Stage 0 Resume. See references/session-context.md.

---

_Add new entries below. Format: number, date, what happened, expected, severity._
