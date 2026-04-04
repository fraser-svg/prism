# Prism — YC Build Brain

## YC Deadline: May 3, 2026

Before implementing any change in this repo, run `/yc-brain` with a description of what you're about to build. Do not begin coding until the YC Brain gives a **BUILD** verdict.

The filter question for every session: **Does this help a user produce more with Prism than without it, more easily than without it? If the answer is weak, say so before building.**

## ICP

Primary: **Agency operators** delivering software outcomes for clients. Semi-technical creators are the expansion play.

## Priority Stack (current)

1. **Web app is the product** — all product work happens in the web app. No desktop/Electron work.
2. **Patrick session** — first real user proof with structured evidence capture
3. **Record a demo-ready walkthrough** of the agency workflow (Socratic discovery → spec → build → verification → deploy)
4. **Sharpen the one-liner and YC application narrative** around agency operators

## Stop Building

Do not work on these until the priority stack is resolved:
- Desktop app / Electron shell (on hold indefinitely — web-only for now)
- 9-stage lifecycle migration (vision doc written, implementation deferred)
- Provider abstractions
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

## Deploy Configuration (configured by /setup-deploy)
- Platform: Railway
- Production URL: https://prismatic.build
- Deploy workflow: auto-deploy on push to main
- Deploy status command: HTTP health check
- Merge method: squash
- Project type: web app (React SPA + Express API + SQLite)
- Post-deploy health check: https://prismatic.build/api/providers

### Custom deploy hooks
- Pre-merge: npm run build:web
- Deploy trigger: automatic on push to main
- Deploy status: poll production URL
- Health check: https://prismatic.build/api/providers

### Environment Variables (Railway dashboard)
- NODE_ENV=production
- PORT=3001
- BETTER_AUTH_SECRET=(set in Railway, generated)
- GOOGLE_CLIENT_ID=(set in Railway)
- GOOGLE_CLIENT_SECRET=(set in Railway)
- GITHUB_CLIENT_ID=(set in Railway)
- GITHUB_CLIENT_SECRET=(set in Railway)
- BETTER_AUTH_URL=https://prismatic.build

## Frontend Stack

HeroUI v3 is the default UI library for all Prism frontend work.

- Import components from `@heroui/react` (barrel export)
- Use compound component API (e.g., `<Table><TableHeader>...`)
- No `HeroUIProvider` wrapper unless using theme switching or locale features
- For component docs, invoke the `heroui-react` skill
- Prefer HeroUI components over raw HTML/Tailwind. Only drop to raw markup when HeroUI has no suitable component.
