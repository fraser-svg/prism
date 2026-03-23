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

---

## 6. No design consultation or design review before first build (2026-03-23)

**What happened:** Prism built v1 without running /design-consultation or /design-review. The result looked bad. No design system, no visual direction, no review of the output before shipping.

**Expected:** For any build with a UI, Prism should:
- Run /design-consultation (or equivalent) before building to establish visual direction
- Run /design-review after building to catch visual issues before shipping
- These should be automatic, not something the user has to remember to ask for

**Related to:** #1 (rushes into building without design thinking). This is the same root problem — Prism skips the design stage entirely.

**Severity:** High — if the first thing you build looks bad, trust in the tool drops immediately.

---

_Add new entries below. Format: number, date, what happened, expected, severity._
