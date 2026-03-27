#!/usr/bin/env bash
# test-scripts.sh — Test suite for Prism v3 scripts
# Exercises happy paths and error paths for all scripts.
#
# Usage: test-scripts.sh [script-dir]
set -uo pipefail

SCRIPT_DIR="${1:-$(cd "$(dirname "$0")" && pwd)}"
PASS=0
FAIL=0
TEST_ROOT="/tmp/prism-test-$$"

# Colors (if terminal supports them)
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

_setup() {
  rm -rf "$TEST_ROOT"
  mkdir -p "$TEST_ROOT"
  cd "$TEST_ROOT" || exit 1
  git init -q
  git commit --allow-empty -m "initial" -q
}

_teardown() {
  rm -rf "$TEST_ROOT"
  # Clean up any leftover lock dirs
  rmdir "$TEST_ROOT/.prism/registry.lockdir" 2>/dev/null || true
}

_assert() {
  local desc="$1"
  local result="$2"
  local expected="$3"
  if [ "$result" = "$expected" ]; then
    printf "${GREEN}PASS${NC}: %s\n" "$desc"
    PASS=$((PASS + 1))
  else
    printf "${RED}FAIL${NC}: %s (expected '%s', got '%s')\n" "$desc" "$expected" "$result"
    FAIL=$((FAIL + 1))
  fi
}

_assert_contains() {
  local desc="$1"
  local haystack="$2"
  local needle="$3"
  if printf '%s' "$haystack" | grep -q "$needle" 2>/dev/null; then
    printf "${GREEN}PASS${NC}: %s\n" "$desc"
    PASS=$((PASS + 1))
  else
    printf "${RED}FAIL${NC}: %s (output does not contain '%s')\n" "$desc" "$needle"
    FAIL=$((FAIL + 1))
  fi
}

_assert_exit() {
  local desc="$1"
  local exit_code="$2"
  local expected="$3"
  if [ "$exit_code" -eq "$expected" ]; then
    printf "${GREEN}PASS${NC}: %s (exit %d)\n" "$desc" "$exit_code"
    PASS=$((PASS + 1))
  else
    printf "${RED}FAIL${NC}: %s (expected exit %d, got %d)\n" "$desc" "$expected" "$exit_code"
    FAIL=$((FAIL + 1))
  fi
}

# ============================================================
echo "=== prism-registry.sh ==="
# ============================================================

# Happy path: full lifecycle
_setup
OUT=$("$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "init creates registry" "$OUT" "OK: initialized"
_assert "registry.json exists" "$([ -f "$TEST_ROOT/.prism/registry.json" ] && echo yes || echo no)" "yes"

OUT=$("$SCRIPT_DIR/prism-registry.sh" worker "$TEST_ROOT" "test-change" "w1" "running" 2>/dev/null)
_assert_contains "worker running" "$OUT" "w1 → running"

OUT=$("$SCRIPT_DIR/prism-registry.sh" worker "$TEST_ROOT" "test-change" "w1" "completed" 2>/dev/null)
_assert_contains "worker completed" "$OUT" "w1 → completed"

WSTATUS=$(jq -r '.workers[0].status' "$TEST_ROOT/.prism/registry.json")
_assert "worker status in JSON" "$WSTATUS" "completed"

OUT=$("$SCRIPT_DIR/prism-registry.sh" log "$TEST_ROOT" "test-change" "milestone" "Built auth" 2>/dev/null)
_assert_contains "log event" "$OUT" "logged milestone"

EVENTS=$(jq '.events | length' "$TEST_ROOT/.prism/registry.json")
_assert "event count" "$EVENTS" "1"

OUT=$("$SCRIPT_DIR/prism-registry.sh" archive "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "archive" "$OUT" "OK: archived"

STAGE=$(jq -r '.change.stage' "$TEST_ROOT/.prism/registry.json")
_assert "archived stage" "$STAGE" "archived"

# Duplicate init should skip
OUT=$("$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "duplicate init skips" "$OUT" "SKIP"

# Error: update before init on fresh dir
_teardown
_setup
OUT=$("$SCRIPT_DIR/prism-registry.sh" status "$TEST_ROOT" 2>/dev/null)
_assert_contains "status without init" "$OUT" "ERROR"

# Error: missing args
OUT=$("$SCRIPT_DIR/prism-registry.sh" init "" "" 2>&1 || true)
_assert_contains "missing root arg" "$OUT" "Usage\|ERROR"

# Error: malformed JSON on stdin for update
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test" 2>/dev/null
OUT=$(echo "not json" | "$SCRIPT_DIR/prism-registry.sh" update "$TEST_ROOT" "test" 2>&1 || true)
_assert_contains "malformed JSON rejected" "$OUT" "ERROR\|invalid"

# Error: shell metacharacters in change name
OUT=$("$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" 'test;rm -rf /' 2>/dev/null)
_assert_contains "metacharacters sanitized" "$OUT" "OK\|SKIP"
# Verify no damage
_assert "test dir still exists" "$([ -d "$TEST_ROOT" ] && echo yes || echo no)" "yes"

# .bak recovery
_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test" 2>/dev/null
"$SCRIPT_DIR/prism-registry.sh" log "$TEST_ROOT" "test" "info" "logged" 2>/dev/null
# Corrupt the registry
echo "CORRUPT" > "$TEST_ROOT/.prism/registry.json"
# Status should recover from .bak
OUT=$("$SCRIPT_DIR/prism-registry.sh" status "$TEST_ROOT" 2>/dev/null)
_assert_contains "bak recovery" "$OUT" "OK: stage="

# ============================================================
echo ""
echo "=== prism-save.sh ==="
# ============================================================

_teardown
_setup

# Nothing to save
OUT=$("$SCRIPT_DIR/prism-save.sh" "$TEST_ROOT" "empty save" 2>&1)
_assert_contains "nothing to save" "$OUT" "nothing to save"

# Stage and save a file
echo "hello" > "$TEST_ROOT/test.txt"
OUT=$("$SCRIPT_DIR/prism-save.sh" "$TEST_ROOT" "first save" 2>/dev/null)
_assert_contains "saves new file" "$OUT" "OK: saved"
COMMITTED=$(git -C "$TEST_ROOT" log --oneline -1)
_assert_contains "commit message" "$COMMITTED" "wip: first save"

# Blocklist: .env should not be staged
echo "SECRET=foo" > "$TEST_ROOT/.env"
echo "tracked change" >> "$TEST_ROOT/test.txt"
OUT=$("$SCRIPT_DIR/prism-save.sh" "$TEST_ROOT" "with secret" 2>/dev/null)
ENV_IN_COMMIT=$(git -C "$TEST_ROOT" diff-tree --no-commit-id --name-only -r HEAD | grep ".env" || echo "")
_assert ".env not committed" "$ENV_IN_COMMIT" ""

# Blocklist: credential files
echo "{}" > "$TEST_ROOT/credentials.json"
echo "change" >> "$TEST_ROOT/test.txt"
"$SCRIPT_DIR/prism-save.sh" "$TEST_ROOT" "with creds" 2>/dev/null
CRED_IN_COMMIT=$(git -C "$TEST_ROOT" diff-tree --no-commit-id --name-only -r HEAD | grep "credential" || echo "")
_assert "credentials.json not committed" "$CRED_IN_COMMIT" ""

# Non-JS files should be staged (blocklist approach)
echo "print('hello')" > "$TEST_ROOT/app.py"
echo "package main" > "$TEST_ROOT/main.go"
echo "fn main() {}" > "$TEST_ROOT/main.rs"
echo "change" >> "$TEST_ROOT/test.txt"
"$SCRIPT_DIR/prism-save.sh" "$TEST_ROOT" "multi-lang" 2>/dev/null
PY_IN=$(git -C "$TEST_ROOT" diff-tree --no-commit-id --name-only -r HEAD | grep "app.py" || echo "")
GO_IN=$(git -C "$TEST_ROOT" diff-tree --no-commit-id --name-only -r HEAD | grep "main.go" || echo "")
RS_IN=$(git -C "$TEST_ROOT" diff-tree --no-commit-id --name-only -r HEAD | grep "main.rs" || echo "")
_assert "python file staged" "$PY_IN" "app.py"
_assert "go file staged" "$GO_IN" "main.go"
_assert "rust file staged" "$RS_IN" "main.rs"

# Error: not a git repo
NOTGIT="/tmp/prism-notgit-$$"
mkdir -p "$NOTGIT"
OUT=$("$SCRIPT_DIR/prism-save.sh" "$NOTGIT" "save" 2>&1 || true)
_assert_contains "not a git repo" "$OUT" "not a git repo"
rm -rf "$NOTGIT"

# ============================================================
echo ""
echo "=== prism-scan.sh ==="
# ============================================================

_teardown
_setup

# No product, no changes
OUT=$("$SCRIPT_DIR/prism-scan.sh" "$TEST_ROOT" 2>/dev/null)
_assert_contains "empty project = NONE" "$OUT" "status=NONE"

# With PRODUCT.md
echo "# My Product" > "$TEST_ROOT/PRODUCT.md"
OUT=$("$SCRIPT_DIR/prism-scan.sh" "$TEST_ROOT" 2>/dev/null)
_assert_contains "product no changes = PRODUCT_NEXT" "$OUT" "status=PRODUCT_NEXT"

# With PRODUCT.md + change
mkdir -p "$TEST_ROOT/openspec/changes/add-auth/specs"
echo "# Spec" > "$TEST_ROOT/openspec/changes/add-auth/specs/spec.md"
OUT=$("$SCRIPT_DIR/prism-scan.sh" "$TEST_ROOT" 2>/dev/null)
_assert_contains "product + change = PRODUCT_RESUME" "$OUT" "status=PRODUCT_RESUME"

# With v2 prism-log.md
echo "## Build Log" > "$TEST_ROOT/prism-log.md"
OUT_FILE=$(printf '/tmp/prism-scan-%s.json' "$$") # approximate
OUT=$("$SCRIPT_DIR/prism-scan.sh" "$TEST_ROOT" 2>/dev/null)
# Read the actual temp file
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-scan-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  V2_FLAG=$(jq -r '.v2_compat.has_prism_log' "$TEMP_FILE")
  _assert "v2 log detected" "$V2_FLAG" "true"
else
  _assert "v2 log detected (could not read temp)" "no" "yes"
fi

# ============================================================
echo ""
echo "=== prism-verify.sh ==="
# ============================================================

_teardown
_setup

# File exists check
echo "content" > "$TEST_ROOT/exists.ts"
OUT=$("$SCRIPT_DIR/prism-verify.sh" "$TEST_ROOT" --files "exists.ts" 2>/dev/null)
_assert_contains "existing file passes" "$OUT" "OK: all checks passed"

# File missing
OUT=$("$SCRIPT_DIR/prism-verify.sh" "$TEST_ROOT" --files "missing.ts" 2>/dev/null)
_assert_contains "missing file fails" "$OUT" "FAIL"

# Empty file
touch "$TEST_ROOT/empty.ts"
OUT=$("$SCRIPT_DIR/prism-verify.sh" "$TEST_ROOT" --files "empty.ts" 2>/dev/null)
_assert_contains "empty file fails" "$OUT" "FAIL"

# Lint with no config = skipped
TEMP_FILE=$(echo "$("$SCRIPT_DIR/prism-verify.sh" "$TEST_ROOT" --lint 2>/dev/null)" | grep -o '/tmp/prism-verify-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  LINT_STATUS=$(jq -r '.checks.lint' "$TEMP_FILE")
  _assert "lint skipped without config" "$LINT_STATUS" "skipped_no_config"
else
  _assert "lint skipped (could not read temp)" "no" "yes"
fi

# ============================================================
echo ""
echo "=== prism-checkpoint.sh ==="
# ============================================================

_teardown
_setup
mkdir -p "$TEST_ROOT/.prism"
mkdir -p "$TEST_ROOT/openspec/changes/test-change"

# Happy path
echo '{"stage":"build","progress":"2/4","decisions":["chose REST"],"next_steps":["Build API"]}' | \
  "$SCRIPT_DIR/prism-checkpoint.sh" "$TEST_ROOT" "test-change" 2>/dev/null
_assert "session-context.md created" "$([ -f "$TEST_ROOT/.prism/session-context.md" ] && echo yes || echo no)" "yes"
_assert_contains "stage in context" "$(cat "$TEST_ROOT/.prism/session-context.md")" "build"
_assert_contains "decision in context" "$(cat "$TEST_ROOT/.prism/session-context.md")" "chose REST"

# Also written to openspec change dir
_assert "openspec context created" "$([ -f "$TEST_ROOT/openspec/changes/test-change/session-context.md" ] && echo yes || echo no)" "yes"

# Empty stdin = no-op
OUT=$("$SCRIPT_DIR/prism-checkpoint.sh" "$TEST_ROOT" "test-change" < /dev/null 2>/dev/null)
_assert_contains "empty stdin = no-op" "$OUT" "SKIP\|no_data"

# Invalid JSON
OUT=$(echo "not json" | "$SCRIPT_DIR/prism-checkpoint.sh" "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "invalid JSON rejected" "$OUT" "ERROR\|invalid"

# ============================================================
echo ""
echo "=== prism-state.sh ==="
# ============================================================

_teardown
_setup

# No registry, no product files — should still generate STATE.md
OUT=$("$SCRIPT_DIR/prism-state.sh" "$TEST_ROOT" 2>/dev/null)
_assert_contains "generates STATE.md without registry" "$OUT" "OK: STATE.md generated"
_assert "STATE.md exists" "$([ -f "$TEST_ROOT/STATE.md" ] && echo yes || echo no)" "yes"
_assert_contains "STATE.md has header" "$(cat "$TEST_ROOT/STATE.md")" "# State"
_assert_contains "STATE.md has do-not-edit notice" "$(cat "$TEST_ROOT/STATE.md")" "do not edit manually"

# With registry — should include change info
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-feature" 2>/dev/null
OUT=$("$SCRIPT_DIR/prism-state.sh" "$TEST_ROOT" 2>/dev/null)
_assert_contains "STATE.md with registry has change name" "$(cat "$TEST_ROOT/STATE.md")" "test-feature"
_assert_contains "STATE.md with registry has stage" "$(cat "$TEST_ROOT/STATE.md")" "understand"

# Read temp file JSON
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-state-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  HAS_REG=$(jq -r '.has_registry' "$TEMP_FILE")
  _assert "JSON has_registry=true" "$HAS_REG" "true"
  JSON_STAGE=$(jq -r '.stage' "$TEMP_FILE")
  _assert "JSON stage=understand" "$JSON_STAGE" "understand"
else
  _assert "could read state temp file" "no" "yes"
fi

# With PRODUCT.md
echo "# Product: TestApp" > "$TEST_ROOT/PRODUCT.md"
OUT=$("$SCRIPT_DIR/prism-state.sh" "$TEST_ROOT" 2>/dev/null)
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-state-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  HAS_PROD=$(jq -r '.has_product' "$TEMP_FILE")
  _assert "JSON has_product=true" "$HAS_PROD" "true"
else
  _assert "could read state temp file with product" "no" "yes"
fi

# With DECISIONS.md
cat > "$TEST_ROOT/DECISIONS.md" << 'DEC'
# Decisions: TestApp

### ADR-1: Use SQLite
**Date:** 2026-03-27

### ADR-2: REST over GraphQL
**Date:** 2026-03-27
DEC
OUT=$("$SCRIPT_DIR/prism-state.sh" "$TEST_ROOT" 2>/dev/null)
_assert_contains "STATE.md includes recent decisions" "$(cat "$TEST_ROOT/STATE.md")" "ADR-1"
_assert_contains "STATE.md includes second decision" "$(cat "$TEST_ROOT/STATE.md")" "ADR-2"

# Missing root directory
OUT=$("$SCRIPT_DIR/prism-state.sh" "/nonexistent/path" 2>&1 || true)
_assert_contains "missing root errors" "$OUT" "ERROR"

# Output format correctness
_assert_contains "has Active Work section" "$(cat "$TEST_ROOT/STATE.md")" "## Active Work"
_assert_contains "has Progress section" "$(cat "$TEST_ROOT/STATE.md")" "## Progress"
_assert_contains "has Blockers section" "$(cat "$TEST_ROOT/STATE.md")" "## Blockers"
_assert_contains "has Next Steps section" "$(cat "$TEST_ROOT/STATE.md")" "## Next Steps"
_assert_contains "has Recent Decisions section" "$(cat "$TEST_ROOT/STATE.md")" "## Recent Decisions"

# ============================================================
echo ""
echo "=== SUMMARY ==="

# ============================================================
echo ""
echo "=== prism-supervisor.sh ==="
# ============================================================

_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null

# Plan: valid graph accepted
GRAPH='{"tasks":[{"id":"t1","name":"Login page","requirement":"Auth","depends_on":[],"files_to_read":["src/auth.ts"],"constraints":["use middleware"],"estimated_files":3},{"id":"t2","name":"Dashboard","requirement":"Dashboard","depends_on":["t1"],"files_to_read":[],"constraints":[],"estimated_files":5}]}'
OUT=$(echo "$GRAPH" | "$SCRIPT_DIR/prism-supervisor.sh" plan "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "plan: valid graph accepted" "$OUT" "OK: planned 2 tasks"

# Verify task statuses: t1=ready, t2=pending
T1_STATUS=$(jq -r '.task_graph.tasks[0].status' "$TEST_ROOT/.prism/registry.json")
T2_STATUS=$(jq -r '.task_graph.tasks[1].status' "$TEST_ROOT/.prism/registry.json")
_assert "plan: t1 is ready" "$T1_STATUS" "ready"
_assert "plan: t2 is pending" "$T2_STATUS" "pending"

# Plan: cycles rejected
_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null
CYCLE_GRAPH='{"tasks":[{"id":"t1","name":"A","depends_on":["t2"]},{"id":"t2","name":"B","depends_on":["t1"]}]}'
OUT=$(echo "$CYCLE_GRAPH" | "$SCRIPT_DIR/prism-supervisor.sh" plan "$TEST_ROOT" "test-change" 2>&1 || true)
_assert_contains "plan: cycles rejected" "$OUT" "cycle"

# Plan: bad dependency reference rejected
_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null
BAD_DEP='{"tasks":[{"id":"t1","name":"A","depends_on":["t99"]}]}'
OUT=$(echo "$BAD_DEP" | "$SCRIPT_DIR/prism-supervisor.sh" plan "$TEST_ROOT" "test-change" 2>&1 || true)
_assert_contains "plan: bad dep reference rejected" "$OUT" "non-existent"

# Plan: duplicate IDs rejected
_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null
DUPE_IDS='{"tasks":[{"id":"t1","name":"A","depends_on":[]},{"id":"t1","name":"B","depends_on":[]}]}'
OUT=$(echo "$DUPE_IDS" | "$SCRIPT_DIR/prism-supervisor.sh" plan "$TEST_ROOT" "test-change" 2>&1 || true)
_assert_contains "plan: duplicate IDs rejected" "$OUT" "duplicate"

# Next: returns ready tasks, respects dependencies
_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null
echo "$GRAPH" | "$SCRIPT_DIR/prism-supervisor.sh" plan "$TEST_ROOT" "test-change" 2>/dev/null
OUT=$("$SCRIPT_DIR/prism-supervisor.sh" next "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "next: returns ready tasks" "$OUT" "1 tasks ready"
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-supervisor-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  READY_ID=$(jq -r '.ready_tasks[0].id' "$TEMP_FILE")
  _assert "next: t1 is ready" "$READY_ID" "t1"
else
  _assert "next: could read temp file" "no" "yes"
fi

# Complete: marks done, promotes dependents
OUT=$("$SCRIPT_DIR/prism-supervisor.sh" complete "$TEST_ROOT" "test-change" "t1" 2>/dev/null)
_assert_contains "complete: marks done" "$OUT" "t1 completed"
T2_STATUS=$(jq -r '.task_graph.tasks[1].status' "$TEST_ROOT/.prism/registry.json")
_assert "complete: t2 promoted to ready" "$T2_STATUS" "ready"
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-supervisor-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  NEWLY_READY=$(jq -r '.newly_ready | length' "$TEMP_FILE")
  _assert "complete: reports newly ready" "$NEWLY_READY" "1"
fi

# Fail: increments retries
OUT=$("$SCRIPT_DIR/prism-supervisor.sh" fail "$TEST_ROOT" "test-change" "t2" 2>/dev/null)
_assert_contains "fail: marks failed" "$OUT" "t2"
T2_RETRIES=$(jq -r '.task_graph.tasks[1].retries' "$TEST_ROOT/.prism/registry.json")
_assert "fail: retries incremented" "$T2_RETRIES" "1"
T2_STATUS=$(jq -r '.task_graph.tasks[1].status' "$TEST_ROOT/.prism/registry.json")
_assert "fail: status is failed (not blocked yet)" "$T2_STATUS" "failed"

# Fail: blocks after max retries (fail twice more to reach 3)
"$SCRIPT_DIR/prism-supervisor.sh" reset "$TEST_ROOT" "test-change" "t2" 2>/dev/null
"$SCRIPT_DIR/prism-supervisor.sh" fail "$TEST_ROOT" "test-change" "t2" 2>/dev/null
"$SCRIPT_DIR/prism-supervisor.sh" reset "$TEST_ROOT" "test-change" "t2" 2>/dev/null
"$SCRIPT_DIR/prism-supervisor.sh" fail "$TEST_ROOT" "test-change" "t2" 2>/dev/null
T2_STATUS=$(jq -r '.task_graph.tasks[1].status' "$TEST_ROOT/.prism/registry.json")
_assert "fail: blocks after max retries" "$T2_STATUS" "blocked"

# Reset: allows guardian retry
_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null
SIMPLE='{"tasks":[{"id":"t1","name":"A","depends_on":[]}]}'
echo "$SIMPLE" | "$SCRIPT_DIR/prism-supervisor.sh" plan "$TEST_ROOT" "test-change" 2>/dev/null
"$SCRIPT_DIR/prism-supervisor.sh" fail "$TEST_ROOT" "test-change" "t1" 2>/dev/null
OUT=$("$SCRIPT_DIR/prism-supervisor.sh" reset "$TEST_ROOT" "test-change" "t1" 2>/dev/null)
_assert_contains "reset: allows retry" "$OUT" "t1 reset to ready"
T1_STATUS=$(jq -r '.task_graph.tasks[0].status' "$TEST_ROOT/.prism/registry.json")
_assert "reset: status is ready" "$T1_STATUS" "ready"

# Reset: rejects non-failed task
OUT=$("$SCRIPT_DIR/prism-supervisor.sh" reset "$TEST_ROOT" "test-change" "t1" 2>&1 || true)
_assert_contains "reset: rejects non-failed" "$OUT" "not failed"

# Status: correct counts
_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null
THREE_TASKS='{"tasks":[{"id":"t1","name":"A","depends_on":[]},{"id":"t2","name":"B","depends_on":["t1"]},{"id":"t3","name":"C","depends_on":["t1"]}]}'
echo "$THREE_TASKS" | "$SCRIPT_DIR/prism-supervisor.sh" plan "$TEST_ROOT" "test-change" 2>/dev/null
"$SCRIPT_DIR/prism-supervisor.sh" complete "$TEST_ROOT" "test-change" "t1" 2>/dev/null
OUT=$("$SCRIPT_DIR/prism-supervisor.sh" status "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "status: correct counts" "$OUT" "1/3 completed"
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-supervisor-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  COMPLETED=$(jq '.completed' "$TEMP_FILE")
  READY=$(jq '.ready' "$TEMP_FILE")
  TOTAL=$(jq '.total' "$TEMP_FILE")
  _assert "status: completed=1" "$COMPLETED" "1"
  _assert "status: ready=2" "$READY" "2"
  _assert "status: total=3" "$TOTAL" "3"
fi

# Version migration: v1 registry auto-upgrades
_teardown
_setup
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null
# Manually downgrade to v1 (remove task_graph, set version to 1)
jq '.version = 1 | del(.task_graph)' "$TEST_ROOT/.prism/registry.json" > "$TEST_ROOT/.prism/registry.json.tmp" && mv "$TEST_ROOT/.prism/registry.json.tmp" "$TEST_ROOT/.prism/registry.json"
V_BEFORE=$(jq '.version' "$TEST_ROOT/.prism/registry.json")
_assert "migration: starts as v1" "$V_BEFORE" "1"
# Trigger migration via status command
"$SCRIPT_DIR/prism-registry.sh" status "$TEST_ROOT" 2>/dev/null
V_AFTER=$(jq '.version' "$TEST_ROOT/.prism/registry.json")
HAS_TG=$(jq 'has("task_graph")' "$TEST_ROOT/.prism/registry.json")
_assert "migration: upgraded to v2" "$V_AFTER" "2"
_assert "migration: has task_graph field" "$HAS_TG" "true"

# ============================================================

_teardown

TOTAL=$((PASS + FAIL))
echo "Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
  printf "${RED}%d test(s) failed${NC}\n" "$FAIL"
  exit 1
else
  printf "${GREEN}All tests passed!${NC}\n"
  exit 0
fi
