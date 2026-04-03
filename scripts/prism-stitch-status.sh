#!/usr/bin/env bash
# prism-stitch-status.sh — Live readiness check for repo-managed Stitch.
#
# Output: compact JSON only.
# Contract:
# {"repo_status":"ready|missing_sdk|missing_key|keychain_locked|keychain_unavailable","sdk_installed":boolean,"keychain_connected":boolean,"reason":"...", "setup_steps":["cd scripts/stitch-mcp && npm install","prism: connect stitch"]}
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_PATH="$SCRIPT_DIR/stitch-mcp/node_modules/@google/stitch-sdk"

_timeout() {
  local secs="$1"
  shift
  "$@" &
  local cmd_pid=$!
  ( sleep "$secs" && kill "$cmd_pid" 2>/dev/null ) &
  local timer_pid=$!
  wait "$cmd_pid" 2>/dev/null
  local exit_code=$?
  kill "$timer_pid" 2>/dev/null 2>&1
  wait "$timer_pid" 2>/dev/null 2>&1
  return "$exit_code"
}

_emit_json() {
  local repo_status="$1"
  local sdk_installed="$2"
  local keychain_connected="$3"
  local reason="$4"

  printf '{"repo_status":"%s","sdk_installed":%s,"keychain_connected":%s,"reason":"%s","setup_steps":["cd scripts/stitch-mcp && npm install","prism: connect stitch"]}\n' \
    "$repo_status" "$sdk_installed" "$keychain_connected" "$reason"
}

SDK_INSTALLED=false
KEYCHAIN_CONNECTED=false
if [ -d "$SDK_PATH" ]; then
  SDK_INSTALLED=true
fi

if [ "$(uname)" != "Darwin" ] || ! command -v security >/dev/null 2>&1; then
  _emit_json "keychain_unavailable" "$SDK_INSTALLED" false "macOS Keychain is unavailable in this environment."
  exit 0
fi

if security show-keychain-info login.keychain 2>&1 | grep -v "unlocked" | grep -q "locked"; then
  _emit_json "keychain_locked" "$SDK_INSTALLED" false "macOS Keychain is locked."
  exit 0
fi

if _timeout 2 security find-generic-password -s "prism-stitch" -a "prism" >/dev/null 2>&1; then
  KEYCHAIN_CONNECTED=true
fi

if [ "$SDK_INSTALLED" != true ]; then
  _emit_json "missing_sdk" false "$KEYCHAIN_CONNECTED" "Repo-managed Stitch is missing the local SDK install."
  exit 0
fi

if [ "$KEYCHAIN_CONNECTED" != true ]; then
  _emit_json "missing_key" true false "Repo-managed Stitch is missing a connected Stitch API key in macOS Keychain."
  exit 0
fi

_emit_json "ready" true true "Repo-managed Stitch is ready."
