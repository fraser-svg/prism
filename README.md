
    ██████╗ ██████╗ ██╗███████╗███╗   ███╗
    ██╔══██╗██╔══██╗██║██╔════╝████╗ ████║
    ██████╔╝██████╔╝██║███████╗██╔████╔██║
    ██╔═══╝ ██╔══██╗██║╚════██║██║╚██╔╝██║
    ██║     ██║  ██║██║███████║██║ ╚═╝ ██║
    ╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝

PRISMATIC v{version}
For agency operators who need to turn client briefs into shipped software without engineers.
Prismatic finds the real problem, shapes the right solution, then specs, builds, verifies, ships and deploys it.
To begin: describe your need...

---

## What Prism Is Today

Prism is an **owned core runtime and orchestration system** that currently runs as a Claude Code skill. It gives agency operators and owner-operators a structured process for turning client briefs into delivered software — with spec-driven planning, invisible quality gates, and durable memory across sessions.

This repo is **not** a finished desktop product. It is the core engine that will power one.

### Who It Is For Today

**Agency operators, freelancers, and studio owners** who use AI coding tools to deliver software for clients. People who hit the 80% wall — where AI-assisted builds start strong, then break down as complexity grows, context degrades, and nobody defined "done" before starting.

Semi-technical creators are the expansion play. Agency operators are the beachhead.

### What Exists Today

- A **Socratic discovery flow** that finds the real problem before building starts
- A **spec-driven lifecycle** (understand, identify problem, spec, plan, build, verify, ship) with artifact gating
- **Typed core packages** for domain model, memory, orchestration, guardian, execution, and workspace
- A **dual-write bridge** connecting the Claude Code skill to typed core artifacts
- **Local-first workspace** with SQLite, FTS5 search, health badges, and multi-project resume
- A **continuous intelligence layer** with skill catalogue, research, and learning
- **Deploy detection and triggering** via Vercel CLI
- A **trust-first self-healing engine** with session report cards, learning journal, advisory prescriptions, HEALTH.md dashboard, and an **autoresearch experiment system** (Level 1: prompt evolution — A/B testing of prompt variants scored across the 4 self-healing dimensions)
- A **pipeline visualizer** generating interactive HTML dashboard of the 7-stage workflow (PipelineSnapshot JSON → Electron IPC contract)
- An **Electron desktop app** (`apps/desktop/`) — Portfolio MVP with client management, project portfolio, 7-stage pipeline view, and session drawer. Currently paused; web app is the active demo surface.
- A **web app** (`apps/web/`) — Vite SPA + Express API server. The web app is now the primary execution surface — you can run the full Socratic pipeline (understand → spec → plan → execute → verify → release) directly from the browser via a built-in Anthropic conversation engine, SSE streaming, and autopilot mode.
- A **shared UI package** (`packages/ui/`) — React components, Zustand store, and transport adapters for IPC (desktop) and fetch (web)
- **Hook integrations** for Claude Code event-driven automation
- **Evaluation harnesses** for quality measurement
- A **spec compiler** pipeline

### What Is Future Direction

- **9-stage lifecycle** (intake, clarify, shape, spec, plan, build, verify, deploy, observe)
- **Agency entity expansion** (feedback records, billing, project timelines)

---

## The Problem

Every AI coding tool today gives you power without confidence. You can generate code in seconds — but who's checking it? You can build a prototype overnight — but is it the right thing? You can ship fast — but things keep breaking at 80%.

Prism fixes that by adding structure, memory, and discipline. It behaves like an unaffordable dream team:
- product thinker
- technical architect
- senior engineer
- designer
- QA lead
- engineering manager

You bring the idea. Prism does the rest.

---

## How It Works

You describe what you want in plain English.

Prism turns that into real, working software by guiding it through a structured process:

| Stage | What Happens |
|-------|-------------|
| **0. Resume** | Picks up where you left off |
| **1. Understand** | Asks a few simple questions to clarify your idea |
| **2. Plan** | Thinks through how it should be built before touching code |
| **3. Build** | Actually builds it step by step |
| **4. Verify** | Checks that everything works properly |
| **5. Ship** | Finalises everything and prepares it to go live |

If you are building something visual like a website, it also:
- Designs it first
- Reviews the design before shipping

---

## What Makes It Different

### It does not rush into coding
It slows down just enough to actually understand and plan first.

### It does not forget what you are building
It keeps a living memory of your product. What it is, what has been built, and what comes next.

### It does not fall apart halfway through
Most AI tools break at around 80%. Prism is designed specifically to get past that point.

### It fixes its own mistakes
If something fails, it:
- Figures out why
- Rewrites the task
- Tries again

Like a real team would.

---

## Install

### Prerequisites

- Node.js (v18+)
- Claude Code
- OpenSpec
- gstack

```bash
npm install -g @fission-ai/openspec@latest
````

---

### Setup

```bash
cp -r prism/ ~/.claude/skills/prism/
```

or:

```bash
git clone https://github.com/fraser-svg/prism.git ~/.claude/skills/prism/
```

---

## Usage

Start a Claude Code conversation:

```
/prism
```

Then just describe what you want.

---

### Examples

```
/prism
Build me a landing page for my SaaS with a waitlist form.
```

```
/prism
Create a tool that tracks my workouts.
```

```
/prism
Add dark mode to my app.
```

---

### You Stay in Control

You can always say:

* Let's rethink this
* Change the plan
* Fix this part

Prism will move back to the right stage and continue from there.

---

## Project Structure

```
prism/
├── SKILL.md              # The brain — LLM judgment only
├── VERSION               # 4.0.29.0
├── CHANGELOG.md
├── CLAUDE.md             # YC Build Brain gate
├── AGENTS.md             # Agent orchestration config
├── apps/                 # Runnable applications
│   ├── desktop/          # Electron desktop app (Portfolio MVP)
│   └── web/              # Vite SPA + Express API server
├── packages/             # Typed core — code-enforced lifecycle
│   ├── core/             # Domain model (branded types, lifecycle entities)
│   ├── memory/           # Artifact repositories (.prism/ storage)
│   ├── orchestrator/     # Gate evaluator, resume engine, bridge CLI, self-healing, pipeline visualizer
│   ├── guardian/         # Review matrix, release-state derivation
│   ├── execution/        # Intent policy, execution adapters
│   ├── ui/               # Shared React components (PortfolioView, ControlRoom, SessionDrawer)
│   └── workspace/        # SQLite workspace, project registry, FTS5 search
├── scripts/              # Deterministic bookkeeping (16 scripts)
│   ├── prism-registry.sh # Task registry (state, workers, events)
│   ├── prism-save.sh     # Auto-save (commit + push at milestones)
│   ├── prism-scan.sh     # Project scan (Stage 0 resume detection)
│   ├── prism-verify.sh   # Syntax/lint/compile verification
│   ├── prism-checkpoint.sh # Session context persistence
│   ├── prism-deploy.sh   # Vercel deploy detection and triggering
│   ├── prism-research.sh # Solution research before building
│   ├── prism-catalogue.sh # Skill catalogue CRUD
│   └── ...               # eval, improve, supervisor, telemetry, state, gemini-worker
├── compiler/             # Spec compilation pipeline
├── hooks/                # Claude Code hook integrations
├── evals/                # Evaluation harnesses
├── openspec/             # OpenSpec integration
├── references/           # Personality, spec format, skill catalog, product context
├── templates/            # Spec templates
├── planning/             # Planning artifacts
├── test/                 # Test infrastructure
└── docs/                 # Architecture, designs, YC readiness, specs
```

### Typed Core (packages/)

Six TypeScript packages run alongside the shell scripts via a dual-write bridge. At every stage transition, SKILL.md calls `npx tsx packages/orchestrator/src/cli.ts <command>` to write typed artifacts to `.prism/`. The bridge CLI supports 18 commands including gate checks, artifact writes, ship, deploy, and session lifecycle. The workspace package provides the SQLite substrate for multi-project state, FTS5 search, and health tracking. Gates are advisory in M3 (failures are silent). The core catches things the scripts miss: missing specs before planning, incomplete reviews before release, unverified builds before shipping.

---

## Licence

MIT
