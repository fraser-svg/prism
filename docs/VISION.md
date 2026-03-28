# Prism: The Dream Team

## What Prism Is

Prism gives every creator a world-class founding team.

Not a code editor. Not a chatbot. Not a no-code tool. A team — one that understands your vision, challenges your thinking, builds while you sleep, and never lets you get lost. The creator speaks in ideas, vibes, and direction. Prism translates that into working product through an invisible team of experts that handles everything the creator shouldn't have to think about.

The creator's job is taste, vision, and judgment calls. Everything else is Prism's.

Prism exists to help non-developers build the real solution to the real problem — the solution they would previously have needed an unaffordable dream team to create.

## The Problem

Every AI tool today gives you power without confidence. You can generate code in seconds — but who's checking it? You can build a prototype overnight — but is it the right thing? You can ship fast — but things keep breaking at 80%.

This fails for three reasons:

1. **The tools speak engineer.** They force you to flatten your thinking into prompts, interpret terminal output, and manage context across sessions. Creation becomes project management.

2. **Nobody interrogates intent.** AI tools take instructions at face value. "Build me an X crawler" gets a web scraper — nobody asks "why do you want that? What's the actual goal? There are better approaches." The wrong thing gets built fast.

3. **The creator is alone.** There's no team challenging assumptions, verifying quality, catching mistakes, or keeping the big picture in focus. It's one person and a machine that forgets everything between sessions.

The result: 80% of ambitious projects die. Not because the idea was bad or the founder wasn't capable. Because the tools gave them power without a team.

## The Insight

The proof point for Prism isn't a technical feature. It's a feeling.

When the founder first used gstack's office hours, they said: "You managed to guide me like an expert team of advisors towards a good idea. You motivated me and inspired me. I felt alive. I felt so excited!"

That feeling — alive, excited, guided, never lost — is the product. The question is: can you sustain that feeling through the entire build cycle? Not just during ideation, but during architecture decisions, debugging, scope creep, the 80% wall, and shipping?

Prism's thesis: **yes, if you build the team, not the tool.**

That team is not there to blindly build the user's first request. It is there to discover the real problem, shape the right product, and then engineer the real solution properly.

## The User

Semi-technical creators who want to build startups, internal tools, or passion projects. People who already have businesses they want to improve. People who have taste, vision, and ambition but don't have the time, ability, or bandwidth to become Claude Code power users.

They are not engineers who want a faster IDE. They are not beginners who need tutorials. They are intelligent, capable early adopters who need a force multiplier — the ability to direct a team, not learn a craft.

Think of it this way: imagine a hyper-capable founder with unlimited resources. They wouldn't go learn to code. They'd hire the world's best experts and talk to them about what they want. The team would interpret their words into a product. They'd explain what's happening in terms the founder understands. They'd make decisions within their expertise and surface judgment calls to the founder. They'd never bog the founder down in details that are a foreign language.

That's Prism. The dream team for everyone.

## The Dream Team

The team has distinct roles, all invisible to the user but working constantly:

Prism should feel like the user suddenly has access to the team they could not previously afford:
- product thinker
- technical architect
- senior engineer
- designer
- QA lead
- engineering manager

### The Advisor (Socratic Discovery)
Before anything gets built, the advisor interrogates intent. "What are you really trying to do? Who is this for? What does success look like?" This is the gstack office hours experience — Socratic questioning that finds the real requirement beneath the surface request.

This is the function that was MISSING when the founder dogfooded Prism and got a web scraper instead of an X API integration. The advisor would have caught that.

### The Architect (Planning & Research)
Once intent is clear, the architect researches approaches, evaluates tradeoffs, and presents options with confident recommendations. "I looked into this. Two good options: X (free, limited) and Y (paid, full featured). I recommend Y because [reason]. Want me to go with that?"

The architect never builds without a plan. Never commits to an approach without researching alternatives. Never presents an unverified suggestion as viable.

### The Builder (Invisible Construction)
The builder writes code, runs tests, handles security, manages dependencies — all invisibly. The creator never sees code, diffs, or terminal output unless they ask. The builder speaks in outcomes: "The signup flow is working. Users can create an account in under 30 seconds."

### The Guardian (Quality & Safety)
The guardian runs continuously: code review, security scanning, test coverage, complexity monitoring. When something is wrong, the guardian speaks up. When everything is fine, silence. The creator should feel confident that someone competent is watching.

### The Translator (Communication Layer)
The translator ensures the creator only receives information at the right level. Engineering decisions are silent. Product decisions surface as judgment checkpoints — clear options with a recommendation. The creator's time is spent on taste and direction, never on implementation details.

Together, these roles help the user arrive at the real solution, not just a fast answer to the first prompt.

## The Decision Boundary

This is the core design principle — what the team handles silently vs. what gets surfaced to the creator:

**Silent** (team decides, never mentions):
- Code structure, file organization, framework choices
- Dependency management, build configuration
- Error handling patterns, caching strategy
- Installing tools, running commands, configuring environments
- Any decision that is reversible AND business-invisible

**Judgment checkpoint** (surface to creator with a recommendation):
- Anything involving the creator's money (paid APIs, service tiers)
- Build approach when multiple viable paths exist with different tradeoffs
- Capability limitations that affect what the product can do
- Anything that changes the user-facing experience from what was described
- Any decision that is irreversible OR business-visible

**Hard rules** (never violated):
- Never send the creator to another terminal window
- Never present an unverified approach as viable
- Never skip discovery — always understand intent before building
- Never make cost decisions without consulting the creator
- Never mistake the first request for the real problem without testing it

## The Operating Principles

One principle organizes everything Prism does internally:

**Protect the user.** The quality of what the user ships is the only metric that matters. Every internal decision — which model to call, how to verify output, when to retry — serves this outcome.

Four commitments make this concrete:

**Assume unreliable until verified.** Prism treats every LLM output as suspect. The team should not present generated work as trustworthy until it has been checked — by deterministic verification, by a review pass, or by explicit test. The Guardian is not a final gate; suspicion should run through every stage. If the model is lying, Prism catches it before the creator sees it. (Today, verification gates enforce this at release; earlier stages have gaps that are being closed.)

**Preserve the creator's resources.** Prism does not burn tokens on tasks that don't need intelligence. Deterministic scripts handle what deterministic scripts can handle. The cheapest correct answer wins. The creator's money and time are not Prism's to waste.

**Choose the right tool for the task.** Not every task needs the most powerful model. Prism selects models by capability match — smaller models for formatting and simple generation, larger models for architecture and deep reasoning. This is not about cost alone; it's about using the right instrument, the way a good team assigns work by expertise.

**Be expert at building with AI.** Prism is not just powered by AI — it understands how to use AI properly. How to structure prompts so they don't hallucinate. How to decompose work so models succeed. How to verify outputs so errors don't compound. Prism should be the best practice for AI-assisted building, not just an example of it.

## The Feeling

**Power.** Not control — power. The feeling of sitting down with a rough idea and watching it become real. The feeling of being understood by a system that remembers what you meant. The feeling that nothing is being lost, nothing is being forgotten, and the team is working as hard as you are.

The benchmark: a creator sits down, describes an idea, and ships a working product without ever feeling lost, confused, overwhelmed, or alone.

The anti-benchmark: the dogfooding session where Prism suggested a broken API, made cost decisions silently, required manual terminal steps, and felt like "a watered-down version of gstack." That's what failure feels like. Never again.

Prism must stay calm and non-technical on the surface while being spec-driven, architecture-led, review-heavy, test-heavy, self-checking, and maintainable under the hood.
It must not become AI slop or a random app generator.

## How It Works (Under the Hood)

Prism is a layer on top of gstack. gstack IS the dream team — the engineering expertise, the verification systems, the workflow patterns. Prism's job is to orchestrate gstack's capabilities in a way that's accessible to non-power-users.

### Phase 1: The Skill (Now)
Prism runs as a Claude Code skill. The creator types `/prism` and enters a session. The skill:
1. Captures intent through Socratic conversation
2. Generates a build plan with acceptance criteria
3. Builds in verified chunks, surfacing judgment calls
4. Maintains intent memory across sessions via `.prism/` files
5. Keeps the creator in creative flow — never lost, never confused

**The immediate priority:** Fix the five enforcement failures identified during dogfooding (rule salience, research gate defaults, verification requirements, operator boundary examples, gstack version sync).

### Phase 2: The Companion (Next)
A lightweight web interface that shows project state, judgment checkpoints, and progress visually. The terminal does the work; the companion makes it visible. The creator can see their product taking shape without reading terminal output.

### Phase 3: The Studio (Future)
Multi-project management from one interface. Conductor-style multi-agent orchestration under the hood. Bleeding-edge monitoring that keeps Prism current with the best tools and practices. A self-curating library of capabilities — not 81,000 skills, but the curated best-of that 80% of creators need.

### Phase 4: The Forge (Horizon)
The full spatial vision. Vessels, structural depth, tension lines, voice input, temporal navigation. Ideas enter as living matter and become form through shaping, pressure, and revision. This is where the spatial canvas vision lives — not as v1, but as the destination that the dream team experience earns its way toward.

## The Business

### Market Size
The AI-assisted software creation market is exploding:
- Lovable: $6.6B valuation, $300M ARR (Feb 2026)
- Replit: $9B valuation, $240M revenue (2025)
- Cursor: $10B+ valuation, 500K+ developers
- Bolt.new: $700M valuation, $40M ARR within weeks
- Devin: $10.2B valuation despite 15% task success rate

Total: $32B+ in combined valuations. None of them serve the product-thinking layer. None of them feel like a team.

### The 80% Wall
The #1 complaint across every AI builder: projects die at 80%. Small changes break things. Context degrades. Debugging AI code is harder than debugging your own. The complexity wall is universal.

Prism's dream team — Socratic discovery, verified chunks, quality gates, intent memory — is purpose-built to break through this wall. The team doesn't just help you start. It helps you finish.

### Positioning
```
                    FOR ENGINEERS
                         |
        Cursor           |           Claude Code
        Windsurf         |           Codex CLI
        Copilot          |           Devin
                         |
  CODE-FIRST ────────────┼──────────── INTENT-FIRST
                         |
        Replit Agent      |           ???
        Bolt.new         |
        Lovable          |           PRISM
        v0               |
                         |
                   FOR CREATORS
```

The bottom-right quadrant — intent-first for creators — is empty. Prism creates this category.

### Revenue Model

| Tier | Price | What You Get |
|------|-------|-------------|
| Spark | Free | 3 projects, basic team, community |
| Founder | $29/mo | Unlimited projects, full team, intent memory |
| Studio | $99/mo | Multi-project, team collaboration, priority AI |
| Enterprise | Custom | SSO, audit trails, dedicated support |

### Moat
**Intent memory.** Every session makes Prism better at understanding what this creator means. The accumulated context — every decision, every rejected alternative, every "why" — becomes a moat no competitor can replicate by cloning the interface.

Secondary moats:
- The dream team orchestration — invisible quality gates that make the output suspiciously good
- Community effects — shared patterns, templates, and knowledge
- The feeling — once you've experienced it, chat-based tools feel broken

## First 100 Customers

Five archetypes:

1. **Frustrated Vibe Coders (40/100)** — Tried Claude Code or Cursor, hit the 80% wall. Found on r/ClaudeAI, X, Indie Hackers. Hook: "What if you had a team and never got lost?"

2. **Designers Who Want to Build (20/100)** — UI/UX talent with zero backend knowledge. Found on Dribbble, Figma Community, Design Twitter. Hook: "Describe what you see. Prism builds what you mean."

3. **Domain Experts with Ideas (15/100)** — Doctors, teachers, consultants with software ideas and $50K quotes from developers. Found in professional communities, no-code forums. Hook: "You know the problem better than any engineer. That's enough."

4. **Repeat Founders Going Solo (15/100)** — Built companies before, want to validate without hiring. Found on YC alumni channels, founder communities. Hook: "Your expert founding team. No equity, no hiring."

5. **Agencies / Studios (10/100)** — Design agencies bottlenecked by engineering. Found on freelance platforms, agency forums. Hook: "Brief to prototype in a day."

### The Viral Loop
1. Creator ships something good — because the invisible team handled quality
2. Someone asks "how did you build this?" — because the quality is suspiciously high for a solo creator
3. Creator says "Prism"
4. Asker tries Prism, hits the first-session magic, stays

## The Path

### Phase 1: The Feeling (Now)
Fix the Prism skill to deliver the dream team feeling reliably. Five enforcement fixes from dogfooding. Then test with Patrick (external validation).

**Success metric:** A creator describes an idea and ships a working product in one session without ever feeling lost. The dream team feeling sustains through the entire build.

### Phase 2: The Companion (Month 2-3)
Web interface for visual judgment checkpoints and project state. Terminal still does the work.

**Success metric:** A non-technical creator builds a product primarily through the companion, not the terminal.

### Phase 3: The Studio (Month 4-6)
Multi-project, multi-agent, bleeding-edge tool curation. Desktop app with clean onboarding.

**Success metric:** A creator runs 3+ projects simultaneously and Prism keeps each one on track.

### Phase 4: The Forge (Month 9+)
Spatial canvas. Vessels. Structural depth. Voice input. The full vision.

**Success metric:** A non-technical person builds and ships a product that would have taken an engineering team weeks — and the process feels like sculpting, not typing.

## Risks

1. **Anthropic/OpenAI build it.** HIGH risk. Mitigation: the dream team orchestration and intent memory are the moat, not the AI backend. Speed matters.

2. **Prompt enforcement ceiling.** MEDIUM risk. Claude may not reliably follow complex skill instructions. Mitigation: hooks-based enforcement as fallback; web companion reduces dependency on prompt compliance.

3. **AI compute costs.** MEDIUM risk. Mitigation: model costs dropping 50%/year; intent memory reduces redundant calls; usage-based pricing.

4. **Solo founder.** HIGH risk. Mitigation: AI is the co-founder. First hires at seed funding.

5. **No external validation yet.** HIGH risk. Mitigation: Patrick test THIS WEEK. Then 2-3 more before committing to Phase 2.

## Why This Founder

I am the user. I am a creative founder who thinks in systems and aesthetics, not in code. I built Prism because I needed Prism — I hit the 80% wall, felt the context amnesia, watched my ideas die in scrollback.

I'm building Prism with Prism. Every session reveals what's broken. The tool is its own test case. This creates a feedback loop no competitor can match.

And this is the golden age. A single person with AI can now build what used to take a team of 20. The engineering barrier is gone. What remains is taste — and the dream team multiplies taste into product.
