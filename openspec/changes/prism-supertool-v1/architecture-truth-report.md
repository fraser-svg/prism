# Prism Architecture Truth Report
**Audited:** 2026-03-27 | **Version:** 3.0.1.0

## Current Architecture

### What Works (Preserve)
1. **Brain/Body Split** — SKILL.md (357 lines, LLM judgment) + 5 bash scripts (1,100 lines, deterministic bookkeeping)
2. **Registry State Model** — .prism/registry.json with concurrency safety (mkdir locks, atomic writes, .bak recovery)
3. **Guardian Pattern** — Diagnose → rewrite → respawn (max 3), not blind retry
4. **Progressive Disclosure** — User sees plain English checklists, not raw spec format
5. **Session Continuity** — Registry JSON + markdown checkpoint, dual-layer persistence
6. **Graceful Degradation** — Every hard dependency has a fallback (openspec, jq, git, linters)
7. **Key Vault** — macOS Keychain, secrets never in LLM context, atomic .env.local writes
8. **Auto-Save** — Blocklist-based (not allowlist), branch auto-creation, push with graceful degradation

### External Runtime Dependencies
| Tool | Usage | Required | Fallback |
|------|-------|----------|----------|
| openspec CLI | Spec lifecycle (new, validate, archive, list) | No | Directory scan |
| gstack skills | plan-eng-review, qa, design-consultation, design-review, ship | No | Inline fallback |
| jq | JSON parsing in all scripts | No | String parsing |
| git | Commits, pushes, branch detection | No | Directory operations |
| npm/npx | Linters, TypeScript | No | Skip checks |
| security (macOS) | Keychain access | No | Skip on non-macOS |

### State Models (Current)
| Location | Owner | Purpose | Format |
|----------|-------|---------|--------|
| .prism/registry.json | prism-registry.sh | Runtime state, workers, events | JSON |
| .prism/registry.json.bak | prism-registry.sh | Recovery backup | JSON |
| .prism/session-context.md | prism-checkpoint.sh | Human-readable session | Markdown |
| openspec/changes/{name}/session-context.md | prism-checkpoint.sh | Per-change session | Markdown |
| openspec/changes/{name}/specs/*/spec.md | Agent subagent | Spec artifacts | Markdown |
| openspec/changes/{name}/proposal.md | Agent subagent | Change proposal | Markdown |
| PRODUCT.md | Agent subagent | Product direction | Markdown |
| .prism/contracts/{worker-id}.json | Agent subagent | Worker output contracts | JSON (undocumented) |

**Assessment:** Registry is already the canonical runtime truth. No conflicting state models. But checkpoint JSON has no schema, contracts are undocumented, and PRODUCT.md update logic is fragile (subagent-dependent, no retry).

### Stale Artifacts
| Path | Origin | Status |
|------|--------|--------|
| hooks/research-gate.sh | v0.3 | Not referenced in v3 SKILL.md |
| hooks/verification-gate.sh | v0.3 | Not referenced in v3 SKILL.md |
| dashboard/ (entire directory) | v0.3 | Not active in v3 |
| openspec/changes/prism-autopilot-v1/ | v1.0.0.0 | Describes v1 behaviour, not v3 |
| planning/*.md | Various | Work-in-progress notes, not canonical |

### Missing Layers (vs Target Architecture)
| Target Layer | Current Status |
|-------------|---------------|
| Prism Core (owned models) | Partially exists: registry is owned, but spec/change model delegates to OpenSpec |
| Prism Runtime (supervisor) | Partially exists: SKILL.md acts as supervisor, scripts handle bookkeeping, but no formal lifecycle |
| Prism Adapters (generated skills) | Not started: SKILL.md is hand-maintained, not generated |
| Prism Improvement Engine | Not started: no telemetry, no eval suite, no gated promotion |

### Most Dangerous Weaknesses
1. **Agent tool is a hard dependency** — 15+ invocations, no explicit fallback if Agent tool unavailable
2. **OpenSpec CLI not version-pinned** — breaking changes would cascade
3. **No canonical architecture document** — system shape spread across SKILL.md, references, docs/, planning/
4. **Skills are hand-maintained** — SKILL.md is 357 lines of manually curated prompt. No generation, no diffing, no compatibility testing

### Highest-Leverage First Fixes (Phase A)
1. Create ARCHITECTURE.md as the single canonical architecture source of truth
2. Remove stale artifacts (hooks, dashboard, v1 specs)
3. Document the undocumented (checkpoint schema, contract format, PRISM_WORKER_EXTRA)
4. Reconcile docs/VISION.md, docs/ROADMAP.md, and planning/ with actual v3 reality
5. Validate all scripts still pass tests after cleanup
