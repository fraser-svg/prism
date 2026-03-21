#!/usr/bin/env bash
# test-hooks.sh — Tests for Prism enforcement hooks
# Simulates tool call payloads and verifies BLOCK/ALLOW behavior.
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Setup test environment
TEST_DIR=$(mktemp -d)
mkdir -p "$TEST_DIR/.prism"
cd "$TEST_DIR"

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

assert_allow() {
  local test_name="$1"
  local result="$2"
  if echo "$result" | grep -q 'permissionDecision'; then
    echo "FAIL: $test_name — expected ALLOW but got BLOCK: $result"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: $test_name"
    PASS=$((PASS + 1))
  fi
}

assert_deny() {
  local test_name="$1"
  local result="$2"
  if echo "$result" | grep -q 'permissionDecision'; then
    echo "PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $test_name — expected DENY but got: $result"
    FAIL=$((FAIL + 1))
  fi
}

# ==========================================
# Test: operator-boundary.sh
# ==========================================
echo ""
echo "=== Testing operator-boundary.sh ==="

# Create a fake transcript with a violation
TRANSCRIPT="$TEST_DIR/transcript.txt"
echo "Assistant: You should run this in your terminal: npm start" > "$TRANSCRIPT"

RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"transcript_path":"'"$TRANSCRIPT"'"}' | bash "$SCRIPT_DIR/operator-boundary.sh")
assert_deny "operator-boundary: 'run this in your terminal'" "$RESULT"

# Clean transcript — no violation
echo "Assistant: I've set up the server and it's running." > "$TRANSCRIPT"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"transcript_path":"'"$TRANSCRIPT"'"}' | bash "$SCRIPT_DIR/operator-boundary.sh")
assert_allow "operator-boundary: clean text" "$RESULT"

# No .prism directory — hook should be inactive
rm -rf "$TEST_DIR/.prism"
echo "Assistant: Open a new terminal and run npm start" > "$TRANSCRIPT"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"transcript_path":"'"$TRANSCRIPT"'"}' | bash "$SCRIPT_DIR/operator-boundary.sh")
assert_allow "operator-boundary: no .prism dir (inactive)" "$RESULT"

# Restore .prism for remaining tests
mkdir -p "$TEST_DIR/.prism"

# ==========================================
# Test: research-gate.sh
# ==========================================
echo ""
echo "=== Testing research-gate.sh ==="

# No history.jsonl, writing a new file — should BLOCK
RESULT=$(echo '{"tool_name":"Write","tool_input":{"file_path":"'"$TEST_DIR/src/app.js"'"}}' | bash "$SCRIPT_DIR/research-gate.sh")
assert_deny "research-gate: no history, new file" "$RESULT"

# Write a session_start + research entry
echo '{"action":"session_start","ts":"2026-03-21T19:00:00Z"}' > "$TEST_DIR/.prism/history.jsonl"
echo '{"action":"research","ts":"2026-03-21T19:01:00Z","topic":"test"}' >> "$TEST_DIR/.prism/history.jsonl"

RESULT=$(echo '{"tool_name":"Write","tool_input":{"file_path":"'"$TEST_DIR/src/app.js"'"}}' | bash "$SCRIPT_DIR/research-gate.sh")
assert_allow "research-gate: research logged, new file" "$RESULT"

# .prism/ file — should SKIP regardless
rm "$TEST_DIR/.prism/history.jsonl" 2>/dev/null || true
RESULT=$(echo '{"tool_name":"Write","tool_input":{"file_path":"'"$TEST_DIR/.prism/state.json"'"}}' | bash "$SCRIPT_DIR/research-gate.sh")
assert_allow "research-gate: .prism path (skip)" "$RESULT"

# CLAUDE.md — should SKIP
RESULT=$(echo '{"tool_name":"Write","tool_input":{"file_path":"'"$TEST_DIR/CLAUDE.md"'"}}' | bash "$SCRIPT_DIR/research-gate.sh")
assert_allow "research-gate: CLAUDE.md (skip)" "$RESULT"

# Existing file (edit) — should SKIP
touch "$TEST_DIR/existing.js"
echo '{"action":"session_start","ts":"2026-03-21T19:00:00Z"}' > "$TEST_DIR/.prism/history.jsonl"
RESULT=$(echo '{"tool_name":"Write","tool_input":{"file_path":"'"$TEST_DIR/existing.js"'"}}' | bash "$SCRIPT_DIR/research-gate.sh")
assert_allow "research-gate: existing file (skip)" "$RESULT"

# Session resume — old research before session_start should not count
echo '{"action":"research","ts":"2026-03-20T10:00:00Z","topic":"old"}' > "$TEST_DIR/.prism/history.jsonl"
echo '{"action":"session_start","ts":"2026-03-21T19:00:00Z"}' >> "$TEST_DIR/.prism/history.jsonl"
rm "$TEST_DIR/existing.js"
RESULT=$(echo '{"tool_name":"Write","tool_input":{"file_path":"'"$TEST_DIR/new-file.js"'"}}' | bash "$SCRIPT_DIR/research-gate.sh")
assert_deny "research-gate: stale research before session_start" "$RESULT"

# Non-Write tool — should SKIP
RESULT=$(echo '{"tool_name":"Read","tool_input":{"file_path":"'"$TEST_DIR/foo"'"}}' | bash "$SCRIPT_DIR/research-gate.sh")
assert_allow "research-gate: non-Write tool (skip)" "$RESULT"

# ==========================================
# Test: verification-gate.sh
# ==========================================
echo ""
echo "=== Testing verification-gate.sh ==="

# npm install with no verification — should BLOCK
echo '{"action":"session_start","ts":"2026-03-21T19:00:00Z"}' > "$TEST_DIR/.prism/history.jsonl"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"npm install express"}}' | bash "$SCRIPT_DIR/verification-gate.sh")
assert_deny "verification-gate: npm install, no verification" "$RESULT"

# Add verification entry — should ALLOW
echo '{"action":"verification","ts":"2026-03-21T19:01:00Z","topic":"express","result":"pass"}' >> "$TEST_DIR/.prism/history.jsonl"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"npm install express"}}' | bash "$SCRIPT_DIR/verification-gate.sh")
assert_allow "verification-gate: npm install, verified" "$RESULT"

# pip install — should BLOCK without verification
echo '{"action":"session_start","ts":"2026-03-21T20:00:00Z"}' > "$TEST_DIR/.prism/history.jsonl"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"pip install requests"}}' | bash "$SCRIPT_DIR/verification-gate.sh")
assert_deny "verification-gate: pip install, no verification" "$RESULT"

# Regular command — should SKIP
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' | bash "$SCRIPT_DIR/verification-gate.sh")
assert_allow "verification-gate: ls command (skip)" "$RESULT"

RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"git status"}}' | bash "$SCRIPT_DIR/verification-gate.sh")
assert_allow "verification-gate: git status (skip)" "$RESULT"

# curl to localhost — should SKIP
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"curl http://localhost:3000/api"}}' | bash "$SCRIPT_DIR/verification-gate.sh")
assert_allow "verification-gate: curl localhost (skip)" "$RESULT"

# curl to external — should BLOCK without verification
echo '{"action":"session_start","ts":"2026-03-21T21:00:00Z"}' > "$TEST_DIR/.prism/history.jsonl"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"curl https://api.twitter.com/v2/tweets"}}' | bash "$SCRIPT_DIR/verification-gate.sh")
assert_deny "verification-gate: curl external API, no verification" "$RESULT"

# No .prism directory — should be inactive
rm -rf "$TEST_DIR/.prism"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"npm install express"}}' | bash "$SCRIPT_DIR/verification-gate.sh")
assert_allow "verification-gate: no .prism dir (inactive)" "$RESULT"

# ==========================================
# Summary
# ==========================================
echo ""
echo "=== Results ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
TOTAL=$((PASS + FAIL))
echo "TOTAL: $TOTAL"

if [ "$FAIL" -gt 0 ]; then
  echo "SOME TESTS FAILED"
  exit 1
else
  echo "ALL TESTS PASSED"
  exit 0
fi
