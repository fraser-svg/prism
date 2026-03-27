#!/usr/bin/env bash
# prism-eval.sh — Eval suite runner for Prism v3 self-improvement
#
# Usage:
#   prism-eval.sh run      <root> <eval-file>
#   prism-eval.sh baseline <root>
#   prism-eval.sh compare  <root> <baseline-id>
#
# Eval file format (JSONL — one JSON object per line):
#   {"input": "text to match against", "expected_contains": "pattern", "expected_excludes": "bad-pattern"}
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
  printf '%s' "$1" | tr -d '`$();|&<>!' | tr -s ' '
}

_evals_dir() {
  local root="$1"
  printf '%s/.prism/evals' "$root"
}

_baselines_dir() {
  local root="$1"
  printf '%s/.prism/evals/baselines' "$root"
}

_tmp_output() {
  printf '/tmp/prism-eval-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

# --- Run a single eval case ---
# Input: case JSON object with input, expected_contains, expected_excludes
# Returns: {input, passed, failure_reason}
_run_case() {
  local case_json="$1"
  local input; input=$(printf '%s' "$case_json" | jq -r '.input // ""')
  local expected_contains; expected_contains=$(printf '%s' "$case_json" | jq -r '.expected_contains // ""')
  local expected_excludes; expected_excludes=$(printf '%s' "$case_json" | jq -r '.expected_excludes // ""')

  local passed=true
  local failure_reason=""

  # Check expected_contains (must be present in input)
  if [ -n "$expected_contains" ]; then
    if ! printf '%s' "$input" | grep -qF "$expected_contains" 2>/dev/null; then
      passed=false
      failure_reason="expected_contains '$expected_contains' not found"
    fi
  fi

  # Check expected_excludes (must NOT be present in input)
  if [ -n "$expected_excludes" ] && [ "$passed" = "true" ]; then
    if printf '%s' "$input" | grep -qF "$expected_excludes" 2>/dev/null; then
      passed=false
      failure_reason="expected_excludes '$expected_excludes' was found"
    fi
  fi

  jq -n \
    --arg input "$input" \
    --argjson passed "$( [ "$passed" = "true" ] && echo "true" || echo "false" )" \
    --arg failure_reason "$failure_reason" \
    '{
      input: $input,
      passed: $passed,
      failure_reason: (if $failure_reason == "" then null else $failure_reason end)
    }'
}

# --- Run all cases in an eval file ---
# Returns: {file, total, passed, failed, details}
_run_eval_file() {
  local eval_file="$1"

  if [ ! -f "$eval_file" ]; then
    echo "ERROR: eval file does not exist: $eval_file" >&2
    return 1
  fi

  local total=0
  local passed=0
  local failed=0
  local details="[]"

  while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    [ -z "$line" ] && continue
    printf '%s' "$line" | grep -q '^#' && continue
    # Validate JSON
    if ! printf '%s' "$line" | jq empty 2>/dev/null; then
      continue
    fi

    total=$((total + 1))
    local result; result=$(_run_case "$line")
    local case_passed; case_passed=$(printf '%s' "$result" | jq -r '.passed')

    if [ "$case_passed" = "true" ]; then
      passed=$((passed + 1))
    else
      failed=$((failed + 1))
    fi

    details=$(printf '%s\n%s' "$details" "$result" | jq -s '.[0] + [.[1:][]]')
  done < "$eval_file"

  jq -n \
    --arg file "$eval_file" \
    --argjson total "$total" \
    --argjson passed "$passed" \
    --argjson failed "$failed" \
    --argjson details "$details" \
    '{file: $file, total: $total, passed: $passed, failed: $failed, details: $details}'
}

# --- Commands ---

cmd_run() {
  local root="$1"
  local eval_file="$2"

  # Allow relative paths from root
  if [ ! -f "$eval_file" ]; then
    eval_file="$root/$eval_file"
  fi

  if [ ! -f "$eval_file" ]; then
    echo "ERROR: eval file not found: $2" >&2
    return 1
  fi

  local result; result=$(_run_eval_file "$eval_file")
  local total; total=$(printf '%s' "$result" | jq '.total')
  local passed; passed=$(printf '%s' "$result" | jq '.passed')
  local failed; failed=$(printf '%s' "$result" | jq '.failed')

  _write_output "OK: eval complete total=$total passed=$passed failed=$failed" "$result"
}

cmd_baseline() {
  local root="$1"
  local evals_dir; evals_dir=$(_evals_dir "$root")
  local baselines_dir; baselines_dir=$(_baselines_dir "$root")

  if [ ! -d "$evals_dir" ]; then
    local empty
    empty=$(jq -n '{total_files: 0, total_cases: 0, passed: 0, failed: 0, file_results: []}')
    _write_output "OK: no eval files (empty baseline)" "$empty"
    return 0
  fi

  mkdir -p "$baselines_dir"

  local total_files=0
  local total_cases=0
  local total_passed=0
  local total_failed=0
  local file_results="[]"

  for eval_file in "$evals_dir"/*.jsonl; do
    [ -f "$eval_file" ] || continue
    # Skip files in subdirectories (baselines/)
    [ "$(dirname "$eval_file")" = "$evals_dir" ] || continue

    total_files=$((total_files + 1))
    local result; result=$(_run_eval_file "$eval_file")
    local f_total; f_total=$(printf '%s' "$result" | jq '.total')
    local f_passed; f_passed=$(printf '%s' "$result" | jq '.passed')
    local f_failed; f_failed=$(printf '%s' "$result" | jq '.failed')

    total_cases=$((total_cases + f_total))
    total_passed=$((total_passed + f_passed))
    total_failed=$((total_failed + f_failed))

    file_results=$(printf '%s\n%s' "$file_results" "$result" | jq -s '.[0] + [.[1:][]]')
  done

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local baseline_id; baseline_id=$(date -u +%Y%m%dT%H%M%SZ)
  local baseline_file="${baselines_dir}/${baseline_id}.json"

  local aggregate
  aggregate=$(jq -n \
    --arg id "$baseline_id" \
    --arg ts "$now" \
    --argjson total_files "$total_files" \
    --argjson total_cases "$total_cases" \
    --argjson passed "$total_passed" \
    --argjson failed "$total_failed" \
    --argjson file_results "$file_results" \
    '{
      id: $id,
      created_at: $ts,
      total_files: $total_files,
      total_cases: $total_cases,
      passed: $passed,
      failed: $failed,
      file_results: $file_results
    }')

  printf '%s' "$aggregate" > "$baseline_file"
  _write_output "OK: baseline $baseline_id (files=$total_files cases=$total_cases passed=$total_passed)" "$aggregate"
}

cmd_compare() {
  local root="$1"
  local baseline_id; baseline_id=$(_sanitize_arg "$2")
  local baselines_dir; baselines_dir=$(_baselines_dir "$root")
  local evals_dir; evals_dir=$(_evals_dir "$root")

  # Find the baseline file
  local baseline_file=""
  for f in "$baselines_dir"/*.json; do
    [ -f "$f" ] || continue
    local fname; fname=$(basename "$f" .json)
    if [ "$fname" = "$baseline_id" ] || printf '%s' "$fname" | grep -q "$baseline_id"; then
      baseline_file="$f"
      break
    fi
  done

  if [ -z "$baseline_file" ] || [ ! -f "$baseline_file" ]; then
    echo "ERROR: baseline not found: $baseline_id" >&2
    return 1
  fi

  # Run current evals
  local current_results="[]"
  local curr_total=0
  local curr_passed=0
  local curr_failed=0

  for eval_file in "$evals_dir"/*.jsonl; do
    [ -f "$eval_file" ] || continue
    [ "$(dirname "$eval_file")" = "$evals_dir" ] || continue

    local result; result=$(_run_eval_file "$eval_file")
    curr_total=$((curr_total + $(printf '%s' "$result" | jq '.total')))
    curr_passed=$((curr_passed + $(printf '%s' "$result" | jq '.passed')))
    curr_failed=$((curr_failed + $(printf '%s' "$result" | jq '.failed')))

    current_results=$(printf '%s\n%s' "$current_results" "$result" | jq -s '.[0] + [.[1:][]]')
  done

  # Load baseline
  local baseline_passed; baseline_passed=$(jq '.passed' "$baseline_file")
  local baseline_failed; baseline_failed=$(jq '.failed' "$baseline_file")
  local baseline_total; baseline_total=$(jq '.total_cases' "$baseline_file")

  # Compare
  local regressions=0
  local improvements=0
  local unchanged=0

  if [ "$curr_failed" -gt "$baseline_failed" ]; then
    regressions=$((curr_failed - baseline_failed))
  fi
  if [ "$curr_passed" -gt "$baseline_passed" ]; then
    improvements=$((curr_passed - baseline_passed))
  fi
  if [ "$curr_passed" -eq "$baseline_passed" ] && [ "$curr_failed" -eq "$baseline_failed" ]; then
    unchanged=1
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local comparison
  comparison=$(jq -n \
    --arg ts "$now" \
    --arg baseline_id "$baseline_id" \
    --argjson regressions "$regressions" \
    --argjson improvements "$improvements" \
    --argjson unchanged "$unchanged" \
    --argjson baseline_passed "$baseline_passed" \
    --argjson baseline_failed "$baseline_failed" \
    --argjson curr_passed "$curr_passed" \
    --argjson curr_failed "$curr_failed" \
    --argjson current_results "$current_results" \
    '{
      compared_at: $ts,
      baseline_id: $baseline_id,
      regressions: $regressions,
      improvements: $improvements,
      unchanged: $unchanged,
      baseline: {passed: $baseline_passed, failed: $baseline_failed},
      current: {passed: $curr_passed, failed: $curr_failed},
      details: $current_results
    }')

  _write_output "OK: compare regressions=$regressions improvements=$improvements unchanged=$unchanged" "$comparison"
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-eval.sh <command> <root> [args...]" >&2
  echo "Commands: run, baseline, compare" >&2
  exit 1
fi

# Validate root is a real directory
if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  run)
    EVAL_FILE="${3:-}"
    [ -z "$EVAL_FILE" ] && { echo "ERROR: eval-file required" >&2; exit 1; }
    cmd_run "$ROOT" "$EVAL_FILE"
    ;;
  baseline)
    cmd_baseline "$ROOT"
    ;;
  compare)
    BASELINE_ID="${3:-}"
    [ -z "$BASELINE_ID" ] && { echo "ERROR: baseline-id required" >&2; exit 1; }
    cmd_compare "$ROOT" "$BASELINE_ID"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: run, baseline, compare" >&2
    exit 1
    ;;
esac
