#!/usr/bin/env bash
# test-scan-parity.sh — Verify that the new prism-scan.sh produces valid JSON
# and matches expected structure.
#
# Usage: bash scripts/test-scan-parity.sh
#
# Exit: 0 = all checks pass, 1 = failure
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCAN_SCRIPT="$SCRIPT_DIR/prism-scan.sh"

PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "0" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Scan Script Parity Tests ==="

# Create a temp project directory
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# --- Test 1: Empty project ---
echo ""
echo "Test 1: Empty project"
OUTPUT=$(bash "$SCAN_SCRIPT" "$TMPDIR" 2>/dev/null)
JSON_FILE=$(echo "$OUTPUT" | grep -o '/tmp/prism-scan-[0-9]*.json')

if [ -n "$JSON_FILE" ] && [ -f "$JSON_FILE" ]; then
  # Verify valid JSON
  jq empty "$JSON_FILE" 2>/dev/null
  check "produces valid JSON" "$?"

  STATUS=$(jq -r '.status' "$JSON_FILE")
  [ "$STATUS" = "NONE" ]
  check "status is NONE for empty project" "$?"

  CHANGE_COUNT=$(jq -r '.openspec.change_count' "$JSON_FILE")
  [ "$CHANGE_COUNT" = "0" ]
  check "change_count is 0" "$?"

  rm -f "$JSON_FILE"
else
  check "produces output file" "1"
fi

# --- Test 2: Project with PRODUCT.md ---
echo ""
echo "Test 2: Project with PRODUCT.md"
cat > "$TMPDIR/PRODUCT.md" << 'EOF'
# Test Product

This is a test product for parity testing.
EOF

OUTPUT=$(bash "$SCAN_SCRIPT" "$TMPDIR" 2>/dev/null)
JSON_FILE=$(echo "$OUTPUT" | grep -o '/tmp/prism-scan-[0-9]*.json')

if [ -n "$JSON_FILE" ] && [ -f "$JSON_FILE" ]; then
  jq empty "$JSON_FILE" 2>/dev/null
  check "produces valid JSON" "$?"

  STATUS=$(jq -r '.status' "$JSON_FILE")
  [ "$STATUS" = "PRODUCT_NEXT" ]
  check "status is PRODUCT_NEXT with PRODUCT.md" "$?"

  HAS_PRODUCT=$(jq -r '.product.exists' "$JSON_FILE")
  [ "$HAS_PRODUCT" = "true" ]
  check "product.exists is true" "$?"

  MEMORY_MODEL=$(jq -r '.product_memory.model' "$JSON_FILE")
  [ "$MEMORY_MODEL" = "legacy" ]
  check "memory_model is legacy" "$?"

  rm -f "$JSON_FILE"
else
  check "produces output file" "1"
fi

# --- Test 3: Project with split memory model ---
echo ""
echo "Test 3: Project with split memory model"
mkdir -p "$TMPDIR/.prism/memory"
echo "# Product" > "$TMPDIR/.prism/memory/product.md"
echo "# Architecture" > "$TMPDIR/.prism/memory/architecture.md"

OUTPUT=$(bash "$SCAN_SCRIPT" "$TMPDIR" 2>/dev/null)
JSON_FILE=$(echo "$OUTPUT" | grep -o '/tmp/prism-scan-[0-9]*.json')

if [ -n "$JSON_FILE" ] && [ -f "$JSON_FILE" ]; then
  jq empty "$JSON_FILE" 2>/dev/null
  check "produces valid JSON" "$?"

  MEMORY_MODEL=$(jq -r '.product_memory.model' "$JSON_FILE")
  [ "$MEMORY_MODEL" = "split" ]
  check "memory_model is split" "$?"

  FILE_COUNT=$(jq -r '.product_memory.file_count' "$JSON_FILE")
  [ "$FILE_COUNT" = "2" ]
  check "memory file_count is 2" "$?"

  # Verify memory_files is a valid JSON array with correct entries
  FILES_LEN=$(jq '.product_memory.files | length' "$JSON_FILE")
  [ "$FILES_LEN" = "2" ]
  check "memory_files array has 2 entries" "$?"

  # Check the array contains the right filenames
  HAS_PRODUCT=$(jq '.product_memory.files | index("product.md") != null' "$JSON_FILE")
  [ "$HAS_PRODUCT" = "true" ]
  check "memory_files contains product.md" "$?"

  HAS_ARCH=$(jq '.product_memory.files | index("architecture.md") != null' "$JSON_FILE")
  [ "$HAS_ARCH" = "true" ]
  check "memory_files contains architecture.md" "$?"

  rm -f "$JSON_FILE"
else
  check "produces output file" "1"
fi

# --- Test 4: Registry (single jq call) ---
echo ""
echo "Test 4: Registry with single jq extraction"
mkdir -p "$TMPDIR/.prism"
cat > "$TMPDIR/.prism/registry.json" << 'EOF'
{
  "change": { "stage": "build", "name": "test-change" },
  "workers": [{"id": "w1"}, {"id": "w2"}]
}
EOF

OUTPUT=$(bash "$SCAN_SCRIPT" "$TMPDIR" 2>/dev/null)
JSON_FILE=$(echo "$OUTPUT" | grep -o '/tmp/prism-scan-[0-9]*.json')

if [ -n "$JSON_FILE" ] && [ -f "$JSON_FILE" ]; then
  jq empty "$JSON_FILE" 2>/dev/null
  check "produces valid JSON" "$?"

  REG_STATUS=$(jq -r '.registry.status' "$JSON_FILE")
  [ "$REG_STATUS" = "found" ]
  check "registry status is found" "$?"

  REG_STAGE=$(jq -r '.registry.stage' "$JSON_FILE")
  [ "$REG_STAGE" = "build" ]
  check "registry stage is build" "$?"

  REG_WORKERS=$(jq -r '.registry.workers' "$JSON_FILE")
  [ "$REG_WORKERS" = "2" ]
  check "registry workers is 2" "$?"

  rm -f "$JSON_FILE"
else
  check "produces output file" "1"
fi

# --- Summary ---
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
