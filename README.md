# Prism

AI concierge for building software. Say what you want built. Prism writes the spec, builds it, tests it, and ships it.

No engineering knowledge required.

## What It Does

Prism turns a conversation into working software through a 6-stage pipeline:

| Stage | What Happens |
|-------|-------------|
| **0. Resume** | Picks up where you left off if there's work in progress |
| **1. Understand** | Asks 2-4 plain-English questions to nail down scope |
| **2. Plan** | Runs an architecture review to catch problems early |
| **3. Build** | Decomposes the spec into tasks, dispatches workers, relays progress |
| **4. Verify** | Runs QA to make sure everything works |
| **5. Ship** | Commits, creates a PR, archives the spec |

UI products get two bonus stages: **Design** (2.5) sets up a visual direction before building, and **Design Review** (4.5) catches visual issues before shipping.

## How It Works

Prism is a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code) that orchestrates two tools under the hood:

- **[OpenSpec](https://github.com/fission-ai/openspec)** - Structured spec generation, validation, and change tracking. Every requirement uses SHALL/SHALL NOT with WHEN/THEN scenarios so there's no ambiguity about what "done" looks like.
- **[gstack](https://github.com/fraser-svg/gstack)** - Planning (`/plan-eng-review`), QA (`/qa`), design (`/design-consultation`, `/design-review`), and shipping (`/ship`).

The user never sees either tool. All technical operations run inside subagents. The main conversation is plain English only.

### The Operator

Prism speaks with The Operator personality: warm, precise, action-oriented. Pattern recognition from thousands of product conversations compressed into a single voice that gives a damn whether you succeed. British English, no corporate jargon, no filler.

### Two-Tier Build Architecture (v2)

Stage 3 uses a two-tier context split inspired by [Zoe Agent Swarm Architecture](https://x.com/AISunElvis):

- **Operator** holds the full picture: user intent, spec, product context, build progress
- **Workers** get only their task: description, relevant files, constraints, shared types

Workers never see the user conversation, personality layer, or other workers' context. This firewall prevents context pollution that causes builds to stall at ~80% completion.

When a worker fails, the **Guardian pattern** activates: the Operator diagnoses the failure, rewrites the task prompt with failure context, and dispatches a new worker. Up to 3 attempts before escalating to the user in plain English.

### Living Product Context

Prism creates and maintains a `PRODUCT.md` file that tracks your product's vision, architecture decisions, what's been built, and what's next. Each build reads it for context and updates it on completion.

## Install

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (CLI)
- [OpenSpec](https://github.com/fission-ai/openspec): `npm install -g @fission-ai/openspec@latest`
- [gstack](https://github.com/fraser-svg/gstack) (for planning, QA, and shipping stages)

### Setup

Copy the `prism/` directory to your Claude Code skills folder:

```bash
cp -r prism/ ~/.claude/skills/prism/
```

Or clone directly:

```bash
git clone https://github.com/fraser-svg/prism.git ~/.claude/skills/prism/
```

## Usage

Start any Claude Code conversation and type:

```
/prism
```

Then describe what you want to build. Prism handles the rest.

### Examples

```
/prism
Build me a landing page for my SaaS product with a waitlist signup form.
```

```
/prism
I need a CLI tool that scrapes job postings from LinkedIn and saves them to a spreadsheet.
```

```
/prism
Add dark mode to my app.
```

### Going Back

You can always go back to a previous stage:
- "Let's change the spec" - back to Stage 1
- "Let me re-plan this" - back to Stage 2
- "I need to fix something" - back to Stage 3
- "Let me re-test" - back to Stage 4

### Skipping Stages

Say "skip planning", "skip QA", "skip design", or "skip shipping" before any stage runs.

## Project Structure

```
prism/
├── SKILL.md              # Main skill definition (thin dispatcher)
├── VERSION               # Current version
├── CHANGELOG.md          # Full version history
├── references/
│   ├── build-mode.md     # Two-tier build architecture + Guardian pattern
│   ├── stage-routing.md  # Stage detection decision tree
│   ├── spec-format.md    # OpenSpec format rules
│   ├── skill-catalog.md  # gstack skill invocation patterns
│   ├── product-context.md # PRODUCT.md protocol
│   ├── operation-log.md  # Diagnostic logging protocol
│   └── personality.md    # The Operator voice
├── hooks/                # Enforcement hooks
├── openspec/             # OpenSpec workspace
├── templates/            # Spec and config templates
└── app/                  # Prism application code
```

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
| **2.0.0.0** | 2026-03-23 | Two-tier build with Operator/Worker split, Guardian pattern, context firewall |
| **1.1.0.0** | 2026-03-23 | Living product context (PRODUCT.md), auto-design stages, resilience protocol |
| **1.0.1.0** | 2026-03-23 | Auto-advance through gstack skills, operation logging, artifact verification |
| **1.0.0.0** | 2026-03-22 | Prism Autopilot: 6-stage pipeline with OpenSpec + gstack orchestration |
| **0.3.0** | 2026-03-22 | Adaptive Socratic depth, acceptance criteria, The Operator personality |
| **0.2.0** | 2026-03-21 | Enforcement hooks, progressive disclosure |
| **0.1.0** | 2026-03-20 | Initial release |

See [CHANGELOG.md](CHANGELOG.md) for full details.

## Licence

MIT
