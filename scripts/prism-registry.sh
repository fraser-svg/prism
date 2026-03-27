#!/usr/bin/env bash
# prism-registry.sh — JSON task registry for Prism v3
# Single source of truth for build state. Replaces prism-log.md.
#
# Usage:
#   prism-registry.sh init    <root> <change>
#   prism-registry.sh status  <root> <change>
#   prism-registry.sh update  <root> <change>          (reads JSON patch from stdin)
#   prism-registry.sh worker  <root> <change> <id> <status> [json-from-stdin]
#   prism-registry.sh log     <root> <change> <type> <message>
#   prism-registry.sh archive <root> <change>
#
# Output: writes full JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed (see stderr).
set -uo pipefail

# --- Dependency check ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi

# --- Stage constants (canonical mapping) ---
# Registry uses string stages. Checkpoint uses numeric. This is the rosetta stone.
# understand=1, plan=2, design=2.5, build=3, verify=4, design_review=4.5, ship=5, archived=done
STAGE_MAP='{"understand":1,"plan":2,"design":2.5,"build":3,"verify":4,"design_review":4.5,"ship":5,"archived":99}'

# --- Helpers ---
_sanitize_arg() {
  # Strip shell metacharacters from user-influenced strings
  printf '%s' "$1" | tr -d '`$();|&<>!' | tr -s ' '
}

_registry_dir() {
  local root="$1"
  printf '%s/.prism' "$root"
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
  printf '/tmp/prism-registry-%s.json' "$$"
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
  # Ensure lock is released on exit
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
  # Write full JSON to temp file, print summary to stdout
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

# --- Commands ---

cmd_init() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local dir; dir=$(_registry_dir "$root")
  local reg; reg=$(_registry_path "$root")

  mkdir -p "$dir"

  if [ -f "$reg" ]; then
    # Check if change name matches — if different, this is a new build
    local existing_change; existing_change=$(jq -r '.change.name // ""' "$reg" 2>/dev/null || echo "")
    if [ "$existing_change" = "$change" ]; then
      _write_output "SKIP: registry already exists for $change" "$(cat "$reg")"
      return 0
    fi
    # Different change — archive old, create new
    local now_ts; now_ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg ts "$now_ts" '.change.stage = "archived" | .change.archived_at = $ts' "$reg" > "${reg}.archived.$(date +%s)" 2>/dev/null || true
    rm -f "$reg" "${reg}.bak"
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local branch; branch=$(git -C "$root" branch --show-current 2>/dev/null || echo "unknown")

  local json
  json=$(jq -n \
    --arg name "$change" \
    --arg started "$now" \
    --arg branch "$branch" \
    '{
      version: 1,
      change: {
        name: $name,
        stage: "understand",
        started: $started,
        last_save: null,
        last_save_commit: null,
        branch: $branch,
        complexity: null,
        requirement_count: null,
        spec_path: null
      },
      workers: [],
      checkpoint: {
        stage: null,
        progress: null,
        decisions: [],
        preferences: [],
        open_questions: [],
        next_steps: []
      },
      contracts: {},
      events: []
    }')

  printf '%s' "$json" > "$reg"
  _write_output "OK: initialized registry for $change" "$json"
}

cmd_status() {
  local root="$1"
  local reg; reg=$(_registry_path "$root")

  if [ ! -f "$reg" ]; then
    local err='{"error":"no registry found"}'
    _write_output "ERROR: no registry" "$err"
    return 1
  fi

  if ! jq empty "$reg" 2>/dev/null; then
    # Try .bak
    if [ -f "${reg}.bak" ] && jq empty "${reg}.bak" 2>/dev/null; then
      cp "${reg}.bak" "$reg"
      echo "WARN: recovered registry from .bak" >&2
    else
      local err='{"error":"registry corrupted, no valid backup"}'
      _write_output "ERROR: registry corrupted" "$err"
      return 1
    fi
  fi

  local json; json=$(cat "$reg")
  local stage; stage=$(jq -r '.change.stage // "unknown"' "$reg")
  local wcount; wcount=$(jq '.workers | length' "$reg")
  local wcomplete; wcomplete=$(jq '[.workers[] | select(.status == "completed")] | length' "$reg")

  _write_output "OK: stage=$stage workers=$wcomplete/$wcount" "$json"
}

cmd_update() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local reg; reg=$(_registry_path "$root")

  if [ ! -f "$reg" ]; then
    echo "ERROR: no registry found. Run init first." >&2
    return 1
  fi

  # Read JSON patch from stdin
  local patch; patch=$(cat)
  if [ -z "$patch" ]; then
    echo "ERROR: no JSON patch provided on stdin" >&2
    return 1
  fi

  # Validate patch is valid JSON
  if ! printf '%s' "$patch" | jq empty 2>/dev/null; then
    echo "ERROR: invalid JSON on stdin" >&2
    return 1
  fi

  # Deep merge patch into .change, and auto-sync checkpoint.stage (numeric) when change.stage updates
  local patch_file; patch_file="/tmp/prism-patch-$$.json"
  printf '%s' "$patch" > "$patch_file"

  local map_file; map_file="/tmp/prism-stage-map-$$.json"
  printf '%s' "$STAGE_MAP" > "$map_file"

  _locked_write "$root" \
    '.change *= $patch[0]
     | if $patch[0].stage then
         .checkpoint.stage = ($map[0][$patch[0].stage] // .checkpoint.stage)
       else . end' \
    --slurpfile patch "$patch_file" \
    --slurpfile map "$map_file"
  rm -f "$patch_file" "$map_file"

  local json; json=$(cat "$reg")
  _write_output "OK: updated change fields" "$json"
}

cmd_worker() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local worker_id; worker_id=$(_sanitize_arg "$3")
  local status; status=$(_sanitize_arg "$4")
  local reg; reg=$(_registry_path "$root")

  if [ ! -f "$reg" ]; then
    echo "ERROR: no registry found. Run init first." >&2
    return 1
  fi

  # Extra JSON is passed via env var PRISM_WORKER_EXTRA, not stdin
  # (stdin is unreliable in chained commands)
  local extra="${PRISM_WORKER_EXTRA:-{}}"
  if [ -n "$extra" ] && ! printf '%s' "$extra" | jq empty 2>/dev/null; then
    extra="{}"
  fi

  local extra_file="/tmp/prism-worker-extra-$$.json"
  printf '%s' "$extra" > "$extra_file"

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  _locked_write "$root" \
    --arg wid "$worker_id" \
    --arg wstatus "$status" \
    --arg ts "$now" \
    --slurpfile extra "$extra_file" \
    '
    # Find existing worker or create new entry
    if (.workers | map(.id) | index($wid)) then
      .workers = [.workers[] |
        if .id == $wid then
          . * ($extra[0] // {}) | .status = $wstatus | .last_updated = $ts
          | if $wstatus == "failed" then .retries = ((.retries // 0) + 1) else . end
        else . end
      ]
    else
      .workers += [{ id: $wid, status: $wstatus, retries: 0, created: $ts, last_updated: $ts } * ($extra[0] // {})]
    end
    '

  rm -f "$extra_file"

  local json; json=$(cat "$reg")
  local wcount; wcount=$(jq '.workers | length' "$reg")
  _write_output "OK: worker $worker_id → $status ($wcount total)" "$json"
}

cmd_log() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local event_type; event_type=$(_sanitize_arg "$3")
  local message; message=$(_sanitize_arg "$4")
  local reg; reg=$(_registry_path "$root")

  if [ ! -f "$reg" ]; then
    echo "ERROR: no registry found. Run init first." >&2
    return 1
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local stage; stage=$(jq -r '.change.stage // "unknown"' "$reg" 2>/dev/null || echo "unknown")

  _locked_write "$root" \
    --arg ts "$now" \
    --arg etype "$event_type" \
    --arg stage "$stage" \
    --arg msg "$message" \
    '.events += [{ ts: $ts, type: $etype, stage: $stage, message: $msg }]'

  local count; count=$(jq '.events | length' "$reg")
  _write_output "OK: logged $event_type ($count events)" "$(cat "$reg")"
}

cmd_reset() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local dir; dir=$(_registry_dir "$root")
  local reg; reg=$(_registry_path "$root")

  if [ -f "$reg" ]; then
    local old_change; old_change=$(jq -r '.change.name // "unknown"' "$reg" 2>/dev/null || echo "unknown")
    rm -f "$reg" "${reg}.bak"
    local reset_json; reset_json=$(jq -n --arg prev "$old_change" '{"status":"reset","previous":$prev}')
    _write_output "OK: reset registry (was: $old_change)" "$reset_json"
  else
    _write_output "OK: no registry to reset" '{"status":"clean"}'
  fi
}

cmd_archive() {
  local root="$1"
  local change; change=$(_sanitize_arg "$2")
  local reg; reg=$(_registry_path "$root")

  if [ ! -f "$reg" ]; then
    echo "ERROR: no registry found." >&2
    return 1
  fi

  local now; now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  _locked_write "$root" \
    --arg ts "$now" \
    '.change.stage = "archived" | .change.archived_at = $ts'

  local json; json=$(cat "$reg")
  _write_output "OK: archived $change" "$json"
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"
CHANGE="${3:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-registry.sh <command> <root> [<change>] [args...]" >&2
  exit 1
fi

# Validate root is a real directory
if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  init)
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_init "$ROOT" "$CHANGE"
    ;;
  status)
    cmd_status "$ROOT"
    ;;
  update)
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_update "$ROOT" "$CHANGE"
    ;;
  worker)
    WORKER_ID="${4:-}"
    WORKER_STATUS="${5:-}"
    [ -z "$WORKER_ID" ] || [ -z "$WORKER_STATUS" ] && { echo "ERROR: worker <id> <status> required" >&2; exit 1; }
    cmd_worker "$ROOT" "$CHANGE" "$WORKER_ID" "$WORKER_STATUS"
    ;;
  log)
    EVENT_TYPE="${4:-}"
    MESSAGE="${5:-}"
    [ -z "$EVENT_TYPE" ] || [ -z "$MESSAGE" ] && { echo "ERROR: log <type> <message> required" >&2; exit 1; }
    cmd_log "$ROOT" "$CHANGE" "$EVENT_TYPE" "$MESSAGE"
    ;;
  reset)
    [ -z "$CHANGE" ] && CHANGE="_"
    cmd_reset "$ROOT" "$CHANGE"
    ;;
  archive)
    [ -z "$CHANGE" ] && { echo "ERROR: change name required" >&2; exit 1; }
    cmd_archive "$ROOT" "$CHANGE"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: init, status, update, worker, log, reset, archive" >&2
    exit 1
    ;;
esac
