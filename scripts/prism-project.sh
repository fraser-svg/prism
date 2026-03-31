#!/usr/bin/env bash
# prism-project.sh — Generate and optionally open the Prism project visualization.
#
# Usage: prism-project.sh [--no-open] [project-root]
# Default project-root: current directory
#
# Generates .prism/dogfood/PROJECT.html and opens it in the default browser
# unless --no-open is passed.
# Exit: 0 = success, non-zero = error
set -euo pipefail

NO_OPEN=false
if [ "${1:-}" = "--no-open" ]; then
  NO_OPEN=true
  shift
fi

ROOT="${1:-.}"
ROOT=$(cd "$ROOT" && pwd)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[prism-project] Generating project visualization..."

npx tsx "$REPO_ROOT/packages/orchestrator/src/cli.ts" project "$ROOT" > /dev/null

if [ $? -ne 0 ]; then
  echo "[prism-project] Failed to generate project snapshot" >&2
  exit 1
fi

HTML_PATH="$ROOT/.prism/dogfood/PROJECT.html"

if [ -f "$HTML_PATH" ]; then
  if [ "$NO_OPEN" = "true" ]; then
    echo "[prism-project] Generated $HTML_PATH"
  else
    echo "[prism-project] Opening $HTML_PATH"
    open "$HTML_PATH" 2>/dev/null || xdg-open "$HTML_PATH" 2>/dev/null || echo "[prism-project] Open $HTML_PATH in your browser"
  fi
else
  echo "[prism-project] PROJECT.html not found at $HTML_PATH" >&2
  exit 1
fi
