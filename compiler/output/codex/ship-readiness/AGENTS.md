# Ship Readiness

> Version: 2.0.0

## Description

Runs the ship workflow for a completed Prism build: squashes all branch commits into one clean conventional commit, creates a rich pull request, optionally deploys, archives the spec, updates product memory, and records a durable ship receipt.

**Activates when user input matches:**
- `ship( it)?$`
- `create (a )?pull request`
- `open (a )?pr`
- `push (to )?(main|prod|production)`
- `we.re done`
- `release`

## Purpose

Closes the loop on a completed build by producing a clean git history, a reviewable pull request with rich context from spec entities, optional deployment, and updated product memory. The typed bridge CLI handles all git operations deterministically — no LLM-guessed git commands.

## Sandbox

**Allowed tools:**
- Bash
- Read
- Write
- Edit
- Grep
- Glob

## Expected Inputs

- `change_name` (string, **required**): The spec ID / change name (e.g., "add-auth"). Used to locate the spec entity, read reviews, and label the commit. 
- `project_root` (filepath, **required**): Absolute path to the project root. 
- `base_branch` (string, optional): Target branch for the PR. Defaults to "main". 
- `commit_message` (string, optional): Optional override for the commit message. If omitted, derived from the spec entity title and acceptance criteria count. 

## Steps

1. **preflight:** Verify the build is actually done: run advisory release-state and check-reviews batch call. Log results but don't block. If release state shows "hold", note missing evidence in the build log. 
2. **ship:** Run $BRIDGE ship to squash all commits on the branch into one clean conventional commit via git reset --soft to merge-base, push to origin, create a rich PR from spec + reviews + verification, and tag the commit. Prism owns the branch — all commits are squashed regardless of prefix. 
3. **deploy:** Run $BRIDGE deploy-detect to check for deployment platforms (Vercel, Netlify, Railway, Fly.io, Render). If detected, ask the user before triggering. If auto-deploy is configured, note it. Never auto-trigger. 
4. **archive and update:** Archive the registry entry, archive the openspec change (best-effort), update product memory with "Last Shipped" section, and record the ship receipt to .prism/ships/{specId}/receipt.json. 
5. **receipt:** Present the structured ship receipt to the user: what was built, requirements verified, review verdicts, PR URL, commit, tag, deploy status, and what's next. Offer branch cleanup and auto-merge. 

## Instructions

Follow these rules strictly:

- Squash all commits on the branch into one clean conventional commit via git reset --soft to merge-base. Prism owns the branch.
- The squash commit message MUST follow conventional commits format (feat:, fix:, chore:).
- Smart commit messages: derive from spec entity title + acceptance criteria count when available.
- Rich PR body: include spec summary, requirements checklist, review verdicts table, and verification results in collapsible GitHub sections.
- If gh CLI is not installed, output the PR details and tell the user to create it manually.
- If push is rejected, fetch + rebase on base branch and retry exactly once. If conflict, abort rebase and report.
- Never auto-deploy. Always ask the user before triggering a deploy.
- Archive the OpenSpec change only AFTER the PR is successfully created.
- Product memory update runs only after archive succeeds — in that order.
- Ship receipt is written after all other steps — it captures the complete outcome.
- If any step fails, surface to Operator with the exact error — do not silently skip steps.
- Each ship step is independently safe — partial completion never leaves broken state.
- Git tag uses prism/{specId_slug} derived from spec title, not product/phase.
- Branch cleanup and auto-merge are offered but never forced.

## Outputs

- `ship_result` (json): Full ship result JSON including squash, push, PR, tag, and deploy status. 
- `pr_url` (string): URL of the created pull request. 
- `receipt_path` (file): Path to the ship receipt JSON at .prism/ships/{specId}/receipt.json. 

## Examples

**Input:** add-auth: Ship the authentication feature
**Expected:** Reads spec entity for "add-auth" → "feat: Add JWT Authentication — 3 requirements verified". Squashes all commits, pushes, creates PR with rich body (spec summary, requirements checklist, review table). Tags as prism/add-jwt-authentication. Archives spec. Records receipt. 

**Input:** user-dashboard: Ship with custom message 'feat: user dashboard v1'
**Expected:** Uses custom commit message override. Creates PR with rich body from spec entity. All other steps identical. 

**Input:** contact-form: Ship (with Vercel detected)
**Expected:** Ships normally. deploy-detect finds vercel.json. Asks user "Want me to deploy?" If yes, triggers vercel --prod with health check. 

---
_Compiled by prism-compile.sh from ship-readiness.yaml_
