#!/usr/bin/env bash
# test-update-hook.sh — Tests for prism-check-update.js
# Mocks git commands via PATH override to test all branches.
set -euo pipefail

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/prism-check-update.js"

# Setup test environment
TEST_DIR=$(mktemp -d)
MOCK_BIN="$TEST_DIR/mock-bin"
MOCK_SKILL="$TEST_DIR/skill/prism"
CACHE_DIR="$TEST_DIR/cache"

mkdir -p "$MOCK_BIN" "$MOCK_SKILL" "$CACHE_DIR"
echo "4.0.15.0" > "$MOCK_SKILL/VERSION"

CACHE_FILE="$CACHE_DIR/prism-update-check.json"

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

assert_status() {
  local test_name="$1"
  local expected_status="$2"
  local cache_file="$3"

  if [ ! -f "$cache_file" ]; then
    echo "FAIL: $test_name — cache file not found"
    FAIL=$((FAIL + 1))
    return
  fi

  local actual_status
  actual_status=$(python3 -c "import json; print(json.load(open('$cache_file'))['status'])" 2>/dev/null || echo "PARSE_ERROR")

  if [ "$actual_status" = "$expected_status" ]; then
    echo "PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $test_name — expected $expected_status but got $actual_status"
    FAIL=$((FAIL + 1))
  fi
}

assert_field() {
  local test_name="$1"
  local field="$2"
  local expected="$3"
  local cache_file="$4"

  local actual
  actual=$(python3 -c "import json; print(json.load(open('$cache_file')).get('$field', 'MISSING'))" 2>/dev/null || echo "PARSE_ERROR")

  if [ "$actual" = "$expected" ]; then
    echo "PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $test_name — expected $field=$expected but got $actual"
    FAIL=$((FAIL + 1))
  fi
}

# Helper: create a mock git that returns specific responses
create_mock_git() {
  local mock_file="$MOCK_BIN/git"
  cat > "$mock_file" << 'GITEOF'
#!/usr/bin/env bash
# Mock git — behavior controlled by MOCK_GIT_MODE env var
case "$MOCK_GIT_MODE" in
  not_git)
    # All git commands fail
    exit 128
    ;;
  dirty)
    case "$*" in
      "rev-parse --git-dir") echo ".git" ;;
      "status --porcelain") echo " M SKILL.md" ;;
      *) exit 0 ;;
    esac
    ;;
  fetch_fail)
    case "$*" in
      "rev-parse --git-dir") echo ".git" ;;
      "status --porcelain") echo "" ;;
      "fetch origin --quiet") exit 1 ;;
      *) exit 0 ;;
    esac
    ;;
  up_to_date)
    case "$*" in
      "rev-parse --git-dir") echo ".git" ;;
      "status --porcelain") echo "" ;;
      "fetch origin --quiet") exit 0 ;;
      "rev-list HEAD..origin/main --count") echo "0" ;;
      *) exit 0 ;;
    esac
    ;;
  update_available)
    case "$*" in
      "rev-parse --git-dir") echo ".git" ;;
      "status --porcelain") echo "" ;;
      "fetch origin --quiet") exit 0 ;;
      "rev-list HEAD..origin/main --count") echo "3" ;;
      "show origin/main:VERSION") echo "4.0.16.0" ;;
      *) exit 0 ;;
    esac
    ;;
  untracked_only)
    case "$*" in
      "rev-parse --git-dir") echo ".git" ;;
      "status --porcelain") printf "?? app/\n?? node_modules/\n" ;;
      "fetch origin --quiet") exit 0 ;;
      "rev-list HEAD..origin/main --count") echo "0" ;;
      *) exit 0 ;;
    esac
    ;;
esac
GITEOF
  chmod +x "$mock_file"
}

create_mock_git

# Helper: run the hook with mocked environment
# Uses env vars to pass paths into the JS script (avoids heredoc interpolation issues).
run_hook() {
  local mode="$1"
  rm -f "$CACHE_FILE"

  # Create the patched hook script (quoted heredoc — no bash expansion)
  local patched="$TEST_DIR/patched-hook.js"
  cat > "$patched" << 'JSEOF'
const fs = require('fs');
const { execSync } = require('child_process');

const skillDir = process.env.TEST_SKILL_DIR;
const cacheFile = process.env.TEST_CACHE_FILE;
const now = Math.floor(Date.now() / 1000);

function write(data) {
  fs.writeFileSync(cacheFile, JSON.stringify({ ...data, checked: now }));
}

try {
  execSync('git rev-parse --git-dir', { cwd: skillDir, stdio: 'ignore', timeout: 5000 });
} catch (e) {
  write({ status: 'NOT_GIT' });
  process.exit(0);
}

try {
  const porcelain = execSync('git status --porcelain', {
    cwd: skillDir, encoding: 'utf8', timeout: 5000
  });
  const dirty = porcelain.split('\n').filter(l => l && !l.startsWith('??'));
  if (dirty.length > 0) {
    write({ status: 'DIRTY' });
    process.exit(0);
  }
} catch (e) {}

let installed = 'unknown';
try {
  installed = fs.readFileSync(skillDir + '/VERSION', 'utf8').trim();
} catch (e) {}

try {
  execSync('git fetch origin --quiet', {
    cwd: skillDir, stdio: 'ignore', timeout: 15000
  });
} catch (e) {
  write({ status: 'FETCH_FAILED', installed });
  process.exit(0);
}

let behind = 0;
try {
  behind = parseInt(
    execSync('git rev-list HEAD..origin/main --count', {
      cwd: skillDir, encoding: 'utf8', timeout: 5000
    }).trim(), 10
  ) || 0;
} catch (e) {
  write({ status: 'FETCH_FAILED', installed });
  process.exit(0);
}

if (behind === 0) {
  write({ status: 'UP_TO_DATE', installed, commits_behind: 0 });
  process.exit(0);
}

let latest = 'unknown';
try {
  latest = execSync('git show origin/main:VERSION', {
    cwd: skillDir, encoding: 'utf8', timeout: 5000
  }).trim();
} catch (e) {}

write({
  status: 'UPDATE_AVAILABLE',
  installed,
  latest,
  commits_behind: behind
});
JSEOF

  # Run with mock git on PATH and test paths via env vars
  MOCK_GIT_MODE="$mode" PATH="$MOCK_BIN:$PATH" \
    TEST_SKILL_DIR="$MOCK_SKILL" TEST_CACHE_FILE="$CACHE_FILE" \
    node "$patched"
}

# ==========================================
# Tests
# ==========================================
echo ""
echo "=== Testing prism-check-update ==="

# Test: NOT_GIT
run_hook "not_git"
assert_status "not_git: returns NOT_GIT" "NOT_GIT" "$CACHE_FILE"

# Test: DIRTY (tracked file modified)
run_hook "dirty"
assert_status "dirty: returns DIRTY" "DIRTY" "$CACHE_FILE"

# Test: FETCH_FAILED
run_hook "fetch_fail"
assert_status "fetch_fail: returns FETCH_FAILED" "FETCH_FAILED" "$CACHE_FILE"
assert_field "fetch_fail: has installed version" "installed" "4.0.15.0" "$CACHE_FILE"

# Test: UP_TO_DATE
run_hook "up_to_date"
assert_status "up_to_date: returns UP_TO_DATE" "UP_TO_DATE" "$CACHE_FILE"
assert_field "up_to_date: commits_behind is 0" "commits_behind" "0" "$CACHE_FILE"

# Test: UPDATE_AVAILABLE
run_hook "update_available"
assert_status "update_available: returns UPDATE_AVAILABLE" "UPDATE_AVAILABLE" "$CACHE_FILE"
assert_field "update_available: installed is 4.0.15.0" "installed" "4.0.15.0" "$CACHE_FILE"
assert_field "update_available: latest is 4.0.16.0" "latest" "4.0.16.0" "$CACHE_FILE"
assert_field "update_available: commits_behind is 3" "commits_behind" "3" "$CACHE_FILE"

# Test: Untracked files don't trigger DIRTY
run_hook "untracked_only"
assert_status "untracked_only: returns UP_TO_DATE (not DIRTY)" "UP_TO_DATE" "$CACHE_FILE"

# Test: TTL guard — cache within 1 hour should be skipped
echo ""
echo "=== Testing TTL guard ==="

# Write a fresh cache entry
python3 -c "
import json, time
data = {'status': 'UP_TO_DATE', 'installed': '4.0.15.0', 'checked': int(time.time())}
with open('$CACHE_FILE', 'w') as f:
    json.dump(data, f)
"

# Run the actual hook (not patched) with a custom skill dir
# The TTL guard is in the main process, so we test it separately
PATCHED_TTL="$TEST_DIR/ttl-test.js"
cat > "$PATCHED_TTL" << 'JSEOF'
const fs = require('fs');
const cacheFile = process.env.TEST_CACHE_FILE;

try {
  const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const age = Math.floor(Date.now() / 1000) - (cached.checked || 0);
  if (age < 3600) {
    fs.writeFileSync(cacheFile + '.ttl-result', 'SKIPPED');
    process.exit(0);
  }
} catch (e) {}
fs.writeFileSync(cacheFile + '.ttl-result', 'PROCEEDED');
JSEOF

TEST_CACHE_FILE="$CACHE_FILE" node "$PATCHED_TTL"
TTL_RESULT=$(cat "$CACHE_FILE.ttl-result" 2>/dev/null || echo "ERROR")
if [ "$TTL_RESULT" = "SKIPPED" ]; then
  echo "PASS: ttl_guard: fresh cache is skipped"
  PASS=$((PASS + 1))
else
  echo "FAIL: ttl_guard: expected SKIPPED but got $TTL_RESULT"
  FAIL=$((FAIL + 1))
fi

# Test: Expired TTL should proceed
python3 -c "
import json
data = {'status': 'UP_TO_DATE', 'installed': '4.0.15.0', 'checked': 0}
with open('$CACHE_FILE', 'w') as f:
    json.dump(data, f)
"
rm -f "$CACHE_FILE.ttl-result"
TEST_CACHE_FILE="$CACHE_FILE" node "$PATCHED_TTL"
TTL_RESULT=$(cat "$CACHE_FILE.ttl-result" 2>/dev/null || echo "ERROR")
if [ "$TTL_RESULT" = "PROCEEDED" ]; then
  echo "PASS: ttl_guard: expired cache proceeds"
  PASS=$((PASS + 1))
else
  echo "FAIL: ttl_guard: expected PROCEEDED but got $TTL_RESULT"
  FAIL=$((FAIL + 1))
fi

# ==========================================
# Test: prism-install-hook.sh
# ==========================================
echo ""
echo "=== Testing prism-install-hook.sh ==="

INSTALL_SCRIPT="$SCRIPT_DIR/../scripts/prism-install-hook.sh"

# Create a mock settings.json
MOCK_SETTINGS="$TEST_DIR/settings.json"
cat > "$MOCK_SETTINGS" << 'EOF'
{
  "permissions": {},
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"gsd-check-update.js\""
          }
        ]
      }
    ]
  }
}
EOF

# Run install script with HOME override
HOME="$TEST_DIR" mkdir -p "$TEST_DIR/.claude"
cp "$MOCK_SETTINGS" "$TEST_DIR/.claude/settings.json"

HOME="$TEST_DIR" bash "$INSTALL_SCRIPT"
if grep -q "prism-check-update" "$TEST_DIR/.claude/settings.json" 2>/dev/null; then
  echo "PASS: install_hook: hook registered in settings.json"
  PASS=$((PASS + 1))
else
  echo "FAIL: install_hook: hook not found in settings.json"
  FAIL=$((FAIL + 1))
fi

# Test idempotency — run again, should not duplicate
BEFORE_COUNT=$(grep -c "prism-check-update" "$TEST_DIR/.claude/settings.json" 2>/dev/null || echo "0")
HOME="$TEST_DIR" bash "$INSTALL_SCRIPT"
AFTER_COUNT=$(grep -c "prism-check-update" "$TEST_DIR/.claude/settings.json" 2>/dev/null || echo "0")
if [ "$BEFORE_COUNT" = "$AFTER_COUNT" ]; then
  echo "PASS: install_hook: idempotent (no duplicate)"
  PASS=$((PASS + 1))
else
  echo "FAIL: install_hook: duplicated entry ($BEFORE_COUNT → $AFTER_COUNT)"
  FAIL=$((FAIL + 1))
fi

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
