#!/usr/bin/env bash
# prism-supervisor.sh — Task graph lifecycle manager for Prism v3
# Formal task decomposition, dependency tracking, and dispatch coordination.
# Stores state in registry.json (task_graph field). Requires registry version 2.
#
# Usage:
#   prism-supervisor.sh plan     <root> <change>             # stdin: task graph JSON
#   prism-supervisor.sh next     <root> <change>             # returns dispatchable tasks
#   prism-supervisor.sh complete <root> <change> <task-id>   # mark task done
#   prism-supervisor.sh fail     <root> <change> <task-id>   # mark task failed
#   prism-supervisor.sh status   <root> <change>             # full status summary
#   prism-supervisor.sh reset    <root> <change> <task-id>   # reset for guardian retry
#
# Output: writes full JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed (see stderr).
set -uo pipefail

# --- Dependency check ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi

# --- Helpers (shared patterns from prism-registry.sh) ---
_sanitize_arg() {
  printf '%s' "$1" | tr -d '`$();|&<>!' | tr -s ' '
}

_registry_path() {
  local root="$1"
  printf '%s/.prism/registry.json' "$root"
}

_lock_path() {
  local root="$1"
  printf '%s/.prism/registry.lockdir' "$root"
}

_tmp_output() {
  printf '/tmp/prism-supervisor-%s.json' "$$"
}

_acquire_lock() {
  local lockdir="$1"
  local attempts=0
  while ! mkdir "$lockdir" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 50 ]; then
      echo "ERROR: could not acquire lock after 5 seconds" >&2
      return 1
    fi
    sleep 0.1
  done
  trap "rmdir '$lockdir' 2>/dev/null || true" EXIT
  return 0
}

_release_lock() {
  local lockdir="$1"
  rmdir "$lockdir" 2>/dev/null || true
}

_locked_write() {
  # Atomic write with mkdir-based lock + .bak
  # Usage: _locked_write <root> <jq_filter> [jq_args...]
  local root="$1"
  local filter="$2"
  shift 2
  local reg; reg=$(_registry_path "$root")
  local lockdir; lockdir=$(_lock_path "$root")

  _acquire_lock "$lockdir" || return 1

  # Validate current file
  if [ -f "$reg" ] && ! jq empty "$reg" 2>/dev/null; then
    if [ -f "${reg}.bak" ] && jq empty "${reg}.bak" 2>/dev/null; then
      cp "${reg}.bak" "$reg"
      echo "WARN: recovered registry from .bak" >&2
    else
      _release_lock "$lockdir"
      echo "ERROR: registry.json is corrupted and no valid .bak exists" >&2
      return 1
    fi
  fi

  # Backup before write
  [ -f "$reg" ] && cp "$reg" "${reg}.bak"

  # Apply jq filter, write to temp, atomic move
  local tmp="${reg}.tmp.$$"
  if jq "$filter" "$@" "$reg" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$reg"
    _release_lock "$lockdir"
  else
    rm -f "$tmp"
    _release_lock "$lockdir"
    echo "ERROR: jq filter failed" >&2
    return 1
  fi
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

_ensure_registry() {
  local root="$1"
  local reg; reg=$(_registry_path "$root")
  if [ ! -f "$reg" ]; then
    echo "ERROR: no registry found. Run prism-registry.sh init first." >&2
    return 1
  fi
}

_ensure_v2() {
  # Check registry version, auto-migrate v1 to v2
  local root="$1"
  local reg; reg=$(_registry_path "$root")
  local version; version=$(jq -r '.version // 1' "$reg" 2>/dev/null)
  if [ "$version" = "1" ]; then
    _locked_write "$root" '.version = 2 | .task_graph = null'
  fi
}

# --- Cycle detection (Kahn's algorithm in jq) ---
# Returns "ok" if no cycle, or "cycle" if cycle detected.
# Input: task graph JSON on stdin
_check_cycles() {
  local graph_file="$1"
  jq -r '
    .tasks as $tasks |
    # Build in-degree map and adjacency list
    ($tasks | map({(.id): [.depends_on[] // empty]}) | add // {}) as $deps |
    ($tasks | map(.id)) as $all_ids |
    # in_degree: count of dependencies per node
    ($all_ids | map({(.): (($deps[.] // []) | length)}) | add // {}) as $initial_degrees |

    # Kahn: iteratively remove nodes with in-degree 0
    {queue: [$all_ids[] | select(($initial_degrees[.] // 0) == 0)],
     degrees: $initial_degrees,
     processed: 0,
     total: ($all_ids | length)} |

    until(.queue | length == 0;
      .queue[0] as $node |
      .queue = .queue[1:] |
      .processed += 1 |
      # Find all tasks that depend on $node and decrement their in-degree
      reduce ($all_ids[] | select(($deps[.] // []) | index($node))) as $dependent (
        .;
        .degrees[$dependent] = (.degrees[$dependent] - 1) |
        if .degrees[$dependent] == 0 then .queue += [$dependent] else . end
      )
    ) |

    if .processed == .total then "ok" else "cycle" end
  ' "$graph_file"
}

# --- Commands ---

cmd_plan() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")

  _ensure_registry "$root" || return 1
  _ensure_v2 "$root"

  # Read task graph JSON from stdin
  local graph; graph=$(cat)
  if [ -z "$graph" ]; then
    echo "ERROR: no task graph JSON provided on stdin" >&2
    return 1
  fi

  # Validate JSON
  if ! printf '%s' "$graph" | jq empty 2>/dev/null; then
    echo "ERROR: invalid JSON on stdin" >&2
    return 1
  fi

  # Validate structure: must have .tasks array
  local has_tasks; has_tasks=$(printf '%s' "$graph" | jq 'has("tasks") and (.tasks | type == "array")' 2>/dev/null)
  if [ "$has_tasks" != "true" ]; then
    echo "ERROR: task graph must have a 'tasks' array" >&2
    return 1
  fi

  # Validate each task has required fields
  local invalid; invalid=$(printf '%s' "$graph" | jq '[.tasks[] | select(.id == null or .name == null)] | length' 2>/dev/null)
  if [ "$invalid" != "0" ]; then
    echo "ERROR: all tasks must have 'id' and 'name' fields" >&2
    return 1
  fi

  # Check for duplicate IDs
  local dupes; dupes=$(printf '%s' "$graph" | jq '(.tasks | map(.id)) as $ids | ($ids | unique | length) != ($ids | length)' 2>/dev/null)
  if [ "$dupes" = "true" ]; then
    echo "ERROR: duplicate task IDs found" >&2
    return 1
  fi

  # Validate dependency references exist
  local bad_deps; bad_deps=$(printf '%s' "$graph" | jq '
    (.tasks | map(.id)) as $all_ids |
    [.tasks[].depends_on[]? | select(. as $d | $all_ids | index($d) | not)] | length
  ' 2>/dev/null)
  if [ "$bad_deps" != "0" ]; then
    echo "ERROR: dependency references non-existent task ID" >&2
    return 1
  fi

  # Check for cycles
  local graph_file="/tmp/prism-supervisor-graph-$$.json"
  printf '%s' "$graph" > "$graph_file"

  local cycle_result; cycle_result=$(_check_cycles "$graph_file")
  if [ "$cycle_result" = "cycle" ]; then
    rm -f "$graph_file"
    echo "ERROR: cycle detected in task graph" >&2
    return 1
  fi

  # Build enriched task graph with statuses
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local enriched; enriched=$(jq --arg now "$now" '
    {
      planned_at: $now,
      tasks: [.tasks[] | {
        id: .id,
        name: .name,
        requirement: (.requirement // null),
        depends_on: (.depends_on // []),
        files_to_read: (.files_to_read // []),
        constraints: (.constraints // []),
        estimated_files: (.estimated_files // null),
        status: (if ((.depends_on // []) | length) == 0 then "ready" else "pending" end),
        worker_id: null,
        retries: 0,
        max_retries: 3,
        started_at: null,
        completed_at: null,
        output_files: [],
        contracts: {},
        failure_reason: null
      }]
    }
  ' "$graph_file")

  rm -f "$graph_file"

  # Write to registry
  local enriched_file="/tmp/prism-supervisor-enriched-$$.json"
  printf '%s' "$enriched" > "$enriched_file"

  _locked_write "$root" '.task_graph = $tg[0]' --slurpfile tg "$enriched_file"
  rm -f "$enriched_file"

  local reg; reg=$(_registry_path "$root")
  local total; total=$(jq '.task_graph.tasks | length' "$reg")
  local ready; ready=$(jq '[.task_graph.tasks[] | select(.status == "ready")] | length' "$reg")

  _write_output "OK: planned $total tasks ($ready ready)" "$(cat "$reg")"
}

cmd_next() {
  local root="$1"

  _ensure_registry "$root" || return 1

  local reg; reg=$(_registry_path "$root")

  # Check task_graph exists
  local has_graph; has_graph=$(jq 'has("task_graph") and .task_graph != null' "$reg" 2>/dev/null)
  if [ "$has_graph" != "true" ]; then
    local err='{"error":"no task graph planned","ready_tasks":[]}'
    _write_output "ERROR: no task graph" "$err"
    return 1
  fi

  local ready_tasks; ready_tasks=$(jq '{ready_tasks: [.task_graph.tasks[] | select(.status == "ready")]}' "$reg")
  local count; count=$(printf '%s' "$ready_tasks" | jq '.ready_tasks | length')

  _write_output "OK: $count tasks ready" "$ready_tasks"
}

cmd_complete() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local task_id; task_id=$(_sanitize_arg "$3")

  _ensure_registry "$root" || return 1

  local reg; reg=$(_registry_path "$root")
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Read output_files from PRISM_TASK_OUTPUT env var if set
  local output_files="${PRISM_TASK_OUTPUT:-[]}"
  if ! printf '%s' "$output_files" | jq empty 2>/dev/null; then
    output_files="[]"
  fi

  local output_file="/tmp/prism-supervisor-output-$$.json"
  printf '%s' "$output_files" > "$output_file"

  # Mark task completed, then promote dependents
  _locked_write "$root" \
    --arg tid "$task_id" \
    --arg ts "$now" \
    --slurpfile ofiles "$output_file" \
    '
    # Mark this task completed
    .task_graph.tasks = [.task_graph.tasks[] |
      if .id == $tid then
        .status = "completed" | .completed_at = $ts | .output_files = ($ofiles[0] // [])
      else . end
    ] |
    # Promote dependents: if all deps are completed, set to ready
    (.task_graph.tasks | map(select(.status == "completed")) | map(.id)) as $done |
    .task_graph.tasks = [.task_graph.tasks[] |
      if .status == "pending" then
        if ([.depends_on[] | select(. as $d | $done | index($d) | not)] | length) == 0
        then .status = "ready"
        else . end
      else . end
    ]
    '

  rm -f "$output_file"

  reg=$(_registry_path "$root")
  local newly_ready; newly_ready=$(jq '{newly_ready: [.task_graph.tasks[] | select(.status == "ready")]}' "$reg")
  local count; count=$(printf '%s' "$newly_ready" | jq '.newly_ready | length')

  _write_output "OK: $task_id completed ($count now ready)" "$newly_ready"
}

cmd_fail() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local task_id; task_id=$(_sanitize_arg "$3")

  _ensure_registry "$root" || return 1

  local reg; reg=$(_registry_path "$root")
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Read failure reason from PRISM_FAIL_REASON env var if set
  local reason="${PRISM_FAIL_REASON:-unknown}"

  _locked_write "$root" \
    --arg tid "$task_id" \
    --arg ts "$now" \
    --arg reason "$reason" \
    '
    .task_graph.tasks = [.task_graph.tasks[] |
      if .id == $tid then
        .retries = (.retries + 1) |
        .failure_reason = $reason |
        if .retries >= .max_retries then .status = "blocked"
        else .status = "failed" end
      else . end
    ]
    '

  reg=$(_registry_path "$root")
  local task_status; task_status=$(jq -r --arg tid "$task_id" '[.task_graph.tasks[] | select(.id == $tid)][0].status' "$reg")
  local retries; retries=$(jq -r --arg tid "$task_id" '[.task_graph.tasks[] | select(.id == $tid)][0].retries' "$reg")

  _write_output "OK: $task_id → $task_status (retry $retries)" "$(jq --arg tid "$task_id" '{task: [.task_graph.tasks[] | select(.id == $tid)][0]}' "$reg")"
}

cmd_status() {
  local root="$1"

  _ensure_registry "$root" || return 1

  local reg; reg=$(_registry_path "$root")

  local has_graph; has_graph=$(jq 'has("task_graph") and .task_graph != null' "$reg" 2>/dev/null)
  if [ "$has_graph" != "true" ]; then
    local err='{"error":"no task graph planned"}'
    _write_output "ERROR: no task graph" "$err"
    return 1
  fi

  # Compute summary (critical path computed separately to avoid jq complexity)
  local summary; summary=$(jq '
    .task_graph as $tg |
    {
      total: ($tg.tasks | length),
      completed: ([$tg.tasks[] | select(.status == "completed")] | length),
      running: ([$tg.tasks[] | select(.status == "running")] | length),
      ready: ([$tg.tasks[] | select(.status == "ready")] | length),
      pending: ([$tg.tasks[] | select(.status == "pending")] | length),
      failed: ([$tg.tasks[] | select(.status == "failed")] | length),
      blocked: ([$tg.tasks[] | select(.status == "blocked")] | length),
      planned_at: $tg.planned_at,
      tasks: $tg.tasks
    }
  ' "$reg")

  # Compute critical path length via separate jq call
  local cpath; cpath=$(jq '
    .task_graph.tasks as $tasks |
    ($tasks | map({key: .id, value: (.depends_on // [])}) | from_entries) as $deps |
    ($tasks | map(.id)) as $ids |
    # Iteratively compute depth: tasks with no deps = 0, others = max(dep depths) + 1
    def depth($id; $memo):
      if $memo | has($id) then $memo
      elif ($deps[$id] | length) == 0 then ($memo | .[$id] = 0)
      else
        reduce ($deps[$id][]) as $dep ($memo;
          depth($dep; .)
        ) |
        . as $m |
        ($m | .[$id] = ([$deps[$id][] | $m[.]] | max) + 1)
      end;
    reduce $ids[] as $id ({}; depth($id; .)) |
    [.[]] | (if length > 0 then max else 0 end) + 1
  ' "$reg" 2>/dev/null || echo "1")

  # Merge critical path into summary
  summary=$(printf '%s' "$summary" | jq --argjson cp "$cpath" '. + {critical_path: {length: $cp}}')

  local total; total=$(printf '%s' "$summary" | jq '.total')
  local completed; completed=$(printf '%s' "$summary" | jq '.completed')

  _write_output "OK: $completed/$total completed" "$summary"
}

cmd_reset() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local task_id; task_id=$(_sanitize_arg "$3")

  _ensure_registry "$root" || return 1

  local reg; reg=$(_registry_path "$root")

  # Verify task exists and is in failed state
  local task_status; task_status=$(jq -r --arg tid "$task_id" '[.task_graph.tasks[] | select(.id == $tid)][0].status // "not_found"' "$reg")

  if [ "$task_status" = "not_found" ]; then
    echo "ERROR: task $task_id not found" >&2
    return 1
  fi

  if [ "$task_status" != "failed" ] && [ "$task_status" != "blocked" ]; then
    echo "ERROR: task $task_id is $task_status, not failed/blocked" >&2
    return 1
  fi

  _locked_write "$root" \
    --arg tid "$task_id" \
    '
    .task_graph.tasks = [.task_graph.tasks[] |
      if .id == $tid then
        .status = "ready" | .failure_reason = null
      else . end
    ]
    '

  _write_output "OK: $task_id reset to ready" "$(jq --arg tid "$task_id" '{task: [.task_graph.tasks[] | select(.id == $tid)][0]}' "$(_registry_path "$root")")"
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"
CHANGE="${3:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-supervisor.sh <command> <root> [<change>] [args...]" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  plan)
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_plan "$ROOT" "$CHANGE"
    ;;
  next)
    cmd_next "$ROOT"
    ;;
  complete)
    TASK_ID="${4:-}"
    [ -z "$TASK_ID" ] && { echo "ERROR: task-id required" >&2; exit 1; }
    cmd_complete "$ROOT" "$CHANGE" "$TASK_ID"
    ;;
  fail)
    TASK_ID="${4:-}"
    [ -z "$TASK_ID" ] && { echo "ERROR: task-id required" >&2; exit 1; }
    cmd_fail "$ROOT" "$CHANGE" "$TASK_ID"
    ;;
  status)
    cmd_status "$ROOT"
    ;;
  reset)
    TASK_ID="${4:-}"
    [ -z "$TASK_ID" ] && { echo "ERROR: task-id required" >&2; exit 1; }
    cmd_reset "$ROOT" "$CHANGE" "$TASK_ID"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: plan, next, complete, fail, status, reset" >&2
    exit 1
    ;;
esac
