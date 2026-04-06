---
status: ACTIVE
promoted_from: ~/.gstack/projects/fraser-svg-prism/ceo-plans/2026-04-06-strategic-course-correction.md
date: 2026-04-06
branch: fraser-svg/vision-audit
---
# Strategic Course Correction: Prism as the Brain, Not the Hands

## One-Liner

**AI builds fast. Prism builds right.**

## Context

The agent execution layer is going commodity (Hermes: MIT, 26.8k stars, persistent memory, 40+ tools). Prism's docs contradict each other on whether Prism "builds" (VISION.md) or "judges" (DOCTRINE.md). The web app IS the product but PLANS.md still says Electron is active and browser-first is "Not Now."

This plan resolves the identity contradiction, updates all strategic docs to reflect web-only reality, and captures competitive intelligence.

## Key Decisions

1. **One-liner:** "AI builds fast. Prism builds right." Survives agents improving because "right" is orthogonal to "fast."
2. **Builder -> Foreman:** VISION.md Builder role becomes Foreman. Today: direct API execution. Migration target: dispatches to external agents. Honest temporal framing.
3. **Brain-vs-hands filter:** Quick pre-screen before the Decision Rubric. "Is this brain or hands? If hands, stop."
4. **Agent-agnostic principle:** New DOCTRINE.md Section 3.6. Any agent can be the hands.
5. **Strategy docs are supporting evidence, not authorities.** DOCTRINE.md remains the single strategic authority.

## Scope (14 files)

### Core Edits (11 files)
1. CLAUDE.md — Quick Context header, new priority stack, filter shortcut, competitive context
2. docs/VISION.md — Foreman reframe, YC Pitch block, "What Prism Is Not" link
3. docs/DOCTRINE.md — Section 0.3/2.2 edits, Section 3.6 (agent-agnostic), applied examples, unified exclusion list, Electron fix
4. PLANS.md — M5 superseded, M6 Web App MVP active, milestone badges
5. TODOS.md — Collapse done items, mark desktop ON HOLD, re-prioritize
6. AGENTS.md — Update stale references
7. docs/architecture/README.md — Update stale references
8. docs/yc/OVERSIGHT.md — Defensibility clarity dimension
9. docs/yc/SCORECARD.md — Full 7-dimension refresh

### New Files (3)
10. docs/strategy/COMPETITIVE-INTELLIGENCE.md — Hermes analysis, commodity landscape
11. docs/strategy/AGENT-AGNOSTIC-ARCHITECTURE.md — Orchestration thesis (strategic context, NOT a spec)
12. docs/strategy/README.md — Strategy directory index

### Infrastructure (2)
13. scripts/lint-docs.sh — Doc-drift lint (6 assertion categories + broken-link check)
14. Cross-reference links across all docs

## Execution Order

1. CLAUDE.md -> 2. VISION.md -> 3. DOCTRINE.md -> 4. PLANS.md -> 5. TODOS.md
6. AGENTS.md + docs/architecture/README.md -> 7. Strategy docs -> 8. YC docs
9. Cross-reference links -> 10. lint-docs.sh -> 11. Verify

## What Does NOT Change

- The ICP (agency operators)
- The quality gates / Guardian layer design
- The Socratic discovery flow
- The artifact system
- The "web app is the product" decision
- The feeling — operators still feel like they have a dream team

## Review History

- CEO Review: CLEAR (2026-04-06) — SCOPE EXPANSION, 11 expansions accepted
- Codex Outside Voice: 12 findings, 7 cross-model tensions resolved
- Spec Review: 2 rounds, 13 issues caught, 11 fixed, quality 5/10 -> 6.4/10
