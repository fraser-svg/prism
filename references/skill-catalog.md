# gstack Skill Catalog

Prism recommends gstack skills at specific stages. The user invokes them manually.
Prism updates the spec after the user returns.

## Plan Stage → /plan-eng-review

**Recommendation text:** "Your spec is ready. Run `/plan-eng-review` now to lock in the architecture. When it's done, come back and tell me."

**What it does:** Reviews the implementation plan for architecture, code quality, tests, and performance. Interactive — asks the user questions.

**Behavioral contract:** Accepts free-text context as its argument.

**After user returns:** Ask "How did planning go? Any decisions I should know about?"
- All good → proceed to Build
- Planning found problems → offer to revise the spec: "No worries — let's adjust the spec."

## Verify Stage → /qa

**Recommendation text:** "Build looks complete. Run `/qa` now to test everything works."

**What it does:** Systematically QA tests the application. Can fix bugs it finds.

**Behavioral contract:** Accepts a URL or description of what to test.

**After user returns:** Ask "Did QA pass? Any issues remaining?"
- All good → proceed to Ship
- QA found issues → offer to fix: "Let me fix those." Go back to Build.

## Ship Stage → /ship

**Recommendation text:** "Everything looks good. Run `/ship` now — it'll commit your code and create a pull request."

**What it does:** Commits code, pushes to remote, creates a pull request. It does NOT deploy to production — it creates a PR for review.

**Behavioral contract:** Handles commit, push, and PR creation.

**After user returns:** Ask "Did that go smoothly? Is your code committed and PR created?"
- Yes → archive the OpenSpec change, mark complete
- No → offer to troubleshoot

**IMPORTANT:** /ship creates a PR, not a deployment. Do NOT say "deploy" or ask "Did the deploy succeed?" The user would not have deployed anything — they'd have a PR.

## Error Handling

If a user reports a gstack skill failed or didn't work as expected:
- Surface the issue in plain English: "The planning step hit a problem."
- Offer options: "Want me to try a different approach, or should we skip this step and keep building?"
- Never retry silently. Never show raw errors.
