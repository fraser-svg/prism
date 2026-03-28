#!/usr/bin/env bash
# prism-research.sh — Research orchestration helper for Prism Continuous Intelligence
#
# Usage:
#   prism-research.sh run     <root> <change> <reqs-json>   — Run catalogue query + persist results
#   prism-research.sh log     <root> <change> <report-json>  — Persist research report from subagent
#   prism-research.sh summary <root> <change>                — Read persisted research summary
#   prism-research.sh check   <root>                         — Pre-flight: check available tools
#   prism-research.sh invalidate <root> <change>             — Delete stale research on spec change
#
# Network research (gh search, npm search, pip search) is done by Agent tool
# subagents, NOT by this script. This script handles:
#   - Catalogue queries (local, instant)
#   - Result persistence to .prism/research/{change}/
#   - history.jsonl writes (research-gate.sh compatibility)
#   - Pre-flight tool availability checks
#
# Output: writes full JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed (see stderr).
set -uo pipefail

# --- Dependency check ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi

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

_research_dir() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  printf '%s/.prism/research/%s' "$root" "$change"
}

_tmp_output() {
  printf '/tmp/prism-research-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

_write_history() {
  local root="$1"
  local findings_count="$2"
  local history_file="$root/.prism/history.jsonl"
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  mkdir -p "$root/.prism"
  local entry
  entry=$(jq -cn \
    --arg action "research" \
    --arg ts "$now" \
    --arg source "automated" \
    --argjson count "$findings_count" \
    '{action: $action, ts: $ts, source: $source, findings_count: $count}')
  printf '%s\n' "$entry" >> "$history_file"
}

# --- Commands ---

cmd_run() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local reqs_json="${3:-"[]"}"
  local dir; dir=$(_research_dir "$root" "$change")
  mkdir -p "$dir"

  # Query local catalogue
  local script_dir; script_dir=$(cd "$(dirname "$0")" && pwd)
  local cat_result=""
  if [ -f "$script_dir/prism-catalogue.sh" ]; then
    cat_result=$(bash "$script_dir/prism-catalogue.sh" query "$root" "$reqs_json" 2>/dev/null || echo "")
  fi

  # Extract catalogue entries from temp file (path is in the summary line after " → ")
  local cat_entries="[]"
  local cat_tmp
  cat_tmp=$(printf '%s' "$cat_result" | sed 's/.* → //')
  if [ -n "$cat_tmp" ] && [ -f "$cat_tmp" ]; then
    cat_entries=$(cat "$cat_tmp" 2>/dev/null || echo "[]")
  fi

  # Determine complexity tier
  local req_count
  req_count=$(printf '%s' "$reqs_json" | jq 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")
  local tier="quick"
  local budget_seconds=1
  if [ "$req_count" -ge 5 ]; then
    tier="deep"
    budget_seconds=120
  elif [ "$req_count" -ge 3 ]; then
    tier="standard"
    budget_seconds=30
  fi

  # Save initial research context (catalogue results + tier)
  local context
  context=$(jq -cn \
    --arg change "$change" \
    --arg tier "$tier" \
    --argjson budget "$budget_seconds" \
    --argjson req_count "$req_count" \
    --argjson catalogue_entries "$cat_entries" \
    '{
      change: $change,
      tier: $tier,
      budget_seconds: $budget,
      requirement_count: $req_count,
      catalogue_entries: $catalogue_entries,
      status: "catalogue_queried"
    }')
  printf '%s' "$context" > "$dir/context.json"

  # Write to history.jsonl for research-gate compatibility
  local cat_count
  cat_count=$(printf '%s' "$cat_entries" | jq 'length' 2>/dev/null || echo "0")
  _write_history "$root" "$cat_count"

  _write_output "OK: tier=$tier reqs=$req_count catalogue=$cat_count" "$context"
}

cmd_log() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local report_json="${3:-"{}"}"
  local dir; dir=$(_research_dir "$root" "$change")
  mkdir -p "$dir"

  # Validate JSON
  if ! printf '%s' "$report_json" | jq empty 2>/dev/null; then
    echo "ERROR: report-json is not valid JSON" >&2
    return 1
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Write structured report
  local report
  report=$(printf '%s' "$report_json" | jq --arg ts "$now" '. + {logged_at: $ts}')
  printf '%s' "$report" | jq '.' > "$dir/report.json"

  # Extract findings count
  local findings_count
  findings_count=$(printf '%s' "$report" | jq '
    (.findings // []) | length
  ' 2>/dev/null || echo "0")

  # Update history.jsonl with final research results
  _write_history "$root" "$findings_count"

  _write_output "OK: logged research ($findings_count findings)" "$report"
}

cmd_summary() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local dir; dir=$(_research_dir "$root" "$change")

  if [ ! -d "$dir" ]; then
    _write_output "OK: no research for $change" '{"found":false}'
    return 0
  fi

  local summary="{}"
  [ -f "$dir/report.json" ] && summary=$(cat "$dir/report.json" 2>/dev/null || echo "{}")
  [ -f "$dir/context.json" ] && {
    local ctx; ctx=$(cat "$dir/context.json" 2>/dev/null || echo "{}")
    summary=$(printf '%s\n%s' "$summary" "$ctx" | jq -s '.[0] * .[1]')
  }

  # Check for decision
  local has_decision="false"
  [ -f "$dir/decision.md" ] && has_decision="true"
  local has_approaches="false"
  [ -f "$dir/approaches.md" ] && has_approaches="true"

  summary=$(printf '%s' "$summary" | jq --argjson hd "$has_decision" --argjson ha "$has_approaches" '
    . + {has_decision: $hd, has_approaches: $ha}
  ')

  _write_output "OK: research summary for $change" "$summary"
}

cmd_check() {
  local root="$1"
  local available="{}"
  local skipped="[]"

  # Check each tool
  local gh_ok="false"
  command -v gh >/dev/null 2>&1 && gh_ok="true"

  local npm_ok="false"
  command -v npm >/dev/null 2>&1 && npm_ok="true"

  local pip_ok="false"
  (command -v pip >/dev/null 2>&1 || command -v pip3 >/dev/null 2>&1) && pip_ok="true"

  local cargo_ok="false"
  command -v cargo >/dev/null 2>&1 && cargo_ok="true"

  local go_ok="false"
  command -v go >/dev/null 2>&1 && go_ok="true"

  available=$(jq -cn \
    --argjson gh "$gh_ok" \
    --argjson npm "$npm_ok" \
    --argjson pip "$pip_ok" \
    --argjson cargo "$cargo_ok" \
    --argjson go "$go_ok" \
    '{gh: $gh, npm: $npm, pip: $pip, cargo: $cargo, go: $go}')

  skipped=$(printf '%s' "$available" | jq '[to_entries[] | select(.value == false) | .key]')

  local result
  result=$(jq -cn --argjson available "$available" --argjson skipped "$skipped" \
    '{available: $available, skipped_sources: $skipped}')

  local skip_count; skip_count=$(printf '%s' "$skipped" | jq 'length')
  _write_output "OK: $skip_count tools unavailable" "$result"
}

cmd_invalidate() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local dir; dir=$(_research_dir "$root" "$change")

  if [ -d "$dir" ]; then
    rm -rf "$dir"
    _write_output "OK: invalidated research for $change" '{"invalidated":true}'
  else
    _write_output "OK: no research to invalidate" '{"invalidated":false}'
  fi
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-research.sh <command> <root> [args...]" >&2
  echo "Commands: run, log, summary, check, invalidate" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  run)
    CHANGE="${3:-}"
    REQS="${4:-"[]"}"
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_run "$ROOT" "$CHANGE" "$REQS"
    ;;
  log)
    CHANGE="${3:-}"
    REPORT="${4:-"{}"}"
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_log "$ROOT" "$CHANGE" "$REPORT"
    ;;
  summary)
    CHANGE="${3:-}"
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_summary "$ROOT" "$CHANGE"
    ;;
  check)
    cmd_check "$ROOT"
    ;;
  invalidate)
    CHANGE="${3:-}"
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_invalidate "$ROOT" "$CHANGE"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: run, log, summary, check, invalidate" >&2
    exit 1
    ;;
esac
