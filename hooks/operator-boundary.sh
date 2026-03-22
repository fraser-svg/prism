#!/usr/bin/env bash
# operator-boundary.sh — PreToolUse hook for Prism
# Scans the conversation transcript for operator boundary violations.
# If Claude directed the founder to another terminal, BLOCK the next tool call
# and force a correction.
#
# Returns {"permissionDecision":"deny","message":"..."} to block, or {} to allow.
set -uo pipefail

INPUT=$(cat)

# Only active when Prism is running (check for .prism directory)
if [ ! -d ".prism" ]; then
  echo '{}'
  exit 0
fi

# Read the transcript to check recent assistant text
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read()).get("transcript_path",""))' 2>/dev/null || true)

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  echo '{}'
  exit 0
fi

# Check the last 50 lines of transcript for operator boundary violations.
# Only match ASSISTANT turns — not user/founder text (which could quote these
# phrases and cause false positives).
RECENT=$(tail -50 "$TRANSCRIPT_PATH" 2>/dev/null || true)

# Extract only assistant text: lines after "Assistant:" until the next role marker.
# This avoids matching the founder's own words (e.g., pasting "open a new terminal").
ASSISTANT_TEXT=$(echo "$RECENT" | sed -n '/^[Aa]ssistant:/,/^[Uu]ser:\|^[Hh]uman:/p' | grep -v '^[Uu]ser:\|^[Hh]uman:')

# If no assistant text extracted, try matching lines not prefixed with user markers
# (fallback for transcript formats that don't use role prefixes)
if [ -z "$ASSISTANT_TEXT" ]; then
  ASSISTANT_TEXT="$RECENT"
fi

# Violation patterns — commands/instructions directed AT the user
VIOLATION=""
if echo "$ASSISTANT_TEXT" | grep -qi "run this in your terminal"; then
  VIOLATION="directed founder to run a command in their terminal"
elif echo "$ASSISTANT_TEXT" | grep -qi "open a new terminal"; then
  VIOLATION="directed founder to open a new terminal"
elif echo "$ASSISTANT_TEXT" | grep -qi "in another window"; then
  VIOLATION="directed founder to use another window"
elif echo "$ASSISTANT_TEXT" | grep -qi "you'll need to manually"; then
  VIOLATION="told founder to do something manually"
elif echo "$ASSISTANT_TEXT" | grep -qi "you need to install"; then
  VIOLATION="told founder to install something themselves"
elif echo "$ASSISTANT_TEXT" | grep -qi "please run the following"; then
  VIOLATION="told founder to run a command"
fi

if [ -n "$VIOLATION" ]; then
  # Log the violation
  mkdir -p .prism 2>/dev/null || true
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg action "hook_violation" --arg hook "operator-boundary" \
      --arg violation "$VIOLATION" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{action: $action, ts: $ts, hook: $hook, violation: $violation}' \
      >> .prism/history.jsonl 2>/dev/null || true
  fi

  # Check violation count for escalation (current session only)
  LAST_START=$(grep -n '"session_start"' .prism/history.jsonl 2>/dev/null | tail -1 | cut -d: -f1)
  LAST_START=${LAST_START:-0}
  LAST_START=$(echo "$LAST_START" | tr -d '[:space:]')
  if [ "$LAST_START" -gt 0 ] 2>/dev/null; then
    COUNT=$(tail -n +"$LAST_START" .prism/history.jsonl | grep -c '"hook":"operator-boundary"' 2>/dev/null || echo "0")
  else
    COUNT=$(grep -c '"hook":"operator-boundary"' .prism/history.jsonl 2>/dev/null || echo "0")
  fi
  COUNT=$(echo "$COUNT" | tr -d '[:space:]')

  if [ "$COUNT" -ge 3 ]; then
    MSG="[prism] CRITICAL: You have violated the operator boundary $COUNT times this session. You $VIOLATION. STOP. Re-read the CREATING checkpoints. The founder must NEVER be asked to leave this terminal, run commands, install things, or do anything manually. YOU do it silently. Rewrite your response."
  else
    MSG="[prism] OPERATOR BOUNDARY VIOLATION: You $VIOLATION. The founder must NEVER be directed to another terminal or asked to do things manually. Do it yourself silently, or ask for information you need (like API keys). Rewrite your approach."
  fi

  # Emit deny (works with or without jq)
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg msg "$MSG" '{"permissionDecision":"deny","message":$msg}'
  else
    ESCAPED=$(printf '%s' "$MSG" | sed 's/"/\\"/g')
    printf '{"permissionDecision":"deny","message":"%s"}\n' "$ESCAPED"
  fi
  exit 0
fi

echo '{}'
