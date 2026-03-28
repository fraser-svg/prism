#!/usr/bin/env bash
# test-gemini-worker.sh — Mock-based tests for prism-gemini-worker.sh
#
# Overrides `curl` and `security` with mock functions to test adapter logic
# without real API calls.
#
# Usage: bash test/test-gemini-worker.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKER="$SCRIPT_DIR/scripts/prism-gemini-worker.sh"
PASS=0
FAIL=0
TOTAL=0

# --- Test helpers ---
setup_test_dir() {
  TEST_DIR=$(mktemp -d /tmp/prism-gemini-test-XXXXXX)
  mkdir -p "$TEST_DIR/.prism"
  mkdir -p "$TEST_DIR/src"
  echo 'export type Config = { name: string };' > "$TEST_DIR/src/types.ts"
  echo 'console.log("hello");' > "$TEST_DIR/src/index.ts"
}

cleanup_test_dir() {
  [ -n "${TEST_DIR:-}" ] && rm -rf "$TEST_DIR"
}

assert_status() {
  local test_name="$1"
  local expected_status="$2"
  local result_file="$3"
  TOTAL=$((TOTAL + 1))

  if [ ! -f "$result_file" ]; then
    echo "FAIL [$test_name]: result file not found: $result_file"
    FAIL=$((FAIL + 1))
    return 1
  fi

  local actual_status
  actual_status=$(jq -r '.status' "$result_file" 2>/dev/null || echo "NO_STATUS")

  if [ "$actual_status" = "$expected_status" ]; then
    echo "PASS [$test_name]"
    PASS=$((PASS + 1))
    return 0
  else
    echo "FAIL [$test_name]: expected status=$expected_status, got status=$actual_status"
    local reason; reason=$(jq -r '.reason // "none"' "$result_file" 2>/dev/null)
    echo "      reason: $reason"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

assert_reason_contains() {
  local test_name="$1"
  local expected_substr="$2"
  local result_file="$3"

  local reason
  reason=$(jq -r '.reason // ""' "$result_file" 2>/dev/null || echo "")

  if echo "$reason" | grep -qi "$expected_substr"; then
    return 0
  else
    echo "      DETAIL: expected reason containing '$expected_substr', got '$reason'"
    return 1
  fi
}

# --- Mock wrapper ---
# Creates a wrapper script that mocks `security` and `curl` then calls the real worker
run_with_mocks() {
  local mock_security_fn="$1"
  local mock_curl_fn="$2"
  local input_json="$3"
  local worker_id="$4"
  local extra_args="${5:-}"

  cat > "$TEST_DIR/_run.sh" <<WRAPPER
#!/usr/bin/env bash
set -uo pipefail

# Mock security
security() {
  $mock_security_fn "\$@"
}
export -f security

# Mock curl
curl() {
  $mock_curl_fn "\$@"
}
export -f curl

echo '$input_json' | bash "$WORKER" "$TEST_DIR" "$worker_id" $extra_args
WRAPPER
  chmod +x "$TEST_DIR/_run.sh"
  bash "$TEST_DIR/_run.sh" 2>/dev/null
}

# --- Standard mocks ---
MOCK_SECURITY_OK='
  if echo "$@" | grep -q "\-w"; then
    echo "fake-api-key-12345"
  else
    return 0
  fi
'

MOCK_SECURITY_NOT_FOUND='
  return 1
'

mock_curl_success() {
  local files_json='{"files":[{"path":"src/Dashboard.tsx","content":"import React from '\'react\'';\\nexport default function Dashboard() { return <div>Hello</div>; }"},{"path":"src/Card.tsx","content":"export function Card() { return <div>Card</div>; }"}]}'
  # Write a Gemini-shaped envelope
  cat <<RESPONSE
{
  "candidates": [{
    "content": {"parts": [{"text": $(printf '%s' "$files_json" | jq -Rs '.')}]},
    "finishReason": "STOP",
    "safetyRatings": []
  }],
  "usageMetadata": {"promptTokenCount": 1200, "candidatesTokenCount": 800}
}
RESPONSE
}

MOCK_CURL_SUCCESS='
  mock_curl_success
'

# ============================================================
# TEST 1: Happy path
# ============================================================
test_happy_path() {
  setup_test_dir

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    local files_json="{\"files\":[{\"path\":\"src/Dashboard.tsx\",\"content\":\"export default function Dashboard() { return null; }\"},{\"path\":\"src/Card.tsx\",\"content\":\"export function Card() { return null; }\"}]}"
    local envelope="{\"candidates\":[{\"content\":{\"parts\":[{\"text\":$(printf "%s" "$files_json" | jq -Rs ".")}]},\"finishReason\":\"STOP\",\"safetyRatings\":[]}],\"usageMetadata\":{\"promptTokenCount\":1200,\"candidatesTokenCount\":800}}"

    if [ -n "$outfile" ]; then
      printf "%s" "$envelope" > "$outfile"
    else
      printf "%s" "$envelope"
    fi
    echo "200"
  '

  INPUT='{"task":"Build dashboard","files_to_read":["src/types.ts"],"constraints":"Use React","model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w1"

  local result; result="$TEST_DIR/.prism/staging/w1/result.json"
  assert_status "happy_path" "completed" "$result"

  # Verify files were promoted to project root
  if [ -f "$TEST_DIR/src/Dashboard.tsx" ] && [ -f "$TEST_DIR/src/Card.tsx" ]; then
    echo "      files promoted to project root: OK"
  else
    echo "      DETAIL: files not promoted to project root"
  fi

  cleanup_test_dir
}

# ============================================================
# TEST 2: Empty files array
# ============================================================
test_empty_files() {
  setup_test_dir

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    local envelope="{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"{\\\"files\\\":[]}\"}]},\"finishReason\":\"STOP\",\"safetyRatings\":[]}],\"usageMetadata\":{\"promptTokenCount\":500,\"candidatesTokenCount\":10}}"

    if [ -n "$outfile" ]; then
      printf "%s" "$envelope" > "$outfile"
    else
      printf "%s" "$envelope"
    fi
    echo "200"
  '

  INPUT='{"task":"Build something","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w2"

  local result; result="$TEST_DIR/.prism/staging/w2/result.json"
  assert_status "empty_files" "failed" "$result"
  assert_reason_contains "empty_files" "no files" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 3: Invalid JSON response
# ============================================================
test_invalid_json_response() {
  setup_test_dir

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    if [ -n "$outfile" ]; then
      printf "This is not JSON at all" > "$outfile"
    else
      printf "This is not JSON at all"
    fi
    echo "200"
  '

  INPUT='{"task":"Build something","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w3"

  local result; result="$TEST_DIR/.prism/staging/w3/result.json"
  assert_status "invalid_json_response" "failed" "$result"
  assert_reason_contains "invalid_json_response" "non-JSON" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 4: Missing API key
# ============================================================
test_missing_api_key() {
  setup_test_dir

  MOCK_CURL='echo "200"'  # Shouldn't be called

  INPUT='{"task":"Build something","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_NOT_FOUND" "$MOCK_CURL" "$INPUT" "w4"

  local result; result="$TEST_DIR/.prism/staging/w4/result.json"
  assert_status "missing_api_key" "failed" "$result"
  assert_reason_contains "missing_api_key" "not connected" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 5: Path traversal
# ============================================================
test_path_traversal() {
  setup_test_dir

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    local files_json="{\"files\":[{\"path\":\"../evil.sh\",\"content\":\"rm -rf /\"}]}"
    local envelope="{\"candidates\":[{\"content\":{\"parts\":[{\"text\":$(printf "%s" "$files_json" | jq -Rs ".")}]},\"finishReason\":\"STOP\",\"safetyRatings\":[]}],\"usageMetadata\":{\"promptTokenCount\":500,\"candidatesTokenCount\":50}}"

    if [ -n "$outfile" ]; then
      printf "%s" "$envelope" > "$outfile"
    else
      printf "%s" "$envelope"
    fi
    echo "200"
  '

  INPUT='{"task":"Build something","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w5"

  local result; result="$TEST_DIR/.prism/staging/w5/result.json"
  assert_status "path_traversal" "failed" "$result"
  assert_reason_contains "path_traversal" "traversal" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 6: File too large (>100KB)
# ============================================================
test_file_too_large() {
  setup_test_dir

  # Create a >100KB file
  dd if=/dev/zero bs=1024 count=110 2>/dev/null | tr '\0' 'x' > "$TEST_DIR/src/bigfile.ts"

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    local files_json="{\"files\":[{\"path\":\"src/output.ts\",\"content\":\"export const x = 1;\"}]}"
    local envelope="{\"candidates\":[{\"content\":{\"parts\":[{\"text\":$(printf "%s" "$files_json" | jq -Rs ".")}]},\"finishReason\":\"STOP\",\"safetyRatings\":[]}],\"usageMetadata\":{\"promptTokenCount\":1000,\"candidatesTokenCount\":50}}"

    if [ -n "$outfile" ]; then
      printf "%s" "$envelope" > "$outfile"
    else
      printf "%s" "$envelope"
    fi
    echo "200"
  '

  INPUT='{"task":"Refactor big file","files_to_read":["src/bigfile.ts"],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w6"

  # Should succeed but with truncation (file is read, just truncated)
  local result; result="$TEST_DIR/.prism/staging/w6/result.json"
  assert_status "file_too_large" "completed" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 7: Missing input file
# ============================================================
test_missing_input_file() {
  setup_test_dir

  MOCK_CURL='echo "200"'  # Shouldn't be called

  INPUT='{"task":"Build something","files_to_read":["src/nonexistent.ts"],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w7"

  local result; result="$TEST_DIR/.prism/staging/w7/result.json"
  assert_status "missing_input_file" "failed" "$result"
  assert_reason_contains "missing_input_file" "not found" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 8: Dry-run mode
# ============================================================
test_dry_run() {
  setup_test_dir

  MOCK_CURL='echo "should not be called" >&2; exit 99'

  INPUT='{"task":"Build something","files_to_read":["src/types.ts"],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w8" "--dry-run"

  local result; result="$TEST_DIR/.prism/staging/w8/result.json"
  assert_status "dry_run" "dry_run" "$result"

  # Verify prompt was saved
  if [ -f "$TEST_DIR/.prism/staging/w8/prompt.json" ]; then
    echo "      prompt.json saved: OK"
  else
    echo "      DETAIL: prompt.json not found in staging"
  fi

  cleanup_test_dir
}

# ============================================================
# TEST 9: Parallel safety (3 concurrent instances)
# ============================================================
test_parallel_safety() {
  setup_test_dir

  # Each parallel worker gets its own wrapper script to avoid race conditions
  _run_parallel_worker() {
    local wid="$1"
    local wrapper="$TEST_DIR/_run_${wid}.sh"

    cat > "$wrapper" <<PWRAPPER
#!/usr/bin/env bash
set -uo pipefail

security() {
  if echo "\$@" | grep -q "\-w"; then
    echo "fake-api-key-12345"
  else
    return 0
  fi
}
export -f security

curl() {
  local outfile=""
  while [ \$# -gt 0 ]; do
    case "\$1" in
      -o) outfile="\$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  sleep 0.1

  local files_json="{\"files\":[{\"path\":\"src/output.ts\",\"content\":\"export const x = 1;\"}]}"
  local envelope="{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\$(printf "%s" "\$files_json" | jq -Rs ".")}]},\"finishReason\":\"STOP\",\"safetyRatings\":[]}],\"usageMetadata\":{\"promptTokenCount\":500,\"candidatesTokenCount\":50}}"

  if [ -n "\$outfile" ]; then
    printf "%s" "\$envelope" > "\$outfile"
  else
    printf "%s" "\$envelope"
  fi
  echo "200"
}
export -f curl

echo '{"task":"Build something","files_to_read":[],"model":"gemini-2.5-pro"}' | bash "$WORKER" "$TEST_DIR" "$wid"
PWRAPPER
    chmod +x "$wrapper"
    bash "$wrapper" 2>/dev/null
  }

  _run_parallel_worker "wp1" &
  PID1=$!
  _run_parallel_worker "wp2" &
  PID2=$!
  _run_parallel_worker "wp3" &
  PID3=$!

  wait "$PID1" "$PID2" "$PID3"

  TOTAL=$((TOTAL + 1))
  local r1="$TEST_DIR/.prism/staging/wp1/result.json"
  local r2="$TEST_DIR/.prism/staging/wp2/result.json"
  local r3="$TEST_DIR/.prism/staging/wp3/result.json"

  if [ -f "$r1" ] && [ -f "$r2" ] && [ -f "$r3" ]; then
    local s1; s1=$(jq -r '.status' "$r1")
    local s2; s2=$(jq -r '.status' "$r2")
    local s3; s3=$(jq -r '.status' "$r3")
    if [ "$s1" = "completed" ] && [ "$s2" = "completed" ] && [ "$s3" = "completed" ]; then
      echo "PASS [parallel_safety]: all 3 workers completed with distinct result files"
      PASS=$((PASS + 1))
    else
      echo "FAIL [parallel_safety]: not all workers completed ($s1, $s2, $s3)"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "FAIL [parallel_safety]: not all result files found"
    [ ! -f "$r1" ] && echo "      missing: wp1/result.json"
    [ ! -f "$r2" ] && echo "      missing: wp2/result.json"
    [ ! -f "$r3" ] && echo "      missing: wp3/result.json"
    FAIL=$((FAIL + 1))
  fi

  cleanup_test_dir
}

# ============================================================
# TEST 10: Malformed stdin JSON
# ============================================================
test_malformed_stdin() {
  setup_test_dir

  MOCK_CURL='echo "200"'

  cat > "$TEST_DIR/_run_malformed.sh" <<'WRAPPER'
#!/usr/bin/env bash
set -uo pipefail
security() { echo "fake-key"; }
export -f security
curl() { echo "200"; }
export -f curl
WRAPPER
  echo "echo 'this is {not valid json' | bash \"$WORKER\" \"$TEST_DIR\" \"w10\"" >> "$TEST_DIR/_run_malformed.sh"
  chmod +x "$TEST_DIR/_run_malformed.sh"
  bash "$TEST_DIR/_run_malformed.sh" 2>/dev/null

  local result; result="$TEST_DIR/.prism/staging/w10/result.json"
  assert_status "malformed_stdin" "failed" "$result"
  assert_reason_contains "malformed_stdin" "Invalid JSON" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 11: Safety block in response
# ============================================================
test_safety_block() {
  setup_test_dir

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    local envelope="{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"{}\"}]},\"finishReason\":\"SAFETY\",\"safetyRatings\":[{\"category\":\"HARM_CATEGORY_DANGEROUS_CONTENT\",\"blocked\":true}]}],\"usageMetadata\":{\"promptTokenCount\":500,\"candidatesTokenCount\":0}}"

    if [ -n "$outfile" ]; then
      printf "%s" "$envelope" > "$outfile"
    else
      printf "%s" "$envelope"
    fi
    echo "200"
  '

  INPUT='{"task":"Build something","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w11"

  local result; result="$TEST_DIR/.prism/staging/w11/result.json"
  assert_status "safety_block" "failed" "$result"
  assert_reason_contains "safety_block" "safety" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 12: No candidates in response
# ============================================================
test_no_candidates() {
  setup_test_dir

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    local envelope="{\"candidates\":[],\"usageMetadata\":{\"promptTokenCount\":500,\"candidatesTokenCount\":0}}"

    if [ -n "$outfile" ]; then
      printf "%s" "$envelope" > "$outfile"
    else
      printf "%s" "$envelope"
    fi
    echo "200"
  '

  INPUT='{"task":"Build something","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w12"

  local result; result="$TEST_DIR/.prism/staging/w12/result.json"
  assert_status "no_candidates" "failed" "$result"
  assert_reason_contains "no_candidates" "No candidates" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 13: Bad finish_reason (MAX_TOKENS)
# ============================================================
test_bad_finish_reason() {
  setup_test_dir

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    local files_json="{\"files\":[{\"path\":\"src/partial.ts\",\"content\":\"export const\"}]}"
    local envelope="{\"candidates\":[{\"content\":{\"parts\":[{\"text\":$(printf "%s" "$files_json" | jq -Rs ".")}]},\"finishReason\":\"MAX_TOKENS\",\"safetyRatings\":[]}],\"usageMetadata\":{\"promptTokenCount\":1000,\"candidatesTokenCount\":8000}}"

    if [ -n "$outfile" ]; then
      printf "%s" "$envelope" > "$outfile"
    else
      printf "%s" "$envelope"
    fi
    echo "200"
  '

  INPUT='{"task":"Build something big","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w13"

  local result; result="$TEST_DIR/.prism/staging/w13/result.json"
  assert_status "bad_finish_reason" "failed" "$result"
  assert_reason_contains "bad_finish_reason" "MAX_TOKENS" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 14: 5xx retry then success
# ============================================================
test_5xx_retry() {
  setup_test_dir

  # Use a state file to track curl call count
  echo "0" > "$TEST_DIR/_curl_count"

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    local count; count=$(cat "'"$TEST_DIR"'/_curl_count")
    count=$((count + 1))
    echo "$count" > "'"$TEST_DIR"'/_curl_count"

    if [ "$count" -eq 1 ]; then
      # First call: 503
      if [ -n "$outfile" ]; then
        printf "Service Unavailable" > "$outfile"
      fi
      echo "503"
    else
      # Second call: success
      local files_json="{\"files\":[{\"path\":\"src/retry.ts\",\"content\":\"export const ok = true;\"}]}"
      local envelope="{\"candidates\":[{\"content\":{\"parts\":[{\"text\":$(printf "%s" "$files_json" | jq -Rs ".")}]},\"finishReason\":\"STOP\",\"safetyRatings\":[]}],\"usageMetadata\":{\"promptTokenCount\":500,\"candidatesTokenCount\":50}}"

      if [ -n "$outfile" ]; then
        printf "%s" "$envelope" > "$outfile"
      else
        printf "%s" "$envelope"
      fi
      echo "200"
    fi
  '

  INPUT='{"task":"Build with retry","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w14"

  local result; result="$TEST_DIR/.prism/staging/w14/result.json"
  assert_status "5xx_retry" "completed" "$result"

  cleanup_test_dir
}

# ============================================================
# TEST 15: Staging cleanup on failure
# ============================================================
test_staging_cleanup() {
  setup_test_dir

  MOCK_CURL='
    local outfile=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -o) outfile="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    if [ -n "$outfile" ]; then
      printf "bad response" > "$outfile"
    fi
    echo "401"
  '

  INPUT='{"task":"Build something","files_to_read":[],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w15"

  local result; result="$TEST_DIR/.prism/staging/w15/result.json"
  assert_status "staging_cleanup" "failed" "$result"

  # Check that only result.json exists in staging (no leftover files)
  TOTAL=$((TOTAL + 1))
  local staging_dir="$TEST_DIR/.prism/staging/w15"
  local file_count
  file_count=$(find "$staging_dir" -type f ! -name 'result.json' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$file_count" = "0" ]; then
    echo "PASS [staging_cleanup_files]: no leftover files in staging"
    PASS=$((PASS + 1))
  else
    echo "FAIL [staging_cleanup_files]: $file_count leftover files in staging"
    FAIL=$((FAIL + 1))
  fi

  cleanup_test_dir
}

# ============================================================
# TEST 16: File limit exceeded (>10 files)
# ============================================================
test_file_limit() {
  setup_test_dir

  # Create 11 files
  for i in $(seq 1 11); do
    echo "export const x$i = $i;" > "$TEST_DIR/src/file$i.ts"
  done

  MOCK_CURL='echo "200"'

  INPUT='{"task":"Build something","files_to_read":["src/file1.ts","src/file2.ts","src/file3.ts","src/file4.ts","src/file5.ts","src/file6.ts","src/file7.ts","src/file8.ts","src/file9.ts","src/file10.ts","src/file11.ts"],"model":"gemini-2.5-pro"}'
  run_with_mocks "$MOCK_SECURITY_OK" "$MOCK_CURL" "$INPUT" "w16"

  local result; result="$TEST_DIR/.prism/staging/w16/result.json"
  assert_status "file_limit" "failed" "$result"
  assert_reason_contains "file_limit" "max 10" "$result"

  cleanup_test_dir
}

# ============================================================
# Run all tests
# ============================================================
echo "=== prism-gemini-worker.sh test suite ==="
echo ""

test_happy_path
test_empty_files
test_invalid_json_response
test_missing_api_key
test_path_traversal
test_file_too_large
test_missing_input_file
test_dry_run
test_parallel_safety
test_malformed_stdin
test_safety_block
test_no_candidates
test_bad_finish_reason
test_5xx_retry
test_staging_cleanup
test_file_limit

echo ""
echo "=== Results: $PASS passed, $FAIL failed, $TOTAL total ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
