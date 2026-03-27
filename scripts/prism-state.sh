#!/usr/bin/env bash
# prism-state.sh — Generate STATE.md from registry + product data
# Reads .prism/registry.json, PRODUCT.md, DECISIONS.md, and session context
# to produce a generated STATE.md at the project root.
#
# Usage: prism-state.sh <project-root>
#
# Output: writes STATE.md to project root, writes JSON summary to temp file,
#         prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed.
set -uo pipefail

# --- Helpers ---
_tmp_output() {
  printf '/tmp/prism-state-%s.json' "$$"
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
  echo "Usage: prism-state.sh <root>" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

cd "$ROOT" || exit 1

# Check for jq
HAS_JQ=false
command -v jq >/dev/null 2>&1 && HAS_JQ=true

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- 1. Read registry ---
REG=".prism/registry.json"
CHANGE_NAME=""
STAGE=""
STAGE_LABEL=""
BRANCH=""
WORKERS_COMPLETED=0
WORKERS_TOTAL=0
LAST_SAVE=""
LAST_SAVE_COMMIT=""
LAST_ACTION=""
BLOCKERS="None"
NEXT_STEPS=""
HAS_REGISTRY=false

if [ -f "$REG" ] && [ "$HAS_JQ" = true ] && jq empty "$REG" 2>/dev/null; then
  HAS_REGISTRY=true
  CHANGE_NAME=$(jq -r '.change.name // ""' "$REG")
  STAGE=$(jq -r '.change.stage // "unknown"' "$REG")
  BRANCH=$(jq -r '.change.branch // "unknown"' "$REG")
  WORKERS_TOTAL=$(jq '.workers | length' "$REG" 2>/dev/null || echo "0")
  WORKERS_COMPLETED=$(jq '[.workers[] | select(.status == "completed")] | length' "$REG" 2>/dev/null || echo "0")
  LAST_SAVE=$(jq -r '.change.last_save // "never"' "$REG")
  LAST_SAVE_COMMIT=$(jq -r '.change.last_save_commit // "none"' "$REG")

  # Stage label mapping
  case "$STAGE" in
    understand) STAGE_LABEL="Understand" ;;
    planned)    STAGE_LABEL="Plan" ;;
    built)      STAGE_LABEL="Build" ;;
    archived)   STAGE_LABEL="Shipped" ;;
    *)          STAGE_LABEL="$STAGE" ;;
  esac

  # Read checkpoint for next_steps, open_questions, last action
  CP_NEXT=$(jq -r '.checkpoint.next_steps[]? // empty' "$REG" 2>/dev/null || true)
  if [ -n "$CP_NEXT" ]; then
    NEXT_STEPS="$CP_NEXT"
  fi

  CP_QUESTIONS=$(jq -r '.checkpoint.open_questions[]? // empty' "$REG" 2>/dev/null || true)
  if [ -n "$CP_QUESTIONS" ]; then
    BLOCKERS="$CP_QUESTIONS"
  fi

  # Last action from checkpoint progress or last event
  CP_PROGRESS=$(jq -r '.checkpoint.progress // ""' "$REG" 2>/dev/null || echo "")
  if [ -n "$CP_PROGRESS" ]; then
    LAST_ACTION="$CP_PROGRESS"
  else
    # Fall back to last event message
    LAST_EVENT=$(jq -r '.events[-1].message // ""' "$REG" 2>/dev/null || echo "")
    if [ -n "$LAST_EVENT" ]; then
      LAST_ACTION="$LAST_EVENT"
    else
      LAST_ACTION="No recorded actions yet"
    fi
  fi
fi

# --- 2. Read session context for richer data ---
SESSION_FILE=""
if [ -f ".prism/session-context.md" ]; then
  SESSION_FILE=".prism/session-context.md"
elif [ -d "openspec/changes" ]; then
  SESSION_FILE=$(find openspec/changes -name "session-context.md" -type f 2>/dev/null | head -1 || true)
fi

# --- 3. Read recent decisions from DECISIONS.md ---
RECENT_DECISIONS=""
if [ -f "DECISIONS.md" ]; then
  # Extract last 5 ADR headings (### ADR-N: Title lines)
  RECENT_DECISIONS=$(grep '^### ADR-' DECISIONS.md 2>/dev/null | tail -5 | sed 's/^### /- /' || true)
fi

# --- 4. Generate STATE.md ---
STATE_MD="# State
Generated: ${NOW} — do not edit manually.

## Active Work
- **Change:** ${CHANGE_NAME:-None}
- **Stage:** ${STAGE:-unknown} (${STAGE_LABEL:-unknown})
- **Branch:** ${BRANCH:-unknown}

## Progress
- **Workers:** ${WORKERS_COMPLETED}/${WORKERS_TOTAL}
- **Last save:** ${LAST_SAVE:-never} (${LAST_SAVE_COMMIT:-none})
- **Last action:** ${LAST_ACTION:-None}

## Blockers
"

# Format blockers
if [ "$BLOCKERS" = "None" ]; then
  STATE_MD="${STATE_MD}None
"
else
  STATE_MD="${STATE_MD}$(printf '%s\n' "$BLOCKERS" | sed 's/^/- /')
"
fi

STATE_MD="${STATE_MD}
## Next Steps
"

# Format next steps
if [ -n "$NEXT_STEPS" ]; then
  STATE_MD="${STATE_MD}$(printf '%s\n' "$NEXT_STEPS" | sed 's/^/- /')
"
else
  STATE_MD="${STATE_MD}None
"
fi

STATE_MD="${STATE_MD}
## Recent Decisions
"

if [ -n "$RECENT_DECISIONS" ]; then
  STATE_MD="${STATE_MD}${RECENT_DECISIONS}
"
else
  STATE_MD="${STATE_MD}None yet
"
fi

# Write STATE.md
printf '%s' "$STATE_MD" > "$ROOT/STATE.md"

# --- 5. Build JSON output ---
if [ "$HAS_JQ" = true ]; then
  JSON=$(jq -n \
    --arg status "generated" \
    --arg timestamp "$NOW" \
    --arg change "$CHANGE_NAME" \
    --arg stage "$STAGE" \
    --arg stage_label "$STAGE_LABEL" \
    --arg branch "$BRANCH" \
    --argjson workers_completed "$WORKERS_COMPLETED" \
    --argjson workers_total "$WORKERS_TOTAL" \
    --arg last_save "$LAST_SAVE" \
    --arg last_action "$LAST_ACTION" \
    --argjson has_registry "$( [ "$HAS_REGISTRY" = true ] && echo 'true' || echo 'false' )" \
    --argjson has_product "$([ -f "$ROOT/PRODUCT.md" ] && echo 'true' || echo 'false')" \
    --argjson has_decisions "$([ -f "$ROOT/DECISIONS.md" ] && echo 'true' || echo 'false')" \
    '{
      status: $status,
      timestamp: $timestamp,
      change: $change,
      stage: $stage,
      stage_label: $stage_label,
      branch: $branch,
      workers: { completed: $workers_completed, total: $workers_total },
      last_save: $last_save,
      last_action: $last_action,
      has_registry: $has_registry,
      has_product: $has_product,
      has_decisions: $has_decisions
    }')
else
  JSON="{\"status\":\"generated\",\"timestamp\":\"$NOW\",\"has_registry\":$HAS_REGISTRY}"
fi

_write_output "OK: STATE.md generated (change=$CHANGE_NAME stage=$STAGE)" "$JSON"
