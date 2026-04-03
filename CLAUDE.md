# Prism — YC Build Brain

## YC Deadline: May 3, 2026

Before implementing any change in this repo, run `/yc-brain` with a description of what you're about to build. Do not begin coding until the YC Brain gives a **BUILD** verdict.

The filter question for every session: **Does this help a user produce more with Prism than without it, more easily than without it? If the answer is weak, say so before building.**

## ICP

Primary: **Agency operators** delivering software outcomes for clients. Semi-technical creators are the expansion play.

## Priority Stack (current)

1. **Electron Portfolio MVP** — the desktop app IS the YC demo. Build at `apps/desktop/`. See `.context/attachments/plan.md` for full spec.
2. **Patrick session** — first real user proof with structured evidence capture
3. **Record a demo-ready walkthrough** of the agency workflow (Socratic discovery → spec → build → verification → deploy)
4. **Sharpen the one-liner and YC application narrative** around agency operators

## Stop Building

Do not work on these until the priority stack is resolved:
- 9-stage lifecycle migration (vision doc written, implementation deferred — show 7 stages honestly in desktop app)
- ~~Provider abstractions~~ — shipped in v4.0.22.0 (adapters, router, dashboard)
- Broad integrations
- Enterprise governance

## Strategic Authority

`docs/DOCTRINE.md` is the strategic compass for all Prism work. It defines the 4 non-negotiable layers, temporal markers (`[NOW]`/`[MIGRATION]`/`[TARGET]`), the Decision Rubric (Layer Test + Wrapper Test + Survival Test), and the entity-per-horizon mapping. When in doubt about whether to build something, check the doctrine before the priority stack.

## YC Readiness Framework

See `docs/yc/OVERSIGHT.md` for the full scoring framework.
See `docs/yc/SCORECARD.md` for the current scores and trend history.

Run `/yc-brain review` for a full YC readiness audit (replaces the ChatGPT oversight workflow).
Run `/yc-brain retro` after completing work to update the scorecard.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
