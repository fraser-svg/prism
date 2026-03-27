# Ship Readiness

> Version: 1.0.0

## Description

Runs the pre-ship checklist for a completed Prism build: squashes auto-save commits, creates a pull request, archives the OpenSpec change, and updates PRODUCT.md to reflect shipped status.

**Activates when user input matches:**
- `ship( it)?$`
- `deploy( this)?$`
- `create (a )?pull request`
- `open (a )?pr`
- `push (to )?(main|prod|production)`
- `we.re done`
- `release`

## Purpose

Closes the loop on a completed build by producing a clean git history, a reviewable pull request, and updated product memory. Without this step, auto-save commits accumulate as noise and PRODUCT.md stays stale. This skill is the canonical "done" gate for every Prism build cycle.

## Sandbox

**Allowed tools:**
- Bash
- Read
- Write
- Edit
- Grep
- Glob

## Expected Inputs

- `change_name` (string, **required**): The OpenSpec change name (e.g., "add-auth"). Used to locate the spec, archive the change, and label the squash commit. 
- `project_root` (filepath, **required**): Absolute path to the project root. 
- `squash_message` (string, optional): Optional override for the squash commit message. Defaults to "feat: {change_name} — built by Prism". 

## Steps

1. **preflight:** Verify the build is actually done: all spec requirements are addressed, QA passed, no uncommitted changes outside auto-save commits. If anything looks incomplete, surface to the Operator before proceeding. 
2. **squash:** Squash all `wip:` auto-save commits on the current branch into one clean commit with a conventional-commit message (feat/fix/chore). Preserve non-wip commits (user-authored or milestone commits). 
3. **push:** Push the squashed branch to origin. If push is rejected (non-fast-forward), rebase on main and retry once. 
4. **create pr:** Create a pull request via `gh pr create`. Title from change_name, body includes: what was built (plain English), test instructions, and the Prism auto-generated notice. 
5. **archive spec:** Run `openspec archive "{change_name}" -y` to mark the change as shipped. If openspec is not installed, move the change directory to openspec/archive/{change_name}/. 
6. **update product md:** Update PRODUCT.md: set current phase status to "shipped", add the change to the shipped history, and suggest the next logical phase. 

## Instructions

Follow these rules strictly:

- Never squash commits that are not prefixed with 'wip:' — preserve user-authored commits.
- The squash commit message MUST follow conventional commits format (feat:, fix:, chore:).
- If gh CLI is not installed, output the PR details as markdown and tell the user to create it manually.
- If push is rejected, rebase on main (not merge) and retry exactly once.
- Archive the OpenSpec change only AFTER the PR is successfully created.
- PRODUCT.md update runs only after archive succeeds — in that order.
- If any step fails, surface to Operator with the exact error — do not silently skip steps.
- The PR body must be in plain English. No raw spec syntax, no engineering jargon.
- Include the Prism version in the PR body footer for audit trail.
- If there are no auto-save commits to squash (user built manually), skip squash stage.

## Outputs

- `pr_url` (string): URL of the created pull request. Surfaced to the user in plain English. 
- `squash_commit_sha` (string): SHA of the squash commit. Written to the registry for audit trail. 
- `archived_spec_path` (file): Path to the archived OpenSpec change directory. Confirms the change was cleanly closed. 

## Examples

**Input:** add-auth: Ship the authentication feature
**Expected:** Squashes all `wip: spec generated for add-auth` and `wip: built auth middleware (1/3)` commits into one `feat: add-auth — built by Prism`. Creates PR with title "feat: add-auth" and plain-English body. Archives openspec/changes/add-auth/. Updates PRODUCT.md. Returns PR URL. 

**Input:** user-dashboard: Ship with custom message 'feat: user dashboard v1'
**Expected:** Uses custom squash message. Creates PR. All other steps identical. 

---
_Compiled by prism-compile.sh from ship-readiness.yaml_
