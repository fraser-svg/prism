# Agent-Agnostic Architecture

> **Status: `[TARGET]`** — This is a strategic thesis for the 20x/100x horizon. No implementation work should begin based on this document until explicitly promoted to `[MIGRATION]` in [DOCTRINE.md](../DOCTRINE.md).

> Last updated: 2026-04-06. This document is subordinate to [DOCTRINE.md](../DOCTRINE.md).

## Thesis

Prism is the judgment and orchestration layer that sits above execution agents. Any agent can be the hands. Prism is the brain.

Today, Prism executes directly via Claude Code skills. This works and ships product. The architectural direction is toward dispatching to external agents and verifying their output, making Prism independent of any single execution provider.

## Why This Matters

1. **The execution layer is commodity.** Hermes (MIT, 26.8k stars), Claude Code, Codex, Cursor... all provide code generation and task execution. Competing here means competing with free.

2. **Better agents make Prism more powerful.** When Claude Code gets 2x better at writing code, Prism's verification catches 2x more edge cases in 2x more output. The relationship is multiplicative, not competitive.

3. **Agent lock-in is a business risk.** If Prism only works with one agent, that agent's pricing, availability, and capability changes directly threaten the business. Agent-agnosticism is a survival property.

## Delegation Model

The conceptual flow (not yet implemented):

```
Operator intent
    ↓
Prism: Socratic discovery → structured spec → build plan
    ↓
Dispatch to agent(s)  ←  agent selection based on task type
    ↓
Agent(s) execute, return results + evidence
    ↓
Prism: Guardian verification → quality gates
    ↓
Prism: Release decision → deploy
```

## Conceptual Interfaces

These are design thinking, not specifications. No code should be written from these.

- **ExecutionBackend** — abstraction over how build work gets done (today: Claude Code skill, future: agent dispatch)
- **MemoryProvider** — abstraction over how cross-session context is stored and retrieved
- **GatewayChannel** — abstraction over how the operator interacts with Prism (today: CLI + web app)

## Current Reality vs. Target

| Aspect | Today `[NOW]` | Target `[TARGET]` |
|--------|--------------|-------------------|
| Execution | Direct API calls via Claude Code | Dispatch to any agent |
| Verification | Guardian layer checks output | Same, but verifying multi-agent output |
| Memory | `.prism/` files + SQLite | Portable, provider-agnostic memory |
| Operator surface | Web app + CLI | Web app (primary), CLI (power users) |
