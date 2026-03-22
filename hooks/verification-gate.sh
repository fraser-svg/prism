#!/usr/bin/env bash
# verification-gate.sh — PreToolUse hook for Prism
# Fires on Bash tool calls that install packages or call external APIs.
# Checks that a verification step was logged in history.jsonl before allowing.
#
# Returns {"permissionDecision":"deny","message":"..."} to block, or {} to allow.
set -uo pipefail

INPUT=$(cat)

# Only active when Prism is running
if [ ! -d ".prism" ]; then
  echo '{}'
  exit 0
fi

# Only fire on Bash tool
TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read()).get("tool_name",""))' 2>/dev/null || true)

if [ "$TOOL_NAME" != "Bash" ]; then
  echo '{}'
  exit 0
fi

# Extract the command
COMMAND=$(printf '%s' "$INPUT" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read()).get("tool_input",{}).get("command",""))' 2>/dev/null || true)

if [ -z "$COMMAND" ]; then
  echo '{}'
  exit 0
fi

# Check if this is a package install or external API call, and extract the target
IS_INSTALL=""
TARGET=""
case "$COMMAND" in
  *"npm install"*|*"npm i "*|*"npm add"*)
    IS_INSTALL="npm package installation"
    # Extract package name(s): strip everything up to and including the npm subcommand, then strip flags
    TARGET=$(echo "$COMMAND" | sed -E 's/.*npm (install|i|add) //' | tr ' ' '\n' | grep -v '^-' | head -5 | tr '\n' ' ' | xargs)
    ;;
  *"pip install"*|*"pip3 install"*)
    IS_INSTALL="pip package installation"
    TARGET=$(echo "$COMMAND" | sed -E 's/.*pip3? install //' | tr ' ' '\n' | grep -v '^-' | head -5 | tr '\n' ' ' | xargs)
    ;;
  *"yarn add"*|*"pnpm add"*|*"bun add"*)
    IS_INSTALL="package installation"
    TARGET=$(echo "$COMMAND" | sed -E 's/.*(yarn|pnpm|bun) add //' | tr ' ' '\n' | grep -v '^-' | head -5 | tr '\n' ' ' | xargs)
    ;;
  *"curl "*)
    # Only flag curl to external URLs, not localhost
    if echo "$COMMAND" | grep -qv "localhost\|127.0.0.1\|0.0.0.0"; then
      IS_INSTALL="external API call"
      # Extract the URL domain as the target
      TARGET=$(echo "$COMMAND" | grep -oE 'https?://[^/ "'"'"']+' | head -1 | sed 's|https\?://||')
    fi
    ;;
esac

# If not an install/external command, allow
if [ -z "$IS_INSTALL" ]; then
  echo '{}'
  exit 0
fi

# Helper: emit a deny response (works with or without jq)
emit_deny() {
  local msg="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg msg "$msg" '{"permissionDecision":"deny","message":$msg}'
  else
    # Escape double quotes in message for valid JSON
    local escaped
    escaped=$(printf '%s' "$msg" | sed 's/"/\\"/g')
    printf '{"permissionDecision":"deny","message":"%s"}\n' "$escaped"
  fi
}

# Check history.jsonl for verification entries matching this target
HISTORY=".prism/history.jsonl"
if [ ! -f "$HISTORY" ]; then
  emit_deny "[prism] VERIFICATION GATE: You are attempting $IS_INSTALL but no verification has been logged this session. Before installing packages or calling external APIs, verify the approach works first (Guardrail 8): confirm the endpoint/package exists, check it is maintained, and log the verification to history.jsonl."
  exit 0
fi

# Find the line number of the most recent session_start
LAST_START_RAW=$(grep -n '"session_start"' "$HISTORY" 2>/dev/null | tail -1 | cut -d: -f1)
LAST_START=${LAST_START_RAW:-0}
LAST_START=$(echo "$LAST_START" | tr -d '[:space:]')

# Get verification entries after session_start
if [ "$LAST_START" -gt 0 ] 2>/dev/null; then
  SESSION_HISTORY=$(tail -n +"$LAST_START" "$HISTORY")
else
  SESSION_HISTORY=$(cat "$HISTORY")
fi

# Per-target matching: ALL packages/domains in the command must have been verified.
# "npm install express stripe" requires both express AND stripe to appear in
# verification entries. This prevents a verified package from blessing unvetted ones.
VERIFIED=false
if [ -n "$TARGET" ]; then
  ALL_MATCHED=true
  for word in $TARGET; do
    # Strip version specifiers but preserve scoped package names (@scope/pkg)
    # For @scope/pkg@version: strip only the trailing @version, keep @scope/pkg
    # For pkg@version: strip @version
    bare=$(echo "$word" | sed 's/\(.\)@[^/].*/\1/' | sed 's/[>=<].*//')
    # Skip empty tokens
    [ -z "$bare" ] && continue
    if ! echo "$SESSION_HISTORY" | grep '"verification"' | grep -qi "$bare" 2>/dev/null; then
      ALL_MATCHED=false
      break
    fi
  done
  if [ "$ALL_MATCHED" = true ]; then
    VERIFIED=true
  fi
else
  # No target extracted (shouldn't happen, but fallback to any verification)
  if echo "$SESSION_HISTORY" | grep -q '"verification"' 2>/dev/null; then
    VERIFIED=true
  fi
fi

if [ "$VERIFIED" = false ]; then
  # Log the violation (truncated to avoid leaking secrets like API keys)
  CMD_SHORT=$(echo "$COMMAND" | head -c 80)
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg action "hook_violation" --arg hook "verification-gate" \
      --arg command "$CMD_SHORT" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{action: $action, ts: $ts, hook: $hook, command: $command}' \
      >> "$HISTORY" 2>/dev/null || true
  fi
  emit_deny "[prism] VERIFICATION GATE: You are attempting $IS_INSTALL ($CMD_SHORT) but no verification for '${TARGET:-this dependency}' has been logged this session. Before installing packages or calling external APIs, verify THIS SPECIFIC approach works first (Guardrail 8): confirm the package/endpoint exists, check it is maintained/working, and log the verification to history.jsonl with the package/domain name."
  exit 0
fi

echo '{}'
