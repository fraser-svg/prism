#!/usr/bin/env bash
# prism-deploy.sh — Deploy to Vercel via CLI
#
# Usage:
#   prism-deploy.sh <project_root> [mode]
#   mode = "preview" (default) | "production" | "status"
#
# Output: writes JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed (see stderr).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Dependency check ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi

# --- Helpers ---
_tmp_output() {
  printf '/tmp/prism-deploy-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

_fail() {
  local reason="$1"
  local detail="${2:-}"
  local json
  json=$(jq -cn \
    --arg status "fail" \
    --arg reason "$reason" \
    --arg mode "$MODE" \
    --arg detail "$detail" \
    '{status:$status, url:null, mode:$mode, reason:$reason, project_id:null, duration_ms:null, env_synced:0, detail:$detail}')
  _write_output "FAIL: reason=$reason" "$json"
}

_env_var_for() {
  case "$1" in
    anthropic) echo "ANTHROPIC_API_KEY" ;;
    openai)    echo "OPENAI_API_KEY" ;;
    google)    echo "GOOGLE_API_KEY" ;;
    vercel)    echo "VERCEL_TOKEN" ;;
    stripe)    echo "STRIPE_SECRET_KEY" ;;
  esac
}

# Portable timeout (macOS has no GNU timeout)
_prism_timeout() {
  local secs=$1; shift
  "$@" &
  local cmd_pid=$!
  ( sleep "$secs" && kill "$cmd_pid" 2>/dev/null ) &
  local timer_pid=$!
  wait "$cmd_pid" 2>/dev/null
  local exit_code=$?
  kill "$timer_pid" 2>/dev/null 2>&1
  wait "$timer_pid" 2>/dev/null 2>&1
  return $exit_code
}

# --- Main ---
PROJECT_ROOT="${1:-}"
MODE="${2:-preview}"

if [ -z "$PROJECT_ROOT" ]; then
  echo "Usage: prism-deploy.sh <project_root> [preview|production|status]" >&2
  exit 1
fi

if [ ! -d "$PROJECT_ROOT" ]; then
  echo "ERROR: project root does not exist: $PROJECT_ROOT" >&2
  exit 1
fi

# --- Status mode ---
if [ "$MODE" = "status" ]; then
  STATE_FILE="$PROJECT_ROOT/.prism/deploy-state.json"
  if [ -f "$STATE_FILE" ]; then
    _write_output "OK: deploy state found" "$(cat "$STATE_FILE")"
  else
    _write_output "OK: no deploy state" '{"status":"no_state"}'
  fi
  exit 0
fi

# --- Step 1: Token fetch ---
TOKEN=$(security find-generic-password -s "prism-vercel" -a "prism" -w 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  _fail "no_token"
  exit 0
fi

# --- Step 2: CLI check ---
if ! command -v vercel >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    npm i -g vercel >/dev/null 2>&1
    if ! command -v vercel >/dev/null 2>&1; then
      _fail "install_failed" "npm i -g vercel did not produce a vercel binary"
      exit 0
    fi
  else
    _fail "no_npm"
    exit 0
  fi
fi

# --- Step 3: Deployability check ---
DEPLOY_DIR="$PROJECT_ROOT"
FOUND_DEPLOYABLE=false
for candidate in "$PROJECT_ROOT" "$PROJECT_ROOT/app" "$PROJECT_ROOT/web" "$PROJECT_ROOT/frontend"; do
  if [ -f "$candidate/package.json" ] || [ -f "$candidate/index.html" ]; then
    DEPLOY_DIR="$candidate"
    FOUND_DEPLOYABLE=true
    break
  fi
done
if [ "$FOUND_DEPLOYABLE" = "false" ]; then
  _fail "not_deployable"
  exit 0
fi

# --- Step 4: Gitignore .vercel/ ---
if [ -f "$PROJECT_ROOT/.gitignore" ]; then
  grep -qxF '.vercel' "$PROJECT_ROOT/.gitignore" 2>/dev/null || echo '.vercel' >> "$PROJECT_ROOT/.gitignore"
else
  echo '.vercel' > "$PROJECT_ROOT/.gitignore"
fi

# --- Step 5: Env sync ---
ENV_SYNCED=0
for provider in anthropic openai google stripe; do
  KEY=$(security find-generic-password -s "prism-$provider" -a "prism" -w 2>/dev/null || true)
  if [ -n "$KEY" ]; then
    VAR_NAME=$(_env_var_for "$provider")
    # Push to Vercel (stdin pipe — key never in CLI args)
    printf '%s' "$KEY" | VERCEL_TOKEN="$TOKEN" vercel env add "$VAR_NAME" production preview --force --cwd "$DEPLOY_DIR" >/dev/null 2>&1 && {
      ENV_SYNCED=$((ENV_SYNCED + 1))
    }
  fi
done

# --- Step 6: Telemetry start ---
START_MS=$(date +%s)000
bash "$SCRIPT_DIR/prism-telemetry.sh" record "$PROJECT_ROOT" "deploy_start" "{\"mode\":\"$MODE\"}" >/dev/null 2>&1 || true

# --- Step 7: Deploy ---
PROD_FLAG=""
[ "$MODE" = "production" ] && PROD_FLAG="--prod"

DEPLOY_OUTPUT_FILE=$(mktemp /tmp/prism-deploy-out-XXXXXX)
trap 'rm -f "$DEPLOY_OUTPUT_FILE"' EXIT

# shellcheck disable=SC2086
_prism_timeout 120 env VERCEL_TOKEN="$TOKEN" vercel --yes $PROD_FLAG --cwd "$DEPLOY_DIR" > "$DEPLOY_OUTPUT_FILE" 2>&1
EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
  DEPLOY_STDERR=$(cat "$DEPLOY_OUTPUT_FILE")

  # Check if killed by timeout (exit 137 = SIGKILL, 143 = SIGTERM)
  if [ "$EXIT_CODE" -eq 137 ] || [ "$EXIT_CODE" -eq 143 ]; then
    _fail "timeout"
    bash "$SCRIPT_DIR/prism-telemetry.sh" record "$PROJECT_ROOT" "deploy_fail" "{\"mode\":\"$MODE\",\"reason\":\"timeout\"}" >/dev/null 2>&1 || true
    exit 0
  fi

  # Parse error type from stderr
  REASON="build_error"
  if echo "$DEPLOY_STDERR" | grep -qi "401\|unauthorized"; then
    REASON="auth_401"
  elif echo "$DEPLOY_STDERR" | grep -qi "403\|forbidden"; then
    REASON="forbidden_403"
  elif echo "$DEPLOY_STDERR" | grep -qi "429\|rate.limit"; then
    REASON="rate_limited_429"
    # Retry once after 60s
    sleep 60
    # shellcheck disable=SC2086
    if _prism_timeout 120 env VERCEL_TOKEN="$TOKEN" vercel --yes $PROD_FLAG --cwd "$DEPLOY_DIR" > "$DEPLOY_OUTPUT_FILE" 2>&1; then
      # Retry succeeded — fall through to URL parsing below
      REASON=""
    fi
  elif echo "$DEPLOY_STDERR" | grep -qi "ENOTFOUND\|network\|getaddrinfo"; then
    REASON="network"
  elif echo "$DEPLOY_STDERR" | grep -qi "already exists\|conflict"; then
    REASON="conflict"
  fi

  if [ -n "$REASON" ]; then
    DETAIL=$(echo "$DEPLOY_STDERR" | tail -5)
    _fail "$REASON" "$DETAIL"
    bash "$SCRIPT_DIR/prism-telemetry.sh" record "$PROJECT_ROOT" "deploy_fail" "{\"mode\":\"$MODE\",\"reason\":\"$REASON\"}" >/dev/null 2>&1 || true
    exit 0
  fi
fi

# --- Parse URL from output ---
DEPLOY_URL=$(grep -oE 'https://[a-zA-Z0-9._-]+\.vercel\.app[^ ]*' "$DEPLOY_OUTPUT_FILE" | tail -1)
if [ -z "$DEPLOY_URL" ]; then
  _fail "no_url_parsed" "$(cat "$DEPLOY_OUTPUT_FILE")"
  bash "$SCRIPT_DIR/prism-telemetry.sh" record "$PROJECT_ROOT" "deploy_fail" "{\"mode\":\"$MODE\",\"reason\":\"no_url_parsed\"}" >/dev/null 2>&1 || true
  exit 0
fi

# --- Step 8: Verify URL health ---
URL_HEALTHY=false
for attempt in 1 2 3; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 400 ]; then
    URL_HEALTHY=true
    break
  fi
  [ "$attempt" -lt 3 ] && sleep 15
done

if [ "$URL_HEALTHY" = "false" ]; then
  _fail "unhealthy" "URL $DEPLOY_URL returned HTTP $HTTP_CODE after 3 attempts"
  bash "$SCRIPT_DIR/prism-telemetry.sh" record "$PROJECT_ROOT" "deploy_fail" "{\"mode\":\"$MODE\",\"reason\":\"unhealthy\",\"url\":\"$DEPLOY_URL\"}" >/dev/null 2>&1 || true
  exit 0
fi

# --- Step 9: Persist deploy state ---
END_MS=$(date +%s)000
DURATION_MS=$(( ${END_MS%000} - ${START_MS%000} ))
DURATION_MS="${DURATION_MS}000"

mkdir -p "$PROJECT_ROOT/.prism"
DEPLOY_STATE=$(jq -cn \
  --arg url "$DEPLOY_URL" \
  --arg mode "$MODE" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson env_synced "$ENV_SYNCED" \
  --arg duration_ms "$DURATION_MS" \
  '{url:$url, mode:$mode, timestamp:$ts, env_synced:$env_synced, duration_ms:($duration_ms|tonumber)}')
printf '%s' "$DEPLOY_STATE" > "$PROJECT_ROOT/.prism/deploy-state.json"

# --- Step 10: Telemetry end ---
bash "$SCRIPT_DIR/prism-telemetry.sh" record "$PROJECT_ROOT" "deploy_complete" "{\"mode\":\"$MODE\",\"url\":\"$DEPLOY_URL\",\"duration_ms\":$DURATION_MS,\"env_synced\":$ENV_SYNCED}" >/dev/null 2>&1 || true

# --- Step 11: Output ---
RESULT_JSON=$(jq -cn \
  --arg status "ok" \
  --arg url "$DEPLOY_URL" \
  --arg mode "$MODE" \
  --argjson env_synced "$ENV_SYNCED" \
  --arg duration_ms "$DURATION_MS" \
  '{status:$status, url:$url, mode:$mode, reason:null, project_id:null, duration_ms:($duration_ms|tonumber), env_synced:$env_synced}')
_write_output "OK: url=$DEPLOY_URL mode=$MODE" "$RESULT_JSON"
