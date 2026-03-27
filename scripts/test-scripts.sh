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

# Duplicate init with same name should skip
OUT=$("$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "duplicate init skips" "$OUT" "SKIP"

# Init with different change name should auto-archive old and create new
OUT=$("$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "new-feature" 2>/dev/null)
_assert_contains "init new change" "$OUT" "OK: initialized registry for new-feature"
NEW_NAME=$(jq -r '.change.name' "$TEST_ROOT/.prism/registry.json")
_assert "new change name" "$NEW_NAME" "new-feature"

# Reset command
OUT=$("$SCRIPT_DIR/prism-registry.sh" reset "$TEST_ROOT" "_" 2>/dev/null)
_assert_contains "reset clears registry" "$OUT" "OK: reset"
_assert "registry deleted after reset" "$([ ! -f "$TEST_ROOT/.prism/registry.json" ] && echo yes || echo no)" "yes"

# Reset on empty dir is a no-op
OUT=$("$SCRIPT_DIR/prism-registry.sh" reset "$TEST_ROOT" "_" 2>/dev/null)
_assert_contains "reset no-op" "$OUT" "OK: no registry"

# Stage sync: update stage string → checkpoint.stage numeric
"$SCRIPT_DIR/prism-registry.sh" init "$TEST_ROOT" "stage-sync-test" 2>/dev/null
echo '{"stage":"build"}' | "$SCRIPT_DIR/prism-registry.sh" update "$TEST_ROOT" "stage-sync-test" 2>/dev/null
CP_STAGE=$(jq '.checkpoint.stage' "$TEST_ROOT/.prism/registry.json")
_assert "stage sync to checkpoint" "$CP_STAGE" "3"

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

# --- status: no memory at all ---
OUT=$("$SCRIPT_DIR/prism-state.sh" status "$TEST_ROOT" 2>/dev/null)
_assert_contains "status with no memory = none" "$OUT" "model=none"

TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-state-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  STATUS_MODEL=$(jq -r '.model' "$TEMP_FILE")
  _assert "status JSON model=none" "$STATUS_MODEL" "none"
else
  _assert "status JSON readable (no memory)" "no" "yes"
fi

# --- status: legacy PRODUCT.md ---
echo "# My Product" > "$TEST_ROOT/PRODUCT.md"
OUT=$("$SCRIPT_DIR/prism-state.sh" status "$TEST_ROOT" 2>/dev/null)
_assert_contains "status with PRODUCT.md = legacy" "$OUT" "model=legacy"

# --- read: no memory ---
rm -f "$TEST_ROOT/PRODUCT.md"
OUT=$("$SCRIPT_DIR/prism-state.sh" read "$TEST_ROOT" 2>/dev/null)
_assert_contains "read with no memory" "$OUT" "model=none"

# --- read: legacy ---
echo "# My Product" > "$TEST_ROOT/PRODUCT.md"
echo "" >> "$TEST_ROOT/PRODUCT.md"
echo "Build something great." >> "$TEST_ROOT/PRODUCT.md"
OUT=$("$SCRIPT_DIR/prism-state.sh" read "$TEST_ROOT" 2>/dev/null)
_assert_contains "read legacy model" "$OUT" "model=legacy"

# --- migrate: legacy PRODUCT.md → split files ---
OUT=$("$SCRIPT_DIR/prism-state.sh" migrate "$TEST_ROOT" 2>/dev/null)
_assert_contains "migrate reports created" "$OUT" "created="
MEMDIR="$TEST_ROOT/.prism/memory"
_assert "product.md created" "$([ -f "$MEMDIR/product.md" ] && echo yes || echo no)" "yes"
_assert "architecture.md created" "$([ -f "$MEMDIR/architecture.md" ] && echo yes || echo no)" "yes"
_assert "roadmap.md created" "$([ -f "$MEMDIR/roadmap.md" ] && echo yes || echo no)" "yes"
_assert "state.md created" "$([ -f "$MEMDIR/state.md" ] && echo yes || echo no)" "yes"
_assert "decisions.md created" "$([ -f "$MEMDIR/decisions.md" ] && echo yes || echo no)" "yes"

# product.md should contain migrated content from PRODUCT.md
_assert_contains "product.md has legacy content" "$(cat "$MEMDIR/product.md")" "My Product"

# --- read: split model after migrate ---
OUT=$("$SCRIPT_DIR/prism-state.sh" read "$TEST_ROOT" 2>/dev/null)
_assert_contains "read split model" "$OUT" "model=split"

TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-state-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  READ_MODEL=$(jq -r '.model' "$TEMP_FILE")
  READ_COUNT=$(jq '.file_count' "$TEMP_FILE")
  _assert "read JSON model=split" "$READ_MODEL" "split"
  _assert "read JSON file_count=5" "$READ_COUNT" "5"
else
  _assert "read JSON readable (split)" "no" "yes"
fi

# --- status: split model ---
OUT=$("$SCRIPT_DIR/prism-state.sh" status "$TEST_ROOT" 2>/dev/null)
_assert_contains "status after migrate = split" "$OUT" "model=split"
_assert_contains "status shows exists=5" "$OUT" "exists=5"

TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-state-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  EXISTS=$(jq '.exists_count' "$TEMP_FILE")
  MISSING=$(jq '.missing_count' "$TEMP_FILE")
  _assert "status exists_count=5" "$EXISTS" "5"
  _assert "status missing_count=0" "$MISSING" "0"
else
  _assert "status JSON readable (split)" "no" "yes"
fi

# --- migrate: second run should skip existing files ---
OUT=$("$SCRIPT_DIR/prism-state.sh" migrate "$TEST_ROOT" 2>/dev/null)
_assert_contains "second migrate skips existing" "$OUT" "skipped=5"

# --- update: add content to a section in state.md ---
printf 'Phase 1 — MVP' | "$SCRIPT_DIR/prism-state.sh" update "$TEST_ROOT" "state.md" "Current Phase" 2>/dev/null
_assert_contains "update writes content to section" "$(cat "$MEMDIR/state.md")" "Phase 1"

OUT=$(printf 'Phase 1 — MVP' | "$SCRIPT_DIR/prism-state.sh" update "$TEST_ROOT" "state.md" "Current Phase" 2>/dev/null)
_assert_contains "update reports OK" "$OUT" "OK: updated"

# --- update: create a new file from scratch via update ---
rm -f "$MEMDIR/state.md"
printf 'Phase 0 — Discovery' | "$SCRIPT_DIR/prism-state.sh" update "$TEST_ROOT" "state.md" "Current Phase" 2>/dev/null
_assert "update creates missing file" "$([ -f "$MEMDIR/state.md" ] && echo yes || echo no)" "yes"
_assert_contains "created file has content" "$(cat "$MEMDIR/state.md")" "Phase 0"

# --- update: unknown file is rejected ---
OUT=$(printf 'bad' | "$SCRIPT_DIR/prism-state.sh" update "$TEST_ROOT" "unknown.md" "Section" 2>&1 || true)
_assert_contains "unknown file rejected" "$OUT" "ERROR"

# --- update: empty stdin is rejected ---
OUT=$("$SCRIPT_DIR/prism-state.sh" update "$TEST_ROOT" "state.md" "Current Phase" < /dev/null 2>&1 || true)
_assert_contains "empty stdin rejected" "$OUT" "ERROR"

# --- error: missing root directory ---
OUT=$("$SCRIPT_DIR/prism-state.sh" status "/tmp/nonexistent-$$" 2>&1 || true)
_assert_contains "nonexistent root rejected" "$OUT" "ERROR"

# --- error: missing command ---
OUT=$("$SCRIPT_DIR/prism-state.sh" 2>&1 || true)
_assert_contains "missing command shows usage" "$OUT" "Usage\|Commands"

# --- prism-scan.sh product_memory field ---
_teardown
_setup

# No memory — scan should report model=none
OUT=$("$SCRIPT_DIR/prism-scan.sh" "$TEST_ROOT" 2>/dev/null)
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-scan-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  SCAN_MODEL=$(jq -r '.product_memory.model' "$TEMP_FILE")
  _assert "scan product_memory.model=none" "$SCAN_MODEL" "none"
else
  _assert "scan JSON readable (no memory)" "no" "yes"
fi

# Create PRODUCT.md — scan should report legacy
echo "# My Product" > "$TEST_ROOT/PRODUCT.md"
OUT=$("$SCRIPT_DIR/prism-scan.sh" "$TEST_ROOT" 2>/dev/null)
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-scan-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  SCAN_MODEL=$(jq -r '.product_memory.model' "$TEMP_FILE")
  _assert "scan product_memory.model=legacy" "$SCAN_MODEL" "legacy"
else
  _assert "scan JSON readable (legacy)" "no" "yes"
fi

# Create split memory — scan should report split
mkdir -p "$TEST_ROOT/.prism/memory"
echo "# Product" > "$TEST_ROOT/.prism/memory/product.md"
OUT=$("$SCRIPT_DIR/prism-scan.sh" "$TEST_ROOT" 2>/dev/null)
TEMP_FILE=$(echo "$OUT" | grep -o '/tmp/prism-scan-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  SCAN_MODEL=$(jq -r '.product_memory.model' "$TEMP_FILE")
  SCAN_FILES=$(jq '.product_memory.files | length' "$TEMP_FILE")
  _assert "scan product_memory.model=split" "$SCAN_MODEL" "split"
  _assert "scan product_memory.files has entries" "$SCAN_FILES" "1"
else
  _assert "scan JSON readable (split)" "no" "yes"
fi

# ============================================================
echo ""
echo "=== prism-supervisor.sh ==="
# ============================================================

_teardown
_setup

SUP="$SCRIPT_DIR/prism-supervisor.sh"

# Helper: extract JSON from supervisor output temp file
_sup_json() {
  local out="$1"
  local tmpfile
  tmpfile=$(printf '%s' "$out" | grep -o '/tmp/prism-supervisor-[0-9]*.json' | head -1)
  if [ -n "$tmpfile" ] && [ -f "$tmpfile" ]; then
    cat "$tmpfile"
  else
    echo '{}'
  fi
}

# --- Test: plan with valid acyclic graph ---
VALID_GRAPH='[
  {"id":"w1","task":"Setup DB","depends_on":[]},
  {"id":"w2","task":"Build API","depends_on":["w1"]},
  {"id":"w3","task":"Build UI","depends_on":["w1"]},
  {"id":"w4","task":"Run tests","depends_on":["w2","w3"]}
]'
OUT=$(echo "$VALID_GRAPH" | "$SUP" plan "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "plan: valid acyclic graph succeeds" "$OUT" "OK: plan stored"
TASK_COUNT=$(jq '.tasks | length' "$TEST_ROOT/.prism/task-graph.json" 2>/dev/null || echo "0")
_assert "plan: task count stored correctly" "$TASK_COUNT" "4"
FIRST_STATUS=$(jq -r '.tasks[0].status' "$TEST_ROOT/.prism/task-graph.json" 2>/dev/null)
_assert "plan: tasks initialized to pending" "$FIRST_STATUS" "pending"

# --- Test: plan with cyclic graph (should fail) ---
CYCLE_GRAPH='[{"id":"a","task":"A","depends_on":["c"]},{"id":"b","task":"B","depends_on":["a"]},{"id":"c","task":"C","depends_on":["b"]}]'
OUT=$(echo "$CYCLE_GRAPH" | "$SUP" plan "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "plan: cyclic graph rejected" "$OUT" "ERROR"
JSON=$(_sup_json "$OUT")
_assert_contains "plan: cycle error in JSON" "$JSON" "cycle\|ERROR"

# --- Test: plan with missing dependency reference (should fail) ---
MISS_GRAPH='[{"id":"w1","task":"A","depends_on":["nonexistent"]}]'
OUT=$(echo "$MISS_GRAPH" | "$SUP" plan "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "plan: missing dep reference rejected" "$OUT" "ERROR"
JSON=$(_sup_json "$OUT")
_assert_contains "plan: missing dep error in JSON" "$JSON" "missing"

# --- Test: plan with duplicate IDs (should fail) ---
DUPE_GRAPH='[{"id":"w1","task":"A","depends_on":[]},{"id":"w1","task":"B","depends_on":[]}]'
OUT=$(echo "$DUPE_GRAPH" | "$SUP" plan "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "plan: duplicate IDs rejected" "$OUT" "ERROR"

# --- Test: next returns only unblocked tasks ---
echo "$VALID_GRAPH" | "$SUP" plan "$TEST_ROOT" "test-change" 2>/dev/null
OUT=$("$SUP" next "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "next: returns ready tasks" "$OUT" "OK: 1 ready"
JSON=$(_sup_json "$OUT")
READY_ID=$(printf '%s' "$JSON" | jq -r '.[0].id' 2>/dev/null)
_assert "next: only w1 is ready (no deps)" "$READY_ID" "w1"

# --- Test: complete marks done + unlocks dependents ---
OUT=$("$SUP" complete "$TEST_ROOT" "test-change" "w1" 2>/dev/null)
_assert_contains "complete: marks task done" "$OUT" "OK: w1 completed"
JSON=$(_sup_json "$OUT")
NEXT_COUNT=$(printf '%s' "$JSON" | jq '.next_ready | length' 2>/dev/null)
_assert "complete: next_ready shows 2 unlocked tasks" "$NEXT_COUNT" "2"
W1_STATUS=$(jq -r '.tasks[] | select(.id=="w1") | .status' "$TEST_ROOT/.prism/task-graph.json" 2>/dev/null)
_assert "complete: w1 status is completed in graph" "$W1_STATUS" "completed"

# --- Test: next after completion shows newly unblocked tasks ---
OUT=$("$SUP" next "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "next: after w1 done, 2 tasks ready" "$OUT" "OK: 2 ready"
JSON=$(_sup_json "$OUT")
READY_IDS=$(printf '%s' "$JSON" | jq -r '[.[].id] | sort | join(",")' 2>/dev/null)
_assert "next: w2 and w3 are ready" "$READY_IDS" "w2,w3"

# --- Test: double-complete is idempotent ---
OUT=$("$SUP" complete "$TEST_ROOT" "test-change" "w1" 2>/dev/null)
_assert_contains "complete: double-complete is no-op" "$OUT" "no-op"

# --- Test: fail with retry (under 3) ---
OUT=$("$SUP" fail "$TEST_ROOT" "test-change" "w2" "network error" 2>/dev/null)
_assert_contains "fail: retry 1 returns WARN" "$OUT" "WARN"
JSON=$(_sup_json "$OUT")
RETRIES=$(printf '%s' "$JSON" | jq '.retries' 2>/dev/null)
CAN_RETRY=$(printf '%s' "$JSON" | jq '.can_retry' 2>/dev/null)
_assert "fail: retry count is 1" "$RETRIES" "1"
_assert "fail: can_retry is true under threshold" "$CAN_RETRY" "true"
W2_STATUS=$(jq -r '.tasks[] | select(.id=="w2") | .status' "$TEST_ROOT/.prism/task-graph.json" 2>/dev/null)
_assert "fail: w2 status is failed (not abandoned) after 1 retry" "$W2_STATUS" "failed"

# --- Test: fail with retry 2 ---
OUT=$("$SUP" fail "$TEST_ROOT" "test-change" "w2" "still broken" 2>/dev/null)
_assert_contains "fail: retry 2 returns WARN" "$OUT" "WARN"
JSON=$(_sup_json "$OUT")
_assert "fail: retry count is 2" "$(printf '%s' "$JSON" | jq '.retries' 2>/dev/null)" "2"

# --- Test: fail at retry 3 → abandoned ---
OUT=$("$SUP" fail "$TEST_ROOT" "test-change" "w2" "giving up" 2>/dev/null)
_assert_contains "fail: retry 3 returns ERROR (abandoned)" "$OUT" "ERROR"
JSON=$(_sup_json "$OUT")
ABANDON_STATUS=$(printf '%s' "$JSON" | jq -r '.status' 2>/dev/null)
CAN_RETRY=$(printf '%s' "$JSON" | jq '.can_retry' 2>/dev/null)
_assert "fail: status is abandoned at retry 3" "$ABANDON_STATUS" "abandoned"
_assert "fail: can_retry is false when abandoned" "$CAN_RETRY" "false"
W2_STATUS=$(jq -r '.tasks[] | select(.id=="w2") | .status' "$TEST_ROOT/.prism/task-graph.json" 2>/dev/null)
_assert "fail: w2 status is abandoned in graph" "$W2_STATUS" "abandoned"

# --- Test: abandoned blocks downstream transitively ---
# w2 is now abandoned → w4 depends on w2 (and w3) → w4 should be blocked
BLOCKED=$(printf '%s' "$JSON" | jq -r '.blocked_downstream | length' 2>/dev/null)
_assert_contains "fail: abandoned reports blocked_downstream" "$BLOCKED" "[1-9]"
OUT=$("$SUP" next "$TEST_ROOT" "test-change" 2>/dev/null)
JSON=$(_sup_json "$OUT")
# Only w3 should be ready (w4 blocked by w2 abandonment)
NEXT_IDS=$(printf '%s' "$JSON" | jq -r '[.[].id] | sort | join(",")' 2>/dev/null)
_assert "abandoned: only w3 ready (w4 blocked by abandoned w2)" "$NEXT_IDS" "w3"
# w4 specifically must not appear in next
W4_IN_NEXT=$(printf '%s' "$JSON" | jq -r '[.[].id] | index("w4")' 2>/dev/null)
_assert "abandoned: w4 is not in next (blocked)" "$W4_IN_NEXT" "null"

# --- Test: status shows correct counts ---
# State: w1=completed, w2=abandoned, w3=pending/ready, w4=pending/blocked
OUT=$("$SUP" status "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "status: returns OK" "$OUT" "OK:"
JSON=$(_sup_json "$OUT")
_assert "status: total=4" "$(printf '%s' "$JSON" | jq '.total' 2>/dev/null)" "4"
_assert "status: completed=1" "$(printf '%s' "$JSON" | jq '.completed' 2>/dev/null)" "1"
_assert "status: abandoned=1" "$(printf '%s' "$JSON" | jq '.abandoned' 2>/dev/null)" "1"
_assert "status: ready=1 (w3)" "$(printf '%s' "$JSON" | jq '.ready' 2>/dev/null)" "1"
_assert "status: blocked includes w4" "$(printf '%s' "$JSON" | jq '.blocked >= 1' 2>/dev/null)" "true"

# --- Test: error paths ---
# next/status without plan
_teardown
_setup
OUT=$("$SUP" next "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "next: without plan returns ERROR" "$OUT" "ERROR"
OUT=$("$SUP" status "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "status: without plan returns ERROR" "$OUT" "ERROR"

# complete/fail on nonexistent worker
echo "$VALID_GRAPH" | "$SUP" plan "$TEST_ROOT" "test-change" 2>/dev/null
OUT=$("$SUP" complete "$TEST_ROOT" "test-change" "nonexistent" 2>&1 || true)
_assert_contains "complete: nonexistent task returns error" "$OUT" "ERROR\|not found"
OUT=$("$SUP" fail "$TEST_ROOT" "test-change" "nonexistent" "reason" 2>&1 || true)
_assert_contains "fail: nonexistent task returns error" "$OUT" "ERROR\|not found"

# invalid JSON plan
OUT=$(echo "not json" | "$SUP" plan "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "plan: invalid JSON rejected" "$OUT" "ERROR"

# empty stdin for plan
OUT=$(echo "" | "$SUP" plan "$TEST_ROOT" "test-change" 2>/dev/null)
_assert_contains "plan: empty stdin rejected" "$OUT" "ERROR"

# ============================================================
echo ""
echo "=== prism-telemetry.sh ==="
# ============================================================

_teardown
_setup

TELEM="$SCRIPT_DIR/prism-telemetry.sh"

# --- Record an event (verify JSONL written) ---
OUT=$("$TELEM" record "$TEST_ROOT" "build_start" '{"change_name":"my-feature"}' 2>/dev/null)
_assert_contains "telemetry: record build_start" "$OUT" "OK: recorded build_start"
_assert "telemetry: JSONL file created" "$([ -f "$TEST_ROOT/.prism/telemetry.jsonl" ] && echo yes || echo no)" "yes"
LINE_COUNT=$(wc -l < "$TEST_ROOT/.prism/telemetry.jsonl" | tr -d ' ')
_assert "telemetry: one line in JSONL" "$LINE_COUNT" "1"

# Verify JSONL entry is valid JSON with correct fields
ENTRY=$(tail -1 "$TEST_ROOT/.prism/telemetry.jsonl")
ET=$(printf '%s' "$ENTRY" | jq -r '.event_type')
_assert "telemetry: event_type field correct" "$ET" "build_start"
CN=$(printf '%s' "$ENTRY" | jq -r '.change_name')
_assert "telemetry: change_name in entry" "$CN" "my-feature"

# --- Record multiple events (verify append-only) ---
"$TELEM" record "$TEST_ROOT" "build_complete" '{"change_name":"my-feature","duration_ms":1200}' 2>/dev/null
"$TELEM" record "$TEST_ROOT" "build_fail" '{"change_name":"other-feature","error":"compile error"}' 2>/dev/null
LINE_COUNT=$(wc -l < "$TEST_ROOT/.prism/telemetry.jsonl" | tr -d ' ')
_assert "telemetry: append-only (3 lines)" "$LINE_COUNT" "3"

# Verify second entry has duration_ms
ENTRY2=$(sed -n '2p' "$TEST_ROOT/.prism/telemetry.jsonl")
DUR=$(printf '%s' "$ENTRY2" | jq '.duration_ms')
_assert "telemetry: duration_ms recorded" "$DUR" "1200"

# --- Summary with events (verify counts) ---
OUT=$("$TELEM" summary "$TEST_ROOT" 2>/dev/null)
_assert_contains "telemetry: summary returns OK" "$OUT" "OK: summary"
TEMP_FILE=$(printf '%s' "$OUT" | grep -o '/tmp/prism-telemetry-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  TOTAL_BUILDS=$(jq '.total_builds' "$TEMP_FILE")
  _assert "telemetry: summary total_builds=2 (complete+fail)" "$TOTAL_BUILDS" "2"
  EVENTS_ANALYZED=$(jq '.events_analyzed' "$TEMP_FILE")
  _assert "telemetry: summary events_analyzed=3" "$EVENTS_ANALYZED" "3"
else
  _assert "telemetry: summary JSON readable" "no" "yes"
fi

# --- Summary with no events (empty result) ---
_teardown
_setup
OUT=$("$TELEM" summary "$TEST_ROOT" 2>/dev/null)
_assert_contains "telemetry: summary empty = no telemetry" "$OUT" "OK: no telemetry"
TEMP_FILE=$(printf '%s' "$OUT" | grep -o '/tmp/prism-telemetry-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  TOTAL_BUILDS=$(jq '.total_builds' "$TEMP_FILE")
  _assert "telemetry: empty summary total_builds=0" "$TOTAL_BUILDS" "0"
else
  _assert "telemetry: empty summary JSON readable" "no" "yes"
fi

# --- Failures with clustering ---
_teardown
_setup
"$TELEM" record "$TEST_ROOT" "build_fail" '{"change_name":"a","error":"compile error in module"}' 2>/dev/null
"$TELEM" record "$TEST_ROOT" "build_fail" '{"change_name":"b","error":"compile error in utils"}' 2>/dev/null
"$TELEM" record "$TEST_ROOT" "worker_fail" '{"change_name":"c","error":"network timeout"}' 2>/dev/null

OUT=$("$TELEM" failures "$TEST_ROOT" 2>/dev/null)
_assert_contains "telemetry: failures lists all failure events" "$OUT" "OK: 3 failures"

OUT=$("$TELEM" failures "$TEST_ROOT" --cluster 2>/dev/null)
_assert_contains "telemetry: failures --cluster returns OK" "$OUT" "OK:"
TEMP_FILE=$(printf '%s' "$OUT" | grep -o '/tmp/prism-telemetry-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  CLUSTER_COUNT=$(jq 'length' "$TEMP_FILE")
  _assert_contains "telemetry: clustering produces groups" "$CLUSTER_COUNT" "[1-9]"
  HAS_COUNT=$(jq '.[0].count' "$TEMP_FILE")
  _assert_contains "telemetry: cluster has count field" "$HAS_COUNT" "[0-9]"
else
  _assert "telemetry: cluster JSON readable" "no" "yes"
fi

# ============================================================
echo ""
echo "=== prism-improve.sh ==="
# ============================================================

_teardown
_setup

IMP="$SCRIPT_DIR/prism-improve.sh"

# --- Create a proposal (verify file created) ---
PROPOSAL_JSON='{
  "description": "Use structured prompts for better output",
  "trigger": "high guardian_retry_rate",
  "change_type": "prompt",
  "target_file": "prompts/build.md",
  "eval_cases": [
    {"input": "hello world", "expected_contains": "hello"},
    {"input": "hello world", "expected_excludes": "foobar"}
  ]
}'
OUT=$(printf '%s' "$PROPOSAL_JSON" | "$IMP" propose "$TEST_ROOT" "Improve build prompts" 2>/dev/null)
_assert_contains "improve: propose creates proposal" "$OUT" "OK: proposal created"

# Extract proposal ID from output
PROPOSAL_ID=$(printf '%s' "$OUT" | grep -o '[0-9]*T[0-9]*Z-[a-z0-9-]*' | head -1)
_assert_contains "improve: proposal ID is timestamp-slug" "$PROPOSAL_ID" "T"

# Verify file created
PROPOSALS_DIR="$TEST_ROOT/.prism/proposals"
FILE_COUNT=$(ls "$PROPOSALS_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
_assert "improve: proposal file created" "$FILE_COUNT" "1"

# Verify file contents
PROPOSAL_FILE=$(ls "$PROPOSALS_DIR"/*.json | head -1)
STATUS=$(jq -r '.status' "$PROPOSAL_FILE")
_assert "improve: initial status is proposed" "$STATUS" "proposed"
CT=$(jq -r '.change_type' "$PROPOSAL_FILE")
_assert "improve: change_type stored" "$CT" "prompt"

# --- List proposals (verify it shows up) ---
OUT=$("$IMP" list "$TEST_ROOT" 2>/dev/null)
_assert_contains "improve: list returns OK" "$OUT" "OK: 1 proposals"
TEMP_FILE=$(printf '%s' "$OUT" | grep -o '/tmp/prism-improve-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  LIST_COUNT=$(jq 'length' "$TEMP_FILE")
  _assert "improve: list shows 1 proposal" "$LIST_COUNT" "1"
  LIST_TITLE=$(jq -r '.[0].title' "$TEMP_FILE")
  _assert_contains "improve: list shows title" "$LIST_TITLE" "Improve"
else
  _assert "improve: list JSON readable" "no" "yes"
fi

# --- Eval with passing cases (verify eval_pass status) ---
OUT=$("$IMP" eval "$TEST_ROOT" "$PROPOSAL_ID" 2>/dev/null)
_assert_contains "improve: eval returns OK" "$OUT" "OK: eval eval_pass"
TEMP_FILE=$(printf '%s' "$OUT" | grep -o '/tmp/prism-improve-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  EVAL_STATUS=$(jq -r '.status' "$TEMP_FILE")
  _assert "improve: eval_pass status in result" "$EVAL_STATUS" "eval_pass"
  EVAL_PASSED=$(jq '.passed' "$TEMP_FILE")
  _assert "improve: 2 cases passed" "$EVAL_PASSED" "2"
  EVAL_FAILED=$(jq '.failed' "$TEMP_FILE")
  _assert "improve: 0 cases failed" "$EVAL_FAILED" "0"
else
  _assert "improve: eval JSON readable" "no" "yes"
fi

# Verify proposal file updated
FILE_STATUS=$(jq -r '.status' "$PROPOSAL_FILE")
_assert "improve: proposal file updated to eval_pass" "$FILE_STATUS" "eval_pass"

# --- Eval with failing cases (verify eval_fail status) ---
FAIL_PROPOSAL_JSON='{
  "description": "A proposal with failing evals",
  "change_type": "script",
  "eval_cases": [
    {"input": "hello world", "expected_contains": "goodbye"},
    {"input": "hello world", "expected_excludes": "hello"}
  ]
}'
printf '%s' "$FAIL_PROPOSAL_JSON" | "$IMP" propose "$TEST_ROOT" "Failing proposal" 2>/dev/null
FAIL_ID=$(ls "$PROPOSALS_DIR"/*.json | xargs -I{} basename {} .json | grep -v "$PROPOSAL_ID" | head -1)
OUT=$("$IMP" eval "$TEST_ROOT" "$FAIL_ID" 2>/dev/null)
_assert_contains "improve: failing eval returns eval_fail" "$OUT" "OK: eval eval_fail"
FAIL_FILE=$(ls "$PROPOSALS_DIR"/*.json | xargs grep -l '"status": "eval_fail"' | head -1)
if [ -n "$FAIL_FILE" ]; then
  FAIL_STATUS=$(jq -r '.status' "$FAIL_FILE")
  _assert "improve: eval_fail status stored in file" "$FAIL_STATUS" "eval_fail"
else
  _assert "improve: eval_fail file found" "no" "yes"
fi

# --- Promote after eval_pass (verify status + file changed) ---
OUT=$("$IMP" promote "$TEST_ROOT" "$PROPOSAL_ID" 2>/dev/null)
_assert_contains "improve: promote succeeds after eval_pass" "$OUT" "OK: promoted"
PROM_STATUS=$(jq -r '.status' "$PROPOSAL_FILE")
_assert "improve: promoted status in file" "$PROM_STATUS" "promoted"
PROM_RESULT=$(jq -r '.promotion_result.apply_status' "$PROPOSAL_FILE")
_assert "improve: apply_status is skipped_no_diff (no diff provided)" "$PROM_RESULT" "skipped_no_diff"

# --- Reject with reason (verify status) ---
printf '%s' "$FAIL_PROPOSAL_JSON" | "$IMP" propose "$TEST_ROOT" "Reject me" 2>/dev/null
REJECT_ID=$(ls "$PROPOSALS_DIR"/*.json | xargs -I{} basename {} .json | grep -v "$PROPOSAL_ID" | grep -v "$FAIL_ID" | head -1)
OUT=$("$IMP" reject "$TEST_ROOT" "$REJECT_ID" "Does not meet quality bar" 2>/dev/null)
_assert_contains "improve: reject returns OK" "$OUT" "OK: rejected"
REJECT_FILE=$(ls "$PROPOSALS_DIR"/*.json | xargs -I{} sh -c 'jq -r "select(.id==\"'"$REJECT_ID"'\") | .id" {} 2>/dev/null' | head -1)
if [ -n "$REJECT_FILE" ]; then
  _assert "improve: reject_id found" "$REJECT_FILE" "$REJECT_ID"
fi
# Check rejection reason in the file
for f in "$PROPOSALS_DIR"/*.json; do
  if jq -e '.status == "rejected"' "$f" >/dev/null 2>&1; then
    REJ_REASON=$(jq -r '.rejection_reason' "$f")
    _assert_contains "improve: rejection_reason stored" "$REJ_REASON" "quality"
    break
  fi
done

# --- Promote without eval_pass (should fail) ---
printf '%s' '${"description":"no eval","change_type":"config","eval_cases":[]}' | \
  "$IMP" propose "$TEST_ROOT" "No eval proposal" 2>/dev/null || true
# Use the failing proposal that has eval_fail status
OUT=$("$IMP" promote "$TEST_ROOT" "$FAIL_ID" 2>&1 || true)
_assert_contains "improve: promote without eval_pass fails" "$OUT" "ERROR"

# ============================================================
echo ""
echo "=== prism-eval.sh ==="
# ============================================================

_teardown
_setup

EVAL="$SCRIPT_DIR/prism-eval.sh"
EVALS_DIR="$TEST_ROOT/.prism/evals"
mkdir -p "$EVALS_DIR"

# --- Create a test eval file ---
cat > "$EVALS_DIR/test-basic.jsonl" << 'EOF'
{"input": "build succeeded in 1.2s", "expected_contains": "succeeded"}
{"input": "build succeeded in 1.2s", "expected_excludes": "failed"}
{"input": "error: module not found", "expected_contains": "error"}
EOF

# --- Run an eval file (verify results) ---
OUT=$("$EVAL" run "$TEST_ROOT" "$EVALS_DIR/test-basic.jsonl" 2>/dev/null)
_assert_contains "eval: run returns OK" "$OUT" "OK: eval complete"
_assert_contains "eval: run shows total=3" "$OUT" "total=3"
_assert_contains "eval: run shows passed=3" "$OUT" "passed=3"
TEMP_FILE=$(printf '%s' "$OUT" | grep -o '/tmp/prism-eval-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  TOTAL=$(jq '.total' "$TEMP_FILE")
  PASSED=$(jq '.passed' "$TEMP_FILE")
  FAILED=$(jq '.failed' "$TEMP_FILE")
  _assert "eval: run total=3" "$TOTAL" "3"
  _assert "eval: run passed=3" "$PASSED" "3"
  _assert "eval: run failed=0" "$FAILED" "0"
  DET_COUNT=$(jq '.details | length' "$TEMP_FILE")
  _assert "eval: run details has 3 entries" "$DET_COUNT" "3"
else
  _assert "eval: run JSON readable" "no" "yes"
fi

# --- Run with a failing case ---
cat > "$EVALS_DIR/test-fail.jsonl" << 'EOF'
{"input": "build succeeded", "expected_contains": "failed"}
{"input": "build succeeded", "expected_excludes": "succeeded"}
EOF
OUT=$("$EVAL" run "$TEST_ROOT" "$EVALS_DIR/test-fail.jsonl" 2>/dev/null)
_assert_contains "eval: run with failures reports failed=2" "$OUT" "failed=2"
TEMP_FILE=$(printf '%s' "$OUT" | grep -o '/tmp/prism-eval-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  FAILED=$(jq '.failed' "$TEMP_FILE")
  _assert "eval: failing run failed=2" "$FAILED" "2"
else
  _assert "eval: failing run JSON readable" "no" "yes"
fi

# --- Baseline creation (verify snapshot) ---
OUT=$("$EVAL" baseline "$TEST_ROOT" 2>/dev/null)
_assert_contains "eval: baseline returns OK" "$OUT" "OK: baseline"
BASELINES_DIR="$TEST_ROOT/.prism/evals/baselines"
BASELINE_COUNT=$(ls "$BASELINES_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
_assert "eval: baseline file created" "$BASELINE_COUNT" "1"

BASELINE_FILE=$(ls "$BASELINES_DIR"/*.json | head -1)
BL_TOTAL=$(jq '.total_cases' "$BASELINE_FILE")
_assert "eval: baseline total_cases=5 (3+2)" "$BL_TOTAL" "5"
BL_FILES=$(jq '.total_files' "$BASELINE_FILE")
_assert "eval: baseline total_files=2" "$BL_FILES" "2"
BL_ID=$(jq -r '.id' "$BASELINE_FILE")
_assert_contains "eval: baseline has id" "$BL_ID" "T"

# --- Compare against baseline ---
OUT=$("$EVAL" compare "$TEST_ROOT" "$BL_ID" 2>/dev/null)
_assert_contains "eval: compare returns OK" "$OUT" "OK: compare"
TEMP_FILE=$(printf '%s' "$OUT" | grep -o '/tmp/prism-eval-[0-9]*.json')
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
  REG=$(jq '.regressions' "$TEMP_FILE")
  IMP=$(jq '.improvements' "$TEMP_FILE")
  BL_ID_STORED=$(jq -r '.baseline_id' "$TEMP_FILE")
  _assert "eval: compare regressions=0 (same files)" "$REG" "0"
  _assert "eval: compare improvements=0 (same files)" "$IMP" "0"
  _assert "eval: compare baseline_id stored" "$BL_ID_STORED" "$BL_ID"
else
  _assert "eval: compare JSON readable" "no" "yes"
fi

# --- Compare with nonexistent baseline ---
OUT=$("$EVAL" compare "$TEST_ROOT" "nonexistent-baseline-id" 2>&1 || true)
_assert_contains "eval: compare with bad baseline returns ERROR" "$OUT" "ERROR"

# --- Baseline with no eval files (empty result) ---
_teardown
_setup
OUT=$("$EVAL" baseline "$TEST_ROOT" 2>/dev/null)
_assert_contains "eval: baseline empty dir returns OK" "$OUT" "OK: no eval files"

# ============================================================
echo ""
echo "=== prism-compile.sh ==="
# ============================================================

_teardown
_setup

COMPILER="$SCRIPT_DIR/../compiler/prism-compile.sh"
SKILLS_DIR="$SCRIPT_DIR/../compiler/skills"
COMPILER_OUTPUT="$SCRIPT_DIR/../compiler/output"

# Verify compiler script exists and is executable
_assert "compiler script exists" "$([ -f "$COMPILER" ] && echo yes || echo no)" "yes"
_assert "compiler script is executable" "$([ -x "$COMPILER" ] && echo yes || echo no)" "yes"

# --- validate: valid skill source should PASS ---
OUT=$(bash "$COMPILER" validate "$SKILLS_DIR/spec-generator.yaml" 2>/dev/null)
_assert_contains "validate: valid skill passes" "$OUT" "PASS"

# --- validate: build-worker should PASS ---
OUT=$(bash "$COMPILER" validate "$SKILLS_DIR/build-worker.yaml" 2>/dev/null)
_assert_contains "validate: build-worker passes" "$OUT" "PASS"

# --- validate: ship-readiness should PASS ---
OUT=$(bash "$COMPILER" validate "$SKILLS_DIR/ship-readiness.yaml" 2>/dev/null)
_assert_contains "validate: ship-readiness passes" "$OUT" "PASS"

# --- validate: invalid skill (missing required fields) should FAIL ---
cat > "$TEST_ROOT/invalid-skill.yaml" <<'YAML'
name: bad skill
display_name: Bad Skill
YAML
OUT=$(bash "$COMPILER" validate "$TEST_ROOT/invalid-skill.yaml" 2>/dev/null)
_assert_contains "validate: invalid skill fails" "$OUT" "FAIL"
_assert_contains "validate: reports missing field" "$OUT" "version\|description\|trigger_patterns\|purpose"

# --- validate: invalid trigger regex should fail ---
cat > "$TEST_ROOT/bad-regex-skill.yaml" <<'YAML'
name: bad-regex
display_name: Bad Regex Skill
version: 1.0.0
description: A test skill with an invalid regex trigger pattern.
purpose: Testing that invalid regex triggers are caught.
trigger_patterns:
  - "[invalid"
YAML
OUT=$(bash "$COMPILER" validate "$TEST_ROOT/bad-regex-skill.yaml" 2>/dev/null)
_assert_contains "validate: invalid regex trigger fails" "$OUT" "FAIL"

# --- validate: missing file should fail ---
OUT=$(bash "$COMPILER" validate "$TEST_ROOT/nonexistent.yaml" 2>/dev/null)
_assert_contains "validate: missing file fails" "$OUT" "FAIL"

# --- compile claude: output SKILL.md should exist ---
OUT=$(bash "$COMPILER" claude "$SKILLS_DIR/spec-generator.yaml" 2>/dev/null)
_assert_contains "claude: compile reports OK" "$OUT" "OK: compiled"
SKILL_MD="$COMPILER_OUTPUT/claude/spec-generator/SKILL.md"
_assert "claude: SKILL.md exists" "$([ -f "$SKILL_MD" ] && echo yes || echo no)" "yes"

# --- compile claude: SKILL.md contains required sections ---
_assert_contains "claude: SKILL.md has frontmatter" "$(cat "$SKILL_MD")" "^---"
_assert_contains "claude: SKILL.md has name field" "$(cat "$SKILL_MD")" "name: spec-generator"
_assert_contains "claude: SKILL.md has allowed-tools" "$(cat "$SKILL_MD")" "allowed-tools:"
_assert_contains "claude: SKILL.md has Purpose section" "$(cat "$SKILL_MD")" "## Purpose"
_assert_contains "claude: SKILL.md has Inputs section" "$(cat "$SKILL_MD")" "## Inputs"
_assert_contains "claude: SKILL.md has Stages section" "$(cat "$SKILL_MD")" "## Stages"
_assert_contains "claude: SKILL.md has Rules section" "$(cat "$SKILL_MD")" "## Rules"
_assert_contains "claude: SKILL.md has trigger patterns" "$(cat "$SKILL_MD")" "build me"
_assert_contains "claude: SKILL.md has version" "$(cat "$SKILL_MD")" "1.0.0"

# --- compile codex: output AGENTS.md should exist ---
OUT=$(bash "$COMPILER" codex "$SKILLS_DIR/spec-generator.yaml" 2>/dev/null)
_assert_contains "codex: compile reports OK" "$OUT" "OK: compiled"
AGENTS_MD="$COMPILER_OUTPUT/codex/spec-generator/AGENTS.md"
_assert "codex: AGENTS.md exists" "$([ -f "$AGENTS_MD" ] && echo yes || echo no)" "yes"

# --- compile codex: AGENTS.md contains required sections ---
_assert_contains "codex: AGENTS.md has Sandbox section" "$(cat "$AGENTS_MD")" "## Sandbox"
_assert_contains "codex: AGENTS.md has Steps section" "$(cat "$AGENTS_MD")" "## Steps"
_assert_contains "codex: AGENTS.md has Instructions section" "$(cat "$AGENTS_MD")" "## Instructions"
_assert_contains "codex: AGENTS.md lists allowed tools" "$(cat "$AGENTS_MD")" "Bash"
_assert_contains "codex: AGENTS.md has trigger patterns" "$(cat "$AGENTS_MD")" "build me"

# --- compile all: compiles all skills in directory ---
OUT=$(bash "$COMPILER" all "$SKILLS_DIR" 2>/dev/null)
_assert_contains "all: compile all reports DONE" "$OUT" "DONE:"
_assert_contains "all: all 3 skills compiled" "$OUT" "3/3"
_assert "all: build-worker SKILL.md exists" "$([ -f "$COMPILER_OUTPUT/claude/build-worker/SKILL.md" ] && echo yes || echo no)" "yes"
_assert "all: ship-readiness SKILL.md exists" "$([ -f "$COMPILER_OUTPUT/claude/ship-readiness/SKILL.md" ] && echo yes || echo no)" "yes"
_assert "all: build-worker AGENTS.md exists" "$([ -f "$COMPILER_OUTPUT/codex/build-worker/AGENTS.md" ] && echo yes || echo no)" "yes"
_assert "all: ship-readiness AGENTS.md exists" "$([ -f "$COMPILER_OUTPUT/codex/ship-readiness/AGENTS.md" ] && echo yes || echo no)" "yes"

# --- compile: fails gracefully on invalid skill ---
OUT=$(bash "$COMPILER" claude "$TEST_ROOT/invalid-skill.yaml" 2>&1 || true)
_assert_contains "claude: invalid skill does not compile" "$OUT" "ERROR\|FAIL"

# --- compile: all with no yaml files returns error ---
EMPTY_DIR="$TEST_ROOT/empty-skills"
mkdir -p "$EMPTY_DIR"
OUT=$(bash "$COMPILER" all "$EMPTY_DIR" 2>&1 || true)
_assert_contains "all: empty dir returns error" "$OUT" "ERROR\|no .yaml"

# ============================================================
echo ""
echo "=== SUMMARY ==="
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
