# Current Script Mapping

## Purpose

This document maps Prism’s existing deterministic assets into the target Prism Core architecture.

It answers four questions for each asset:
- what subsystem it belongs to
- whether it remains canonical
- whether it should become an adapter
- whether it is transitional or legacy

## Mapping Table

| Asset | Current Role | Target Subsystem | Target Status | Notes |
|-------|--------------|------------------|---------------|-------|
| `scripts/prism-state.sh` | Split product memory management | `packages/memory` | Canonical behavior, likely wrapped | Strong fit for long-term memory subsystem |
| `scripts/prism-checkpoint.sh` | Session/checkpoint persistence | `packages/memory` + `packages/orchestrator` | Canonical behavior, likely split | Persistence stays; stage semantics should be owned by orchestrator |
| `scripts/prism-scan.sh` | Project/resume scan | `packages/memory` + `packages/orchestrator` | Canonical behavior, likely wrapped | Good substrate for local project introspection |
| `scripts/prism-registry.sh` | Build state registry | `packages/orchestrator` | Transitional | Useful now, but should eventually align to canonical run/checkpoint/task entities |
| `scripts/prism-supervisor.sh` | Task-graph execution manager | `packages/orchestrator` | Canonical behavior, likely wrapped | Strong fit for bounded-worker orchestration |
| `scripts/prism-verify.sh` | Deterministic verification runner | `packages/guardian` | Canonical behavior, likely wrapped | Good base for deterministic checks |
| `scripts/prism-save.sh` | Auto-save commit/push | `packages/execution` | Canonical behavior, likely wrapped | Approval and branch policy should be orchestrator-aware |
| `scripts/prism-telemetry.sh` | Append-only telemetry | `packages/guardian` or shared infra | Canonical behavior, likely wrapped | Useful for eval and reliability loops |
| `scripts/prism-eval.sh` | Eval suite | `packages/guardian` | Canonical behavior, likely wrapped | Core for safe self-improvement |
| `scripts/prism-improve.sh` | Improvement proposals and promotion | `packages/guardian` + `packages/orchestrator` | Transitional canonical | Good pattern, but should align with formal change/release state |

## Compiler And Prompt Assets

| Asset | Current Role | Target Subsystem | Target Status | Notes |
|-------|--------------|------------------|---------------|-------|
| `compiler/prism-compile.sh` | Cross-platform skill/agent compiler | `packages/execution` or tooling | Transitional | Valuable as tooling, but not the product core itself |
| `compiler/skills/*.yaml` | Canonical prompt skill definitions | Tooling / prompt assets | Transitional | Useful source assets; should not become the only architecture source |
| `references/reviews/*.md` | Native review prompts | `packages/guardian` | Canonical content, likely wrapped | Good review policy substrate |
| `hooks/*.sh` | Enforcement hooks | `packages/execution` / policy tooling | Transitional | Keep available as enforcement backup, not product identity |

## Canonical Versus Transitional Summary

### Likely Canonical Behaviors To Preserve

- split product memory model
- checkpoint persistence
- task-graph supervision
- deterministic verification
- telemetry and eval loops
- native review prompts

### Transitional Behaviors To Wrap Or Refactor

- registry-as-primary-state
- prompt assets standing in for domain models

### Legacy Compatibility To Keep Reading

- `PRODUCT.md`
- `openspec/` history where relevant

## Recommended M1 Follow-Through

1. Preserve current script capabilities.
2. Stop treating script files as the architecture.
3. Define TypeScript contracts that describe their inputs and outputs.
4. Wrap them behind clear subsystem boundaries.
5. Gradually migrate durable truth into canonical Prism Core entities.
