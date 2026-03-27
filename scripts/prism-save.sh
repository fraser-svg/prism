#!/usr/bin/env bash
# prism-save.sh — Smart auto-save for Prism v3
# Stages tracked + new files (minus blocklist), commits, pushes.
#
# Usage: prism-save.sh <root> "<milestone>"
#
# Output: writes JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed.
set -uo pipefail

# --- Helpers ---
_sanitize_arg() {
  printf '%s' "$1" | tr -d '`$();|&<>!'
}

_tmp_output() {
  printf '/tmp/prism-save-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

# --- Main ---
ROOT="${1:-}"
MILESTONE="${2:-auto-save}"

if [ -z "$ROOT" ]; then
  echo "Usage: prism-save.sh <root> \"<milestone>\"" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

cd "$ROOT" || exit 1

# Sanitize milestone for use in commit message
MILESTONE=$(_sanitize_arg "$MILESTONE")

# Check if we're in a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  _write_output "ERROR: not a git repo" '{"status":"error","reason":"not_a_git_repo"}'
  exit 1
fi

# --- Blocklist patterns (never stage these) ---
BLOCKLIST_PATTERNS=(
  '*.env'
  '*.env.*'
  '.env*'
  '*.pem'
  '*.key'
  '*.p12'
  '*.pfx'
  '*.jks'
  '*.secret'
  '*_rsa'
  'id_ed25519'
  '.netrc'
  'aws/credentials'
  '*credential*'
  '*secret*.json'
  'serviceAccount*'
  'firebase*.json'
  'token.json'
  '.npmrc'
  'dist/'
  '.next/'
  'node_modules/'
  'coverage/'
  '.prism/worktrees/'
  '__pycache__/'
  '*.pyc'
  '.DS_Store'
  'Thumbs.db'
)

# 0. Branch safety — never commit WIP directly to main/master
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  # Derive branch name from milestone (sanitize for git)
  BRANCH_NAME="prism/$(printf '%s' "$MILESTONE" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]-' '-' | sed 's/^-//;s/-$//' | head -c 50)"
  if git checkout -b "$BRANCH_NAME" >/dev/null 2>&1; then
    CURRENT_BRANCH="$BRANCH_NAME"
  else
    # Branch may already exist — try switching to it
    git checkout "$BRANCH_NAME" >/dev/null 2>&1 || true
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  fi
fi

# 1. Stage tracked file changes (safe — only files git already knows about)
git add -u 2>/dev/null || true

# 2. Stage new untracked files, excluding blocklist
# Get untracked files (respects .gitignore automatically)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)

if [ -n "$UNTRACKED" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue

    # Check against blocklist
    blocked=false
    filename=$(basename "$file")
    for pattern in "${BLOCKLIST_PATTERNS[@]}"; do
      # Check if pattern matches the filename or the path
      case "$file" in
        $pattern) blocked=true; break ;;
      esac
      case "$filename" in
        $pattern) blocked=true; break ;;
      esac
    done

    # Also check for credential-like content in filenames (case-insensitive)
    if [ "$blocked" = false ]; then
      lower_name=$(printf '%s' "$filename" | tr '[:upper:]' '[:lower:]')
      case "$lower_name" in
        *credential*|*secret*|*password*|*auth_token*) blocked=true ;;
      esac
    fi

    if [ "$blocked" = false ]; then
      git add "$file" 2>/dev/null || true
    fi
  done <<< "$UNTRACKED"
fi

# 3. Check if there's anything to commit
STAGED=$(git diff --cached --name-only 2>/dev/null || true)
if [ -z "$STAGED" ]; then
  _write_output "SKIP: nothing to save" '{"status":"nothing_to_save"}'
  exit 0
fi

STAGED_COUNT=$(printf '%s\n' "$STAGED" | wc -l | tr -d ' ')

# 4. Commit
COMMIT_MSG="wip: ${MILESTONE} [prism auto-save]"
if ! git commit -m "$COMMIT_MSG" >/dev/null 2>&1; then
  _write_output "ERROR: commit failed" '{"status":"error","reason":"commit_failed"}'
  exit 1
fi

COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# 5. Push (best-effort — don't fail if no remote)
PUSH_STATUS="pushed"
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

if git remote get-url origin >/dev/null 2>&1; then
  # Check if upstream tracking branch exists
  if ! git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
    # Create tracking branch
    if ! git push -u origin "$BRANCH" >/dev/null 2>&1; then
      PUSH_STATUS="push_failed"
    fi
  else
    if ! git push >/dev/null 2>&1; then
      PUSH_STATUS="push_failed"
    fi
  fi
else
  PUSH_STATUS="no_remote"
fi

# 6. Output
if command -v jq >/dev/null 2>&1; then
  JSON=$(jq -n \
    --arg status "saved" \
    --arg commit "$COMMIT_SHA" \
    --argjson files_staged "$STAGED_COUNT" \
    --arg push "$PUSH_STATUS" \
    --arg branch "$BRANCH" \
    --arg milestone "$MILESTONE" \
    '{status:$status, commit:$commit, files_staged:$files_staged, push:$push, branch:$branch, milestone:$milestone}')
else
  JSON="{\"status\":\"saved\",\"commit\":\"$COMMIT_SHA\",\"files_staged\":$STAGED_COUNT,\"push\":\"$PUSH_STATUS\"}"
fi

_write_output "OK: saved $STAGED_COUNT files ($COMMIT_SHA) push=$PUSH_STATUS" "$JSON"
