#!/bin/bash
# Prism Chat Hook — runs after every tool call.
# Checks .prism/chat.jsonl for unread user messages and outputs them
# so Claude sees them immediately in the conversation.

PRISM_DIR=".prism"
CHAT_FILE="$PRISM_DIR/chat.jsonl"
CURSOR_FILE="$PRISM_DIR/.chat_cursor"

# No-op if prism isn't active
[ -f "$CHAT_FILE" ] || exit 0

# Current line count
TOTAL=$(wc -l < "$CHAT_FILE" 2>/dev/null | tr -d ' ')
[ -z "$TOTAL" ] || [ "$TOTAL" = "0" ] && exit 0

# Last processed line
SEEN=0
[ -f "$CURSOR_FILE" ] && SEEN=$(cat "$CURSOR_FILE" 2>/dev/null | tr -d ' ')

# Nothing new
[ "$TOTAL" -le "$SEEN" ] && exit 0

# Extract new user messages only
NEW_MSGS=$(tail -n +"$((SEEN + 1))" "$CHAT_FILE" | grep '"from":"user"')

# Update cursor regardless (so we don't re-show prism's own replies)
echo "$TOTAL" > "$CURSOR_FILE"

# If there are new user messages, output them
if [ -n "$NEW_MSGS" ]; then
  echo ""
  echo "[PRISM DASHBOARD] New message from the founder:"
  echo "$NEW_MSGS" | while IFS= read -r line; do
    TEXT=$(echo "$line" | sed 's/.*"text":"\(.*\)".*/\1/' | sed 's/\\"/"/g')
    echo "  > $TEXT"
  done
  echo ""
  echo "Respond by appending to .prism/chat.jsonl and then act on their request."
fi
