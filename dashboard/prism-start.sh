#!/bin/bash
# prism-start.sh — Start the Prism Dashboard server and open browser

PORT=3333

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    *) shift ;;
  esac
done

# Find .prism directory: check cwd, then walk up
find_prism_dir() {
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/.prism" ]]; then
      echo "$dir/.prism"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

PRISM_DIR="$(find_prism_dir)"
if [[ -z "$PRISM_DIR" ]]; then
  echo "Error: No .prism directory found in current or parent directories." >&2
  exit 1
fi

# Resolve server.cjs relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="$SCRIPT_DIR/server.cjs"

if [[ ! -f "$SERVER" ]]; then
  echo "Error: server.cjs not found at $SERVER" >&2
  exit 1
fi

# Check if server is already running on this port
if curl -s -o /dev/null --connect-timeout 1 "http://localhost:$PORT" 2>/dev/null; then
  open "http://localhost:$PORT"
  echo "◆ Prism Dashboard — http://localhost:$PORT"
  exit 0
fi

# Start server in background
PRISM_DIR="$PRISM_DIR" PORT="$PORT" node "$SERVER" &
SERVER_PID=$!

# Store PID for cleanup
echo "$SERVER_PID" > "$PRISM_DIR/.dashboard-pid"

# Wait for server to be ready (up to 5 seconds)
for i in $(seq 1 50); do
  if curl -s -o /dev/null --connect-timeout 1 "http://localhost:$PORT" 2>/dev/null; then
    open "http://localhost:$PORT"
    echo "◆ Prism Dashboard — http://localhost:$PORT"
    exit 0
  fi
  sleep 0.1
done

echo "Error: Server failed to start within 5 seconds." >&2
kill "$SERVER_PID" 2>/dev/null
rm -f "$PRISM_DIR/.dashboard-pid"
exit 1
