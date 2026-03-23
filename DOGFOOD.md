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

_Add new entries below. Format: number, date, what happened, expected, severity._
