#!/bin/bash
# prism-stop.sh — Stop the Prism Dashboard server

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

PID_FILE="$PRISM_DIR/.dashboard-pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No running dashboard found (no PID file)." >&2
  exit 1
fi

PID="$(cat "$PID_FILE")"

if kill "$PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "◆ Prism Dashboard stopped (PID $PID)"
else
  rm -f "$PID_FILE"
  echo "Process $PID not running. Cleaned up PID file."
fi
