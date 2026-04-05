
    ██████╗ ██████╗ ██╗███████╗███╗   ███╗
    ██╔══██╗██╔══██╗██║██╔════╝████╗ ████║
    ██████╔╝██████╔╝██║███████╗██╔████╔██║
    ██╔═══╝ ██╔══██╗██║╚════██║██║╚██╔╝██║
    ██║     ██║  ██║██║███████║██║ ╚═╝ ██║
    ╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝

**Prismatic** — for agency operators who need to turn client briefs into shipped software.
Live at [prismatic.build](https://prismatic.build)

---

## What Prism Is

Prism is a **web app for agency operators** that turns client briefs into shipped software. It guides you through the whole process — understanding the real problem, speccing the solution, building it, verifying it works, and shipping it — with structured memory so nothing falls apart halfway through.

### Who It Is For

**Agency operators, freelancers, and studio owners** delivering software for clients. People who hit the 80% wall — where AI-assisted builds start strong, then break down as complexity grows, context degrades, and nobody defined "done" before starting.

Semi-technical creators are the expansion play. Agency operators are the beachhead.

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

## What Exists Today

- **Web app** at [prismatic.build](https://prismatic.build) — Vite SPA + Express API + SQLite, deployed on Railway
- **Client management** — create clients, teach Prism about them via Context Dump (files, notes, extracted knowledge), and that context flows into every build
- **Project portfolio** — all your active projects in one view, grouped by client
- **Context Dump** — drop pitch decks, briefs, meeting notes. Prism extracts structured knowledge (business context, technical requirements, design direction, history) using Claude Haiku
- **Usage-gated beta** — 50 free AI actions/day, 500/day for Pro. Vault page for subscription, GitHub connection, and BYO API keys
- **Auth** — Google + GitHub OAuth via Better Auth
- **Shared UI package** (`packages/ui/`) — React components, Zustand store, transport adapters

---

## How It Works

You create a client, teach Prism about them, then create projects. Prism guides you through:

| Stage | What Happens |
|-------|-------------|
| **Context** | Drop files and notes — Prism learns your client's business, tech stack, design direction |
| **Brief** | Describe what you need to build |
| **Spec** | Prism shapes the right solution and specs it out |
| **Build** | Builds step by step with quality gates |
| **Verify** | Checks it works properly |
| **Ship** | Finalises and deploys |

---

## Dev Setup

### Prerequisites

- Node.js v18+
- npm v9+

### Install

```bash
git clone https://github.com/fraser-svg/prism.git
cd prism
npm install
```

### Environment

```bash
cp apps/web/.env.example apps/web/.env
# Fill in auth credentials (Google + GitHub OAuth apps)
# SKIP_AUTH=true works for local dev without OAuth setup
```

### Run

```bash
npm run dev:web      # Vite SPA + Express API on :3001
```

### Build

```bash
npm run build:web    # Production build (client + server)
npm run verify       # Typecheck + tests
npm run test         # Run test suite
```

---

## Project Structure

```
prism/
├── apps/
│   └── web/              # Vite SPA + Express API (the product)
│       ├── src/          # React frontend entry
│       ├── server/       # Express API routes
│       └── .env.example  # Environment variables reference
├── packages/
│   ├── ui/               # Shared React components + Zustand store
│   │   ├── src/components/  # ContextTab, ControlRoom, Portfolio, etc.
│   │   └── src/store.ts     # Global app state
│   ├── workspace/        # SQLite workspace, project registry, FTS5 search
│   ├── core/             # Domain model (branded types, lifecycle entities)
│   ├── memory/           # Artifact repositories
│   ├── orchestrator/     # Gate evaluator, pipeline, self-healing
│   ├── guardian/         # Review matrix, release-state derivation
│   └── execution/        # Intent policy, execution adapters
├── docs/                 # Architecture, designs, YC readiness, specs
├── CHANGELOG.md
├── CLAUDE.md             # YC Build Brain gate (read before coding)
└── TODOS.md
```

---

## Deploy

Deployed automatically on Railway. Every push to `main` triggers a deploy.

- Production: [https://prismatic.build](https://prismatic.build)
- Health check: `https://prismatic.build/api/providers`

---

## Licence

MIT
