#!/usr/bin/env bash
# prism-pipeline.sh — Generate and open the Prism pipeline visualization.
#
# Usage: prism-pipeline.sh [project-root]
# Default project-root: current directory
#
# Generates .prism/dogfood/PIPELINE.html and opens it in the default browser.
# Exit: 0 = success, non-zero = error
set -uo pipefail

ROOT="${1:-.}"
ROOT=$(cd "$ROOT" && pwd)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[prism-pipeline] Generating pipeline visualization..."

npx tsx "$REPO_ROOT/packages/orchestrator/src/cli.ts" pipeline "$ROOT" > /dev/null

if [ $? -ne 0 ]; then
  echo "[prism-pipeline] Failed to generate pipeline snapshot" >&2
  exit 1
fi

HTML_PATH="$ROOT/.prism/dogfood/PIPELINE.html"

if [ -f "$HTML_PATH" ]; then
  echo "[prism-pipeline] Opening $HTML_PATH"
  open "$HTML_PATH" 2>/dev/null || xdg-open "$HTML_PATH" 2>/dev/null || echo "[prism-pipeline] Open $HTML_PATH in your browser"
else
  echo "[prism-pipeline] PIPELINE.html not found at $HTML_PATH" >&2
  exit 1
fi
