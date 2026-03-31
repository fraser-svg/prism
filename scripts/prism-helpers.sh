#!/usr/bin/env bash
# prism-helpers.sh — Shared functions for Prism scripts
#
# Source this file from other scripts:
#   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
#   source "$SCRIPT_DIR/prism-helpers.sh"
#
# Provides:
#   PRISM_PROVIDERS         — array of supported provider names
#   _prism_env_var_for      — map provider name to env var name
#   _prism_timeout          — run command with timeout (macOS-compatible)
#   _prism_keychain_probe   — probe Keychain for connected providers (cached)

# --- Provider list (single source of truth) ---
PRISM_PROVIDERS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prism-providers.txt"
PRISM_PROVIDERS=()
if [ -f "$PRISM_PROVIDERS_FILE" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && PRISM_PROVIDERS+=("$line")
  done < "$PRISM_PROVIDERS_FILE"
fi

# --- Map provider name to env var name ---
_prism_env_var_for() {
  case "$1" in
    anthropic) echo "ANTHROPIC_API_KEY" ;;
    openai)    echo "OPENAI_API_KEY" ;;
    google)    echo "GOOGLE_API_KEY" ;;
    vercel)    echo "VERCEL_TOKEN" ;;
    stripe)    echo "STRIPE_SECRET_KEY" ;;
  esac
}

# --- Portable timeout (macOS has no GNU timeout) ---
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

# --- Keychain probe with 1-hour cache ---
# Sets PRISM_KEY_<provider>=connected|disconnected for each provider.
# Writes/reads cache at /tmp/prism-keychain-<UID>-cache.
_prism_keychain_probe() {
  local cache="/tmp/prism-keychain-${UID:-0}-cache"

  # Cache hit: file exists and is less than 1 hour old
  if [ -f "$cache" ] && [ "$(( $(date +%s) - $(stat -f%m "$cache" 2>/dev/null || echo 0) ))" -lt 3600 ]; then
    for p in "${PRISM_PROVIDERS[@]}"; do
      local _val
      _val=$(grep "^PRISM_KEY_$p=" "$cache" 2>/dev/null | cut -d= -f2)
      # Validate: only accept known values (prevents eval injection via cache poisoning)
      case "$_val" in
        connected|disconnected) ;;
        *) _val="disconnected" ;;
      esac
      eval "PRISM_KEY_$p=$_val"
    done
    return 0
  fi

  # Cache miss: probe each provider with 2s timeout
  local tmp_cache
  tmp_cache=$(mktemp /tmp/prism-kc-XXXXXX)
  for p in "${PRISM_PROVIDERS[@]}"; do
    if _prism_timeout 2 security find-generic-password -s "prism-$p" -a "prism" >/dev/null 2>&1; then
      echo "PRISM_KEY_$p=connected" >> "$tmp_cache"
    else
      echo "PRISM_KEY_$p=disconnected" >> "$tmp_cache"
    fi
  done
  mv "$tmp_cache" "$cache" 2>/dev/null || { rm -f "$tmp_cache"; return 1; }

  for p in "${PRISM_PROVIDERS[@]}"; do
    local _val
    _val=$(grep "^PRISM_KEY_$p=" "$cache" 2>/dev/null | cut -d= -f2)
    case "$_val" in
      connected|disconnected) ;;
      *) _val="disconnected" ;;
    esac
    eval "PRISM_KEY_$p=$_val"
  done
  return 0
}
