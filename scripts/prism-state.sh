#!/usr/bin/env bash
# prism-state.sh — Product memory manager for Prism v3
# Manages the split product memory model: product, architecture, roadmap, state, decisions.
#
# Usage:
#   prism-state.sh read    <root>                        — reads all product memory, returns JSON summary
#   prism-state.sh update  <root> <file> <section>       — updates a section (stdin: content)
#   prism-state.sh migrate <root>                        — migrates legacy PRODUCT.md into split files
#   prism-state.sh status  <root>                        — returns which files exist and their freshness
#
# Output: writes full JSON to temp file, prints one-line summary to stdout.
# Exit: 0 = completed (check JSON), non-zero = script crashed (see stderr).
set -uo pipefail

# --- Known product memory files ---
MEMORY_FILES="product.md architecture.md roadmap.md state.md decisions.md"

# --- Helpers ---
_sanitize_arg() {
  printf '%s' "$1" | tr -d '`$();|&<>!' | tr -s ' '
}

_memory_dir() {
  local root="$1"
  printf '%s/.prism/memory' "$root"
}

_tmp_output() {
  printf '/tmp/prism-state-%s.json' "$$"
}

_write_output() {
  local summary="$1"
  local json="$2"
  local out; out=$(_tmp_output)
  printf '%s' "$json" > "$out"
  printf '%s → %s\n' "$summary" "$out"
}

_file_mtime() {
  # Returns modification time as ISO-8601 string, or "unknown"
  local path="$1"
  if [ ! -f "$path" ]; then
    echo "null"
    return
  fi
  # macOS stat vs GNU stat
  if stat -f '%Sm' -t '%Y-%m-%dT%H:%M:%SZ' "$path" 2>/dev/null; then
    return
  fi
  # GNU stat fallback
  if stat -c '%y' "$path" 2>/dev/null | sed 's/ /T/' | sed 's/\.[0-9]* /Z/'; then
    return
  fi
  echo "unknown"
}

_read_file_preview() {
  # Returns first 10 non-comment, non-empty lines of a file
  local path="$1"
  [ -f "$path" ] || { echo ""; return; }
  head -30 "$path" 2>/dev/null | grep -v '^<!--' | grep -v '^$' | head -10 | tr '\n' ' ' | xargs 2>/dev/null || echo ""
}

# --- Commands ---

cmd_read() {
  local root="$1"
  local memdir; memdir=$(_memory_dir "$root")

  # Check for jq
  local has_jq=false
  command -v jq >/dev/null 2>&1 && has_jq=true

  # Determine model
  local model="none"
  local files_found=0
  for f in $MEMORY_FILES; do
    [ -f "$memdir/$f" ] && files_found=$((files_found + 1))
  done
  [ -f "$root/PRODUCT.md" ] && [ "$files_found" -eq 0 ] && model="legacy"
  [ "$files_found" -gt 0 ] && model="split"

  if [ "$model" = "none" ] && [ ! -f "$root/PRODUCT.md" ]; then
    local json='{"model":"none","files":[],"summary":null}'
    _write_output "OK: model=none no product memory found" "$json"
    return 0
  fi

  if [ "$model" = "legacy" ]; then
    local preview; preview=$(_read_file_preview "$root/PRODUCT.md")
    if [ "$has_jq" = true ]; then
      local json; json=$(jq -n \
        --arg preview "$preview" \
        '{"model":"legacy","files":["PRODUCT.md"],"summary":{"product":$preview}}')
      _write_output "OK: model=legacy PRODUCT.md found" "$json"
    else
      _write_output "OK: model=legacy PRODUCT.md found" '{"model":"legacy","files":["PRODUCT.md"]}'
    fi
    return 0
  fi

  # Split model — read each file
  if [ "$has_jq" = true ]; then
    local files_json="[]"
    local summary_obj="{}"

    for f in $MEMORY_FILES; do
      local path="$memdir/$f"
      if [ -f "$path" ]; then
        local mtime; mtime=$(_file_mtime "$path")
        local preview; preview=$(_read_file_preview "$path")
        local basename; basename=$(printf '%s' "$f" | sed 's/\.md$//')
        files_json=$(printf '%s' "$files_json" | jq \
          --arg name "$f" \
          --arg mtime "$mtime" \
          '. += [{"file":$name,"mtime":$mtime}]')
        summary_obj=$(printf '%s' "$summary_obj" | jq \
          --arg key "$basename" \
          --arg val "$preview" \
          '. + {($key): $val}')
      fi
    done

    local json; json=$(jq -n \
      --argjson files "$files_json" \
      --argjson summary "$summary_obj" \
      --argjson count "$files_found" \
      '{"model":"split","files":$files,"file_count":$count,"summary":$summary}')
    _write_output "OK: model=split files=$files_found" "$json"
  else
    _write_output "OK: model=split files=$files_found" "{\"model\":\"split\",\"file_count\":$files_found}"
  fi
}

cmd_update() {
  local root="$1"
  local target_file; target_file=$(_sanitize_arg "$2")
  local section; section=$(_sanitize_arg "$3")
  local memdir; memdir=$(_memory_dir "$root")

  # Validate target file is a known memory file
  local valid=false
  for f in $MEMORY_FILES; do
    [ "$target_file" = "$f" ] && valid=true && break
  done
  if [ "$valid" = false ]; then
    echo "ERROR: unknown file '$target_file'. Valid: $MEMORY_FILES" >&2
    return 1
  fi

  # Read new content from stdin
  local content; content=$(cat)
  if [ -z "$content" ]; then
    echo "ERROR: no content provided on stdin" >&2
    return 1
  fi

  mkdir -p "$memdir"
  local path="$memdir/$target_file"

  # If file does not exist, write full content directly
  if [ ! -f "$path" ]; then
    printf '%s\n' "$content" > "$path"
    _write_output "OK: created $target_file with section '$section'" \
      "{\"file\":\"$target_file\",\"section\":\"$section\",\"action\":\"created\"}"
    return 0
  fi

  # File exists — find the section header and replace its content
  # Section header: ## <section> (case-insensitive match)
  local escaped_section; escaped_section=$(printf '%s' "$section" | sed 's/[[\.*^$(){}?+|]/\\&/g')
  local tmp="$path.tmp.$$"

  # Use awk to replace content under the matching ## heading through the next ## heading or EOF
  awk -v section="$section" -v new_content="$content" '
    BEGIN { in_section=0; printed_new=0; found=0 }
    /^## / {
      if (in_section) {
        # We were in the target section — inject new content before this next heading
        if (!printed_new) {
          print new_content
          print ""
          printed_new=1
        }
        in_section=0
      }
      # Check if this heading matches our target
      heading = substr($0, 4)
      # Trim leading/trailing whitespace from heading
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", heading)
      if (tolower(heading) == tolower(section)) {
        in_section=1
        found=1
        print $0
        next
      }
    }
    {
      if (in_section) {
        # Skip old content while in the target section
        next
      }
      print $0
    }
    END {
      if (in_section && !printed_new) {
        print new_content
      }
      if (!found) {
        # Section not found — append it
        print ""
        print "## " section
        print ""
        print new_content
      }
    }
  ' "$path" > "$tmp" && mv "$tmp" "$path" || { rm -f "$tmp"; echo "ERROR: failed to update file" >&2; return 1; }

  _write_output "OK: updated $target_file section '$section'" \
    "{\"file\":\"$target_file\",\"section\":\"$section\",\"action\":\"updated\"}"
}

cmd_migrate() {
  local root="$1"
  local legacy="$root/PRODUCT.md"

  if [ ! -f "$legacy" ]; then
    echo "ERROR: no PRODUCT.md found at $root" >&2
    return 1
  fi

  local memdir; memdir=$(_memory_dir "$root")
  mkdir -p "$memdir"

  local has_jq=false
  command -v jq >/dev/null 2>&1 && has_jq=true

  # Check if split files already exist — don't overwrite
  local existing=0
  for f in $MEMORY_FILES; do
    [ -f "$memdir/$f" ] && existing=$((existing + 1))
  done

  if [ "$existing" -gt 0 ]; then
    echo "WARN: $existing split file(s) already exist — skipping overwrite" >&2
  fi

  local created=0
  local skipped=0

  # Read the legacy file content
  local legacy_content; legacy_content=$(cat "$legacy")

  # product.md — map Vision, Problem, Users, Success Criteria from PRODUCT.md
  if [ ! -f "$memdir/product.md" ]; then
    # Extract product name from first # heading
    local product_name; product_name=$(printf '%s' "$legacy_content" | grep '^# ' | head -1 | sed 's/^# //' || echo "")

    # Write product.md with legacy content preserved under a Legacy Content section
    {
      printf '# Product\n\n'
      [ -n "$product_name" ] && printf '**Name:** %s\n\n' "$product_name"
      printf '<!-- Migrated from PRODUCT.md -->\n\n'
      printf '%s\n' "$legacy_content"
    } > "$memdir/product.md"
    created=$((created + 1))
  else
    skipped=$((skipped + 1))
  fi

  # architecture.md — copy from template if not exists
  if [ ! -f "$memdir/architecture.md" ]; then
    local tmpl_dir; tmpl_dir=$(cd "$(dirname "$0")/../templates" 2>/dev/null && pwd || echo "")
    if [ -n "$tmpl_dir" ] && [ -f "$tmpl_dir/architecture.md" ]; then
      cp "$tmpl_dir/architecture.md" "$memdir/architecture.md"
    else
      printf '# Architecture\n\n<!-- Migrated from PRODUCT.md. Fill in details. -->\n' > "$memdir/architecture.md"
    fi
    created=$((created + 1))
  else
    skipped=$((skipped + 1))
  fi

  # roadmap.md — copy from template if not exists
  if [ ! -f "$memdir/roadmap.md" ]; then
    local tmpl_dir; tmpl_dir=$(cd "$(dirname "$0")/../templates" 2>/dev/null && pwd || echo "")
    if [ -n "$tmpl_dir" ] && [ -f "$tmpl_dir/roadmap.md" ]; then
      cp "$tmpl_dir/roadmap.md" "$memdir/roadmap.md"
    else
      printf '# Roadmap\n\n<!-- Migrated from PRODUCT.md. Fill in phases. -->\n' > "$memdir/roadmap.md"
    fi
    created=$((created + 1))
  else
    skipped=$((skipped + 1))
  fi

  # state.md — copy from template if not exists
  if [ ! -f "$memdir/state.md" ]; then
    local tmpl_dir; tmpl_dir=$(cd "$(dirname "$0")/../templates" 2>/dev/null && pwd || echo "")
    if [ -n "$tmpl_dir" ] && [ -f "$tmpl_dir/state.md" ]; then
      cp "$tmpl_dir/state.md" "$memdir/state.md"
    else
      printf '# State\n\n<!-- Migrated from PRODUCT.md. Update current state. -->\n' > "$memdir/state.md"
    fi
    created=$((created + 1))
  else
    skipped=$((skipped + 1))
  fi

  # decisions.md — copy from template if not exists
  if [ ! -f "$memdir/decisions.md" ]; then
    local tmpl_dir; tmpl_dir=$(cd "$(dirname "$0")/../templates" 2>/dev/null && pwd || echo "")
    if [ -n "$tmpl_dir" ] && [ -f "$tmpl_dir/decisions.md" ]; then
      cp "$tmpl_dir/decisions.md" "$memdir/decisions.md"
    else
      printf '# Decisions\n\n<!-- Migrated from PRODUCT.md. Fill in key decisions. -->\n' > "$memdir/decisions.md"
    fi
    created=$((created + 1))
  else
    skipped=$((skipped + 1))
  fi

  if [ "$has_jq" = true ]; then
    local json; json=$(jq -n \
      --argjson created "$created" \
      --argjson skipped "$skipped" \
      --arg source "$legacy" \
      --arg memdir "$memdir" \
      '{"action":"migrate","source":$source,"dest":$memdir,"created":$created,"skipped":$skipped}')
    _write_output "OK: migrated PRODUCT.md → split files (created=$created skipped=$skipped)" "$json"
  else
    _write_output "OK: migrated PRODUCT.md → split files (created=$created skipped=$skipped)" \
      "{\"action\":\"migrate\",\"created\":$created,\"skipped\":$skipped}"
  fi
}

cmd_status() {
  local root="$1"
  local memdir; memdir=$(_memory_dir "$root")

  local has_jq=false
  command -v jq >/dev/null 2>&1 && has_jq=true

  local model="none"
  local files_json="[]"
  local exists_count=0
  local missing_count=0

  # Check split files
  for f in $MEMORY_FILES; do
    local path="$memdir/$f"
    if [ -f "$path" ]; then
      exists_count=$((exists_count + 1))
      if [ "$has_jq" = true ]; then
        local mtime; mtime=$(_file_mtime "$path")
        local size; size=$(wc -c < "$path" | tr -d ' ')
        files_json=$(printf '%s' "$files_json" | jq \
          --arg name "$f" \
          --arg mtime "$mtime" \
          --argjson size "$size" \
          '. += [{"file":$name,"exists":true,"mtime":$mtime,"bytes":$size}]')
      fi
    else
      missing_count=$((missing_count + 1))
      if [ "$has_jq" = true ]; then
        files_json=$(printf '%s' "$files_json" | jq \
          --arg name "$f" \
          '. += [{"file":$name,"exists":false,"mtime":null,"bytes":0}]')
      fi
    fi
  done

  [ "$exists_count" -gt 0 ] && model="split"

  # Check legacy fallback
  local has_legacy=false
  [ -f "$root/PRODUCT.md" ] && has_legacy=true
  [ "$model" = "none" ] && [ "$has_legacy" = true ] && model="legacy"

  if [ "$has_jq" = true ]; then
    local json; json=$(jq -n \
      --arg model "$model" \
      --argjson files "$files_json" \
      --argjson exists "$exists_count" \
      --argjson missing "$missing_count" \
      --argjson has_legacy "$( [ "$has_legacy" = true ] && echo 'true' || echo 'false' )" \
      '{"model":$model,"files":$files,"exists_count":$exists,"missing_count":$missing,"has_legacy_product_md":$has_legacy}')
    _write_output "OK: model=$model exists=$exists_count missing=$missing_count" "$json"
  else
    _write_output "OK: model=$model exists=$exists_count missing=$missing_count" \
      "{\"model\":\"$model\",\"exists_count\":$exists_count,\"missing_count\":$missing_count}"
  fi
}

# --- Main dispatch ---
CMD="${1:-}"
ROOT="${2:-}"

if [ -z "$CMD" ] || [ -z "$ROOT" ]; then
  echo "Usage: prism-state.sh <command> <root> [args...]" >&2
  echo "Commands: read, update, migrate, status" >&2
  exit 1
fi

# Validate root is a real directory
if [ ! -d "$ROOT" ]; then
  echo "ERROR: root directory does not exist: $ROOT" >&2
  exit 1
fi

case "$CMD" in
  read)
    cmd_read "$ROOT"
    ;;
  update)
    FILE="${3:-}"
    SECTION="${4:-}"
    [ -z "$FILE" ] && { echo "ERROR: file argument required" >&2; exit 1; }
    [ -z "$SECTION" ] && { echo "ERROR: section argument required" >&2; exit 1; }
    cmd_update "$ROOT" "$FILE" "$SECTION"
    ;;
  migrate)
    cmd_migrate "$ROOT"
    ;;
  status)
    cmd_status "$ROOT"
    ;;
  *)
    echo "ERROR: unknown command: $CMD" >&2
    echo "Commands: read, update, migrate, status" >&2
    exit 1
    ;;
esac
