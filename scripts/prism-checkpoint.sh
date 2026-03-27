#!/usr/bin/env bash
# prism-checkpoint.sh — Session context persistence for Prism v3
# Reads JSON from stdin, merges with existing checkpoint in registry.
# Also writes a human-readable session-context.md for cross-session recovery.
#
# Usage: prism-checkpoint.sh <root> <change>
# Stdin: {"stage":3,"progress":"2/4 built","decisions":["chose SQLite"],...}
#
# Output: writes JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed.
set -uo pipefail

# --- Helpers ---
_sanitize_arg() {
  printf '%s' "$1" | tr -d '`$();|&<>!'
}

_tmp_output() {
  printf '/tmp/prism-checkpoint-%s.json' "$$"
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
CHANGE="${2:-}"

if [ -z "$ROOT" ] || [ -z "$CHANGE" ]; then
  echo "Usage: prism-checkpoint.sh <root> <change>" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

CHANGE=$(_sanitize_arg "$CHANGE")

# Read checkpoint data from stdin (with timeout to prevent blocking)
STDIN_DATA=""
if [ ! -t 0 ]; then
  # Read with 1-second timeout
  STDIN_DATA=$(timeout 1 cat 2>/dev/null || cat 2>/dev/null || true)
fi

# If no stdin data, this is a no-op
if [ -z "$STDIN_DATA" ]; then
  _write_output "SKIP: no checkpoint data on stdin" '{"status":"no_data"}'
  exit 0
fi

# Validate JSON
if ! printf '%s' "$STDIN_DATA" | jq empty 2>/dev/null; then
  echo "ERROR: invalid JSON on stdin" >&2
  _write_output "ERROR: invalid JSON" '{"status":"error","reason":"invalid_json"}'
  exit 1
fi

# --- Update registry checkpoint ---
REG="$ROOT/.prism/registry.json"
if [ -f "$REG" ] && command -v jq >/dev/null 2>&1; then
  PATCH_FILE="/tmp/prism-cp-patch-$$.json"
  printf '%s' "$STDIN_DATA" > "$PATCH_FILE"

  # Merge checkpoint data into registry
  LOCKDIR="$ROOT/.prism/registry.lockdir"
  attempts=0
  while ! mkdir "$LOCKDIR" 2>/dev/null; do
    attempts=$((attempts + 1))
    [ "$attempts" -ge 50 ] && break
    sleep 0.1
  done

  if [ -d "$LOCKDIR" ]; then
    cp "$REG" "${REG}.bak" 2>/dev/null || true
    TMP="${REG}.tmp.$$"
    if jq --slurpfile cp "$PATCH_FILE" '.checkpoint = (.checkpoint * $cp[0])' "$REG" > "$TMP" 2>/dev/null; then
      mv "$TMP" "$REG"
    else
      rm -f "$TMP"
    fi
    rmdir "$LOCKDIR" 2>/dev/null || true
  fi

  rm -f "$PATCH_FILE"
fi

# --- Write human-readable session-context.md ---
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Extract fields for markdown
STAGE=$(printf '%s' "$STDIN_DATA" | jq -r '.stage // "unknown"' 2>/dev/null || echo "unknown")
PROGRESS=$(printf '%s' "$STDIN_DATA" | jq -r '.progress // "unknown"' 2>/dev/null || echo "unknown")

# Build markdown content
MD_CONTENT="# Session Context
Updated: $NOW

## Current State
- **Stage:** $STAGE
- **Progress:** $PROGRESS
- **Change:** $CHANGE
"

# Add decisions if present
DECISIONS=$(printf '%s' "$STDIN_DATA" | jq -r '.decisions[]? // empty' 2>/dev/null || true)
if [ -n "$DECISIONS" ]; then
  MD_CONTENT="${MD_CONTENT}
## Decisions
$(printf '%s\n' "$DECISIONS" | sed 's/^/- /')
"
fi

# Add preferences if present
PREFERENCES=$(printf '%s' "$STDIN_DATA" | jq -r '.preferences[]? // empty' 2>/dev/null || true)
if [ -n "$PREFERENCES" ]; then
  MD_CONTENT="${MD_CONTENT}
## Preferences
$(printf '%s\n' "$PREFERENCES" | sed 's/^/- /')
"
fi

# Add next steps if present
NEXT_STEPS=$(printf '%s' "$STDIN_DATA" | jq -r '.next_steps[]? // empty' 2>/dev/null || true)
if [ -n "$NEXT_STEPS" ]; then
  MD_CONTENT="${MD_CONTENT}
## Next Steps
$(printf '%s\n' "$NEXT_STEPS" | sed 's/^/- /')
"
fi

# Write to both locations
mkdir -p "$ROOT/.prism"
printf '%s' "$MD_CONTENT" > "$ROOT/.prism/session-context.md"

# Also write to openspec change directory if it exists
CHANGE_DIR="$ROOT/openspec/changes/$CHANGE"
if [ -d "$CHANGE_DIR" ]; then
  printf '%s' "$MD_CONTENT" > "$CHANGE_DIR/session-context.md"
fi

# Output
_write_output "OK: checkpoint saved (stage=$STAGE progress=$PROGRESS)" "$STDIN_DATA"
