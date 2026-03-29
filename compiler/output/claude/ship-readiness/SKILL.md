---
name: ship-readiness
description: |
  Runs the ship workflow for a completed Prism build: squashes all branch commits into one clean conventional commit, creates a rich pull request, optionally deploys, archives the spec, updates product memory, and records a durable ship receipt.
  Activates on patterns:
  - ship( it)?$
  - create (a )?pull request
  - open (a )?pr
  - push (to )?(main|prod|production)
  - we.re done
  - release
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# Ship Readiness

**Version:** 2.0.0

## Purpose

Closes the loop on a completed build by producing a clean git history, a reviewable pull request with rich context from spec entities, optional deployment, and updated product memory. The typed bridge CLI handles all git operations deterministically — no LLM-guessed git commands.

## Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `change_name` | string | required | The spec ID / change name (e.g., "add-auth"). Used to locate the spec entity, read reviews, and label the commit. |
| `project_root` | filepath | required | Absolute path to the project root. |
| `base_branch` | string | optional | Target branch for the PR. Defaults to "main". |
| `commit_message` | string | optional | Optional override for the commit message. If omitted, derived from the spec entity title and acceptance criteria count. |

## Outputs

| Name | Type | Description |
|------|------|-------------|
| `ship_result` | json | Full ship result JSON including squash, push, PR, tag, and deploy status. |
| `pr_url` | string | URL of the created pull request. |
| `receipt_path` | file | Path to the ship receipt JSON at .prism/ships/{specId}/receipt.json. |

## Stages

### Stage 1: Preflight

Verify the build is actually done: run advisory release-state and check-reviews batch call. Log results but don't block. If release state shows "hold", note missing evidence in the build log.

### Stage 2: Ship

Run $BRIDGE ship to squash all commits on the branch into one clean conventional commit via git reset --soft to merge-base, push to origin, create a rich PR from spec + reviews + verification, and tag the commit. Prism owns the branch — all commits are squashed regardless of prefix.

_Auto-advances on success._

### Stage 3: Deploy

Run $BRIDGE deploy-detect to check for deployment platforms (Vercel, Netlify, Railway, Fly.io, Render). If detected, ask the user before triggering. If auto-deploy is configured, note it. Never auto-trigger.

### Stage 4: Archive And Update

Archive the registry entry, archive the openspec change (best-effort), update product memory with "Last Shipped" section, and record the ship receipt to .prism/ships/{specId}/receipt.json.

_Auto-advances on success._

### Stage 5: Receipt

Present the structured ship receipt to the user: what was built, requirements verified, review verdicts, PR URL, commit, tag, deploy status, and what's next. Offer branch cleanup and auto-merge.

## Scripts

| Script | Path | When |
|--------|------|------|
| registry-archive | `$SKILL_DIR/scripts/prism-registry.sh` | on_complete |
| state-update | `$SKILL_DIR/scripts/prism-state.sh` | on_complete |
| bridge-ship | `$BRIDGE ship` | core |
| bridge-deploy-detect | `$BRIDGE deploy-detect` | optional |
| bridge-deploy-trigger | `$BRIDGE deploy-trigger` | optional |
| bridge-record-ship | `$BRIDGE record-ship` | on_complete |

## Rules

1. Squash all commits on the branch into one clean conventional commit via git reset --soft to merge-base. Prism owns the branch.
2. The squash commit message MUST follow conventional commits format (feat:, fix:, chore:).
3. Smart commit messages: derive from spec entity title + acceptance criteria count when available.
4. Rich PR body: include spec summary, requirements checklist, review verdicts table, and verification results in collapsible GitHub sections.
5. If gh CLI is not installed, output the PR details and tell the user to create it manually.
6. If push is rejected, fetch + rebase on base branch and retry exactly once. If conflict, abort rebase and report.
7. Never auto-deploy. Always ask the user before triggering a deploy.
8. Archive the OpenSpec change only AFTER the PR is successfully created.
9. Product memory update runs only after archive succeeds — in that order.
10. Ship receipt is written after all other steps — it captures the complete outcome.
11. If any step fails, surface to Operator with the exact error — do not silently skip steps.
12. Each ship step is independently safe — partial completion never leaves broken state.
13. Git tag uses prism/{specId_slug} derived from spec title, not product/phase.
14. Branch cleanup and auto-merge are offered but never forced.

## Examples

**Input:** `add-auth: Ship the authentication feature`
**Expected:** Reads spec entity for "add-auth" → "feat: Add JWT Authentication — 3 requirements verified". Squashes all commits, pushes, creates PR with rich body (spec summary, requirements checklist, review table). Tags as prism/add-jwt-authentication. Archives spec. Records receipt.

**Input:** `user-dashboard: Ship with custom message 'feat: user dashboard v1'`
**Expected:** Uses custom commit message override. Creates PR with rich body from spec entity. All other steps identical.

**Input:** `contact-form: Ship (with Vercel detected)`
**Expected:** Ships normally. deploy-detect finds vercel.json. Asks user "Want me to deploy?" If yes, triggers vercel --prod with health check.

## Eval Cases

### pr_url_returned

**Input:** `test-feature: Ship`

**Must contain:**
- `github.com`
- `pull`

**Must not contain:**
- `error`
- `failed`

### squash_conventional_commit

**Input:** `add-login: Ship`

**Must contain:**
- `feat:`

**Must not contain:**
- `wip:`

### rich_pr_body

**Input:** `add-auth: Ship`

**Must contain:**
- `What was built`
- `Requirements`
- `Review Results`

### deploy_detect_vercel

**Input:** `my-app: Ship (vercel.json exists)`

**Must contain:**
- `vercel`
- `deploy`

### ship_receipt_persisted

**Input:** `add-auth: Ship`

**Must contain:**
- `receipt`
- `commitSha`

---
_Compiled by prism-compile.sh from ship-readiness.yaml_
