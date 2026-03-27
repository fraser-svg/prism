# Spec Generator

> Version: 1.0.0

## Description

Generates a structured OpenSpec change from sharpened user intent. Writes proposal.md and spec.md in the canonical SHALL/WHEN/THEN format, validates them, and returns a plain-English summary for user approval.

**Activates when user input matches:**
- `build me .+`
- `create .+ (feature|page|api|endpoint|component)`
- `add .+ to (the )?(app|product|site)`
- `I (want|need) .+`
- `spec(ify)? .+`
- `generate (a )?spec`

## Purpose

Converts a user's natural-language request (after sharpening questions) into a validated OpenSpec change. This is the canonical artifact that Stage 3 Build reads. Without a valid spec, nothing gets built — this skill is the bridge between intent and execution.

## Sandbox

**Allowed tools:**
- Bash
- Read
- Write
- Edit
- Grep
- Glob

## Expected Inputs

- `feature_name` (string, **required**): Kebab-case name for the change directory (e.g. "add-auth", "user-dashboard"). Created by the Operator after sharpening questions. 
- `summary` (string, **required**): Plain-English summary of what to build, distilled from the sharpening conversation. Includes scope, definition of done, and out-of-scope items. 
- `project_root` (filepath, **required**): Absolute path to the project root (output of git rev-parse --show-toplevel). 

## Steps

1. **scaffold:** Run `openspec new change "{feature_name}"` (or mkdir fallback) to create the change directory structure. 
2. **write proposal:** Write proposal.md with the Why (user's goal) and What (scope and out-of-scope) derived from the sharpening conversation. 
3. **write spec:** Write spec.md with formal SHALL/WHEN/THEN requirements. Minimum 2 requirements, each with at least 1 WHEN/THEN scenario. 
4. **validate:** Run `openspec validate "{feature_name}" --type change`. Fix any formatting errors before returning. Never return an invalid spec. 
5. **summarize:** Extract requirements as a plain-English numbered checklist (no raw spec syntax). Return this summary to the Operator for user approval. 

## Instructions

Follow these rules strictly:

- Requirements use exactly ### (3 hashtags). Scenarios use exactly #### (4 hashtags).
- Every requirement MUST use SHALL, SHALL NOT, or MUST — not 'should' or 'will'.
- Every requirement MUST have at least one Scenario with WHEN and THEN.
- Minimum 2 requirements per spec. Never write an empty or single-requirement spec.
- Out of Scope section MUST have at least 1 item.
- Use the user's own words in descriptions, not engineering jargon.
- Never return raw spec format to the user — always summarize in plain English.
- Validate with openspec before returning. Fix issues before surfacing to Operator.
- If openspec CLI is not installed, fall back to manual mkdir and skip validate step.
- Return the plain-English summary as the output, NOT the file paths.

## Outputs

- `proposal_md` (file): Written to openspec/changes/{feature_name}/proposal.md. Contains the Why and What derived from the sharpening conversation. 
- `spec_md` (file): Written to openspec/changes/{feature_name}/specs/{feature_name}/spec.md. Contains formal SHALL/WHEN/THEN requirements (min 2 requirements, min 1 scenario each). 
- `plain_english_summary` (string): Human-readable checklist returned to the Operator for progressive-disclosure approval. Never exposes raw spec syntax to the user. 

## Examples

**Input:** add-auth: User wants login with Google and email/password
**Expected:** Creates openspec/changes/add-auth/proposal.md and openspec/changes/add-auth/specs/add-auth/spec.md with requirements for Google OAuth and email/password login, each with WHEN/THEN scenarios. Returns a plain-English checklist: "1. Login with Google account, 2. Login with email and password, 3. Stay logged in between sessions." 

**Input:** user-dashboard: User wants to see their activity feed and profile stats
**Expected:** Creates spec with 2+ requirements for activity feed display and profile stats. Validates successfully. Returns: "1. View recent activity feed, 2. See profile statistics summary." 

---
_Compiled by prism-compile.sh from spec-generator.yaml_
