#!/usr/bin/env bash
# prism-improve.sh — Safe self-improvement proposals for Prism v3
#
# Usage:
#   prism-improve.sh propose <root> <title>           (stdin: proposal JSON)
#   prism-improve.sh list    <root>
#   prism-improve.sh eval    <root> <proposal-id>
#   prism-improve.sh promote <root> <proposal-id>
#   prism-improve.sh reject  <root> <proposal-id> <reason>
#
# Output: writes full JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed (see stderr).
set -uo pipefail

# --- Dependency check ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi

# --- Valid change types ---
VALID_CHANGE_TYPES="prompt script reference config"

# --- Helpers ---
_sanitize_arg() {
  printf '%s' "$1" | tr -d '`$();|&<>!' | tr -s ' '
}

_proposals_dir() {
  local root="$1"
  printf '%s/.prism/proposals' "$root"
}

_tmp_output() {
  printf '/tmp/prism-improve-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

_slug() {
  # Convert title to URL-safe slug
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | tr -s '-' | sed 's/^-//;s/-$//' | cut -c1-40
}

_find_proposal() {
  local proposals_dir="$1"
  local proposal_id="$2"
  local found=""

  # proposal_id can be a full filename or a partial match (timestamp prefix or slug)
  for f in "$proposals_dir"/*.json; do
    [ -f "$f" ] || continue
    local basename; basename=$(basename "$f" .json)
    if [ "$basename" = "$proposal_id" ] || printf '%s' "$basename" | grep -qF "$proposal_id"; then
      found="$f"
      break
    fi
  done
  printf '%s' "$found"
}

_record_telemetry() {
  local root="$1"
  local event_type="$2"
  local data_json="$3"
  local telemetry_script; telemetry_script="$(dirname "$0")/prism-telemetry.sh"
  if [ -f "$telemetry_script" ]; then
    "$telemetry_script" record "$root" "$event_type" "$data_json" >/dev/null 2>&1 || true
  fi
}

# --- Commands ---

cmd_propose() {
  local root="$1"
  local title; title=$(_sanitize_arg "$2")
  local proposals_dir; proposals_dir=$(_proposals_dir "$root")

  # Read proposal JSON from stdin
  local proposal_json; proposal_json=$(cat)
  if [ -z "$proposal_json" ]; then
    echo "ERROR: no proposal JSON provided on stdin" >&2
    return 1
  fi

  if ! printf '%s' "$proposal_json" | jq empty 2>/dev/null; then
    echo "ERROR: invalid JSON on stdin" >&2
    return 1
  fi

  mkdir -p "$proposals_dir"

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local ts; ts=$(date -u +%Y%m%dT%H%M%SZ)
  local slug; slug=$(_slug "$title")
  local proposal_id="${ts}-${slug}"
  local proposal_file="${proposals_dir}/${proposal_id}.json"

  # Merge title + status into proposal JSON
  local full_proposal
  full_proposal=$(printf '%s' "$proposal_json" | jq \
    --arg id "$proposal_id" \
    --arg title "$title" \
    --arg ts "$now" \
    --arg status "proposed" \
    '{
      id: $id,
      title: $title,
      status: $status,
      created_at: $ts,
      updated_at: $ts,
      description: (.description // ""),
      trigger: (.trigger // null),
      change_type: (.change_type // null),
      target_file: (.target_file // null),
      current_content_hash: (.current_content_hash // null),
      proposed_diff: (.proposed_diff // null),
      eval_cases: (.eval_cases // []),
      eval_result: null,
      promotion_result: null,
      rejection_reason: null
    }')

  # Proposals are immutable once created — write once
  if [ -f "$proposal_file" ]; then
    echo "ERROR: proposal already exists: $proposal_id" >&2
    return 1
  fi

  printf '%s' "$full_proposal" > "$proposal_file"
  _write_output "OK: proposal created $proposal_id" "$full_proposal"
}

cmd_list() {
  local root="$1"
  local proposals_dir; proposals_dir=$(_proposals_dir "$root")

  if [ ! -d "$proposals_dir" ]; then
    _write_output "OK: no proposals" "[]"
    return 0
  fi

  local list="[]"
  for f in "$proposals_dir"/*.json; do
    [ -f "$f" ] || continue
    local entry
    entry=$(jq '{id, title, status, created_at, change_type, target_file}' "$f" 2>/dev/null) || continue
    list=$(printf '%s\n%s' "$list" "$entry" | jq -s '.[0] + [.[1:][]]')
  done

  local count; count=$(printf '%s' "$list" | jq 'length')
  _write_output "OK: $count proposals" "$list"
}

cmd_eval() {
  local root="$1"
  local proposal_id; proposal_id=$(_sanitize_arg "$2")
  local proposals_dir; proposals_dir=$(_proposals_dir "$root")

  local proposal_file; proposal_file=$(_find_proposal "$proposals_dir" "$proposal_id")
  if [ -z "$proposal_file" ] || [ ! -f "$proposal_file" ]; then
    echo "ERROR: proposal not found: $proposal_id" >&2
    return 1
  fi

  local eval_cases
  eval_cases=$(jq '.eval_cases' "$proposal_file" 2>/dev/null)
  local case_count; case_count=$(printf '%s' "$eval_cases" | jq 'length')

  if [ "$case_count" -eq 0 ]; then
    echo "ERROR: proposal has no eval_cases" >&2
    return 1
  fi

  local passed=0
  local failed=0
  local details="[]"

  # Run each eval case — pattern matching only (grep for expected_contains/excludes)
  local i=0
  while [ "$i" -lt "$case_count" ]; do
    local case_obj; case_obj=$(printf '%s' "$eval_cases" | jq ".[$i]")
    local input; input=$(printf '%s' "$case_obj" | jq -r '.input // ""')
    local expected_contains; expected_contains=$(printf '%s' "$case_obj" | jq -r '.expected // .expected_contains // ""')
    local expected_excludes; expected_excludes=$(printf '%s' "$case_obj" | jq -r '.expected_excludes // ""')

    local case_passed=true
    local failure_reason=""

    # Check expected_contains
    if [ -n "$expected_contains" ]; then
      if ! printf '%s' "$input" | grep -qF "$expected_contains" 2>/dev/null; then
        case_passed=false
        failure_reason="expected_contains '$expected_contains' not found in input"
      fi
    fi

    # Check expected_excludes
    if [ -n "$expected_excludes" ] && [ "$case_passed" = "true" ]; then
      if printf '%s' "$input" | grep -qF "$expected_excludes" 2>/dev/null; then
        case_passed=false
        failure_reason="expected_excludes '$expected_excludes' found in input"
      fi
    fi

    if [ "$case_passed" = "true" ]; then
      passed=$((passed + 1))
    else
      failed=$((failed + 1))
    fi

    local case_detail
    case_detail=$(jq -n \
      --arg input "$input" \
      --argjson passed "$( [ "$case_passed" = "true" ] && echo "true" || echo "false" )" \
      --arg reason "$failure_reason" \
      '{input: $input, passed: $passed, failure_reason: (if $reason == "" then null else $reason end)}')
    details=$(printf '%s\n%s' "$details" "$case_detail" | jq -s '.[0] + [.[1:][]]')

    i=$((i + 1))
  done

  # Determine overall status
  local new_status
  if [ "$failed" -eq 0 ]; then
    new_status="eval_pass"
  else
    new_status="eval_fail"
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local eval_result
  eval_result=$(jq -n \
    --arg status "$new_status" \
    --arg ts "$now" \
    --argjson passed "$passed" \
    --argjson failed "$failed" \
    --argjson details "$details" \
    '{status: $status, evaluated_at: $ts, passed: $passed, failed: $failed, details: $details}')

  # Update proposal status (status field only — immutable otherwise)
  local tmp_file="${proposal_file}.tmp.$$"
  jq \
    --arg status "$new_status" \
    --arg ts "$now" \
    --argjson eval_result "$eval_result" \
    '.status = $status | .updated_at = $ts | .eval_result = $eval_result' \
    "$proposal_file" > "$tmp_file" && mv "$tmp_file" "$proposal_file"

  _write_output "OK: eval $new_status (passed=$passed, failed=$failed)" "$eval_result"
}

cmd_promote() {
  local root="$1"
  local proposal_id; proposal_id=$(_sanitize_arg "$2")
  local proposals_dir; proposals_dir=$(_proposals_dir "$root")

  local proposal_file; proposal_file=$(_find_proposal "$proposals_dir" "$proposal_id")
  if [ -z "$proposal_file" ] || [ ! -f "$proposal_file" ]; then
    echo "ERROR: proposal not found: $proposal_id" >&2
    return 1
  fi

  local current_status; current_status=$(jq -r '.status' "$proposal_file" 2>/dev/null)
  if [ "$current_status" != "eval_pass" ]; then
    echo "ERROR: cannot promote — status is '$current_status', must be 'eval_pass'" >&2
    return 1
  fi

  local proposed_diff; proposed_diff=$(jq -r '.proposed_diff // ""' "$proposal_file" 2>/dev/null)
  local target_file; target_file=$(jq -r '.target_file // ""' "$proposal_file" 2>/dev/null)

  local promotion_result
  local apply_status="skipped_no_diff"

  if [ -n "$proposed_diff" ] && [ "$proposed_diff" != "null" ] && [ -n "$target_file" ] && [ "$target_file" != "null" ]; then
    # Apply the diff
    local abs_target
    if [[ "$target_file" = /* ]]; then
      abs_target="$target_file"
    else
      abs_target="$root/$target_file"
    fi

    if [ ! -f "$abs_target" ]; then
      echo "ERROR: target file does not exist: $abs_target" >&2
      return 1
    fi

    # Apply patch using patch command
    local patch_tmp="/tmp/prism-promote-patch-$$.diff"
    printf '%s' "$proposed_diff" > "$patch_tmp"
    if patch -p1 "$abs_target" < "$patch_tmp" >/dev/null 2>&1; then
      apply_status="applied"
    else
      rm -f "$patch_tmp"
      echo "ERROR: failed to apply diff to $target_file" >&2
      return 1
    fi
    rm -f "$patch_tmp"
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  promotion_result=$(jq -n \
    --arg ts "$now" \
    --arg apply_status "$apply_status" \
    --arg target_file "$target_file" \
    '{promoted_at: $ts, apply_status: $apply_status, target_file: $target_file}')

  # Update proposal status
  local tmp_file="${proposal_file}.tmp.$$"
  jq \
    --arg status "promoted" \
    --arg ts "$now" \
    --argjson promotion_result "$promotion_result" \
    '.status = $status | .updated_at = $ts | .promotion_result = $promotion_result' \
    "$proposal_file" > "$tmp_file" && mv "$tmp_file" "$proposal_file"

  # Log to telemetry
  local title; title=$(jq -r '.title' "$proposal_file" 2>/dev/null)
  _record_telemetry "$root" "build_complete" \
    "{\"change_name\": \"proposal-promote\", \"metadata\": {\"proposal_id\": \"$proposal_id\", \"title\": \"$title\"}}"

  _write_output "OK: promoted $proposal_id (apply_status=$apply_status)" "$promotion_result"
}

cmd_reject() {
  local root="$1"
  local proposal_id; proposal_id=$(_sanitize_arg "$2")
  local reason; reason=$(_sanitize_arg "$3")
  local proposals_dir; proposals_dir=$(_proposals_dir "$root")

  local proposal_file; proposal_file=$(_find_proposal "$proposals_dir" "$proposal_id")
  if [ -z "$proposal_file" ] || [ ! -f "$proposal_file" ]; then
    echo "ERROR: proposal not found: $proposal_id" >&2
    return 1
  fi

  local current_status; current_status=$(jq -r '.status' "$proposal_file" 2>/dev/null)
  if [ "$current_status" = "promoted" ]; then
    echo "ERROR: cannot reject an already-promoted proposal" >&2
    return 1
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local tmp_file="${proposal_file}.tmp.$$"
  jq \
    --arg status "rejected" \
    --arg ts "$now" \
    --arg reason "$reason" \
    '.status = $status | .updated_at = $ts | .rejection_reason = $reason' \
    "$proposal_file" > "$tmp_file" && mv "$tmp_file" "$proposal_file"

  # Log to telemetry
  _record_telemetry "$root" "build_fail" \
    "{\"change_name\": \"proposal-reject\", \"metadata\": {\"proposal_id\": \"$proposal_id\", \"reason\": \"$reason\"}}"

  local result
  result=$(jq '{id, title, status, rejection_reason, updated_at}' "$proposal_file" 2>/dev/null)
  _write_output "OK: rejected $proposal_id" "$result"
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-improve.sh <command> <root> [args...]" >&2
  echo "Commands: propose, list, eval, promote, reject" >&2
  exit 1
fi

# Validate root is a real directory
if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  propose)
    TITLE="${3:-}"
    [ -z "$TITLE" ] && { echo "ERROR: title required" >&2; exit 1; }
    cmd_propose "$ROOT" "$TITLE"
    ;;
  list)
    cmd_list "$ROOT"
    ;;
  eval)
    PROPOSAL_ID="${3:-}"
    [ -z "$PROPOSAL_ID" ] && { echo "ERROR: proposal-id required" >&2; exit 1; }
    cmd_eval "$ROOT" "$PROPOSAL_ID"
    ;;
  promote)
    PROPOSAL_ID="${3:-}"
    [ -z "$PROPOSAL_ID" ] && { echo "ERROR: proposal-id required" >&2; exit 1; }
    cmd_promote "$ROOT" "$PROPOSAL_ID"
    ;;
  reject)
    PROPOSAL_ID="${3:-}"
    REASON="${4:-no reason given}"
    [ -z "$PROPOSAL_ID" ] && { echo "ERROR: proposal-id required" >&2; exit 1; }
    cmd_reject "$ROOT" "$PROPOSAL_ID" "$REASON"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: propose, list, eval, promote, reject" >&2
    exit 1
    ;;
esac
