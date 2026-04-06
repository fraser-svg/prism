# Prism — YC Build Brain

## YC Deadline: May 3, 2026

Before implementing any change in this repo, run `/yc-brain` with a description of what you're about to build. Do not begin coding until the YC Brain gives a **BUILD** verdict.

The filter question for every session: **Does this help a user produce more with Prism than without it, more easily than without it? If the answer is weak, say so before building.**

## Quick Context

- **YC Deadline:** May 3, 2026
- **One-liner:** AI builds fast. Prism builds right.
- **ICP:** Agency operators delivering software outcomes for clients
- **Score:** 20/35 (see [SCORECARD](docs/yc/SCORECARD.md))
- **Filter:** Brain or hands? If hands, stop. If brain, apply the [Decision Rubric](docs/DOCTRINE.md#8-decision-rubric).

## Priority Stack (current)

1. **Web app works end-to-end** — operator goes intake → discovery → spec → build → verify → ship, entirely in the browser. No CLI fallback. This is the ONLY engineering priority.
2. **Fraser dogfoods daily** — use the web app for real client/project work. Every broken thing becomes a bug to fix, not a feature to plan.
3. **Reddit + ProductHunt launch** — with Fraser's own proof: "I built X with Prism, here's what happened"
4. **YC application** — with public traction data and the defensibility narrative
5. **Sharpen the one-liner** — "AI builds fast. Prism builds right."

## Brain-vs-Hands Filter

Before starting any work, ask: **Is this building the brain (judgment, memory, quality, product surface) or the hands (execution, generation, provider infrastructure)?**

If hands, stop. If brain, apply the full [Decision Rubric](docs/DOCTRINE.md#8-decision-rubric) before building.

## Competitive Context

The agent execution layer is commodity (Hermes: MIT/26.8k stars, Claude Code, Cursor, Codex). Prism's value is the judgment/orchestration layer above. Do not build agent infrastructure.

## Stop Building

Do not work on these until the priority stack is resolved:
- Desktop app / Electron shell (on hold indefinitely — web-only. [PLANS.md M5](PLANS.md#m5-electron-portfolio-mvp--superseded) is superseded.)
- Agent runtime / execution infrastructure
- 9-stage lifecycle migration (vision doc written, implementation deferred)
- Provider abstractions / model routing improvements
- Broad integrations
- Enterprise governance

## Strategic Authority

[`docs/DOCTRINE.md`](docs/DOCTRINE.md) is the strategic compass for all Prism work. It defines the 4 non-negotiable layers, temporal markers (`[NOW]`/`[MIGRATION]`/`[TARGET]`), the [Decision Rubric](docs/DOCTRINE.md#8-decision-rubric) (Layer Test + Wrapper Test + Survival Test), and the entity-per-horizon mapping. When in doubt about whether to build something, check the doctrine before the priority stack.

## YC Readiness Framework

See [`docs/yc/OVERSIGHT.md`](docs/yc/OVERSIGHT.md) for the full scoring framework.
See [`docs/yc/SCORECARD.md`](docs/yc/SCORECARD.md) for the current scores and trend history.

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
