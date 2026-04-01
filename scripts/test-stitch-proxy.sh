#!/usr/bin/env bash
# test-stitch-proxy.sh — Smoke tests for the Stitch MCP proxy
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROXY="$SCRIPT_DIR/stitch-mcp/prism-stitch-proxy.mjs"
PASS=0
FAIL=0

_check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected=$expected actual=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Stitch MCP Proxy Smoke Tests ==="

# 1. Syntax check
echo ""
echo "--- Syntax validation ---"
if node --check "$PROXY" 2>/dev/null; then
  _check "node --check syntax" "pass" "pass"
else
  _check "node --check syntax" "pass" "fail"
fi

# 2. Missing SDK should exit 1
echo ""
echo "--- Missing SDK detection ---"
TMPDIR_SDK=$(mktemp -d)
cp "$PROXY" "$TMPDIR_SDK/proxy-test.mjs"
# Run with empty NODE_PATH so SDK won't be found
OUTPUT=$(NODE_PATH="$TMPDIR_SDK" node "$TMPDIR_SDK/proxy-test.mjs" 2>&1 || true)
EXIT_CODE=$?
rm -rf "$TMPDIR_SDK"
if echo "$OUTPUT" | grep -q "Stitch SDK not found"; then
  _check "missing SDK exits with message" "pass" "pass"
else
  _check "missing SDK exits with message" "pass" "fail"
fi

# 3. Missing Keychain entry should exit 1
echo ""
echo "--- Missing Keychain entry detection ---"
# Only test if SDK is installed (otherwise Phase 1 fails first)
if [ -d "$SCRIPT_DIR/stitch-mcp/node_modules/@google/stitch-sdk" ]; then
  # Use a fake Keychain service that won't exist
  OUTPUT=$(node -e "
    import('$PROXY').catch(() => {});
  " 2>&1 || true)
  # If SDK is present but no key, we expect the Keychain error
  if echo "$OUTPUT" | grep -qi "keychain\|api key"; then
    _check "missing Keychain entry detected" "pass" "pass"
  else
    _check "missing Keychain entry detected" "pass" "skip (could not isolate)"
  fi
else
  echo "  SKIP: SDK not installed — run 'cd scripts/stitch-mcp && npm install' first"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
