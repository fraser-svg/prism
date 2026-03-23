# Stage Routing

## How to determine which stage the user is in

On activation, follow this decision tree:

```
/prism invoked
    │
    ├─ Use subagent to scan for active OpenSpec changes
    │   ├─ Found → Stage 0: Resume (offer to continue or start new)
    │   └─ Not found → Stage 1: Understand
    │
Stage 1: Understand (sharpening questions → generate spec via subagent)
    │ spec generated in openspec/changes/{name}/specs/
    │
Stage 2: Plan (auto-invoke /plan-eng-review via Skill tool)
    │ user can skip before invocation → go to Build
    │ planning found problems → go back to Stage 1 to revise
    │ fallback: if Skill tool fails → guided mode
    │
Stage 3: Build (Prism builds directly, referencing spec in change dir)
    │ drift detection active
    │ read spec from: openspec/changes/{name}/specs/{feature}/spec.md
    │
Stage 4: Verify (auto-invoke /qa via Skill tool)
    │ user can skip before invocation → go to Ship
    │ QA found issues → go back to Build to fix
    │ fallback: if Skill tool fails → guided mode
    │
Stage 5: Ship (auto-invoke /ship via Skill tool — creates PR, NOT a deploy)
    │ Prism observes output, archives change on success
    │ archive change: openspec archive "{name}" -y
    │ fallback: if Skill tool fails → guided mode
    │
Done. Change archived. Specs merged to openspec/specs/.
```

## Stage Transitions

| From | To | Trigger |
|------|-----|---------|
| (none) | Stage 1 | No active changes found |
| Stage 1 | Stage 2 | Spec generated and approved |
| Stage 2 | Stage 3 | Planning complete or skipped |
| Stage 2 | Stage 1 | Planning found problems, revise spec |
| Stage 3 | Stage 4 | All requirements built |
| Stage 4 | Stage 5 | QA passed or skipped |
| Stage 4 | Stage 3 | QA found issues, fix them |
| Stage 5 | Done | PR created successfully, change archived |
| Stage 5 | Paused | User skips shipping — change stays active |
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

- **"build me X" / "I need X" / "create X"** → Stage 1 (new build)
- **"continue" / "pick up" / "resume"** → Stage 0 (resume)
- **"change X" / "add X to Y" / "update"** → Spec change flow
- **"plan" / "review"** → Stage 2
- **"test" / "verify" / "QA"** → Stage 4
- **"ship" / "commit" / "PR"** → Stage 5

## Important: Where Specs Live

During a build, specs are in the **change directory:**
`openspec/changes/{change-name}/specs/{feature}/spec.md`

After archiving (Stage 5 complete), specs move to the **main directory:**
`openspec/specs/{feature}/spec.md`

Always read from the change directory during active work. The main directory
is only populated after `openspec archive`.
