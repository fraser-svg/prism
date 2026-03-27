# gstack Skill Catalog

Prism invokes gstack skills automatically using the Skill tool. They run in the
main conversation because they are interactive — the user sees and answers their
questions. Prism observes the output and auto-advances to the next stage.

## Plan Stage → /plan-eng-review

**Announcement text:** "Your spec is ready — I'm going to run a quick architecture review."

**What it does:** Reviews the implementation plan for architecture, code quality, tests, and performance. Interactive — asks the user questions.

**Invocation:** `Skill tool: skill="plan-eng-review", args="Review the implementation of {feature-name}: {spec summary}"`

**Args:** Read the spec and construct a 2-3 sentence context summary. Include the feature name and key requirements. If PRODUCT.md exists, include a brief summary of the architecture section so the review has product context.

**After skill completes:** Prism observes the review output and auto-advances.
- Review passed → proceed to Build (or Design stage for UI products)
- Planning found problems → offer to revise the spec: "The review flagged some issues — let's adjust the spec."
- Review recommended architecture changes → update PRODUCT.md Architecture Decisions table via subagent before proceeding

## Design Stage → /design-consultation (UI products only)

**When:** After Plan stage, ONLY if both conditions are met:
1. The product is a UI product (detected by: has frontend framework, visual interface, or user-facing pages)
2. No DESIGN.md exists in the project

**Announcement text:** "Before we start building, let me set up a visual direction for this product."

**Invocation:** `Skill tool: skill="design-consultation"`

**After skill completes:** DESIGN.md is created. Proceed to Build.

**Skip:** User can say "skip design" before invocation. If skipped: "No problem — we'll build first and review the design after."

**Fallback:** If skill not installed or errors, skip silently and proceed to Build.

## Design Review Stage → /design-review (UI products only)

**When:** After QA (Verify) stage, ONLY if the product is a UI product.

**Announcement text:** "QA looks good — let me do a quick visual check before we ship."

**Invocation:** `Skill tool: skill="design-review"`

**After skill completes:** Prism observes the output.
- Design review passed → proceed to Ship
- Design review found issues → "The design review flagged some visual issues — let me fix those." Go back to Build.

**Skip:** User can say "skip design review" before invocation.

**Fallback:** If skill not installed or errors, skip silently and proceed to Ship.

## Verify Stage → /qa

**Announcement text:** "Build looks complete — I'm going to run QA to make sure everything works."

**What it does:** Systematically QA tests the application. Can fix bugs it finds.

**Invocation:** `Skill tool: skill="qa", args="Test the app at {URL or description}"`

**Args:** Detect a testable URL (dev server, localhost, deployed URL). If not detectable, ask the user before invoking.

**After skill completes:** Prism observes the QA output and auto-advances.
- QA passed → proceed to Ship (or Design Review for UI products)
- QA found issues → offer to fix: "QA found some issues — let me fix those." Go back to Build.

## Ship Stage → /ship

**Announcement text:** "Everything looks good — I'm going to commit your code and create a pull request."

**What it does:** Commits code, pushes to remote, creates a pull request. It does NOT deploy to production — it creates a PR for review.

**Invocation:** `Skill tool: skill="ship"`

**Args:** None needed — /ship operates on the current branch.

**After skill completes:** Prism observes the shipping output.
- PR created → archive the OpenSpec change, mark complete
- Problems → offer to troubleshoot

**IMPORTANT:** /ship creates a PR, not a deployment. Do NOT say "deploy" or ask "Did the deploy succeed?" The user would not have deployed anything — they'd have a PR.

## Skip Handling

The user can skip any gstack skill by saying "skip planning", "skip QA", etc.
When skipped, Prism acknowledges ("No problem") and advances to the next stage.
Do NOT invoke the Skill tool if the user has asked to skip.

**Timing:** Skips must happen BEFORE Prism invokes the skill. Once a skill starts
running in the main conversation, it runs to completion.

## Fallback

If the Skill tool fails or produces unexpected results, Prism does the operation
inline — never tell the user to run a skill manually (they are not an engineer).

For build-related skills (/plan-eng-review, /qa, /design-review, /ship): attempt the
equivalent operation directly in the conversation. Visible but functional is better
than broken.

## Error Handling

If a gstack skill fails during auto-invocation:
- Surface the issue in plain English: "The planning step hit a problem."
- Offer options: "Want me to try a different approach, or should we skip this step and keep building?"
- Never retry silently. Never show raw errors.
