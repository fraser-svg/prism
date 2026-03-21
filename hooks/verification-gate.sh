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

# Check if this is a package install or external API call
IS_INSTALL=""
case "$COMMAND" in
  *"npm install"*|*"npm i "*|*"npm add"*)
    IS_INSTALL="npm package installation"
    ;;
  *"pip install"*|*"pip3 install"*)
    IS_INSTALL="pip package installation"
    ;;
  *"yarn add"*|*"pnpm add"*|*"bun add"*)
    IS_INSTALL="package installation"
    ;;
  *"curl "*)
    # Only flag curl to external URLs, not localhost
    if echo "$COMMAND" | grep -qv "localhost\|127.0.0.1\|0.0.0.0"; then
      IS_INSTALL="external API call"
    fi
    ;;
esac

# If not an install/external command, allow
if [ -z "$IS_INSTALL" ]; then
  echo '{}'
  exit 0
fi

# Check history.jsonl for verification entries after most recent session_start
HISTORY=".prism/history.jsonl"
if [ ! -f "$HISTORY" ]; then
  jq -n --arg msg "[prism] VERIFICATION GATE: You are attempting $IS_INSTALL but no verification has been logged this session. Before installing packages or calling external APIs, verify the approach works first (Guardrail 8): confirm the endpoint/package exists, check it is maintained, and log the verification to history.jsonl." '{"permissionDecision":"deny","message":$msg}'
  exit 0
fi

# Find the line number of the most recent session_start
LAST_START_RAW=$(grep -n '"session_start"' "$HISTORY" 2>/dev/null | tail -1 | cut -d: -f1)
LAST_START=${LAST_START_RAW:-0}
LAST_START=$(echo "$LAST_START" | tr -d '[:space:]')

# Check for verification entries after that line
if [ "$LAST_START" -gt 0 ] 2>/dev/null; then
  VERIFY_COUNT=$(tail -n +"$LAST_START" "$HISTORY" | grep -c '"verification"' 2>/dev/null || echo "0")
else
  VERIFY_COUNT=$(grep -c '"verification"' "$HISTORY" 2>/dev/null || echo "0")
fi
VERIFY_COUNT=$(echo "$VERIFY_COUNT" | tr -d '[:space:]')

if [ "${VERIFY_COUNT:-0}" -eq 0 ]; then
  # Log the violation
  jq -n --arg action "hook_violation" --arg hook "verification-gate" \
    --arg command "$COMMAND" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{action: $action, ts: $ts, hook: $hook, command: $command}' \
    >> "$HISTORY" 2>/dev/null || true

  CMD_SHORT=$(echo "$COMMAND" | head -c 80)
  jq -n --arg msg "[prism] VERIFICATION GATE: You are attempting $IS_INSTALL ($CMD_SHORT) but no verification has been logged this session. Before installing packages or calling external APIs, verify the approach works first (Guardrail 8): confirm the package/endpoint exists, check it is maintained/working, and log the verification to history.jsonl." '{"permissionDecision":"deny","message":$msg}'
  exit 0
fi

echo '{}'
