# Product Context

Prism maintains a living `PRODUCT.md` in every project it builds. This file provides
product-level awareness across multiple build phases.

## Authority Rule

Two sources of product knowledge exist. When they conflict:
- **Archived specs** (`openspec/specs/`) are ground truth for **what was built**
- **PRODUCT.md** is the source of truth for **direction** (vision, what's next, architecture intent)

If PRODUCT.md says "Phase 2: not started" but archived specs show Phase 2 was shipped,
trust the archived specs and update PRODUCT.md to match.

## When to Create PRODUCT.md

Create when ALL of these are true:
1. No PRODUCT.md exists in the project root
2. The user is starting a new build (not resuming)
3. No existing code/specs to bootstrap from

If existing code or archived specs exist but no PRODUCT.md, use the Bootstrap Protocol
instead of asking fresh product questions.

## Product-Level Sharpening Questions

Ask these ONLY when creating a new PRODUCT.md from scratch (no existing code/specs):

1. "What's the full vision for this product? What problem does it solve?"
2. "What does the finished product look like? Describe what a user would see and do."
3. "What's the foundation we need to build first?"
4. "What are the major pieces after that? Help me understand the building blocks."
5. "Does this product have a visual interface?" (determines UI product detection)

If the product has a UI, also ask:
6. "What should it look like? Any design references, styles, or examples you like?"

## Bootstrap Protocol

When a repo has existing code or archived specs in `openspec/specs/` but no PRODUCT.md:

1. Read all archived specs in `openspec/specs/`
2. Inspect the codebase: `package.json`, directory structure, README, key config files
3. Synthesize a draft PRODUCT.md from what's already there
4. Present the draft to the user: "I've put together a product overview based on what's
   already built. Take a look and let me know if anything needs adjusting."
5. User confirms or refines, then continue with normal flow

Do NOT ask fresh product-level questions when bootstrap material exists. The user
already answered those questions when they built the existing code.

## PRODUCT.md Template

```markdown
# Product: {Name}

## Vision
{1-2 paragraphs: what this product does, who it's for, what done looks like}

## Architecture
{Living section: current tech stack, key patterns, data model}
{ASCII diagram updated as product evolves}

## What's Been Built
| Phase | Change Name | What Shipped | Status | Date |
|-------|-------------|-------------|--------|------|

## What's Next
| Phase | Description | Depends On | Status |
|-------|------------|-----------|--------|

## Architecture Decisions
| Decision | Why | Date | Revisit If |
|----------|-----|------|------------|
```

The Status column in "What's Been Built" tracks: `built` or `shipped`.

Valid statuses for "What's Next": `ready` (can be started), `blocked` (depends on
unshipped phase), `in progress`, `shipped` (done).

## When to Read PRODUCT.md

Read silently at every stage transition:
- **Stage 0 (Resume):** Provide product context for resume routing
- **Stage 1 (Understand):** Inform spec generation with architecture context
- **Stage 2 (Plan):** Pass architecture section to /plan-eng-review
- **Stage 3 (Build):** Consult architecture for build decisions

Reading is always silent. Never announce "I'm reading your product doc." Just use the
context naturally in conversation.

## When to Update PRODUCT.md

Update via subagent at these points:
- **After Build completion (Stage 3):** Add to "Built" table with status "built".
  Update Architecture Decisions if new decisions were made during build.
- **After Ship (Stage 5):** Update "Built" status from "built" to "shipped". Update
  Architecture section. Update "What's Next" statuses. Suggest next phase.
- **After Plan (Stage 2):** If /plan-eng-review recommends architecture changes, update
  the Architecture Decisions table.

If a subagent fails to update: retry once, then skip. Never block the user on a
PRODUCT.md update failure. Log the skip.

## Stale Architecture Detection

At each Stage 1 invocation for product-level requests (not small changes/bugfixes),
the subagent should check for drift using narrow heuristics:

1. **Dependencies:** Compare PRODUCT.md Architecture section against `package.json`
   dependencies (or equivalent). Flag new major dependencies not mentioned in the doc.
2. **Directory structure:** Check if new top-level directories exist that aren't
   reflected in the Architecture section.
3. **Config files:** Check for new config files (`.env`, `docker-compose.yml`, database
   configs) that suggest infrastructure changes.

Do NOT attempt to compare prose descriptions against code semantics. Only flag concrete,
observable mismatches (new package, new directory, new config file).

When drift is detected, ask the user:
"Your product doc says {X} but I notice {Y} in the codebase. Want me to update the doc?"

## UI Product Detection

A product is a "UI product" if ANY of:
- PRODUCT.md Vision section mentions "interface", "UI", "page", "screen", "dashboard",
  "frontend", or "app"
- The codebase has a frontend framework (React, Vue, Next.js, Svelte, etc.)
- The user answers "yes" to "Does this product have a visual interface?"

When a UI product is detected:
- Before first Build: auto-invoke `/design-consultation` if no DESIGN.md exists
- After QA (Verify) stage: auto-invoke `/design-review`
- Product-level questions include "What should it look like?"

## Constraint: One Product Per Repo

PRODUCT.md is singular. Each repo contains one product. If the user wants to build a
different product, they should use a different repo/directory.

## Reading PRODUCT.md in Subagent Prompts

When reading PRODUCT.md for context, use this shared instruction in subagent prompts:

> "Read PRODUCT.md in the project root if it exists. Extract:
> - Vision (what this product is)
> - Architecture (current tech decisions)
> - What's Been Built (completed phases)
> - What's Next (upcoming phases and dependencies)
> Use this context to inform your work. Do not contradict architecture decisions
> unless the user explicitly asks to change direction."
