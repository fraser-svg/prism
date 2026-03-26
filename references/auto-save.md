# Auto-Save — Prevent Data Loss

Prism automatically commits and pushes work-in-progress to a remote branch at key
milestones. The user never has to think about saving — it just happens.

## Why

If the user's machine crashes, all uncommitted work is lost. This is unacceptable.
Prism must ensure that significant work product is persisted to GitHub at every
milestone, not just at Stage 5 (Ship).

## When to Auto-Save

Auto-save fires at these milestones (each one uses a subagent):

| Milestone | What gets saved |
|-----------|----------------|
| Spec generated (Stage 1, Part B) | openspec/changes/{name}/ files |
| Spec approved (Stage 1, Part C) | Same + any revisions |
| Plan complete (Stage 2) | Planning artifacts |
| Design complete (Stage 2.5) | DESIGN.md, design assets |
| After each worker completes (Stage 3) | Code changes from that worker |
| QA fixes applied (Stage 4 → 3 loop) | Bug fix code |
| Design review fixes (Stage 4.5 → 3 loop) | Design fix code |

Auto-save does NOT fire at Stage 5 — that's handled by `/ship` which creates a
clean commit and PR.

## How It Works

After each milestone, dispatch a subagent:

> "You are a helper for Prism. Auto-save the current work to prevent data loss.
>
> 1. Run: `git add -A`
> 2. Check for sensitive files: `git diff --cached --name-only | grep -iE '\.env$|\.env\.|credentials|secret|\.pem$|\.key$|\.p12$|\.pfx$'`
>    If any found: run `git reset HEAD` on those files. Return 'SENSITIVE_FILES_SKIPPED: {list}'
>    alongside the save result (still proceed with the commit for non-sensitive files).
> 3. Run: `git status --short` — if nothing to commit, return 'NOTHING_TO_SAVE'
> 4. Run: `git commit -m "wip: {milestone-description} [prism auto-save]"`
> 5. Check if remote tracking branch exists: `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null`
>    - If no tracking branch: `git push -u origin HEAD`
>    - If tracking branch exists: `git push`
> 6. Return: 'SAVED' or describe any error.
>
> If push fails (no remote, auth issue, etc.): still commit locally. Local commit
> is better than nothing. Return 'COMMITTED_LOCAL_ONLY: {reason push failed}'"

## Commit Messages

Auto-save commits use this format:
```
wip: {description} [prism auto-save]
```

Examples:
- `wip: spec generated for user-auth [prism auto-save]`
- `wip: built login page (2/4 requirements) [prism auto-save]`
- `wip: QA fixes applied [prism auto-save]`

The `[prism auto-save]` suffix lets Prism identify WIP commits. Before invoking
`/ship`, Prism passes squash instructions so these get cleaned up into a single
clean commit for the PR.

## Branch Strategy

Auto-save commits go to the current working branch. Prism should ensure a feature
branch exists before the first auto-save:

- If already on a feature branch (not `main` or `master`): use it
- If on `main`/`master`: create a branch before the first auto-save:
  `git checkout -b prism/{change-name}`

## Rules

- Auto-save is SILENT. Never tell the user "I'm saving your work." Just do it.
- Auto-save failures are non-blocking. If commit or push fails, log the error
  and continue. Never interrupt the user's flow for a save failure.
- Auto-save runs via subagent — invisible to the user.
- The operation log should record each auto-save with the commit hash.
- Auto-save happens AFTER the milestone action, not before. The milestone must
  complete successfully first.
