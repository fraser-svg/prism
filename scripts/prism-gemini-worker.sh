#!/usr/bin/env bash
# prism-gemini-worker.sh — Gemini API adapter for Prism build workers
#
# Bridges the gap between Prism's worker contract and Gemini's API.
# Reads files into the prompt, calls Gemini, parses structured JSON output,
# writes files to a staging directory, verifies, then promotes to project root.
#
# Usage:
#   echo '<json_payload>' | prism-gemini-worker.sh <project_root> <worker_id> [--dry-run]
#
# Input JSON (stdin):
#   {"task":"...","files_to_read":["src/types.ts"],"constraints":"...","shared_context":"...","model":"gemini-2.5-pro"}
#
# Output: writes result JSON to .prism/staging/{worker_id}/result.json
#         prints one-line summary to stdout.
# Exit: 0 = completed (check result JSON), non-zero = script crashed (see stderr).
set -uo pipefail

# --- Dependency check ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required but not installed" >&2
  exit 1
fi

# --- Constants ---
MAX_FILES=10
MAX_FILE_SIZE=102400  # 100KB
MAX_RETRIES=3
API_TIMEOUT=120

# --- Helpers ---
_sanitize_arg() {
  printf '%s' "$1" | tr -d '`$();|&<>!' | tr -s ' '
}

_staging_dir() {
  printf '%s/.prism/staging/%s' "$1" "$2"
}

_result_path() {
  printf '%s/.prism/staging/%s/result.json' "$1" "$2"
}

_write_result() {
  local root="$1"
  local worker_id="$2"
  local json="$3"
  local summary="$4"
  local result_file; result_file=$(_result_path "$root" "$worker_id")
  mkdir -p "$(dirname "$result_file")"
  printf '%s' "$json" > "$result_file"
  printf '%s -> %s\n' "$summary" "$result_file"
}

_fail() {
  local root="$1"
  local worker_id="$2"
  local model="$3"
  local reason="$4"
  local result
  result=$(jq -n \
    --arg wid "$worker_id" \
    --arg model "$model" \
    --arg reason "$reason" \
    '{status:"failed",worker_id:$wid,provider:"google",model:$model,reason:$reason,file_manifest:[]}')
  _write_result "$root" "$worker_id" "$result" "FAIL: $worker_id — $reason"
  # Clean up any staged files (but keep result.json)
  local staging; staging=$(_staging_dir "$root" "$worker_id")
  if [ -d "$staging" ]; then
    find "$staging" -type f ! -name 'result.json' -delete 2>/dev/null || true
    find "$staging" -mindepth 1 -type d -empty -delete 2>/dev/null || true
  fi
  exit 0
}

# --- Parse CLI args ---
ROOT="${1:-}"
WORKER_ID="${2:-}"
DRY_RUN=false

if [ -z "$ROOT" ] || [ -z "$WORKER_ID" ]; then
  echo "Usage: echo '<json>' | prism-gemini-worker.sh <project_root> <worker_id> [--dry-run]" >&2
  exit 1
fi

ROOT=$(_sanitize_arg "$ROOT")
WORKER_ID=$(_sanitize_arg "$WORKER_ID")

shift 2
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    *) shift ;;
  esac
done

if [ ! -d "$ROOT" ]; then
  echo "ERROR: project root does not exist: $ROOT" >&2
  exit 1
fi

# --- Read and validate stdin JSON ---
STDIN_DATA=""
if [ ! -t 0 ]; then
  STDIN_DATA=$(timeout 5 cat 2>/dev/null || cat 2>/dev/null || true)
fi

if [ -z "$STDIN_DATA" ]; then
  _fail "$ROOT" "$WORKER_ID" "unknown" "No JSON payload on stdin"
fi

if ! printf '%s' "$STDIN_DATA" | jq empty 2>/dev/null; then
  _fail "$ROOT" "$WORKER_ID" "unknown" "Invalid JSON on stdin"
fi

# Extract fields
TASK=$(printf '%s' "$STDIN_DATA" | jq -r '.task // empty')
MODEL=$(printf '%s' "$STDIN_DATA" | jq -r '.model // "gemini-2.5-pro"')
CONSTRAINTS=$(printf '%s' "$STDIN_DATA" | jq -r '.constraints // ""')
SHARED_CONTEXT=$(printf '%s' "$STDIN_DATA" | jq -r '.shared_context // ""')

if [ -z "$TASK" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Missing required field: task"
fi

# Validate files_to_read
FILE_COUNT=$(printf '%s' "$STDIN_DATA" | jq '.files_to_read | length')
if [ "$FILE_COUNT" -gt "$MAX_FILES" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Too many files (max $MAX_FILES, got $FILE_COUNT)"
fi

# --- Retrieve API key ---
if [ "$DRY_RUN" = false ]; then
  API_KEY=""
  KEY_ERR=""
  API_KEY=$(security find-generic-password -s "prism-google" -a "prism" -w 2>/dev/null) || KEY_ERR="$?"
  if [ -z "$API_KEY" ]; then
    if echo "$KEY_ERR" | grep -qi "interaction"; then
      _fail "$ROOT" "$WORKER_ID" "$MODEL" "Keychain locked"
    fi
    _fail "$ROOT" "$WORKER_ID" "$MODEL" "google provider not connected"
  fi
fi

# --- Read files_to_read into prompt context ---
FILE_CONTEXT=""
FILES_TO_READ=$(printf '%s' "$STDIN_DATA" | jq -r '.files_to_read[]?' 2>/dev/null)

while IFS= read -r file_path; do
  [ -z "$file_path" ] && continue

  # Validate input path (no traversal)
  case "$file_path" in
    ../*|*/../*|/*|~*) _fail "$ROOT" "$WORKER_ID" "$MODEL" "Invalid input path (traversal rejected): $file_path" ;;
  esac

  # Resolve relative to project root
  local_path="$ROOT/$file_path"

  if [ ! -f "$local_path" ]; then
    _fail "$ROOT" "$WORKER_ID" "$MODEL" "File not found: $file_path"
  fi

  # Skip binary files
  if file --mime "$local_path" 2>/dev/null | grep -q "charset=binary"; then
    FILE_CONTEXT="${FILE_CONTEXT}--- FILE: ${file_path} ---
[binary file skipped]
--- END FILE ---
"
    continue
  fi

  # Check file size
  FILE_SIZE=$(wc -c < "$local_path" | tr -d ' ')
  if [ "$FILE_SIZE" -gt "$MAX_FILE_SIZE" ]; then
    CONTENT=$(head -c "$MAX_FILE_SIZE" "$local_path")
    FILE_CONTEXT="${FILE_CONTEXT}--- FILE: ${file_path} (TRUNCATED: ${FILE_SIZE} bytes, showing first 100KB) ---
${CONTENT}
--- END FILE ---
"
  else
    CONTENT=$(cat "$local_path")
    FILE_CONTEXT="${FILE_CONTEXT}--- FILE: ${file_path} ---
${CONTENT}
--- END FILE ---
"
  fi
done <<< "$FILES_TO_READ"

# --- Construct prompt ---
SYSTEM_PROMPT="You are a build worker for a software project. Your job is to write complete, production-ready code.

RULES:
- Write COMPLETE file contents. No placeholders, no TODOs, no \"// rest of file\".
- Every file must be syntactically valid and ready to use.
- Only output files relevant to the task.
- Do not reference or import files that don't exist in the provided context.

FRONTEND STACK:
# Source of truth: heroui-react skill. Update both when patterns change.
- HeroUI v3 is the default UI library. Import components from @heroui/react.
- Use compound component API (e.g., <Table><TableHeader><TableColumn>...).
- No HeroUIProvider wrapper unless using theme switching or locale features.
- Prefer HeroUI components over raw HTML/Tailwind markup.

OUTPUT FORMAT:
Return a JSON object with a \"files\" array. Each element has:
- \"path\": relative file path (e.g., \"src/Dashboard.tsx\")
- \"content\": the complete file content as a string

Example:
{\"files\":[{\"path\":\"src/Example.tsx\",\"content\":\"import React from 'react';\\n...\"}]}"

USER_PROMPT="TASK: ${TASK}"
if [ -n "$CONSTRAINTS" ]; then
  USER_PROMPT="${USER_PROMPT}

CONSTRAINTS: ${CONSTRAINTS}"
fi
if [ -n "$SHARED_CONTEXT" ]; then
  USER_PROMPT="${USER_PROMPT}

SHARED CONTEXT: ${SHARED_CONTEXT}"
fi
if [ -n "$FILE_CONTEXT" ]; then
  USER_PROMPT="${USER_PROMPT}

EXISTING FILES:
${FILE_CONTEXT}"
fi

# --- Build API request body ---
REQUEST_BODY=$(jq -n \
  --arg system "$SYSTEM_PROMPT" \
  --arg user "$USER_PROMPT" \
  '{
    system_instruction: {parts: [{text: $system}]},
    contents: [{role: "user", parts: [{text: $user}]}],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.2
    }
  }')

# --- Dry-run mode ---
if [ "$DRY_RUN" = true ]; then
  STAGING=$(_staging_dir "$ROOT" "$WORKER_ID")
  mkdir -p "$STAGING"
  printf '%s' "$REQUEST_BODY" > "$STAGING/prompt.json"

  RESULT=$(jq -n \
    --arg wid "$WORKER_ID" \
    --arg model "$MODEL" \
    '{status:"dry_run",worker_id:$wid,provider:"google",model:$model,reason:"dry-run mode",file_manifest:[],prompt_file:"prompt.json"}')
  _write_result "$ROOT" "$WORKER_ID" "$RESULT" "DRY_RUN: $WORKER_ID (prompt saved)"
  exit 0
fi

# --- Call Gemini API with retry ---
API_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent"
RESPONSE=""
HTTP_CODE=""
ATTEMPT=0
BACKOFF=2

while [ "$ATTEMPT" -lt "$MAX_RETRIES" ]; do
  ATTEMPT=$((ATTEMPT + 1))
  TMPFILE=$(mktemp /tmp/prism-gemini-resp-XXXXXX)

  HTTP_CODE=$(curl -s -o "$TMPFILE" -w '%{http_code}' \
    --max-time "$API_TIMEOUT" \
    --max-redirs 0 \
    -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "x-goog-api-key: $API_KEY" \
    -d "$REQUEST_BODY" 2>/dev/null) || HTTP_CODE="000"

  RESPONSE=$(cat "$TMPFILE" 2>/dev/null || true)
  rm -f "$TMPFILE"

  # Success
  if [ "$HTTP_CODE" = "200" ]; then
    break
  fi

  # Retryable errors: 429 (rate limit) or 5xx
  if [ "$HTTP_CODE" = "429" ] || [ "${HTTP_CODE:0:1}" = "5" ]; then
    if [ "$ATTEMPT" -lt "$MAX_RETRIES" ]; then
      echo "WARN: Gemini API returned $HTTP_CODE, retrying in ${BACKOFF}s (attempt $ATTEMPT/$MAX_RETRIES)" >&2
      sleep "$BACKOFF"
      BACKOFF=$((BACKOFF * 2))
      continue
    fi
  fi

  # Non-retryable error
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "API returned HTTP $HTTP_CODE"
done

# Final check after retries exhausted
if [ "$HTTP_CODE" != "200" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "API returned HTTP $HTTP_CODE after $MAX_RETRIES retries"
fi

# --- Envelope validation ---

# Must be valid JSON
if ! printf '%s' "$RESPONSE" | jq empty 2>/dev/null; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "API returned non-JSON response"
fi

# Check candidates array exists and is non-empty
CANDIDATE_COUNT=$(printf '%s' "$RESPONSE" | jq '.candidates | length // 0' 2>/dev/null || echo "0")
if [ "$CANDIDATE_COUNT" = "0" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "No candidates in response"
fi

# Check for safety block
SAFETY_BLOCKED=$(printf '%s' "$RESPONSE" | jq -r '
  .candidates[0].safetyRatings // [] |
  map(select(.blocked == true)) | length
' 2>/dev/null || echo "0")
if [ "$SAFETY_BLOCKED" != "0" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Response blocked by safety filter"
fi

# Check finish reason
FINISH_REASON=$(printf '%s' "$RESPONSE" | jq -r '.candidates[0].finishReason // "UNKNOWN"' 2>/dev/null)
if [ "$FINISH_REASON" != "STOP" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Unexpected finish reason: $FINISH_REASON"
fi

# Extract the text content (Gemini wraps JSON mode output in text)
RAW_TEXT=$(printf '%s' "$RESPONSE" | jq -r '.candidates[0].content.parts[0].text // empty' 2>/dev/null)
if [ -z "$RAW_TEXT" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "No text content in response"
fi

# Parse the structured JSON output
if ! printf '%s' "$RAW_TEXT" | jq empty 2>/dev/null; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Model returned non-JSON text content"
fi

FILE_ARRAY=$(printf '%s' "$RAW_TEXT" | jq '.files // []')
OUTPUT_FILE_COUNT=$(printf '%s' "$FILE_ARRAY" | jq 'length')

if [ "$OUTPUT_FILE_COUNT" = "0" ]; then
  # Check for refusal pattern
  if printf '%s' "$RAW_TEXT" | grep -qi "I cannot\|I can't\|I'm unable"; then
    _fail "$ROOT" "$WORKER_ID" "$MODEL" "Model refused the task"
  fi
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Model returned no files"
fi

# --- Validate output paths ---
INVALID_PATH=$(printf '%s' "$FILE_ARRAY" | jq -r '
  .[] | .path | select(
    contains("..") or
    startswith("/") or
    startswith("~")
  )
' 2>/dev/null | head -1)

if [ -n "$INVALID_PATH" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Invalid output path (traversal rejected): $INVALID_PATH"
fi

# --- Write files to staging directory ---
STAGING=$(_staging_dir "$ROOT" "$WORKER_ID")
mkdir -p "$STAGING"

FILE_MANIFEST="[]"
WRITE_ERRORS=""

for i in $(seq 0 $((OUTPUT_FILE_COUNT - 1))); do
  FILE_PATH=$(printf '%s' "$FILE_ARRAY" | jq -r ".[$i].path")
  FILE_CONTENT=$(printf '%s' "$FILE_ARRAY" | jq -r ".[$i].content")

  STAGED_PATH="$STAGING/$FILE_PATH"
  mkdir -p "$(dirname "$STAGED_PATH")"

  if printf '%s' "$FILE_CONTENT" > "$STAGED_PATH" 2>/dev/null; then
    FILE_MANIFEST=$(printf '%s' "$FILE_MANIFEST" | jq --arg p "$FILE_PATH" '. + [$p]')
  else
    WRITE_ERRORS="${WRITE_ERRORS}Failed to write: $FILE_PATH; "
  fi
done

if [ -n "$WRITE_ERRORS" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Write errors: $WRITE_ERRORS"
fi

# --- Promote from staging to project root ---
PROMOTE_ERRORS=""
MANIFEST_PATHS=$(printf '%s' "$FILE_MANIFEST" | jq -r '.[]')

while IFS= read -r rel_path; do
  [ -z "$rel_path" ] && continue
  TARGET="$ROOT/$rel_path"
  SOURCE="$STAGING/$rel_path"

  mkdir -p "$(dirname "$TARGET")"
  if ! cp "$SOURCE" "$TARGET" 2>/dev/null; then
    PROMOTE_ERRORS="${PROMOTE_ERRORS}Failed to promote: $rel_path; "
  fi
done <<< "$MANIFEST_PATHS"

if [ -n "$PROMOTE_ERRORS" ]; then
  _fail "$ROOT" "$WORKER_ID" "$MODEL" "Promote errors: $PROMOTE_ERRORS"
fi

# Clean up staged files (keep result.json)
find "$STAGING" -type f ! -name 'result.json' -delete 2>/dev/null || true
find "$STAGING" -mindepth 1 -type d -empty -delete 2>/dev/null || true

# --- Extract token usage ---
INPUT_TOKENS=$(printf '%s' "$RESPONSE" | jq '.usageMetadata.promptTokenCount // 0' 2>/dev/null || echo "0")
OUTPUT_TOKENS=$(printf '%s' "$RESPONSE" | jq '.usageMetadata.candidatesTokenCount // 0' 2>/dev/null || echo "0")

# --- Write success result ---
RESULT=$(jq -n \
  --arg wid "$WORKER_ID" \
  --arg model "$MODEL" \
  --argjson manifest "$FILE_MANIFEST" \
  --argjson input_tokens "$INPUT_TOKENS" \
  --argjson output_tokens "$OUTPUT_TOKENS" \
  '{
    status: "completed",
    worker_id: $wid,
    provider: "google",
    model: $model,
    file_manifest: $manifest,
    token_usage: {input: $input_tokens, output: $output_tokens}
  }')

MANIFEST_COUNT=$(printf '%s' "$FILE_MANIFEST" | jq 'length')
_write_result "$ROOT" "$WORKER_ID" "$RESULT" "OK: $WORKER_ID completed ($MANIFEST_COUNT files)"
