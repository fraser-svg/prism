#!/usr/bin/env bash
# prism-install-hook.sh — One-time hook registration for Prism auto-update
# Adds a SessionStart hook to ~/.claude/settings.json that runs prism-check-update.js
# Idempotent: safe to run multiple times.
set -euo pipefail

SETTINGS="$HOME/.claude/settings.json"
HOOK_SCRIPT="\$HOME/.claude/skills/prism/hooks/prism-check-update.js"

if [ ! -f "$SETTINGS" ]; then
  echo "ERROR: $SETTINGS not found. Is Claude Code installed?" >&2
  exit 1
fi

# Check if already registered
if grep -q "prism-check-update" "$SETTINGS" 2>/dev/null; then
  echo "Prism auto-update hook already registered."
  exit 0
fi

# Use python3 to safely modify the JSON
python3 << 'PYEOF'
import json, sys, os

settings_path = os.path.expanduser("~/.claude/settings.json")

try:
    with open(settings_path, "r") as f:
        data = json.load(f)
except (json.JSONDecodeError, FileNotFoundError) as e:
    print(f"ERROR: Could not parse {settings_path}: {e}", file=sys.stderr)
    sys.exit(1)

hooks = data.setdefault("hooks", {})
session_start = hooks.setdefault("SessionStart", [])

entry = {
    "type": "command",
    "command": 'node "$HOME/.claude/skills/prism/hooks/prism-check-update.js"'
}

# Add to existing hooks block if one exists, otherwise create a new block
if session_start and isinstance(session_start[0], dict) and "hooks" in session_start[0]:
    session_start[0]["hooks"].append(entry)
else:
    session_start.insert(0, {"hooks": [entry]})

with open(settings_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("Registered Prism auto-update hook in ~/.claude/settings.json")
PYEOF
