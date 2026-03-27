#!/usr/bin/env bash
# prism-supervisor.sh — Native build lifecycle supervisor for Prism v3
# Manages task graph execution: validation, scheduling, completion, failure.
#
# Usage:
#   prism-supervisor.sh plan     <root> <change>            (stdin: JSON task graph)
#   prism-supervisor.sh next     <root> <change>
#   prism-supervisor.sh status   <root> <change>
#   prism-supervisor.sh complete <root> <change> <worker-id>
#   prism-supervisor.sh fail     <root> <change> <worker-id> <reason>
#
# Task graph JSON format (stdin for plan):
#   [{"id":"w1","task":"...","depends_on":[]}, ...]
#
# Status transitions: pending → running → completed|failed → (retry → running)
#                     failed (retries >= 3) → abandoned → blocks dependents
#
# Output: writes full JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = OK (check JSON), non-zero = script crashed (see stderr).
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

_prism_dir() {
  printf '%s/.prism' "$1"
}

_graph_path() {
  printf '%s/.prism/task-graph.json' "$1"
}

_lock_path() {
  printf '%s/.prism/supervisor.lockdir' "$1"
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
  local graph; graph=$(_graph_path "$root")
  local lockdir; lockdir=$(_lock_path "$root")

  _acquire_lock "$lockdir" || return 1

  # Validate current file
  if [ -f "$graph" ] && ! jq empty "$graph" 2>/dev/null; then
    if [ -f "${graph}.bak" ] && jq empty "${graph}.bak" 2>/dev/null; then
      cp "${graph}.bak" "$graph"
      echo "WARN: recovered task-graph from .bak" >&2
    else
      _release_lock "$lockdir"
      echo "ERROR: task-graph.json is corrupted and no valid .bak exists" >&2
      return 1
    fi
  fi

  # Backup before write
  [ -f "$graph" ] && cp "$graph" "${graph}.bak"

  # Apply jq filter, write to temp, atomic move
  local tmp="${graph}.tmp.$$"
  if jq "$filter" "$@" "$graph" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$graph"
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

# --- Kahn's algorithm for cycle detection (pure bash + jq, no external deps) ---
#
# in-degree[x] = number of items in x.depends_on (how many prereqs x needs)
# adj[x]       = list of nodes that have x in their depends_on (x unlocks these)
#
# BFS: start with in-degree-0 nodes, decrement successors, add newly-zero to queue.
# If visited count == total nodes → acyclic; else cycle detected.
_KAHN_JQ='
  . as $nodes |
  ($nodes | map({key: .id, value: (.depends_on | length)}) | from_entries) as $indegree0 |
  (reduce $nodes[] as $n (
    ($nodes | map({key:.id, value:[]}) | from_entries);
    reduce $n.depends_on[] as $dep (.; .[$dep] += [$n.id])
  )) as $adj |
  ($indegree0 | to_entries | map(select(.value == 0)) | map(.key)) as $q0 |
  { queue: $q0, visited: 0, indeg: $indegree0 } |
  until(
    .queue | length == 0;
    .queue[0] as $node |
    .queue[1:] as $rest |
    { queue: $rest, visited: (.visited + 1), indeg: .indeg } |
    reduce ($adj[$node] // [])[] as $succ (
      .;
      .indeg[$succ] -= 1 |
      if .indeg[$succ] == 0 then .queue += [$succ] else . end
    )
  ) |
  if .visited == ($nodes | length) then "ACYCLIC" else "CYCLE" end
'

# --- Abandoned set: transitive closure of abandoned nodes + their dependents ---
#
# adj[x] = nodes that have x in their depends_on (successors in execution order)
# BFS from all abandoned nodes, collecting all transitively blocked nodes.
# Uses object for O(1) visited lookup to avoid jq's O(n) index().
_ABANDONED_SET_JQ='
  . as $tasks |
  ([$tasks[] | select(.status == "abandoned") | .id]) as $initial |
  ($initial | map({key:., value:true}) | from_entries) as $visited0 |
  ($tasks | reduce .[] as $n (
    ($tasks | map({key:.id, value:[]}) | from_entries);
    reduce $n.depends_on[] as $dep (.; .[$dep] += [$n.id])
  )) as $adj |
  { frontier: $initial, blocked: $visited0 } |
  until(
    .frontier | length == 0;
    .frontier[0] as $node |
    .blocked as $cur_blocked |
    ($adj[$node] // []) as $successors |
    ($successors | map(select($cur_blocked[.] | not))) as $new |
    {
      frontier: (.frontier[1:] + $new),
      blocked: (.blocked + ($new | map({key:., value:true}) | from_entries))
    }
  ) |
  .blocked | keys
'

# --- Validate task graph structure ---
_validate_graph() {
  local graph_json="$1"
  local err_file="$2"

  # Must be a non-empty array
  local is_array
  is_array=$(printf '%s' "$graph_json" | jq 'type == "array" and length > 0' 2>/dev/null || echo "false")
  if [ "$is_array" != "true" ]; then
    printf 'task graph must be a non-empty JSON array\n' > "$err_file"
    return 1
  fi

  # All entries must have id (string), task (string), depends_on (array)
  local missing_fields
  missing_fields=$(printf '%s' "$graph_json" | jq -r '
    map(select(
      (.id | type) != "string" or (.id | length) == 0 or
      (.task | type) != "string" or
      (.depends_on | type) != "array"
    )) | map(.id // "(missing id)") | join(", ")
  ' 2>/dev/null || echo "__jq_error__")
  if [ "$missing_fields" = "__jq_error__" ]; then
    printf 'could not validate task fields\n' > "$err_file"; return 1
  fi
  if [ -n "$missing_fields" ]; then
    printf 'tasks missing required fields (id/task/depends_on): %s\n' "$missing_fields" > "$err_file"
    return 1
  fi

  # No duplicate IDs
  local dupes
  dupes=$(printf '%s' "$graph_json" | jq -r '
    group_by(.id) | map(select(length > 1)) | map(.[0].id) | join(", ")
  ' 2>/dev/null || echo "__jq_error__")
  if [ "$dupes" = "__jq_error__" ]; then
    printf 'could not check for duplicate IDs\n' > "$err_file"; return 1
  fi
  if [ -n "$dupes" ]; then
    printf 'duplicate task IDs: %s\n' "$dupes" > "$err_file"; return 1
  fi

  # All depends_on entries reference existing IDs
  local missing_deps
  missing_deps=$(printf '%s' "$graph_json" | jq -r '
    (map(.id)) as $ids |
    [.[] | .id as $tid | .depends_on[] |
      select(. as $dep | ($ids | index($dep)) == null) |
      "\($tid) references missing dep \(.)"] |
    join(", ")
  ' 2>/dev/null || echo "__jq_error__")
  if [ "$missing_deps" = "__jq_error__" ]; then
    printf 'could not check dependency references\n' > "$err_file"; return 1
  fi
  if [ -n "$missing_deps" ]; then
    printf 'missing dependency references: %s\n' "$missing_deps" > "$err_file"; return 1
  fi

  # Cycle detection via Kahn's algorithm
  local cycle_result
  cycle_result=$(printf '%s' "$graph_json" | jq -r "$_KAHN_JQ" 2>/dev/null || echo "ERROR")
  if [ "$cycle_result" = "CYCLE" ]; then
    printf 'task graph contains a cycle (Kahn topology sort failed)\n' > "$err_file"; return 1
  fi
  if [ "$cycle_result" != "ACYCLIC" ]; then
    printf 'cycle detection failed (jq error)\n' > "$err_file"; return 1
  fi

  return 0
}

# --- Commands ---

cmd_plan() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local dir; dir=$(_prism_dir "$root")
  local graph; graph=$(_graph_path "$root")

  mkdir -p "$dir"

  # Read task graph from stdin
  local raw_graph; raw_graph=$(cat)
  if [ -z "$raw_graph" ]; then
    echo "ERROR: no task graph provided on stdin" >&2
    local err='{"status":"ERROR","error":"no task graph provided on stdin"}'
    _write_output "ERROR: no input" "$err"
    return 1
  fi

  # Validate JSON syntax
  if ! printf '%s' "$raw_graph" | jq empty 2>/dev/null; then
    echo "ERROR: invalid JSON on stdin" >&2
    local err='{"status":"ERROR","error":"invalid JSON on stdin"}'
    _write_output "ERROR: invalid JSON" "$err"
    return 1
  fi

  # Validate graph structure
  local val_err_file="/tmp/prism-supervisor-val-$$.err"
  if ! _validate_graph "$raw_graph" "$val_err_file"; then
    local errors; errors=$(cat "$val_err_file" 2>/dev/null || echo "unknown validation error")
    rm -f "$val_err_file"
    local err_json
    err_json=$(jq -n --arg e "$errors" '{"status":"ERROR","errors":$e}')
    _write_output "ERROR: $errors" "$err_json"
    return 1
  fi
  rm -f "$val_err_file"

  # Normalize: stamp all tasks with status=pending, retries=0, timestamps
  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local normalized
  normalized=$(printf '%s' "$raw_graph" | jq \
    --arg ts "$now" \
    --arg change "$change" \
    '{
      version: 1,
      change: $change,
      created: $ts,
      tasks: map({
        id: .id,
        task: .task,
        depends_on: .depends_on,
        status: "pending",
        retries: 0,
        created: $ts,
        last_updated: $ts,
        worker_id: null,
        reason: null
      })
    }')

  printf '%s' "$normalized" > "$graph"

  local task_count
  task_count=$(printf '%s' "$normalized" | jq '.tasks | length')
  _write_output "OK: plan stored ($task_count tasks)" "$normalized"
}

cmd_next() {
  local root="$1"
  local graph; graph=$(_graph_path "$root")

  if [ ! -f "$graph" ]; then
    local err='{"error":"no task graph found. Run plan first."}'
    _write_output "ERROR: no task graph" "$err"
    return 1
  fi

  # Return tasks that are pending, not abandoned/blocked, and all deps completed
  local ready_json
  ready_json=$(jq '
    .tasks as $tasks |
    ($tasks | '"$_ABANDONED_SET_JQ"') as $abandoned_set |
    ($abandoned_set | map({key:., value:true}) | from_entries) as $ab_map |
    [$tasks[] | select(
      .status == "pending" and
      ($ab_map[.id] | not) and
      (.depends_on | all(. as $dep |
        ($tasks | map(select(.id == $dep)) | .[0].status) == "completed"
      ))
    ) | {id:.id, task:.task, depends_on:.depends_on}]
  ' "$graph" 2>/dev/null)

  if [ -z "$ready_json" ]; then
    ready_json="[]"
  fi

  local count
  count=$(printf '%s' "$ready_json" | jq 'length')
  _write_output "OK: $count ready tasks" "$ready_json"
}

cmd_status() {
  local root="$1"
  local graph; graph=$(_graph_path "$root")

  if [ ! -f "$graph" ]; then
    local err='{"error":"no task graph found. Run plan first."}'
    _write_output "ERROR: no task graph" "$err"
    return 1
  fi

  local status_json
  status_json=$(jq '
    .tasks as $tasks |
    ($tasks | '"$_ABANDONED_SET_JQ"') as $abandoned_set |
    ($abandoned_set | map({key:., value:true}) | from_entries) as $ab_map |

    ($tasks | map(select(.status == "completed")) | length) as $completed |
    ($tasks | map(select(.status == "running")) | length) as $running |
    ($tasks | map(select(.status == "failed")) | length) as $failed |
    ($tasks | map(select(.status == "abandoned")) | length) as $abandoned |
    ($tasks | length) as $total |

    # Ready: pending, not in abandoned set, all deps completed
    ($tasks | map(select(
      .status == "pending" and
      ($ab_map[.id] | not) and
      (.depends_on | all(. as $dep |
        ($tasks | map(select(.id == $dep)) | .[0].status) == "completed"
      ))
    )) | length) as $ready |

    # Blocked: pending tasks not in abandoned set but not yet ready (waiting on deps)
    ($tasks | map(select(
      .status == "pending" and
      ($ab_map[.id] | not) and
      (.depends_on | any(. as $dep |
        ($tasks | map(select(.id == $dep)) | .[0].status) != "completed"
      ))
    )) | length) as $waiting |

    # Blocked by abandonment: pending nodes in the abandoned set (but not themselves abandoned)
    ($tasks | map(select(
      .status == "pending" and
      ($ab_map[.id] // false)
    )) | length) as $blocked_abandoned |

    {
      total: $total,
      completed: $completed,
      running: $running,
      failed: $failed,
      abandoned: $abandoned,
      ready: $ready,
      blocked: ($waiting + $blocked_abandoned),
      critical_path_remaining: ($total - $completed - $abandoned)
    }
  ' "$graph" 2>/dev/null)

  if [ -z "$status_json" ]; then
    local err='{"error":"failed to compute status"}'
    _write_output "ERROR: status computation failed" "$err"
    return 1
  fi

  local total completed running failed
  total=$(printf '%s' "$status_json" | jq '.total')
  completed=$(printf '%s' "$status_json" | jq '.completed')
  running=$(printf '%s' "$status_json" | jq '.running')
  failed=$(printf '%s' "$status_json" | jq '.failed')
  _write_output "OK: total=$total completed=$completed running=$running failed=$failed" "$status_json"
}

cmd_complete() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local worker_id; worker_id=$(_sanitize_arg "$3")
  local graph; graph=$(_graph_path "$root")

  if [ ! -f "$graph" ]; then
    echo "ERROR: no task graph found. Run plan first." >&2
    return 1
  fi

  # Check task exists
  local task_exists
  task_exists=$(jq --arg wid "$worker_id" '[.tasks[] | select(.id == $wid)] | length' "$graph" 2>/dev/null || echo "0")
  if [ "$task_exists" = "0" ]; then
    echo "ERROR: task not found: $worker_id" >&2
    return 1
  fi

  # Idempotent: if already completed, no-op
  local current_status
  current_status=$(jq -r --arg wid "$worker_id" '.tasks[] | select(.id == $wid) | .status' "$graph" 2>/dev/null || echo "")
  if [ "$current_status" = "completed" ]; then
    local remaining
    remaining=$(jq '[.tasks[] | select(.status != "completed" and .status != "abandoned")] | length' "$graph")
    local result
    result=$(jq -n \
      --arg wid "$worker_id" \
      --argjson remaining "$remaining" \
      '{"status":"no-op","message":"already completed","worker_id":$wid,"remaining":$remaining}')
    _write_output "OK (no-op): $worker_id already completed" "$result"
    return 0
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  _locked_write "$root" \
    --arg wid "$worker_id" \
    --arg ts "$now" \
    '.tasks = [.tasks[] |
      if .id == $wid then
        .status = "completed" | .last_updated = $ts
      else . end
    ]'

  local remaining
  remaining=$(jq '[.tasks[] | select(.status != "completed" and .status != "abandoned")] | length' "$graph")

  # Compute next ready tasks after this completion
  local next_ready
  next_ready=$(jq '
    .tasks as $tasks |
    ($tasks | '"$_ABANDONED_SET_JQ"') as $abandoned_set |
    ($abandoned_set | map({key:., value:true}) | from_entries) as $ab_map |
    [$tasks[] | select(
      .status == "pending" and
      ($ab_map[.id] | not) and
      (.depends_on | all(. as $dep |
        ($tasks | map(select(.id == $dep)) | .[0].status) == "completed"
      ))
    ) | {id:.id, task:.task, depends_on:.depends_on}]
  ' "$graph" 2>/dev/null || echo "[]")

  local result
  result=$(jq -n \
    --arg wid "$worker_id" \
    --argjson remaining "$remaining" \
    --argjson next "$next_ready" \
    '{"status":"completed","worker_id":$wid,"remaining":$remaining,"next_ready":$next}')

  _write_output "OK: $worker_id completed ($remaining remaining)" "$result"
}

cmd_fail() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local worker_id; worker_id=$(_sanitize_arg "$3")
  local reason; reason=$(_sanitize_arg "$4")
  local graph; graph=$(_graph_path "$root")

  if [ ! -f "$graph" ]; then
    echo "ERROR: no task graph found. Run plan first." >&2
    return 1
  fi

  # Check task exists
  local task_exists
  task_exists=$(jq --arg wid "$worker_id" '[.tasks[] | select(.id == $wid)] | length' "$graph" 2>/dev/null || echo "0")
  if [ "$task_exists" = "0" ]; then
    echo "ERROR: task not found: $worker_id" >&2
    return 1
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Get current retry count and compute new count + status
  local current_retries
  current_retries=$(jq -r --arg wid "$worker_id" '.tasks[] | select(.id == $wid) | .retries // 0' "$graph" 2>/dev/null || echo "0")
  local new_retries=$(( current_retries + 1 ))

  # Abandon if retries >= 3
  local new_status="failed"
  if [ "$new_retries" -ge 3 ]; then
    new_status="abandoned"
  fi

  _locked_write "$root" \
    --arg wid "$worker_id" \
    --arg ts "$now" \
    --arg reason "$reason" \
    --arg new_status "$new_status" \
    --argjson new_retries "$new_retries" \
    '.tasks = [.tasks[] |
      if .id == $wid then
        .status = $new_status | .retries = $new_retries | .reason = $reason | .last_updated = $ts
      else . end
    ]'

  # If abandoned, compute which downstream tasks are now blocked
  local blocked_downstream="[]"
  if [ "$new_status" = "abandoned" ]; then
    blocked_downstream=$(jq --arg wid "$worker_id" '
      .tasks as $tasks |
      ($tasks | '"$_ABANDONED_SET_JQ"') as $abandoned_set |
      ($abandoned_set | map({key:., value:true}) | from_entries) as $ab_map |
      [$tasks[] | select(
        .status == "pending" and
        ($ab_map[.id] // false) and
        .id != $wid
      ) | .id]
    ' "$graph" 2>/dev/null || echo "[]")
  fi

  local result
  result=$(jq -n \
    --arg wid "$worker_id" \
    --arg new_status "$new_status" \
    --argjson retries "$new_retries" \
    --arg reason "$reason" \
    --argjson blocked "$blocked_downstream" \
    '{
      worker_id: $wid,
      status: $new_status,
      retries: $retries,
      reason: $reason,
      blocked_downstream: $blocked,
      can_retry: ($new_status == "failed")
    }')

  if [ "$new_status" = "abandoned" ]; then
    _write_output "ERROR: $worker_id abandoned after $new_retries retries" "$result"
  else
    _write_output "WARN: $worker_id failed (retry $new_retries/3)" "$result"
  fi
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"
CHANGE="${3:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-supervisor.sh <command> <root> [<change>] [args...]" >&2
  echo "Commands: plan, next, status, complete, fail" >&2
  exit 1
fi

# Validate root is a real directory
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
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_next "$ROOT" "$CHANGE"
    ;;
  status)
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_status "$ROOT" "$CHANGE"
    ;;
  complete)
    WORKER_ID="${4:-}"
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    [ -z "$WORKER_ID" ] && { echo "ERROR: worker-id required" >&2; exit 1; }
    cmd_complete "$ROOT" "$CHANGE" "$WORKER_ID"
    ;;
  fail)
    WORKER_ID="${4:-}"
    FAIL_REASON="${5:-unknown}"
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    [ -z "$WORKER_ID" ] && { echo "ERROR: worker-id required" >&2; exit 1; }
    cmd_fail "$ROOT" "$CHANGE" "$WORKER_ID" "$FAIL_REASON"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: plan, next, status, complete, fail" >&2
    exit 1
    ;;
esac
