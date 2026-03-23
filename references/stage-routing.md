# Stage Routing

## How to determine which stage the user is in

On activation, follow this decision tree:

```
/prism invoked
    │
    ├─ Use subagent to scan for active OpenSpec changes AND check for PRODUCT.md
    │   │
    │   ├─ PRODUCT.md exists + active change
    │   │   → Stage 0: Resume with product context
    │   │     "You're building {product}. Picking up {change}: {description}."
    │   │
    │   ├─ PRODUCT.md exists + NO active change
    │   │   → Stage 0: Suggest next phase
    │   │     "You're building {product}. {Last shipped}. Ready for {next phase}?"
    │   │     User confirms → Stage 1 with product context
    │   │     User wants something else → Stage 1 with product context (different change)
    │   │
    │   ├─ NO PRODUCT.md + active change
    │   │   → Stage 0: Resume (existing behaviour, no product context)
    │   │
    │   └─ NO PRODUCT.md + no active change
    │       → Stage 1: Understand (fresh start)
    │         If existing code/specs exist → Bootstrap PRODUCT.md first
    │         (see references/product-context.md Bootstrap Protocol)
    │
Stage 1: Understand (sharpening questions → generate spec via subagent)
    │ spec generated in openspec/changes/{name}/specs/
    │
Stage 2: Plan (auto-invoke /plan-eng-review via Skill tool)
    │ user can skip before invocation → go to Build
    │ planning found problems → go back to Stage 1 to revise
    │ fallback: if Skill tool fails → guided mode
    │
Stage 2.5: Design (auto, for UI products only)
    │ if UI product detected AND no DESIGN.md exists:
    │   auto-invoke /design-consultation before first Build
    │ user can skip before invocation
    │ fallback: if Skill tool fails → guided mode
    │
Stage 3: Build (Prism builds directly, referencing spec in change dir)
    │ drift detection active
    │ read spec from: openspec/changes/{name}/specs/{feature}/spec.md
    │ consult PRODUCT.md architecture for build decisions
    │ after build completion: update PRODUCT.md (status: "built")
    │
Stage 4: Verify (auto-invoke /qa via Skill tool)
    │ user can skip before invocation → go to Ship
    │ QA found issues → go back to Build to fix
    │ fallback: if Skill tool fails → guided mode
    │
Stage 4.5: Design Review (auto, for UI products only)
    │ if UI product: auto-invoke /design-review after QA
    │ user can skip before invocation
    │
Stage 5: Ship (auto-invoke /ship via Skill tool — creates PR, NOT a deploy)
    │ Prism observes output, archives change on success
    │ archive change: openspec archive "{name}" -y
    │ update PRODUCT.md: status → "shipped", suggest next phase
    │ fallback: if Skill tool fails → guided mode
    │
Done. Change archived. Specs merged to openspec/specs/.
```

## Stage Transitions

| From | To | Trigger |
|------|-----|---------|
| (none) | Stage 1 | No active changes found (with or without PRODUCT.md) |
| Stage 0 | Stage 1 | User confirms next phase or requests something new |
| Stage 1 | Stage 2 | Spec generated and approved |
| Stage 2 | Stage 2.5 | Planning complete + UI product + no DESIGN.md |
| Stage 2 | Stage 3 | Planning complete (non-UI or DESIGN.md exists) |
| Stage 2 | Stage 1 | Planning found problems, revise spec |
| Stage 2.5 | Stage 3 | Design consultation complete or skipped |
| Stage 3 | Stage 4 | All requirements built (PRODUCT.md updated) |
| Stage 4 | Stage 4.5 | QA passed + UI product |
| Stage 4 | Stage 5 | QA passed (non-UI) or skipped |
| Stage 4 | Stage 3 | QA found issues, fix them |
| Stage 4.5 | Stage 5 | Design review complete or skipped |
| Stage 5 | Done | PR created, change archived, PRODUCT.md updated |
| Stage 5 | Paused | User skips shipping (PRODUCT.md still updated at Build) |
| Any | Stage 1 | User says "change the spec" or "start over" |
| Any | Stage 3 | User says "fix something" or "I need to change X" |

## Recovery

The user can ALWAYS go backwards:
- "Actually, let's change the spec" → Stage 1
- "Let me re-plan" → Stage 2
- "I need to fix something" → Stage 3
- "Let me re-test" → Stage 4

## Intent Classification

When the user invokes /prism with a message:

- **"build me X" / "I need X" / "create X"** → Check for PRODUCT.md first:
  - PRODUCT.md exists → Stage 1 with product context (is this a new phase or standalone?)
  - No PRODUCT.md → Stage 1 (fresh start, will create PRODUCT.md)
- **"continue" / "pick up" / "resume"** → Stage 0 (resume)
- **"fix X" / "add a button" / small change** → Stage 1 with silent product context
  (no product-level ceremony, just inject PRODUCT.md context into spec generation)
- **"change X" / "add X to Y" / "update"** → Spec change flow
- **"plan" / "review"** → Stage 2
- **"test" / "verify" / "QA"** → Stage 4
- **"ship" / "commit" / "PR"** → Stage 5

### Ceremony vs Context

Not every invocation needs product-level questioning. The rule:
- **Product-level ceremony** (full product questions): ONLY when creating PRODUCT.md for
  the first time or when the user explicitly asks to rethink the product direction.
- **Silent context injection** (read PRODUCT.md, use it naturally): EVERY invocation where
  PRODUCT.md exists. Bug fixes, small features, and tweaks get context without interrogation.

## UI Product Detection

See [product-context.md](product-context.md) for the full detection criteria.
UI products get automatic design stages (2.5 and 4.5). Non-UI products skip them.

## Important: Where Specs Live

During a build, specs are in the **change directory:**
`openspec/changes/{change-name}/specs/{feature}/spec.md`

After archiving (Stage 5 complete), specs move to the **main directory:**
`openspec/specs/{feature}/spec.md`

Always read from the change directory during active work. The main directory
is only populated after `openspec archive`.
