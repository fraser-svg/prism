# Competitive Intelligence

> Last researched: 2026-04-06. Refresh quarterly or when a new competitor crosses 10k GitHub stars.

> This is a living document. It provides context for [DOCTRINE.md](../DOCTRINE.md) decisions. It is not a strategic authority.

## The Commodity Agent Landscape

The agent execution layer is going commodity. Multiple open-source and commercial tools now provide persistent memory, tool use, code generation, and autonomous task completion. Building a better agent is not Prism's game.

### Hermes Agent (Nous Research)

- **License:** MIT
- **GitHub stars:** 26.8k (as of 2026-04-06)
- **Key capabilities:** Persistent memory, 40+ tools, multi-platform, autonomous task completion
- **Overlap with Prism:** Code generation, tool orchestration, memory
- **Gap:** No Socratic discovery, no quality gates, no intent memory across projects, no judgment layer. Hermes builds fast. It doesn't verify whether it built the right thing.

### Other Execution-Layer Players

| Tool | Type | Threat to Prism |
|------|------|----------------|
| Claude Code (Anthropic) | Agent + IDE | Execution layer, not judgment. Prism sits above it. |
| Cursor | AI IDE | Code-first, for engineers. Different ICP. |
| Codex (OpenAI) | Agent | Same category as Hermes. Execution, not orchestration. |
| Devin (Cognition) | Autonomous agent | $10.2B valuation, 15% task success rate. Fast but unreliable. |
| Replit Agent | Agent + hosting | Operator-adjacent but no discovery/verification layer. |
| Bolt.new / Lovable / v0 | Builders | Code-first generators. No project lifecycle. |

### Why Better Agents = More Prism Leverage

When agents get faster and more capable:
- **Without Prism:** Faster output, more chaos, more inconsistency, harder to verify
- **With Prism:** Better routing, better decisions, better outcomes, faster iteration loops

The relationship is not competitive. It's complementary. AI builds fast. Prism builds right. The faster the agents, the more valuable the judgment layer.

## Market Signal

Job market data (2025-2026) shows a 340% increase in architect/orchestrate roles and a 17% decline in pure implementation roles. The market is pricing in that execution is commodity and orchestration is premium.

## Positioning

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
                   FOR OPERATORS
```

The bottom-right quadrant (intent-first for operators) is empty. Prism creates this category.
