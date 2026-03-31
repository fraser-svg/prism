#!/usr/bin/env bash
# prism-verify.sh — Post-worker syntax verification for Prism v3
# Checks file existence, lint, and compile. This is SYNTAX verification only —
# it catches missing files, lint errors, and type errors.
# It does NOT catch semantic correctness (wrong logic, incompatible contracts).
#
# Usage: prism-verify.sh <root> [--files f1,f2,...] [--lint] [--compile] [--cwd dir]
#
# Output: writes JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed.
set -uo pipefail

# --- Helpers ---
_tmp_output() {
  printf '/tmp/prism-verify-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

# --- Parse args ---
ROOT=""
FILES=""
DO_LINT=false
DO_COMPILE=false
DO_TOLERANT=false
CWD=""

while [ $# -gt 0 ]; do
  case "$1" in
    --files)   FILES="$2"; shift 2 ;;
    --lint)    DO_LINT=true; shift ;;
    --compile) DO_COMPILE=true; shift ;;
    --tolerant) DO_TOLERANT=true; shift ;;
    --cwd)     CWD="$2"; shift 2 ;;
    *)
      if [ -z "$ROOT" ]; then
        ROOT="$1"
      fi
      shift
      ;;
  esac
done

if [ -z "$ROOT" ]; then
  echo "Usage: prism-verify.sh <root> [--files f1,f2] [--lint] [--compile]" >&2
  exit 1
fi

if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

WORK_DIR="${CWD:-$ROOT}"
cd "$WORK_DIR" || exit 1

PASSED=true
FILE_CHECK="skipped"
LINT_CHECK="skipped"
COMPILE_CHECK="skipped"
ERRORS="[]"

HAS_JQ=false
command -v jq >/dev/null 2>&1 && HAS_JQ=true

# --- 1. File existence check ---
if [ -n "$FILES" ]; then
  FILE_CHECK="passed"
  SKIP_COUNT=0
  FILE_COUNT=0
  IFS=',' read -ra FILE_LIST <<< "$FILES"
  for file in "${FILE_LIST[@]}"; do
    file=$(printf '%s' "$file" | xargs)  # trim whitespace
    [ -z "$file" ] && continue
    FILE_COUNT=$((FILE_COUNT + 1))

    # Resolve relative to root
    local_path="$file"
    [ ! -f "$local_path" ] && local_path="$ROOT/$file"

    if [ ! -f "$local_path" ]; then
      if [ "$DO_TOLERANT" = true ]; then
        # Skip missing files with warning (file may have been deleted during QA fixes)
        printf 'WARN: skipping missing file: %s\n' "$file" >&2
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
      fi
      FILE_CHECK="failed"
      PASSED=false
      if [ "$HAS_JQ" = true ]; then
        ERRORS=$(printf '%s' "$ERRORS" | jq --arg f "$file" '. + [{"type":"file_missing","file":$f}]')
      fi
    elif [ ! -s "$local_path" ]; then
      FILE_CHECK="failed"
      PASSED=false
      if [ "$HAS_JQ" = true ]; then
        ERRORS=$(printf '%s' "$ERRORS" | jq --arg f "$file" '. + [{"type":"file_empty","file":$f}]')
      fi
    fi
  done
  # If all files were missing, report accurately instead of false "passed"
  if [ "$FILE_COUNT" -gt 0 ] && [ "$SKIP_COUNT" -eq "$FILE_COUNT" ]; then
    FILE_CHECK="skipped_all_missing"
  fi
fi

# --- 2. Lint check ---
if [ "$DO_LINT" = true ]; then
  # Detect linter config
  LINTER=""
  LINT_CMD=""

  if [ -f "$ROOT/.eslintrc.js" ] || [ -f "$ROOT/.eslintrc.json" ] || [ -f "$ROOT/.eslintrc.yml" ] || [ -f "$ROOT/eslint.config.js" ] || [ -f "$ROOT/eslint.config.mjs" ]; then
    if command -v npx >/dev/null 2>&1; then
      LINTER="eslint"
      if [ -n "$FILES" ]; then
        # Lint only specified files (filter to .ts/.tsx/.js/.jsx)
        LINT_FILES=""
        IFS=',' read -ra FILE_LIST <<< "$FILES"
        for file in "${FILE_LIST[@]}"; do
          file=$(printf '%s' "$file" | xargs)
          case "$file" in
            *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) LINT_FILES="$LINT_FILES $file" ;;
          esac
        done
        [ -n "$LINT_FILES" ] && LINT_CMD="npx eslint --no-error-on-unmatched-pattern $LINT_FILES"
      else
        LINT_CMD="npx eslint ."
      fi
    fi
  elif [ -f "$ROOT/biome.json" ] || [ -f "$ROOT/biome.jsonc" ]; then
    if command -v npx >/dev/null 2>&1; then
      LINTER="biome"
      LINT_CMD="npx biome check ."
    fi
  fi

  if [ -z "$LINTER" ]; then
    LINT_CHECK="skipped_no_config"
  elif [ -z "$LINT_CMD" ]; then
    LINT_CHECK="skipped_no_files"
  else
    LINT_OUTPUT=$(eval "$LINT_CMD" 2>&1)
    LINT_EXIT=$?
    if [ $LINT_EXIT -eq 0 ]; then
      LINT_CHECK="passed"
    else
      LINT_CHECK="failed"
      PASSED=false
      # Capture first 10 lines of lint errors
      LINT_SUMMARY=$(printf '%s' "$LINT_OUTPUT" | head -10)
      if [ "$HAS_JQ" = true ]; then
        ERRORS=$(printf '%s' "$ERRORS" | jq --arg lint "$LINT_SUMMARY" '. + [{"type":"lint_error","details":$lint}]')
      fi
    fi
  fi
fi

# --- 3. Compile check ---
if [ "$DO_COMPILE" = true ]; then
  # Find nearest tsconfig
  TSCONFIG=""
  if [ -n "$CWD" ] && [ -f "$CWD/tsconfig.json" ]; then
    TSCONFIG="$CWD/tsconfig.json"
  elif [ -f "$ROOT/tsconfig.json" ]; then
    TSCONFIG="$ROOT/tsconfig.json"
  fi

  if [ -z "$TSCONFIG" ]; then
    COMPILE_CHECK="skipped_no_tsconfig"
  elif ! command -v npx >/dev/null 2>&1; then
    COMPILE_CHECK="skipped_no_npx"
  else
    COMPILE_OUTPUT=$(npx tsc --noEmit --project "$TSCONFIG" 2>&1)
    COMPILE_EXIT=$?
    if [ $COMPILE_EXIT -eq 0 ]; then
      COMPILE_CHECK="passed"
    else
      COMPILE_CHECK="failed"
      PASSED=false
      COMPILE_SUMMARY=$(printf '%s' "$COMPILE_OUTPUT" | head -10)
      if [ "$HAS_JQ" = true ]; then
        ERRORS=$(printf '%s' "$ERRORS" | jq --arg comp "$COMPILE_SUMMARY" '. + [{"type":"compile_error","details":$comp}]')
      fi
    fi
  fi
fi

# --- Output ---
if [ "$HAS_JQ" = true ]; then
  JSON=$(jq -n \
    --argjson passed "$( [ "$PASSED" = true ] && echo 'true' || echo 'false' )" \
    --arg files "$FILE_CHECK" \
    --arg lint "$LINT_CHECK" \
    --arg compile "$COMPILE_CHECK" \
    --argjson errors "$ERRORS" \
    '{passed:$passed, checks:{files:$files, lint:$lint, compile:$compile}, errors:$errors}')
else
  JSON="{\"passed\":$PASSED,\"checks\":{\"files\":\"$FILE_CHECK\",\"lint\":\"$LINT_CHECK\",\"compile\":\"$COMPILE_CHECK\"}}"
fi

if [ "$PASSED" = true ]; then
  _write_output "OK: all checks passed (files=$FILE_CHECK lint=$LINT_CHECK compile=$COMPILE_CHECK)" "$JSON"
else
  ERROR_COUNT=$(printf '%s' "$ERRORS" | jq 'length' 2>/dev/null || echo "?")
  _write_output "FAIL: $ERROR_COUNT errors (files=$FILE_CHECK lint=$LINT_CHECK compile=$COMPILE_CHECK)" "$JSON"
fi
