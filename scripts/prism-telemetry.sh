#!/usr/bin/env bash
# prism-telemetry.sh — Append-only telemetry log for Prism v3 self-improvement
#
# Usage:
#   prism-telemetry.sh record  <root> <event-type> <data-json>
#   prism-telemetry.sh summary <root> [--last-n N]
#   prism-telemetry.sh failures <root> [--cluster]
#
# Output: writes full JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed (see stderr).
set -uo pipefail

# --- Dependency check ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi

# --- Valid event types ---
VALID_EVENTS="build_start build_complete build_fail worker_complete worker_fail guardian_retry qa_pass qa_fail ship user_intervention stage_skip discovery_complete"

# --- Helpers ---
_sanitize_arg() {
  printf '%s' "$1" | tr -d '`$();|&<>!' | tr -s ' '
}

_telemetry_dir() {
  local root="$1"
  printf '%s/.prism' "$root"
}

_telemetry_path() {
  local root="$1"
  printf '%s/.prism/telemetry.jsonl' "$root"
}

_tmp_output() {
  printf '/tmp/prism-telemetry-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

_is_valid_event() {
  local event="$1"
  for e in $VALID_EVENTS; do
    [ "$e" = "$event" ] && return 0
  done
  return 1
}

# --- Commands ---

cmd_record() {
  local root="$1"
  local event_type; event_type=$(_sanitize_arg "$2")
  local data_json="${3:-}"
  [ -z "$data_json" ] && data_json="{}"
  local telemetry_file; telemetry_file=$(_telemetry_path "$root")
  local dir; dir=$(_telemetry_dir "$root")

  # Validate event type
  if ! _is_valid_event "$event_type"; then
    echo "ERROR: unknown event type: $event_type. Valid: $VALID_EVENTS" >&2
    return 1
  fi

  # Validate data_json is valid JSON
  if ! printf '%s' "$data_json" | jq empty 2>/dev/null; then
    echo "ERROR: data-json is not valid JSON" >&2
    return 1
  fi

  mkdir -p "$dir"

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local epoch_ms; epoch_ms=$(date +%s)000

  # Build the JSONL entry
  local entry
  entry=$(jq -cn \
    --arg ts "$now" \
    --arg epoch_ms "$epoch_ms" \
    --arg event_type "$event_type" \
    --argjson data "$data_json" \
    '{
      timestamp: $ts,
      epoch_ms: ($epoch_ms | tonumber),
      event_type: $event_type,
      change_name: ($data.change_name // null),
      duration_ms: ($data.duration_ms // null),
      metadata: (if ($data | keys | map(select(. != "change_name" and . != "duration_ms")) | length) > 0
                 then ($data | del(.change_name) | del(.duration_ms))
                 else {} end)
    }')

  # Append-only — never rewrite. Write compact single-line JSONL.
  printf '%s\n' "$entry" >> "$telemetry_file"

  _write_output "OK: recorded $event_type" "$entry"
}

cmd_summary() {
  local root="$1"
  local last_n="${2:-20}"
  local telemetry_file; telemetry_file=$(_telemetry_path "$root")

  if [ ! -f "$telemetry_file" ]; then
    local empty
    empty=$(jq -n '{
      total_builds: 0,
      success_rate: null,
      avg_build_duration: null,
      most_common_failures: [],
      guardian_retry_rate: null,
      user_intervention_rate: null,
      events_analyzed: 0
    }')
    _write_output "OK: no telemetry (empty)" "$empty"
    return 0
  fi

  # Read last N build-related events (we scope to build_start/complete/fail for build count)
  local all_events
  all_events=$(tail -n "$last_n" "$telemetry_file" 2>/dev/null | jq -s '.')

  local summary
  summary=$(printf '%s' "$all_events" | jq '
    . as $events |
    ($events | length) as $total_events |
    ($events | map(select(.event_type == "build_complete" or .event_type == "build_fail")) | length) as $total_builds |
    ($events | map(select(.event_type == "build_complete")) | length) as $build_successes |
    ($events | map(select(.event_type == "build_fail")) | length) as $build_fails |
    ($events | map(select(.event_type == "guardian_retry")) | length) as $guardian_retries |
    ($events | map(select(.event_type == "user_intervention")) | length) as $user_interventions |
    ($events | map(select(.event_type == "build_complete" and .duration_ms != null) | .duration_ms) | if length > 0 then add / length else null end) as $avg_dur |
    ($events | map(select(.event_type == "build_fail")) | group_by((.metadata.error // "unknown")) | map({pattern: (.[0].metadata.error // "unknown"), count: length}) | sort_by(-.count) | .[0:5]) as $failures |
    {
      total_builds: $total_builds,
      success_rate: (if $total_builds > 0 then ($build_successes / $total_builds * 100 | round / 100) else null end),
      avg_build_duration: $avg_dur,
      most_common_failures: $failures,
      guardian_retry_rate: (if $total_builds > 0 then ($guardian_retries / $total_builds * 100 | round / 100) else null end),
      user_intervention_rate: (if $total_builds > 0 then ($user_interventions / $total_builds * 100 | round / 100) else null end),
      events_analyzed: $total_events
    }
  ')

  local builds; builds=$(printf '%s' "$summary" | jq '.total_builds')
  local rate; rate=$(printf '%s' "$summary" | jq '.success_rate // "N/A"')
  _write_output "OK: summary builds=$builds success_rate=$rate" "$summary"
}

cmd_failures() {
  local root="$1"
  local cluster="${2:-}"
  local telemetry_file; telemetry_file=$(_telemetry_path "$root")

  if [ ! -f "$telemetry_file" ]; then
    _write_output "OK: no telemetry (no failures)" "[]"
    return 0
  fi

  # Read all failure events
  local fail_events
  fail_events=$(jq -s 'map(select(.event_type | test("fail|error"; "i")))' "$telemetry_file" 2>/dev/null || echo "[]")

  if [ "$cluster" = "--cluster" ]; then
    # Group by error pattern (shared keywords/prefixes)
    local clustered
    clustered=$(printf '%s' "$fail_events" | jq '
      . as $events |
      # Extract a normalized "pattern" key from each event
      ($events | map(
        . as $e |
        ((($e.metadata.error // $e.metadata.reason) // $e.event_type) // "unknown") as $raw |
        # Normalize: lowercase, keep first 40 chars as pattern
        ($raw | ascii_downcase | .[0:40] | gsub("[^a-z0-9 ]"; " ") | gsub("  +"; " ") | ltrimstr(" ") | rtrimstr(" ")) as $pattern |
        $e + {_pattern: $pattern}
      )) |
      group_by(._pattern) |
      map(
        . as $group |
        ($group[0]._pattern) as $pat |
        {
          pattern: $pat,
          count: ($group | length),
          examples: ($group | reverse | .[0:3] | map(del(._pattern))),
          first_seen: ($group | map(.timestamp) | sort | first),
          last_seen: ($group | map(.timestamp) | sort | last)
        }
      ) |
      sort_by(-.count)
    ')
    local count; count=$(printf '%s' "$clustered" | jq 'length')
    _write_output "OK: $count failure clusters" "$clustered"
  else
    local count; count=$(printf '%s' "$fail_events" | jq 'length')
    _write_output "OK: $count failures" "$fail_events"
  fi
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-telemetry.sh <command> <root> [args...]" >&2
  echo "Commands: record, summary, failures" >&2
  exit 1
fi

# Validate root is a real directory
if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  record)
    EVENT_TYPE="${3:-}"
    DATA_JSON="${4:-}"
    [ -z "$DATA_JSON" ] && DATA_JSON="{}"
    [ -z "$EVENT_TYPE" ] && { echo "ERROR: event-type required" >&2; exit 1; }
    cmd_record "$ROOT" "$EVENT_TYPE" "$DATA_JSON"
    ;;
  summary)
    LAST_N="20"
    if [ "${3:-}" = "--last-n" ] && [ -n "${4:-}" ]; then
      LAST_N="$4"
    fi
    cmd_summary "$ROOT" "$LAST_N"
    ;;
  failures)
    CLUSTER="${3:-}"
    cmd_failures "$ROOT" "$CLUSTER"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: record, summary, failures" >&2
    exit 1
    ;;
esac
