# Prism Build Doctrine — 10x / 20x / 100x

> Prism wins by owning memory, judgment, and outcomes — while letting everything else be replaced.

This document is the **strategic authority** for Prism. It defines what Prism is becoming, what must be built, what must not be built, and how every decision is tested. CLAUDE.md, PLANS.md, and /yc-brain reference this document — it is not decorative.

---

## Current Reality `[NOW]`

Prism today is a Claude Code skill system with a typed core underneath. The skill layer (SKILL.md) sits **inside** the model — it is a prompt, not a standalone system. This contradicts the core doctrine ("never sit inside a model"), and we know it.

The path forward:
- **Typed core** (`packages/*`) is the durable layer being built underneath the skill
- **Dual-write bridge** (M3) keeps both paths working during migration
- **Electron desktop shell** (post-YC) will be the first client that consumes the typed core directly
- **SKILL.md** remains the user-facing interface until the desktop shell ships

This is not hypocrisy — it is sequencing. The doctrine points north. We are not at the north pole yet. Temporal markers on every rule below prevent misapplication.

---

## 0. Core Doctrine (Never Violate)

### 0.1 Position in the Stack `[TARGET]`

Prism must sit **above models, above agents, above tools**. It must never sit inside a model, as a wrapper around a model, or as "another agent."

### 0.2 Fundamental Truth `[NOW]`

> Models produce output. Prism produces **outcomes**.

### 0.3 System Responsibility `[NOW]`

Prism is responsible for: defining the problem, shaping the solution, ensuring correctness, managing execution, deciding release readiness, capturing reality post-launch, driving iteration.

### 0.4 Replaceability Rule `[TARGET]`

Everything external must be replaceable — OpenAI, Anthropic, GitHub, Vercel, Cursor, Replit. Prism routes between them, evaluates them, and learns from them.

---

## 1. The Four Non-Negotiable Layers

### Product Truth `[NOW]`

What problem is being solved. Constraints, tradeoffs, success criteria. Prism owns the "what" and "why" — models own the "how."

### Memory `[NOW]`

Decisions, assumptions, failures, outcomes over time. Structured, queryable, persistent, central. This is the moat.

### Verification `[NOW]`

Should this proceed? Is this shippable? What's missing? Agents generate — Prism judges. Never mix.

### Outcome Loop `[MIGRATION]`

What happened after launch? What should change next? Feedback ingestion, outcome tracking, iteration engine. Currently manual; becomes automated at 20x.

---

## 2. The Three Horizons

### 2.1 10x Prism (0–6 months) `[NOW]`

> A deterministic product execution system with enforced quality.

**Capabilities:** Structured lifecycle (intake → deploy → observe). Hard gates (non-bypassable). Artifact system — everything becomes structured objects, nothing important lives in chat. Execution tracking. Deployment state. Decision + assumption log.

**UX Principle:** "This system forces clarity and prevents mistakes."

**Success:** At least one full project defined, built, deployed, verified. Prism catches real errors before release.

**Failure modes:** Feels like a chat tool. Outputs are disposable. Gates are weak or skippable. No real deployments.

### 2.2 20x Prism (6–12 months) `[MIGRATION]`

> An autonomous product system that runs and improves software.

**New capabilities:** Feedback ingestion layer. Outcome tracking. Iteration engine. Strategy layer (challenge direction, suggest better solutions, identify risks). Adaptive verification. Cross-project memory.

**UX Principle:** "This system is running my product, not just building it."

**Success:** Projects improve after launch. Users return to same projects. Prism suggests meaningful next actions.

### 2.3 100x Prism (12+ months) `[TARGET]`

> The operating system for software outcomes in the age of agents.

**Core capabilities:** Product Graph (central brain of decisions, features, risks, dependencies, outcomes). Multi-provider execution mesh. Outcome engine optimising for ROI, performance, user value, cost. Autonomous prioritisation. Longitudinal intelligence. Trust layer.

**UX Principle:** "I describe intent. The system handles everything else."

---

## 3. System Architecture Rules

### 3.1 Canonical Data Model `[NOW]`

All external outputs become Prism objects. Never store raw outputs only.

### 3.2 Provider Abstraction `[TARGET]`

Each capability is modular: generation, coding, deployment, verification.

### 3.3 Separation of Concerns `[NOW]`

Agents = generate. Prism = judge. Never mix.

### 3.4 Memory-First Design `[NOW]`

Memory is structured, queryable, persistent, central.

### 3.5 Closed Loop `[MIGRATION]`

Every project must start with intent and end with iteration.

---

## 4. What Prism Must NOT Own

To avoid being destroyed by frontier model progress:

- Raw code generation `[NOW]`
- Raw agent execution `[NOW]`
- Model-specific features `[NOW]`
- Chat-based building UX `[NOW]`
- Generic no-code builder positioning `[NOW]`
- Prompt playground `[NOW]`
- Plugin marketplace (early) `[NOW]`
- Hobby/no-code focus `[NOW]`

These layers are being eaten by OpenAI (Codex), Anthropic (Claude Code), GitHub (Copilot agents), Vercel (v0 + infra), Cursor, Replit.

---

## 5. The Compounding Engine `[MIGRATION]`

Every run must improve the system. Learn which provider works best, which patterns fail, which specs succeed, which decisions correlate with outcomes. Store patterns, failures, improvements. Apply better routing, better defaults, better verification.

As models improve: without Prism → faster output, more chaos, more inconsistency. With Prism → better routing, better decisions, better outcomes, faster iteration loops. **AI progress = Prism leverage.**

---

## 6. The Winning Position

Prism is NOT an AI builder, an IDE, or a chat tool.

> Prism IS the system where software work is defined, judged, executed, shipped, and improved.

**The winning wedge:** Agency operators delivering software without engineers. High pain, repeated workflows, fast feedback loops, willingness to pay.

**The real moat:** Long-term memory across projects/clients/outcomes. Cross-provider intelligence. Outcome-linked learning — not "this prompt worked" but "this decision led to success."

---

## 7. Entity-per-Horizon Mapping

Entities are tiered by when they become necessary. See `docs/designs/prism-os-roadmap.md` for full field-level definitions.

### Tier 1: Needed for User Proof `[NOW]`

| Entity | Purpose |
|--------|---------|
| IntakeBrief | Structured output from Socratic discovery — persists client context, workflow, pain points |
| Deployment | First-class deploy tracking — URL, environment, health, linked build |

### Tier 2: Needed for Agency Workflow `[MIGRATION]`

| Entity | Purpose |
|--------|---------|
| ClientAccount | Agency-facing client identity — links projects to client context |
| SolutionThesis | Structured output from shaping — the "what we're building and why" artifact |
| FeedbackRecord | Client feedback, defects, analytics summaries per deployment |

### Tier 3: Nice-to-Have `[TARGET]`

| Entity | Purpose |
|--------|---------|
| ProviderRun | Per-provider execution tracking for model routing analytics |
| GateDecision | Durable record of gate evaluations |
| Environment | Named deployment targets |
| DecisionEntry | Structured decision log entry with rationale and alternatives |
| Assumption | Tracked assumption with validation status |
| IterationPlan | Post-observe plan for next build cycle |
| BuildRun | Richer execution tracking |

---

## 8. Decision Rubric

Before building ANY feature, apply all three tests. /yc-brain enforces this rubric as a "Doctrinal Check."

### Layer Test

Does this feature strengthen one of the 4 non-negotiable layers?

- **Product Truth** (defining the problem, shaping the solution, success criteria): +1
- **Memory** (decisions, assumptions, failures, outcomes persisted durably): +1
- **Verification** (should this proceed? is this shippable? what's missing?): +1
- **Outcome Loop** (what happened after launch? what should change next?): +1
- None of the above: **WARNING** — "This feature doesn't strengthen any doctrinal layer"

### Wrapper Test

Does this feature deepen the skill wrapper or strengthen the typed core?

- SKILL.md-only change with no typed core equivalent: **WARNING** — "This deepens the wrapper. Can the logic also live in the typed core?"
- Typed core change (`packages/*`): PASS
- Both (dual-write pattern): PASS

**Temporal note:** For `[NOW]`-phase work, a SKILL.md-only change is acceptable if no typed core equivalent exists yet. The WARNING applies only when the typed core equivalent COULD exist but is being skipped. During `[MIGRATION]`, all new logic should have a typed core representation.

### Survival Test

If AI models get 10x better tomorrow, does this feature:

- Become more powerful (Prism routes better, judges better, remembers more): **BUILD**
- Stay the same (neither helped nor hurt by model improvement): **DEFER**
- Become irrelevant (models do this natively): **STOP**

---

## 9. Final Non-Negotiable Test `[NOW]`

> If AI gets 10x better tomorrow… does this feature become irrelevant, stay the same, or become more powerful? Only build if it becomes more powerful.

Build Prism as: a system that owns outcomes, not outputs. A system that improves with AI, not competes with it. A system that remembers, judges, and evolves work over time.

Do NOT build: a demo, a wrapper, a toy.

> **Build the operating system for turning intent into reality.**
