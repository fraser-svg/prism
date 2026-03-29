---
name: spec-generator
description: |
  Generates a structured OpenSpec change from sharpened user intent. Writes proposal.md and spec.md in the canonical SHALL/WHEN/THEN format, validates them, and returns a plain-English summary for user approval.
  Activates on patterns:
  - build me .+
  - create .+ (feature|page|api|endpoint|component)
  - add .+ to (the )?(app|product|site)
  - I (want|need) .+
  - spec(ify)? .+
  - generate (a )?spec
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# Spec Generator

**Version:** 1.0.0

## Purpose

Converts a user's natural-language request (after sharpening questions) into a validated OpenSpec change. This is the canonical artifact that Stage 3 Build reads. Without a valid spec, nothing gets built — this skill is the bridge between intent and execution.

## Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `feature_name` | string | required | Kebab-case name for the change directory (e.g. "add-auth", "user-dashboard"). Created by the Operator after sharpening questions.  |
| `summary` | string | required | Plain-English summary of what to build, distilled from the sharpening conversation. Includes scope, definition of done, and out-of-scope items.  |
| `project_root` | filepath | required | Absolute path to the project root (output of git rev-parse --show-toplevel).  |

## Outputs

| Name | Type | Description |
|------|------|-------------|
| `proposal_md` | file | Written to openspec/changes/{feature_name}/proposal.md. Contains the Why and What derived from the sharpening conversation.  |
| `spec_md` | file | Written to openspec/changes/{feature_name}/specs/{feature_name}/spec.md. Contains formal SHALL/WHEN/THEN requirements (min 2 requirements, min 1 scenario each).  |
| `plain_english_summary` | string | Human-readable checklist returned to the Operator for progressive-disclosure approval. Never exposes raw spec syntax to the user.  |

## Stages

### Stage 1: Scaffold

Run `openspec new change "{feature_name}"` (or mkdir fallback) to create the change directory structure. 

_Auto-advances on success._

### Stage 2: Write Proposal

Write proposal.md with the Why (user's goal) and What (scope and out-of-scope) derived from the sharpening conversation. 

_Auto-advances on success._

### Stage 3: Write Spec

Write spec.md with formal SHALL/WHEN/THEN requirements. Minimum 2 requirements, each with at least 1 WHEN/THEN scenario. 

_Auto-advances on success._

### Stage 4: Validate

Run `openspec validate "{feature_name}" --type change`. Fix any formatting errors before returning. Never return an invalid spec. 

_Auto-advances on success._

### Stage 5: Summarize

Extract requirements as a plain-English numbered checklist (no raw spec syntax). Return this summary to the Operator for user approval. 

## Scripts

| Script | Path | When |
|--------|------|------|
| openspec-validate | `$SKILL_DIR/scripts/prism-verify.sh` | on_complete |
| auto-save | `$SKILL_DIR/scripts/prism-save.sh` | on_complete |

## References

### Spec Format Rules

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

- [Product Context](../../references/product-context.md)

## Rules

1. Requirements use exactly ### (3 hashtags). Scenarios use exactly #### (4 hashtags).
2. Every requirement MUST use SHALL, SHALL NOT, or MUST — not 'should' or 'will'.
3. Every requirement MUST have at least one Scenario with WHEN and THEN.
4. Minimum 2 requirements per spec. Never write an empty or single-requirement spec.
5. Out of Scope section MUST have at least 1 item.
6. Use the user's own words in descriptions, not engineering jargon.
7. Never return raw spec format to the user — always summarize in plain English.
8. Validate with openspec before returning. Fix issues before surfacing to Operator.
9. If openspec CLI is not installed, fall back to manual mkdir and skip validate step.
10. Return the plain-English summary as the output, NOT the file paths.

## Examples

**Input:** `add-auth: User wants login with Google and email/password`
**Expected:** Creates openspec/changes/add-auth/proposal.md and openspec/changes/add-auth/specs/add-auth/spec.md with requirements for Google OAuth and email/password login, each with WHEN/THEN scenarios. Returns a plain-English checklist: "1. Login with Google account, 2. Login with email and password, 3. Stay logged in between sessions." 

**Input:** `user-dashboard: User wants to see their activity feed and profile stats`
**Expected:** Creates spec with 2+ requirements for activity feed display and profile stats. Validates successfully. Returns: "1. View recent activity feed, 2. See profile statistics summary." 

## Eval Cases

### valid_spec_structure

**Input:** `test-feature: Build a button that sends an email`

**Must contain:**
- `SHALL`
- `WHEN`
- `THEN`
- `### Requirement`
- `#### Scenario`

**Must not contain:**
- `undefined`
- `TODO`

### plain_english_summary_returned

**Input:** `contact-form: Add a contact form with name, email, message fields`

**Must contain:**
- `contact form`
- `name`
- `email`

**Must not contain:**
- `SHALL`
- `openspec`

---
_Compiled by prism-compile.sh from spec-generator.yaml_
