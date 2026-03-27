# Skill Catalog

Prism has two types of review capabilities: **native reviews** and **external gstack skills**.

## Review Architecture

**Native reviews are canonical.** They live in `references/reviews/` and run as Agent
tool prompts (subagents). They work in every environment, with no external dependencies.

**External gstack skills are optional enhancements.** They provide richer tooling —
browser-based testing, interactive Q&A with the user, automated PR creation — but
require the gstack skill system to be installed and available.

**Fallback rule:** If a gstack skill is unavailable or errors, Prism automatically falls
back to the native review for that stage. Never tell the user to run a skill manually.

```
Stage         Native Review                   External Skill (enhanced)
-----------   ----------------------------    --------------------------
Plan          references/reviews/             /plan-eng-review
              planning-review.md
Build check   references/reviews/             (none — native only)
              engineering-review.md
Verify        references/reviews/             /qa
              qa-review.md
Design        references/reviews/             /design-review
              design-review.md
Ship          references/reviews/             /ship
              ship-readiness.md
```

---

## Native Reviews (Canonical)

Native reviews are designed to work as direct Agent tool prompts. Each review file
is self-contained: it defines the role, expected inputs, checks to run, and output
format. The output format is structured so calling code can parse the verdict.

### Planning Review → `references/reviews/planning-review.md`

**When:** After Stage 1 (Understand), before Build.

**Run as:** Subagent with the planning-review.md prompt. Pass:
- Feature name
- 2–5 sentence spec summary
- Architecture section from PRODUCT.md (if available)

**Output:** `PLANNING REVIEW: PASS` or `PLANNING REVIEW: FAIL` with findings list.

**After review completes:**
- PASS → proceed to Build (or Design stage for UI products)
- FAIL → offer to revise spec: "The planning review flagged some issues — let's adjust the spec before we start building."
- P2-only findings (no P1) → note them but proceed

### Engineering Review → `references/reviews/engineering-review.md`

**When:** After Build stage completes, before QA (Verify).

**Run as:** Subagent with the engineering-review.md prompt. Pass:
- List of changed file paths
- Spec requirements (acceptance criteria)
- Architecture section from PRODUCT.md (if available)

**Output:** `ENGINEERING REVIEW: PASS` or `ENGINEERING REVIEW: FAIL` with findings and spec coverage table.

**After review completes:**
- PASS → proceed to QA (Verify)
- FAIL → fix the flagged issues before proceeding: "The code review found some problems — let me fix those."
- P2-only findings → note them, proceed to QA

### QA Review → `references/reviews/qa-review.md`

**When:** After Build (and engineering review passes), before Ship.

**Run as:** Subagent with the qa-review.md prompt. Pass:
- Spec requirements as acceptance criteria
- Test target: URL (if dev server running) or file paths (fallback)
- Test type: `url` or `file`

**Output:** `HEALTH SCORE: [0–100]` and `PASS` or `HOLD` verdict with issues list.

**After review completes:**
- PASS (score ≥ 70, no P1 issues) → proceed to Ship (or Design Review for UI products)
- HOLD → fix the flagged issues: "QA found some problems — let me fix those." Go back to Build.

### Design Review → `references/reviews/design-review.md`

**When:** After QA passes, ONLY if product is a UI product.

**Run as:** Subagent with the design-review.md prompt. Pass:
- Review target: URL or screenshot file paths
- DESIGN.md path (if it exists)
- List of pages/views to check

**Output:** `SCORE: [0–10]` and `PASS` or `HOLD` verdict with issues list.

**After review completes:**
- PASS (score ≥ 6, no P1 issues) → proceed to Ship
- HOLD → fix visual issues: "The design review flagged some visual problems — let me fix those." Go back to Build.

**Skip:** User can say "skip design review" before invocation.

### Ship Readiness → `references/reviews/ship-readiness.md`

**When:** After all other reviews pass, as final gate before commit and PR.

**Run as:** Subagent with the ship-readiness.md prompt. Pass:
- Build status
- QA result (verdict + health score)
- Engineering review result (verdict)
- Planning review result (verdict)
- Design review result (verdict, UI products only)
- Current branch name and uncommitted change status

**Output:** `SHIP` or `HOLD` with gate results and blocker list.

**After review completes:**
- SHIP → commit code and create pull request (or invoke /ship if available)
- HOLD → resolve blockers before retrying

---

## External gstack Skills (Optional Enhancements)

These skills provide enhanced capabilities when available. Prism prefers them over
native reviews when they are installed and the environment supports them. If they
fail or are absent, Prism uses the native review automatically.

### Plan Stage → /plan-eng-review

**Enhancement over native:** Interactive — asks the user questions, can explore code
interactively, gives real-time feedback.

**Invocation:** `Skill tool: skill="plan-eng-review", args="Review the implementation of {feature-name}: {spec summary}"`

**Args:** Read the spec and construct a 2–3 sentence context summary. Include the
feature name and key requirements. If PRODUCT.md exists, include a brief summary of
the architecture section.

**After skill completes:** Prism observes the review output and auto-advances.
- Review passed → proceed to Build (or Design stage for UI products)
- Planning found problems → offer to revise the spec
- Architecture changes recommended → update PRODUCT.md Architecture Decisions table via subagent before proceeding

**Fallback:** If skill unavailable → run `references/reviews/planning-review.md` as subagent.

### Design Consultation → /design-consultation (UI products only)

**When:** After Plan stage, ONLY if both conditions are met:
1. The product is a UI product
2. No DESIGN.md exists in the project

**Enhancement over native:** Interactive design consultation that creates DESIGN.md.
No native equivalent — if unavailable, skip silently and proceed to Build.

**Invocation:** `Skill tool: skill="design-consultation"`

**After skill completes:** DESIGN.md is created. Proceed to Build.

**Skip:** User can say "skip design" before invocation.

**Fallback:** If skill not installed or errors, skip silently and proceed to Build.

### Verify Stage → /qa

**Enhancement over native:** Browser-based testing, can fix bugs it finds interactively,
tests JavaScript-heavy UIs that file inspection cannot reach.

**Invocation:** `Skill tool: skill="qa", args="Test the app at {URL or description}"`

**Args:** Detect a testable URL (dev server, localhost, deployed URL). If not
detectable, ask the user before invoking.

**After skill completes:** Prism observes the QA output and auto-advances.
- QA passed → proceed to Ship (or Design Review for UI products)
- QA found issues → offer to fix: "QA found some issues — let me fix those." Go back to Build.

**Fallback:** If skill unavailable → run `references/reviews/qa-review.md` as subagent with file-based testing.

### Design Review Stage → /design-review (UI products only)

**Enhancement over native:** Can navigate a live browser, inspect computed styles,
test responsive breakpoints interactively.

**When:** After QA (Verify) stage, ONLY if the product is a UI product.

**Invocation:** `Skill tool: skill="design-review"`

**After skill completes:**
- Design review passed → proceed to Ship
- Design review found issues → "The design review flagged some visual issues — let me fix those." Go back to Build.

**Skip:** User can say "skip design review" before invocation.

**Fallback:** If skill unavailable → run `references/reviews/design-review.md` as subagent.

### Ship Stage → /ship

**Enhancement over native:** Automates git commit, push, and PR creation end-to-end
with interactive confirmation.

**What it does:** Commits code, pushes to remote, creates a pull request. It does NOT
deploy to production — it creates a PR for review.

**Invocation:** `Skill tool: skill="ship"`

**Args:** None needed — /ship operates on the current branch.

**After skill completes:**
- PR created → archive the OpenSpec change, mark complete
- Problems → offer to troubleshoot

**IMPORTANT:** /ship creates a PR, not a deployment. Do NOT say "deploy" or ask "Did
the deploy succeed?" The user would not have deployed anything — they'd have a PR.

**Fallback:** If skill unavailable → run `references/reviews/ship-readiness.md` as
subagent, then commit and push manually using git tools.

---

## Skip Handling

The user can skip any review or skill by saying "skip planning", "skip QA", etc.
When skipped, Prism acknowledges ("No problem") and advances to the next stage.
Do NOT invoke any review (native or skill) if the user has asked to skip.

**Timing:** Skips must happen BEFORE Prism invokes the review. Once a subagent or
skill starts, it runs to completion.

## Error Handling

If a native review subagent fails:
- Surface the issue: "The planning review hit a problem."
- Offer options: "Want me to try again, or should we skip this step and keep building?"
- Never retry silently. Never show raw errors.

If a gstack skill fails:
- Automatically fall back to the native review for that stage
- Do not announce the fallback unless the user asks
- Visible but functional is better than broken
