# Prism: Technical Roadmap

> How Prism goes from a Claude Code skill to a paid hosted platform.

## The Architecture Problem (and Solution)

**Today:** Prism is a SKILL.md file (~1400 lines) that runs inside Claude Code. Users need a terminal, an API key, and technical knowledge. You can't charge for this.

**Target:** Prism is a web app. Users sign up, pay monthly, and interact through a clean UI. Your backend calls AI APIs (Anthropic, OpenAI) and runs code in sandboxed environments. Users never see a terminal.

**The key insight:** The SKILL.md is the "brain" — the orchestration logic, decision boundaries, and team personas. That brain migrates from "a file Claude reads" to "system prompts and routing logic on your server." The brain doesn't change. The delivery mechanism does.

---

## Phase 0: Nail the Brain (Week 1)
*The 5 SKILL.md enforcement fixes — already planned*

**Why this comes first:** The skill logic becomes your backend's orchestration layer. If the brain is broken, the platform is broken. Fix it here where iteration is fast.

**Deliverables:**
1. Rule repetition at build-time decision points (salience anchors)
2. Invert research gate default (fire always, skip only when explicitly safe)
3. Add verification step to research gate (test before presenting)
4. Operator boundary examples + hard gate
5. gstack version sync check

**Validation:** 3 dogfood sessions with zero violations. Then Patrick test.

**Cost:** $0 | **Time:** CC ~2-3 hours

---

## Phase 1: MVP Web Platform (Weeks 2-5)
*The minimum product that can charge money*

### What Users See

```
┌─────────────────────────────────────────────────┐
│  PRISM                              [Settings]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  💭 What do you want to build today?    │    │
│  │                                         │    │
│  │  "I want an app that helps dog          │    │
│  │   walkers manage their schedule"        │    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  ADVISOR                                │    │
│  │  Great start! A few questions to make   │    │
│  │  sure we build the right thing:         │    │
│  │                                         │    │
│  │  1. Who's the user — the dog walker     │    │
│  │     or the dog owner?                   │    │
│  │  2. What's the #1 pain? Scheduling,     │    │
│  │     payments, or finding clients?       │    │
│  │  3. Is this a business you're running   │    │
│  │     or an idea you're exploring?        │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌─── JUDGMENT CHECKPOINT ──────────────────┐   │
│  │  The Architect found two approaches:     │   │
│  │                                          │   │
│  │  A) Next.js web app — works everywhere   │   │
│  │     (recommended)                        │   │
│  │  B) React Native — native feel, but      │   │
│  │     slower to ship                       │   │
│  │                                          │   │
│  │  [ Go with A ]  [ Go with B ]  [ More ]  │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌─── STATUS BAR ───────────────────────────┐   │
│  │  Builder: working on signup flow...      │   │
│  │  Guardian: ✓ 14 checks passed            │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  [Type a message...]                   [Send]   │
└─────────────────────────────────────────────────┘
```

### Technical Architecture

```
┌──────────────┐     ┌──────────────────────────────┐     ┌────────────┐
│              │     │       PRISM BACKEND            │     │            │
│   Next.js    │────▶│                                │────▶│ Anthropic  │
│   Frontend   │     │  ┌──────────┐  ┌───────────┐  │     │ API        │
│              │◀────│  │ Agent    │  │ Project   │  │     │ (Claude)   │
│  - Chat UI   │     │  │ Router   │  │ Manager   │  │     └────────────┘
│  - Checkpts  │     │  └──────────┘  └───────────┘  │
│  - Status    │     │  ┌──────────┐  ┌───────────┐  │     ┌────────────┐
│  - Preview   │     │  │ Sandbox  │  │ Auth +    │  │────▶│ OpenAI API │
│              │     │  │ Manager  │  │ Billing   │  │     │ (Codex)    │
└──────────────┘     │  └──────────┘  └───────────┘  │     └────────────┘
                     └──────────────────────────────┘
                              │                              ┌────────────┐
                              └─────────────────────────────▶│ E2B        │
                                                             │ (sandbox)  │
                                                             └────────────┘
```

### Component Breakdown

#### 1. Agent Router (the migrated "brain")
The SKILL.md logic becomes TypeScript/Python on your server:

```
SKILL.md concept          →  Backend implementation
─────────────────────────────────────────────────
Advisor (discovery)       →  System prompt + conversation state machine
Architect (research)      →  Multi-step tool-calling agent
Builder (construction)    →  Code generation + sandbox execution
Guardian (quality)        →  Automated review pipeline
Translator (comms)        →  Response formatting layer
Decision boundary         →  Router: silent vs. checkpoint vs. hard rule
```

Each "team member" is a Claude API call with a specialized system prompt. The router decides which agent handles each turn, and whether to surface results to the user or handle silently.

#### 2. Sandbox Manager (where code runs)
Users' code can't run on your server. Options:

| Provider | What it does | Cost | Best for |
|----------|-------------|------|----------|
| **E2B** (recommended) | Sandboxed cloud environments, built for AI agents | ~$0.05/session | Code execution, file system, terminal |
| Modal | Serverless containers | Pay per compute | Heavy workloads |
| Fly Machines | Lightweight VMs | ~$0.01/hr | Long-running apps |

**E2B is the move** — it's purpose-built for AI code execution. Each user project gets an isolated sandbox. The Builder agent writes code, E2B runs it, results come back.

#### 3. Auth + Billing
- **Auth:** Clerk (fastest to integrate, great UX) or Supabase Auth (if you want to own the DB)
- **Billing:** Stripe — subscriptions with metered usage for overages
- **Usage tracking:** Count API calls per user, enforce tier limits

#### 4. Project Storage
- **Database:** Supabase (Postgres) — user accounts, projects, conversation history, intent memory
- **File storage:** Supabase Storage or S3 — user project files, generated code
- **Intent memory:** The `.prism/` context files become database records per project

### Tech Stack Decision

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **Next.js 16 + React 19** | Already started, SSR, API routes |
| Styling | **Tailwind CSS** | Already installed |
| State | **Zustand** | Already installed, simple |
| Backend | **Next.js API routes + server actions** | Same codebase, no separate server needed at first |
| AI | **Anthropic SDK** (already in package.json) + **OpenAI SDK** | Direct API calls, full control |
| Sandbox | **E2B** | Purpose-built for AI code execution |
| Auth | **Clerk** | Fast integration, handles OAuth/magic links |
| Billing | **Stripe** | Industry standard, subscription + metered billing |
| Database | **Supabase** | Postgres + auth + storage + realtime |
| Hosting | **Vercel** | Next.js native, edge functions, easy deploy |
| Streaming | **Server-Sent Events** | Real-time agent status updates to frontend |

### What to Build (in order)

**Week 2: Foundation**
- [ ] Auth flow (Clerk) — sign up, sign in, protected routes
- [ ] Database schema (Supabase) — users, projects, conversations, messages
- [ ] Basic chat UI — message input, message list, streaming responses
- [ ] Single agent call — chat message → Anthropic API → streamed response

**Week 3: The Dream Team**
- [ ] Agent Router — classify user intent, route to correct team member
- [ ] Advisor agent — Socratic discovery system prompt + conversation state
- [ ] Architect agent — research + planning with tool use
- [ ] Judgment checkpoints — rich UI cards for decisions (not just text)
- [ ] Team status bar — shows which agent is working

**Week 4: Building Things**
- [ ] E2B integration — sandboxed code execution
- [ ] Builder agent — code generation + execution in sandbox
- [ ] Guardian agent — automated code review after each build step
- [ ] Preview — show the user what was built (iframe to sandbox URL or screenshots)
- [ ] Project persistence — save/resume projects across sessions

**Week 5: Money**
- [ ] Stripe integration — subscription tiers
- [ ] Usage metering — track API calls, sandbox time per user
- [ ] Tier enforcement — free tier limits (3 projects, X messages/day)
- [ ] Landing page — what Prism is, pricing, sign up CTA
- [ ] Deploy to Vercel with custom domain

**Cost:** ~$0 (free tiers of everything) | **Time:** CC ~1-2 weeks

---

## Phase 2: The Full Platform (Weeks 6-10)
*From MVP to something people tell friends about*

- [ ] Intent memory — persistent context per project across sessions
- [ ] Project dashboard — see all projects, status, recent activity
- [ ] Deployment — one-click deploy from Prism to Vercel/Netlify
- [ ] Rich previews — live preview of the app being built, updating in real-time
- [ ] Onboarding flow — guided first-session experience
- [ ] Mobile responsive — works on iPad/phone for reviewing
- [ ] Conversation branching — "actually, go back to the other approach"
- [ ] Export — download the code, push to GitHub

---

## Phase 3: Studio (Months 3-6)
*Multi-project, multi-agent, the moat deepens*

- [ ] Multi-project management — dashboard of all projects
- [ ] Team collaboration — share projects, assign reviewers
- [ ] Bleeding-edge monitoring — auto-discover new tools/libraries
- [ ] Desktop app (Tauri) — native feel, local file access
- [ ] Community — shared templates, patterns, knowledge base
- [ ] API — let power users build on top of Prism

---

## Phase 4: Forge (Month 9+)
*The spatial canvas — the full vision*

- [ ] Spatial canvas interface
- [ ] Voice input
- [ ] Vessel metaphor — ideas as living objects
- [ ] Temporal navigation — rewind/replay project evolution

---

## How Money Flows

```
USER ($29-99/mo)
  │
  ▼
STRIPE ──────▶ YOUR BANK
  │
  │  Stripe fees: ~3%
  │
  ▼
YOUR COSTS:
  │
  ├── Anthropic API: ~$3-10/user/month
  │   (Claude Sonnet for most calls,
  │    Opus for complex decisions)
  │
  ├── OpenAI API: ~$1-3/user/month
  │   (Codex for second opinions)
  │
  ├── E2B: ~$1-5/user/month
  │   (sandboxed code execution)
  │
  ├── Supabase: ~$0.50/user/month
  │   (database, storage, auth)
  │
  ├── Vercel: ~$0.10/user/month
  │   (hosting, edge functions)
  │
  └── Total cost: ~$6-19/user/month

MARGIN ANALYSIS:
  Spark ($0/mo):  Loss leader, 3 projects max, rate-limited
  Founder ($29):  ~$10-23 margin (34-79%)
  Studio ($99):   ~$80-93 margin (80-94%)
```

### Cost Optimization Levers
1. **Model routing** — Use Haiku for simple responses, Sonnet for building, Opus only for architecture decisions. 3-5x cost reduction.
2. **Prompt caching** — Anthropic supports prompt caching. System prompts (the team personas) get cached. Saves 50%+ on repeated calls.
3. **Intent memory** — Accumulated context means shorter prompts over time. Less re-explaining = fewer tokens.
4. **Batch operations** — Guardian reviews can run on cheaper batch API (50% discount, 24hr turnaround).
5. **Usage tiers** — Heavy users pay more. Light users subsidize nothing.

---

## The Migration: SKILL.md → Backend

This is the critical technical step. Here's how each piece maps:

```
CURRENT (SKILL.md)                    FUTURE (Backend)
────────────────────────────────────────────────────────
Session Start detection        →  Auth + project state from DB
Socratic discovery flow        →  Advisor agent (system prompt + state machine)
Research gate                  →  Architect agent with web search tools
Decision boundary rules        →  Router logic in TypeScript
Build chunks                   →  Builder agent + E2B sandbox
Complexity tracking            →  Guardian agent + metrics DB
Intent memory (.prism/ files)  →  Supabase project context table
gstack skill invocation        →  Backend workflow modules
Judgment checkpoints (text)    →  Rich UI cards with buttons
```

The SKILL.md is ~1400 lines of orchestration instructions. That translates to roughly:
- 5 system prompts (~200 lines each) — one per team member
- 1 router module (~300 lines) — classifies and routes
- 1 state machine (~200 lines) — tracks project phase
- Database schema (~100 lines) — persists everything

---

## What You Don't Need to Build

Things that seem important but aren't (yet):

- **Your own LLM** — Use Anthropic/OpenAI APIs. Don't train anything.
- **Real-time collaboration** — Single-user first. Collaboration is Phase 3.
- **Mobile app** — Responsive web works fine. Native mobile is Phase 3+.
- **Plugin system** — You curate the capabilities. No marketplace yet.
- **Self-hosting option** — Cloud-only keeps you in control of the experience.
- **Git integration** — Export to GitHub is enough. Full git workflows are Phase 2+.

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| API costs spike | Model routing (Haiku/Sonnet/Opus), usage caps per tier, prompt caching |
| Anthropic rate limits | Queue system, retry with backoff, multi-key rotation |
| Sandbox security | E2B handles isolation. Never run user code on your server. |
| User abuse (crypto mining, etc.) | Sandbox timeouts, resource caps, usage monitoring |
| Claude doesn't follow system prompt | Same problem as SKILL.md — the enforcement fixes in Phase 0 apply to system prompts too |
| Competitor ships first | Speed. Your advantage is taste + being your own user. Ship MVP in 5 weeks. |

---

## First Dollar Timeline

| Week | Milestone |
|------|-----------|
| 1 | Phase 0: Fix SKILL.md, dogfood, Patrick test |
| 2-3 | Auth + chat + single agent working |
| 4 | E2B + building things + preview |
| 5 | Stripe + landing page + deploy |
| 6 | **First paying users** — invite-only beta |
| 7-8 | Iterate based on feedback |
| 9-10 | Open beta, start marketing |

**Target: First revenue by Week 6.**
