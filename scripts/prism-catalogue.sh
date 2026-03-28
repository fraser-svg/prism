#!/usr/bin/env bash
# prism-catalogue.sh — Skill Catalogue CRUD for Prism Continuous Intelligence
#
# Usage:
#   prism-catalogue.sh query   <root> <domains-json>        — Find matching entries
#   prism-catalogue.sh record  <root> <entry-json>           — Add or update an entry
#   prism-catalogue.sh promote <root> <entry-id>             — Increment successCount
#   prism-catalogue.sh demote  <root> <entry-id> <reason>    — Increment failureCount + log reason
#   prism-catalogue.sh list    <root> [--domain <domain>]    — List entries (optionally filtered)
#   prism-catalogue.sh evict   <root>                        — Evict stale entries if over 500
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
MAX_ENTRIES=500
STALE_MONTHS=6

# --- Helpers ---
_sanitize_arg() {
  local result
  result=$(printf '%s' "$1" | tr -d '`$();|&<>!/' | tr -s ' ')
  # Reject path traversal attempts
  case "$result" in
    *..*) echo "ERROR: invalid argument (path traversal)" >&2; return 1 ;;
  esac
  printf '%s' "$result"
}

_catalogue_path() {
  printf '%s/.prism/skill-catalogue.json' "$1"
}

_tmp_output() {
  printf '/tmp/prism-catalogue-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

_read_catalogue() {
  local cat_file="$1"
  if [ ! -f "$cat_file" ]; then
    echo '{"entries":[]}'
    return 0
  fi
  local content
  if ! content=$(jq '.' "$cat_file" 2>/dev/null); then
    # Corrupt JSON — recover from .bak or start empty
    echo "WARN: catalogue corrupt, checking .bak" >&2
    if [ -f "${cat_file}.bak" ] && content=$(jq '.' "${cat_file}.bak" 2>/dev/null); then
      echo "WARN: recovered from .bak" >&2
      printf '%s' "$content"
      return 0
    fi
    # Rename corrupt file, start empty
    mv "$cat_file" "${cat_file}.corrupt.$(date +%s)" 2>/dev/null || true
    echo "WARN: starting with empty catalogue" >&2
    echo '{"entries":[]}'
    return 0
  fi
  printf '%s' "$content"
}

_atomic_write() {
  local cat_file="$1"
  local content="$2"
  local dir; dir=$(dirname "$cat_file")
  mkdir -p "$dir"
  local tmp_file="${cat_file}.tmp.$$"
  # Validate JSON before writing
  if ! printf '%s' "$content" | jq empty 2>/dev/null; then
    echo "ERROR: refusing to write invalid JSON to catalogue" >&2
    return 1
  fi
  # Backup current file
  [ -f "$cat_file" ] && cp "$cat_file" "${cat_file}.bak" 2>/dev/null || true
  # Write to tmp, then atomic move
  printf '%s' "$content" > "$tmp_file"
  mv "$tmp_file" "$cat_file"
}

# --- Commands ---

cmd_query() {
  local root="$1"
  local domains_json="${2:-"[]"}"
  local cat_file; cat_file=$(_catalogue_path "$root")
  local catalogue; catalogue=$(_read_catalogue "$cat_file")

  # Return all entries (LLM subagent does semantic matching, not this script)
  local result
  result=$(printf '%s' "$catalogue" | jq '.entries')
  local count; count=$(printf '%s' "$result" | jq 'length')
  _write_output "OK: $count entries available" "$result"
}

cmd_record() {
  local root="$1"
  local entry_json="$2"
  local cat_file; cat_file=$(_catalogue_path "$root")
  local catalogue; catalogue=$(_read_catalogue "$cat_file")

  # Validate entry has required fields
  local entry_id
  if ! entry_id=$(printf '%s' "$entry_json" | jq -r '.id // empty' 2>/dev/null) || [ -z "$entry_id" ]; then
    echo "ERROR: entry must have an 'id' field" >&2
    return 1
  fi

  # Ensure required fields have defaults
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local normalized
  normalized=$(printf '%s' "$entry_json" | jq --arg now "$now" '
    . + {
      usageCount: (.usageCount // 0),
      successCount: (.successCount // 0),
      failureCount: (.failureCount // 0),
      failureReasons: (.failureReasons // []),
      lastUsedAt: (.lastUsedAt // $now),
      source: (.source // "build")
    }
  ')

  # Upsert: replace if exists, append if new
  local updated
  updated=$(printf '%s' "$catalogue" | jq --argjson entry "$normalized" '
    if (.entries | map(.id) | index($entry.id)) then
      .entries |= map(if .id == $entry.id then $entry else . end)
    else
      .entries += [$entry]
    end
  ')

  _atomic_write "$cat_file" "$updated"
  _write_output "OK: recorded $entry_id" "$normalized"
}

cmd_promote() {
  local root="$1"
  local entry_id; entry_id=$(_sanitize_arg "$2")
  local cat_file; cat_file=$(_catalogue_path "$root")
  local catalogue; catalogue=$(_read_catalogue "$cat_file")
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local updated
  updated=$(printf '%s' "$catalogue" | jq --arg id "$entry_id" --arg now "$now" '
    .entries |= map(
      if .id == $id then
        .successCount += 1 |
        .usageCount += 1 |
        .lastUsedAt = $now
      else . end
    )
  ')

  # Check if entry was found
  local found
  found=$(printf '%s' "$updated" | jq --arg id "$entry_id" '[.entries[] | select(.id == $id)] | length')
  if [ "$found" = "0" ]; then
    echo "WARN: entry '$entry_id' not found in catalogue" >&2
    _write_output "WARN: entry not found" '{"found":false}'
    return 0
  fi

  _atomic_write "$cat_file" "$updated"
  local new_count
  new_count=$(printf '%s' "$updated" | jq --arg id "$entry_id" '[.entries[] | select(.id == $id)][0].successCount')
  local out_json
  out_json=$(jq -cn --arg id "$entry_id" --argjson count "$new_count" '{"id": $id, "successCount": $count}')
  _write_output "OK: promoted $entry_id (successCount=$new_count)" "$out_json"
}

cmd_demote() {
  local root="$1"
  local entry_id; entry_id=$(_sanitize_arg "$2")
  local reason="${3:-unknown}"
  local cat_file; cat_file=$(_catalogue_path "$root")
  local catalogue; catalogue=$(_read_catalogue "$cat_file")
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local updated
  updated=$(printf '%s' "$catalogue" | jq --arg id "$entry_id" --arg now "$now" --arg reason "$reason" '
    .entries |= map(
      if .id == $id then
        .failureCount += 1 |
        .usageCount += 1 |
        .lastUsedAt = $now |
        .failureReasons += [$reason]
      else . end
    )
  ')

  local found
  found=$(printf '%s' "$updated" | jq --arg id "$entry_id" '[.entries[] | select(.id == $id)] | length')
  if [ "$found" = "0" ]; then
    echo "WARN: entry '$entry_id' not found in catalogue" >&2
    _write_output "WARN: entry not found" '{"found":false}'
    return 0
  fi

  _atomic_write "$cat_file" "$updated"
  local out_json
  out_json=$(jq -cn --arg id "$entry_id" --arg reason "$reason" '{"id": $id, "reason": $reason}')
  _write_output "OK: demoted $entry_id (reason=$reason)" "$out_json"
}

cmd_list() {
  local root="$1"
  local domain="${2:-}"
  local cat_file; cat_file=$(_catalogue_path "$root")
  local catalogue; catalogue=$(_read_catalogue "$cat_file")

  local result
  if [ -n "$domain" ]; then
    result=$(printf '%s' "$catalogue" | jq --arg d "$domain" '
      .entries | map(select((.domain // []) | arrays | index($d) != null))
    ')
  else
    result=$(printf '%s' "$catalogue" | jq '.entries')
  fi

  local count; count=$(printf '%s' "$result" | jq 'length')
  _write_output "OK: $count entries" "$result"
}

cmd_evict() {
  local root="$1"
  local cat_file; cat_file=$(_catalogue_path "$root")
  local catalogue; catalogue=$(_read_catalogue "$cat_file")

  local count
  count=$(printf '%s' "$catalogue" | jq '.entries | length')
  if [ "$count" -le "$MAX_ENTRIES" ]; then
    _write_output "OK: $count entries (under limit)" '{"evicted":0}'
    return 0
  fi

  # Calculate stale cutoff (6 months ago)
  local cutoff
  cutoff=$(date -u -v-${STALE_MONTHS}m +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
           date -u -d "${STALE_MONTHS} months ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
           echo "2025-09-28T00:00:00Z")

  # Phase 1: evict entries with successCount==0 and lastUsedAt older than cutoff
  local after_phase1
  after_phase1=$(printf '%s' "$catalogue" | jq --arg cutoff "$cutoff" '
    .entries |= map(select(
      .successCount > 0 or .lastUsedAt >= $cutoff
    ))
  ')
  local count1; count1=$(printf '%s' "$after_phase1" | jq '.entries | length')

  if [ "$count1" -le "$MAX_ENTRIES" ]; then
    local evicted=$((count - count1))
    _atomic_write "$cat_file" "$after_phase1"
    _write_output "OK: evicted $evicted stale entries ($count1 remaining)" "{\"evicted\":$evicted,\"remaining\":$count1}"
    return 0
  fi

  # Phase 2: evict lowest-confidence entries (sort by successCount asc, then lastUsedAt asc)
  local target=$MAX_ENTRIES
  local after_phase2
  after_phase2=$(printf '%s' "$after_phase1" | jq --argjson target "$target" '
    .entries |= (sort_by(.successCount, .lastUsedAt) | .[-$target:])
  ')
  local count2; count2=$(printf '%s' "$after_phase2" | jq '.entries | length')
  local evicted=$((count - count2))

  _atomic_write "$cat_file" "$after_phase2"
  _write_output "OK: evicted $evicted entries ($count2 remaining)" "{\"evicted\":$evicted,\"remaining\":$count2}"
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-catalogue.sh <command> <root> [args...]" >&2
  echo "Commands: query, record, promote, demote, list, evict" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  query)
    DOMAINS="${3:-"[]"}"
    cmd_query "$ROOT" "$DOMAINS"
    ;;
  record)
    ENTRY="${3:-}"
    [ -z "$ENTRY" ] && { echo "ERROR: entry-json required" >&2; exit 1; }
    cmd_record "$ROOT" "$ENTRY"
    ;;
  promote)
    ID="${3:-}"
    [ -z "$ID" ] && { echo "ERROR: entry-id required" >&2; exit 1; }
    cmd_promote "$ROOT" "$ID"
    ;;
  demote)
    ID="${3:-}"
    REASON="${4:-unknown}"
    [ -z "$ID" ] && { echo "ERROR: entry-id required" >&2; exit 1; }
    cmd_demote "$ROOT" "$ID" "$REASON"
    ;;
  list)
    if [ "${3:-}" = "--domain" ] && [ -n "${4:-}" ]; then
      cmd_list "$ROOT" "$4"
    else
      cmd_list "$ROOT"
    fi
    ;;
  evict)
    cmd_evict "$ROOT"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: query, record, promote, demote, list, evict" >&2
    exit 1
    ;;
esac
