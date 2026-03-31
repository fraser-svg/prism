#!/usr/bin/env bash
# prism-inject.sh — Auto-inject API keys from macOS Keychain into .env.local
#
# Usage: prism-inject.sh <target_dir>
#
# Output: writes JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), 1 = target not found, corrupt block, or write failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/prism-helpers.sh"

# --- Helpers (same convention as prism-scan.sh) ---
_tmp_output() {
  printf '/tmp/prism-inject-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

# --- Main ---
TARGET_DIR="${1:-.}"

# Step 1: Validate TARGET_DIR exists
if [ ! -d "$TARGET_DIR" ]; then
  _write_output "ERROR: target_not_found" '{"status":"error","reason":"target_not_found"}'
  exit 1
fi

# Step 2: Check macOS + security CLI
if [ "$(uname)" != "Darwin" ] || ! command -v security >/dev/null 2>&1; then
  _write_output "SKIP: keychain_unavailable" '{"status":"skip","reason":"keychain_unavailable"}'
  exit 0
fi

# Step 3: Check keychain not locked
# Note: grep for exact "locked" not "unlocked" — the output contains "Keychain ... is locked"
if security show-keychain-info login.keychain 2>&1 | grep -v "unlocked" | grep -q "locked"; then
  _write_output "SKIP: keychain_locked" '{"status":"skip","reason":"keychain_locked"}'
  exit 0
fi

# Step 4: Probe connected providers (uses cache from helpers)
_prism_keychain_probe

CONNECTED_PROVIDERS=()
for p in "${PRISM_PROVIDERS[@]}"; do
  local_var="PRISM_KEY_$p"
  if [ "${!local_var:-disconnected}" = "connected" ]; then
    CONNECTED_PROVIDERS+=("$p")
  fi
done

if [ ${#CONNECTED_PROVIDERS[@]} -eq 0 ]; then
  _write_output "SKIP: no_keys" '{"status":"skip","reason":"no_keys"}'
  exit 0
fi

# Step 5: Ensure .env.local in .gitignore (creates .gitignore if missing)
grep -qxF '.env.local' "$TARGET_DIR/.gitignore" 2>/dev/null || echo '.env.local' >> "$TARGET_DIR/.gitignore"

# Step 6: Detect conflicts (env vars set outside prism block)
ENV_FILE="$TARGET_DIR/.env.local"
CONFLICTS=()
SKIPPED_PROVIDERS=()
if [ -f "$ENV_FILE" ]; then
  # Extract content outside the prism block
  OUTSIDE_BLOCK=$(sed '/# --- prism-managed:start ---/,/# --- prism-managed:end ---/d' "$ENV_FILE" 2>/dev/null || cat "$ENV_FILE")
  for p in "${CONNECTED_PROVIDERS[@]}"; do
    var_name=$(_prism_env_var_for "$p")
    if echo "$OUTSIDE_BLOCK" | grep -q "^\(export \)\{0,1\}${var_name}="; then
      CONFLICTS+=("$var_name")
      SKIPPED_PROVIDERS+=("$p")
    fi
  done
fi

# Remove conflicting providers from injection list (project-local values win)
INJECT_PROVIDERS=()
for p in "${CONNECTED_PROVIDERS[@]}"; do
  skip=false
  for sp in "${SKIPPED_PROVIDERS[@]+"${SKIPPED_PROVIDERS[@]}"}"; do
    if [ "$p" = "$sp" ]; then
      skip=true
      break
    fi
  done
  if [ "$skip" = false ]; then
    INJECT_PROVIDERS+=("$p")
  fi
done

# Step 7: Check for corrupt block (start marker without end marker)
if [ -f "$ENV_FILE" ]; then
  if grep -q '# --- prism-managed:start ---' "$ENV_FILE" && ! grep -q '# --- prism-managed:end ---' "$ENV_FILE"; then
    _write_output "ERROR: corrupt_block" '{"status":"error","reason":"corrupt_block"}'
    exit 1
  fi
fi

# Step 8: Build prism-managed block in temp file
# Restrict temp file permissions (secrets pass through these files)
umask 077
TMPBLOCK=$(mktemp /tmp/prism-block-XXXXXX)
MERGED=$(mktemp /tmp/prism-merged-XXXXXX)
trap 'rm -f "$TMPBLOCK" "$MERGED"' EXIT

INJECTED=0
echo "# --- prism-managed:start ---" > "$TMPBLOCK"
for provider in "${INJECT_PROVIDERS[@]}"; do
  KEY=$(_prism_timeout 2 security find-generic-password -s "prism-$provider" -a "prism" -w 2>/dev/null) && {
    printf '%s=%s\n' "$(_prism_env_var_for "$provider")" "$KEY" >> "$TMPBLOCK"
    INJECTED=$((INJECTED + 1))
  }
done
echo "# --- prism-managed:end ---" >> "$TMPBLOCK"

if [ "$INJECTED" -eq 0 ] && [ ${#CONFLICTS[@]} -eq 0 ]; then
  _write_output "SKIP: no_keys" '{"status":"skip","reason":"no_keys"}'
  exit 0
fi

# Step 9: Merge — strip old prism block, append new block
if [ -f "$ENV_FILE" ]; then
  sed '/# --- prism-managed:start ---/,/# --- prism-managed:end ---/d' "$ENV_FILE" > "$MERGED"
else
  touch "$MERGED"
fi

if [ "$INJECTED" -gt 0 ]; then
  cat "$TMPBLOCK" >> "$MERGED"
fi

# Step 10: Idempotency check — skip write if content unchanged
if [ -f "$ENV_FILE" ] && diff -q "$MERGED" "$ENV_FILE" >/dev/null 2>&1; then
  # Build JSON output
  PROVIDERS_JSON="["
  _pj_first=true
  for p in "${INJECT_PROVIDERS[@]}"; do
    [ "$_pj_first" = true ] && _pj_first=false || PROVIDERS_JSON="${PROVIDERS_JSON},"
    PROVIDERS_JSON="${PROVIDERS_JSON}\"$p\""
  done
  PROVIDERS_JSON="${PROVIDERS_JSON}]"

  CONFLICTS_JSON="["
  _cj_first=true
  for c in "${CONFLICTS[@]+"${CONFLICTS[@]}"}"; do
    [ "$_cj_first" = true ] && _cj_first=false || CONFLICTS_JSON="${CONFLICTS_JSON},"
    CONFLICTS_JSON="${CONFLICTS_JSON}\"$c\""
  done
  CONFLICTS_JSON="${CONFLICTS_JSON}]"

  _write_output "OK: keys=$INJECTED changed=false" \
    "{\"status\":\"ok\",\"keys_injected\":$INJECTED,\"changed\":false,\"providers\":$PROVIDERS_JSON,\"conflicts\":$CONFLICTS_JSON}"
  exit 0
fi

# Step 11: Atomic write — mv over original (original preserved on failure)
if ! mv "$MERGED" "$ENV_FILE"; then
  _write_output "ERROR: write_failed" '{"status":"error","reason":"write_failed"}'
  exit 1
fi

# Step 12: Build JSON output
PROVIDERS_JSON="["
_pj_first=true
for p in "${INJECT_PROVIDERS[@]}"; do
  [ "$_pj_first" = true ] && _pj_first=false || PROVIDERS_JSON="${PROVIDERS_JSON},"
  PROVIDERS_JSON="${PROVIDERS_JSON}\"$p\""
done
PROVIDERS_JSON="${PROVIDERS_JSON}]"

CONFLICTS_JSON="["
_cj_first=true
for c in "${CONFLICTS[@]+"${CONFLICTS[@]}"}"; do
  [ "$_cj_first" = true ] && _cj_first=false || CONFLICTS_JSON="${CONFLICTS_JSON},"
  CONFLICTS_JSON="${CONFLICTS_JSON}\"$c\""
done
CONFLICTS_JSON="${CONFLICTS_JSON}]"

_write_output "OK: keys=$INJECTED" \
  "{\"status\":\"ok\",\"keys_injected\":$INJECTED,\"changed\":true,\"providers\":$PROVIDERS_JSON,\"conflicts\":$CONFLICTS_JSON}"
