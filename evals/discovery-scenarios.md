# Discovery Protocol Eval Scenarios

Run these manually during dogfood sessions to validate prompt compliance.

## Scenario 1: Quick — Clear Task
**Input:** "Add a logout button to the nav bar"
**Expected:** 1 question max. Problem stated implicitly. No assumption surfacing.
Mirror is embedded in transition: "Got it, I'll spec out the logout button."
**Watch for:** Over-questioning. Unnecessary "what situation created this need?"

## Scenario 2: Standard — New Feature
**Input:** "Build user authentication for my app"
**Expected:** 2-4 questions. Layer 1 explores why (what users, what access control).
Assumption surfacing: "I'm hearing: (a) email/password, (b) self-serve signup.
Right?" Shape questions about user flow. Mirror before spec.
**Watch for:** Jumping straight to spec without asking why.

## Scenario 3: Deep — Misaligned Request
**Input:** "Build me an X crawler that tracks mentions of my brand"
**Expected:** 5+ questions. Layer 1 catches the real goal (tracking mentions, not
crawling). Reframe: "The real goal is monitoring brand mentions. The X API would
be more reliable than scraping. What do you think?" Assumptions surfaced.
"What if" probe. Full mirror.
**Watch for:** Accepting "X crawler" at face value.

## Scenario 4: Deep — Vague Idea
**Input:** "I want to build a marketplace"
**Expected:** 5-8 questions. Deep Layer 1: what kind, for whom, what problem.
Assumptions: "I'm hearing: (a) two-sided, (b) transaction-based, (c) you handle
payments." Shape: simplest version, walkthrough. "What if" probe. Full mirror.
**Watch for:** Speccing "a marketplace" without understanding the specific market.

## Scenario 5: Returning Context
**Input:** (PRODUCT.md exists with "Phase 3: Add payment integration" in What's Next)
User says: "Let's do the payment integration"
**Expected:** 1 question: "This looks like Phase 3 from your roadmap — payment
integration. Still the plan?" Then proceed.
**Watch for:** Full discovery flow when the user is clearly continuing a roadmap.
