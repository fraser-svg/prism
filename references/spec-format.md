# Spec Generation Rules

## Overview

Prism uses OpenSpec under the hood for spec management. This means:
- Specs follow OpenSpec's strict formatting (parseable, validatable)
- Changes are tracked via `openspec new change` / `openspec archive`
- Specs are validated with `openspec validate` after every write
- The user never sees OpenSpec commands — Prism handles them silently

## Discovery Protocol

Prism uses a three-layer discovery protocol before spec generation:

1. **Problem** — Why does this matter? What situation created the need? What changes
   when it works? Surface assumptions. Reframe if the request doesn't match the
   real problem.
2. **Shape** — What are we building? Simplest version that solves the problem. User
   walkthrough. Boundaries. Constraints.
3. **Mirror** — Reflect back in 2-4 sentences. Get confirmation before speccing.
4. **Scope** — After confirming understanding, ask ONE question:

   > "How much should we build?"
   > - **Full build** — Everything described, plus obvious supporting pieces
   > - **Targeted** — Core feature, supporting pieces only where critical
   > - **Exactly this** — Only what's described, nothing more
   > - **Minimum viable** — Smallest thing that proves the concept

   Store the answer as `scopeMode` on the Plan. This constrains task count
   and review posture downstream. Default if user doesn't choose: "Exactly this."

Transition to spec generation when you can answer:
- What problem are we solving, and for whom?
- What will the user see and do when this works?
- What are we explicitly not doing?

Depth scales with request complexity: 1-2 questions for clear tasks,
5-8 for novel products. Do NOT ask engineering questions.

## OpenSpec Workflow (invisible to user)

After sharpening questions:

1. `openspec new change "{feature-name}"` — creates the change directory
2. Write `proposal.md` — the Why and What from sharpening answers
3. Write spec file(s) in `openspec/changes/{feature-name}/specs/{capability}/spec.md`
4. `openspec validate "{feature-name}" --type change` — check formatting is correct
5. Show user a plain-English summary for approval

## Spec Format (OpenSpec strict)

Requirements and Scenarios follow OpenSpec's exact format:

```markdown
## ADDED Requirements

### Requirement: {Name}
The system SHALL {what it must do}.

#### Scenario: {Name}
- **WHEN** {condition}
- **THEN** {expected outcome}
```

**Formatting rules (enforced by OpenSpec):**
- Requirements use exactly `###` (3 hashtags)
- Scenarios use exactly `####` (4 hashtags) — NOT 3, NOT bullets
- Requirements use `SHALL` / `SHALL NOT` / `MUST` (normative language)
- Scenarios use `WHEN` / `THEN` (testable conditions)
- Every requirement MUST have at least one scenario

## Content Rules

- **Minimum:** 2 requirements per spec. Every requirement MUST have at least 1 scenario. Never empty.
- Use the user's own words in descriptions
- Requirements use formal SHALL language (for machine precision)
- Scenarios use WHEN/THEN (for testability)
- "Out of Scope" must have at least 1 item

## Language Rules

- If the user said "spreadsheet," write "spreadsheet" not "CSV export"
- Plain English in all descriptions — no engineering jargon
- SHALL statements are the one exception: formal language is required for precision
- The user sees a plain-English summary, not the raw spec format

## After Generation

1. Run `openspec validate` — fix any issues before showing the user
2. Show a plain-English summary (not the raw spec)
3. Ask for approval before proceeding
4. If revisions needed: update spec, re-validate, re-show

## For Spec Changes

When modifying an existing spec:
1. Create a new OpenSpec change with delta specs
2. Use `## MODIFIED Requirements` for changed requirements (copy full content)
3. Use `## ADDED Requirements` for new requirements
4. Use `## REMOVED Requirements` for deprecated requirements (include Reason + Migration)
5. Validate and show summary before proceeding
