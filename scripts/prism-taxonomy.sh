#!/usr/bin/env bash
# prism-taxonomy.sh — Failure-Class Taxonomy for Prism Continuous Intelligence
#
# Usage:
#   prism-taxonomy.sh check <root> <approach_text>    — Check approach against known failure classes
#   prism-taxonomy.sh add   <root> <entry_json>       — Add or update a taxonomy entry (use "-" for stdin)
#   prism-taxonomy.sh list  <root>                    — List all taxonomy entries with hit counts
#   prism-taxonomy.sh grow  <root> <failure_json>     — Extract new failure class from Guardian event
#
# Output: writes full JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed (see stderr).
set -uo pipefail

# --- Dependency check ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi

# --- Constants ---
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SKILL_DIR=$(dirname "$SCRIPT_DIR")
TAXONOMY_FILE="$SKILL_DIR/references/failure-taxonomy.json"

# --- Helpers ---
_sanitize_arg() {
  local result
  result=$(printf '%s' "$1" | tr -d '`$();|&<>!/' | tr -s ' ')
  case "$result" in
    *..*) echo "ERROR: invalid argument (path traversal)" >&2; return 1 ;;
  esac
  printf '%s' "$result"
}

_tmp_output() {
  printf '/tmp/prism-taxonomy-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

_read_taxonomy() {
  if [ ! -f "$TAXONOMY_FILE" ]; then
    echo ""
    return 1
  fi
  local content
  if ! content=$(jq '.' "$TAXONOMY_FILE" 2>/dev/null); then
    echo ""
    return 2
  fi
  printf '%s' "$content"
}

_atomic_write_taxonomy() {
  local content="$1"
  local dir; dir=$(dirname "$TAXONOMY_FILE")
  mkdir -p "$dir"
  local tmp_file="${TAXONOMY_FILE}.tmp.$$"
  if ! printf '%s' "$content" | jq empty 2>/dev/null; then
    echo "ERROR: refusing to write invalid JSON to taxonomy" >&2
    return 1
  fi
  [ -f "$TAXONOMY_FILE" ] && cp "$TAXONOMY_FILE" "${TAXONOMY_FILE}.bak" 2>/dev/null || true
  printf '%s' "$content" > "$tmp_file"
  mv "$tmp_file" "$TAXONOMY_FILE"
}

_slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '-' | sed 's/^-//;s/-$//'
}

# --- Commands ---

cmd_check() {
  local approach_text="$1"

  local taxonomy
  taxonomy=$(_read_taxonomy)
  local rc=$?
  if [ $rc -eq 1 ]; then
    _write_output "SKIP: taxonomy file not found" '{"matched":[],"unmatched":[],"skipped":true,"reason":"taxonomy file not found"}'
    return 0
  fi
  if [ $rc -eq 2 ]; then
    _write_output "SKIP: taxonomy file malformed" '{"matched":[],"unmatched":[],"skipped":true,"reason":"taxonomy file malformed"}'
    return 0
  fi

  # Lowercase the approach text for case-insensitive matching
  local approach_lower
  approach_lower=$(printf '%s' "$approach_text" | tr '[:upper:]' '[:lower:]')

  # Check each entry's detection_keywords against the approach text
  local result
  result=$(printf '%s' "$taxonomy" | jq --arg text "$approach_lower" '
    [.[] | . as $entry |
      {
        entry: $entry,
        matched: ([.detection_keywords[] | select(. as $kw | $text | contains($kw))] | length > 0)
      }
    ] |
    {
      matched: [.[] | select(.matched) | .entry],
      unmatched: [.[] | select(.matched | not) | .entry]
    }
  ')

  local matched_count; matched_count=$(printf '%s' "$result" | jq '.matched | length')
  local total_count; total_count=$(printf '%s' "$taxonomy" | jq 'length')
  _write_output "OK: $matched_count/$total_count failure classes matched" "$result"
}

cmd_add() {
  local entry_json="$1"

  # Read from stdin if argument is "-"
  if [ "$entry_json" = "-" ]; then
    entry_json=$(cat)
  fi

  # Validate JSON
  if ! printf '%s' "$entry_json" | jq empty 2>/dev/null; then
    echo "ERROR: entry_json is not valid JSON" >&2
    return 1
  fi

  # Validate required fields
  local missing
  missing=$(printf '%s' "$entry_json" | jq -r '
    [
      (if .id         then empty else "id"         end),
      (if .category   then empty else "category"   end),
      (if .description then empty else "description" end),
      (if .detection_keywords then empty else "detection_keywords" end),
      (if .mitigation then empty else "mitigation" end),
      (if .source     then empty else "source"     end)
    ] | join(", ")
  ')
  if [ -n "$missing" ]; then
    echo "ERROR: missing required fields: $missing" >&2
    return 1
  fi

  # Read current taxonomy (or start empty array)
  local taxonomy
  taxonomy=$(_read_taxonomy) || taxonomy='[]'
  if [ -z "$taxonomy" ]; then
    taxonomy='[]'
  fi

  local entry_id
  entry_id=$(printf '%s' "$entry_json" | jq -r '.id')
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Check for duplicate
  local existing_count
  existing_count=$(printf '%s' "$taxonomy" | jq --arg id "$entry_id" '[.[] | select(.id == $id)] | length')

  if [ "$existing_count" -gt 0 ]; then
    # Duplicate: increment hit_count, update added_at
    local updated
    updated=$(printf '%s' "$taxonomy" | jq --arg id "$entry_id" --arg now "$now" '
      map(if .id == $id then .hit_count += 1 | .added_at = $now else . end)
    ')
    _atomic_write_taxonomy "$updated"
    local entry_out
    entry_out=$(printf '%s' "$updated" | jq --arg id "$entry_id" '[.[] | select(.id == $id)][0]')
    local new_hits; new_hits=$(printf '%s' "$entry_out" | jq '.hit_count')
    _write_output "OK: dedup $entry_id (hit_count=$new_hits)" "$entry_out"
  else
    # New entry: ensure defaults
    local normalized
    normalized=$(printf '%s' "$entry_json" | jq --arg now "$now" '
      . + {
        added_at: (.added_at // $now),
        hit_count: (.hit_count // 0)
      }
    ')
    local updated
    updated=$(printf '%s' "$taxonomy" | jq --argjson entry "$normalized" '. + [$entry]')
    _atomic_write_taxonomy "$updated"
    _write_output "OK: added $entry_id" "$normalized"
  fi
}

cmd_list() {
  local taxonomy
  taxonomy=$(_read_taxonomy) || taxonomy='[]'
  if [ -z "$taxonomy" ]; then
    taxonomy='[]'
  fi

  local total; total=$(printf '%s' "$taxonomy" | jq 'length')
  local total_hits; total_hits=$(printf '%s' "$taxonomy" | jq '[.[].hit_count] | add // 0')
  _write_output "OK: $total entries, $total_hits total hits" "$taxonomy"
}

cmd_grow() {
  local failure_json="$1"

  # Validate JSON
  if ! printf '%s' "$failure_json" | jq empty 2>/dev/null; then
    echo "ERROR: failure_json is not valid JSON" >&2
    return 1
  fi

  # Extract fields
  local error_category; error_category=$(printf '%s' "$failure_json" | jq -r '.error_category // ""')
  local error_summary; error_summary=$(printf '%s' "$failure_json" | jq -r '.error_summary // ""')
  local task_domain; task_domain=$(printf '%s' "$failure_json" | jq -r '.task_domain // ""')
  local approach_used; approach_used=$(printf '%s' "$failure_json" | jq -r '.approach_used // ""')

  if [ -z "$error_category" ]; then
    echo "ERROR: failure_json must have error_category" >&2
    return 1
  fi

  # Auto-generate id
  local gen_id; gen_id=$(_slugify "$error_category")

  # Auto-generate detection_keywords from error_summary words (lowercase, unique, min 3 chars)
  local gen_keywords
  gen_keywords=$(printf '%s' "$error_summary" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' | awk 'length >= 3' | sort -u | jq -R . | jq -s '.')

  # Infer category from error_category
  local gen_category
  gen_category=$(printf '%s' "$error_category" | tr '[:upper:]' '[:lower:]')
  case "$gen_category" in
    *detect*|*render*|*block*|*cdn*|*network*)
      gen_category="detection" ;;
    *coverage*|*page*|*scope*|*incomplete*)
      gen_category="coverage" ;;
    *epistem*|*binary*|*false*|*confidence*)
      gen_category="epistemology" ;;
    *arch*|*design*|*structure*)
      gen_category="architecture" ;;
    *)
      gen_category="detection" ;;
  esac

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local description="Failure class auto-extracted from Guardian: $error_category"
  [ -n "$task_domain" ] && description="$description (domain: $task_domain)"

  local mitigation="Review approach: $approach_used"

  # Build entry
  local entry
  entry=$(jq -cn \
    --arg id "$gen_id" \
    --arg category "$gen_category" \
    --arg description "$description" \
    --argjson keywords "$gen_keywords" \
    --arg mitigation "$mitigation" \
    --arg now "$now" \
    '{
      id: $id,
      category: $category,
      description: $description,
      detection_keywords: $keywords,
      mitigation: $mitigation,
      source: "guardian",
      added_at: $now,
      hit_count: 0
    }')

  # Check for duplicates before adding
  local taxonomy
  taxonomy=$(_read_taxonomy) || taxonomy='[]'
  if [ -z "$taxonomy" ]; then
    taxonomy='[]'
  fi

  local existing_count
  existing_count=$(printf '%s' "$taxonomy" | jq --arg id "$gen_id" '[.[] | select(.id == $id)] | length')

  if [ "$existing_count" -gt 0 ]; then
    # Duplicate: increment hit_count
    local updated
    updated=$(printf '%s' "$taxonomy" | jq --arg id "$gen_id" --arg now "$now" '
      map(if .id == $id then .hit_count += 1 | .added_at = $now else . end)
    ')
    _atomic_write_taxonomy "$updated"
    local entry_out
    entry_out=$(printf '%s' "$updated" | jq --arg id "$gen_id" '[.[] | select(.id == $id)][0]')
    _write_output "OK: grow dedup $gen_id (already exists)" "$entry_out"
  else
    local updated
    updated=$(printf '%s' "$taxonomy" | jq --argjson entry "$entry" '. + [$entry]')
    _atomic_write_taxonomy "$updated"
    _write_output "OK: grew new class $gen_id" "$entry"
  fi
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-taxonomy.sh <command> <root> [args...]" >&2
  echo "Commands: check, add, list, grow" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  check)
    APPROACH="${3:-}"
    [ -z "$APPROACH" ] && { echo "ERROR: approach_text required" >&2; exit 1; }
    cmd_check "$APPROACH"
    ;;
  add)
    ENTRY="${3:-}"
    [ -z "$ENTRY" ] && { echo "ERROR: entry_json required (use \"-\" for stdin)" >&2; exit 1; }
    cmd_add "$ENTRY"
    ;;
  list)
    cmd_list
    ;;
  grow)
    FAILURE="${3:-}"
    [ -z "$FAILURE" ] && { echo "ERROR: failure_json required" >&2; exit 1; }
    cmd_grow "$FAILURE"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: check, add, list, grow" >&2
    exit 1
    ;;
esac
