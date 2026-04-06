#!/usr/bin/env bash
# lint-docs.sh — Doc drift detection for Prism strategic docs
#
# Catches stale references that contradict the current strategic direction.
# Run after any doc surgery. Wire into CI when ready.
#
# Assertions (update when strategy changes):
#   1. No "Electron" as active/current in CLAUDE.md or PLANS.md
#      (allowed in historical/on-hold/superseded context)
#   2. No "Tauri" anywhere in active docs
#   3. No "desktop" as current strategy in CLAUDE.md or PLANS.md
#      (allowed in "on hold", "superseded", "Not Now" context)
#   4. No "creator" as primary ICP
#      (allowed in "expansion play" context)
#   5. No broken internal doc links (markdown links to files that don't exist)
#
# Allowlist: CHANGELOG.md, TODOS.md, references/, docs/designs/, .context/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
TOTAL=5

# Colors (if terminal supports them)
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  NC='\033[0m'
else
  GREEN=''
  RED=''
  NC=''
fi

check_pass() {
  echo -e "${GREEN}ok${NC}  $1"
  PASS=$((PASS + 1))
}

check_fail() {
  echo -e "${RED}FAIL${NC}  $1"
  echo "  $2"
  FAIL=$((FAIL + 1))
}

# --- Assertion 1: No active Electron references in CLAUDE.md/PLANS.md ---
# Grep for "Electron" but exclude lines containing "on hold", "superseded", "SUPERSEDED", "ON HOLD", "Not Now"
ELECTRON_HITS=$(grep -n -i "electron" "$REPO_ROOT/CLAUDE.md" "$REPO_ROOT/PLANS.md" 2>/dev/null \
  | grep -v -i "on hold\|superseded\|not now\|ON HOLD\|SUPERSEDED" \
  | grep -v "^.*:.*#.*COMPLETE\|^.*:.*#.*LOCKED" \
  | grep -v "~~" \
  || true)

if [ -z "$ELECTRON_HITS" ]; then
  check_pass "No active Electron references in CLAUDE.md/PLANS.md"
else
  check_fail "Active Electron references found" "$ELECTRON_HITS"
fi

# --- Assertion 2: No Tauri references in active docs ---
TAURI_HITS=$(grep -rn -i "tauri" "$REPO_ROOT/CLAUDE.md" "$REPO_ROOT/PLANS.md" "$REPO_ROOT/AGENTS.md" \
  "$REPO_ROOT/docs/VISION.md" "$REPO_ROOT/docs/DOCTRINE.md" "$REPO_ROOT/docs/architecture/README.md" \
  "$REPO_ROOT/docs/yc/" "$REPO_ROOT/docs/strategy/" 2>/dev/null || true)

if [ -z "$TAURI_HITS" ]; then
  check_pass "No Tauri references in active docs"
else
  check_fail "Tauri references found" "$TAURI_HITS"
fi

# --- Assertion 3: No "desktop" as current strategy ---
DESKTOP_HITS=$(grep -n -i "desktop" "$REPO_ROOT/CLAUDE.md" "$REPO_ROOT/PLANS.md" 2>/dev/null \
  | grep -v -i "on hold\|superseded\|not now\|ON HOLD\|SUPERSEDED\|paused\|indefinitely\|original goal\|COMPLETE\|LOCKED" \
  | grep -v "~~" \
  || true)

if [ -z "$DESKTOP_HITS" ]; then
  check_pass "No desktop-as-current-strategy in CLAUDE.md/PLANS.md"
else
  check_fail "Desktop referenced as current strategy" "$DESKTOP_HITS"
fi

# --- Assertion 4: No "creator" as primary ICP ---
CREATOR_HITS=$(grep -n -i "creator" "$REPO_ROOT/CLAUDE.md" "$REPO_ROOT/PLANS.md" \
  "$REPO_ROOT/docs/VISION.md" "$REPO_ROOT/docs/DOCTRINE.md" 2>/dev/null \
  | grep -i "primary\|main\|target\|focus" \
  | grep -v -i "expansion\|secondary\|broader" \
  || true)

if [ -z "$CREATOR_HITS" ]; then
  check_pass "No creator-as-primary-ICP references"
else
  check_fail "Creator referenced as primary ICP" "$CREATOR_HITS"
fi

# --- Assertion 5: Broken internal doc links ---
# Find markdown links like [text](path) and check if the file exists
BROKEN_LINKS=""
for doc in "$REPO_ROOT/CLAUDE.md" "$REPO_ROOT/PLANS.md" "$REPO_ROOT/AGENTS.md" \
           "$REPO_ROOT/docs/VISION.md" "$REPO_ROOT/docs/DOCTRINE.md" \
           "$REPO_ROOT/docs/architecture/README.md" \
           "$REPO_ROOT/docs/strategy/"*.md "$REPO_ROOT/docs/yc/"*.md; do
  [ -f "$doc" ] || continue
  DOC_DIR="$(dirname "$doc")"
  # Extract markdown link targets, skip http/https/mailto links and anchors-only
  while IFS= read -r link; do
    # Strip any anchor (#...) from the path
    FILE_PATH="${link%%#*}"
    [ -z "$FILE_PATH" ] && continue
    # Resolve relative to the doc's directory
    RESOLVED="$DOC_DIR/$FILE_PATH"
    if [ ! -e "$RESOLVED" ]; then
      BROKEN_LINKS="$BROKEN_LINKS\n  $(basename "$doc"): $link -> $RESOLVED"
    fi
  done < <(grep -o '\[[^]]*\]([^)]*)' "$doc" 2>/dev/null | sed 's/^.*](//' | sed 's/)$//' | grep -v '^http\|^mailto\|^#\|`' || true)
done

if [ -z "$BROKEN_LINKS" ]; then
  check_pass "No broken internal doc links"
else
  check_fail "Broken internal doc links found" "$(echo -e "$BROKEN_LINKS")"
fi

# --- Summary ---
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}PASS: $PASS/$TOTAL assertions${NC}"
  exit 0
else
  echo -e "${RED}FAIL: $PASS passed, $FAIL failed out of $TOTAL assertions${NC}"
  exit 1
fi
