#!/usr/bin/env bash
# prism-scan.sh — Project scan for Prism v3 Stage 0
# Detects project state: PRODUCT.md, active changes, registry, session context.
# Degrades gracefully if openspec CLI is not installed.
#
# Usage: prism-scan.sh <root>
#
# Output: writes JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed.
set -uo pipefail

# --- Helpers ---
_tmp_output() {
  printf '/tmp/prism-scan-%s.json' "$$"
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

if [ -z "$ROOT" ]; then
  echo "Usage: prism-scan.sh <root>" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

cd "$ROOT" || exit 1

# Check for jq (required for structured output)
HAS_JQ=false
command -v jq >/dev/null 2>&1 && HAS_JQ=true

# --- 1. Check if openspec CLI is available ---
HAS_OPENSPEC=false
command -v openspec >/dev/null 2>&1 && HAS_OPENSPEC=true

# --- 2. Check PRODUCT.md ---
HAS_PRODUCT=false
PRODUCT_NAME="null"
PRODUCT_VISION="null"
if [ -f "PRODUCT.md" ]; then
  HAS_PRODUCT=true
  if [ "$HAS_JQ" = true ]; then
    # Extract name (first # heading) and vision (first paragraph after it)
    PRODUCT_NAME=$(head -20 PRODUCT.md | grep '^# ' | head -1 | sed 's/^# //' || echo "")
    PRODUCT_VISION=$(head -20 PRODUCT.md | sed -n '/^# /,/^$/p' | tail -n +2 | head -3 | tr '\n' ' ' | xargs || echo "")
  fi
fi

# --- 3. List active changes ---
CHANGES="[]"
CHANGE_COUNT=0

if [ "$HAS_OPENSPEC" = true ]; then
  # Use openspec CLI if available
  OPENSPEC_OUT=$(openspec list --json 2>/dev/null || echo "[]")
  if printf '%s' "$OPENSPEC_OUT" | jq empty 2>/dev/null; then
    CHANGES="$OPENSPEC_OUT"
    CHANGE_COUNT=$(printf '%s' "$CHANGES" | jq 'length' 2>/dev/null || echo "0")
  fi
elif [ -d "openspec/changes" ]; then
  # Graceful degradation: read directory structure directly
  CHANGES="["
  first=true
  for change_dir in openspec/changes/*/; do
    [ -d "$change_dir" ] || continue
    change_name=$(basename "$change_dir")
    if [ "$first" = true ]; then
      first=false
    else
      CHANGES="${CHANGES},"
    fi
    # Check for spec files
    spec_count=$(find "$change_dir" -name "spec.md" 2>/dev/null | wc -l | tr -d ' ')
    CHANGES="${CHANGES}{\"name\":\"${change_name}\",\"specs\":${spec_count}}"
    CHANGE_COUNT=$((CHANGE_COUNT + 1))
  done
  CHANGES="${CHANGES}]"
fi

# --- 4. Read registry for active changes ---
REGISTRY_STATUS="none"
REGISTRY_STAGE="null"
REGISTRY_WORKERS=0
if [ -f ".prism/registry.json" ] && [ "$HAS_JQ" = true ]; then
  if jq empty .prism/registry.json 2>/dev/null; then
    REGISTRY_STATUS="found"
    REGISTRY_STAGE=$(jq -r '.change.stage // "unknown"' .prism/registry.json)
    REGISTRY_WORKERS=$(jq '.workers | length' .prism/registry.json 2>/dev/null || echo "0")
  else
    REGISTRY_STATUS="corrupted"
  fi
fi

# --- 5. Read session context ---
SESSION_CONTEXT="null"
SESSION_FILE=""
if [ -f ".prism/session-context.md" ]; then
  SESSION_FILE=".prism/session-context.md"
elif [ -d "openspec/changes" ]; then
  # Find session context in any active change
  SESSION_FILE=$(find openspec/changes -name "session-context.md" -type f 2>/dev/null | head -1 || true)
fi

if [ -n "$SESSION_FILE" ] && [ -f "$SESSION_FILE" ]; then
  # Read first 50 lines of session context
  SESSION_CONTEXT=$(head -50 "$SESSION_FILE" 2>/dev/null || echo "")
fi

# --- 6. Check for v2 backward compat ---
HAS_V2_LOG=false
[ -f "prism-log.md" ] && HAS_V2_LOG=true

# --- 7. Determine status ---
STATUS="NONE"
if [ "$HAS_PRODUCT" = true ] && [ "$CHANGE_COUNT" -gt 0 ]; then
  STATUS="PRODUCT_RESUME"
elif [ "$HAS_PRODUCT" = true ] && [ "$CHANGE_COUNT" -eq 0 ]; then
  STATUS="PRODUCT_NEXT"
elif [ "$CHANGE_COUNT" -gt 1 ]; then
  STATUS="MULTIPLE"
elif [ "$CHANGE_COUNT" -eq 1 ]; then
  STATUS="FOUND"
fi

# --- Build output JSON ---
if [ "$HAS_JQ" = true ]; then
  JSON=$(jq -n \
    --arg status "$STATUS" \
    --argjson has_product "$( [ "$HAS_PRODUCT" = true ] && echo 'true' || echo 'false' )" \
    --arg product_name "$PRODUCT_NAME" \
    --arg product_vision "$PRODUCT_VISION" \
    --argjson has_openspec "$( [ "$HAS_OPENSPEC" = true ] && echo 'true' || echo 'false' )" \
    --argjson changes "$CHANGES" \
    --argjson change_count "$CHANGE_COUNT" \
    --arg registry_status "$REGISTRY_STATUS" \
    --arg registry_stage "$REGISTRY_STAGE" \
    --argjson registry_workers "$REGISTRY_WORKERS" \
    --argjson has_session "$( [ -n "$SESSION_FILE" ] && echo 'true' || echo 'false' )" \
    --arg session_file "$SESSION_FILE" \
    --argjson has_v2_log "$( [ "$HAS_V2_LOG" = true ] && echo 'true' || echo 'false' )" \
    '{
      status: $status,
      product: { exists: $has_product, name: $product_name, vision: $product_vision },
      openspec: { cli_available: $has_openspec, changes: $changes, change_count: $change_count },
      registry: { status: $registry_status, stage: $registry_stage, workers: $registry_workers },
      session: { exists: $has_session, file: $session_file },
      v2_compat: { has_prism_log: $has_v2_log }
    }')
else
  JSON="{\"status\":\"$STATUS\",\"product\":{\"exists\":$HAS_PRODUCT},\"change_count\":$CHANGE_COUNT}"
fi

_write_output "OK: status=$STATUS changes=$CHANGE_COUNT product=$HAS_PRODUCT" "$JSON"
