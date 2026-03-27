#!/usr/bin/env bash
# prism-compile.sh — Skill/Adapter Compiler for Prism
# Converts canonical YAML skill sources into Claude SKILL.md or Codex AGENTS.md bundles.
#
# Usage:
#   prism-compile.sh claude    <skill.yaml>  — compile to Claude SKILL.md
#   prism-compile.sh codex     <skill.yaml>  — compile to Codex AGENTS.md
#   prism-compile.sh validate  <skill.yaml>  — validate against schema
#   prism-compile.sh all       <dir>         — compile all .yaml skills in directory
#
# Output: compiler/output/claude/{name}/SKILL.md or compiler/output/codex/{name}/AGENTS.md
# Exit: 0 = success, 1 = failure
set -uo pipefail

# --- Locate compiler root ---
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
COMPILER_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA_PATH="$COMPILER_DIR/skill-schema.json"
OUTPUT_DIR="$COMPILER_DIR/output"

# --- Dependency checks ---
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Run: brew install jq" >&2
  exit 1
fi

# --- YAML parser detection ---
# Prefer yq; fall back to Python 3 with PyYAML
_yaml_available=false
_yaml_tool=""

if command -v yq >/dev/null 2>&1; then
  _yaml_available=true
  _yaml_tool="yq"
elif python3 -c "import yaml" 2>/dev/null; then
  _yaml_available=true
  _yaml_tool="python3"
fi

if [ "$_yaml_available" = false ]; then
  echo "ERROR: YAML parser not available. Install yq (brew install yq) or PyYAML (pip3 install pyyaml)." >&2
  exit 1
fi

# --- Helpers ---

_sanitize_arg() {
  printf '%s' "$1" | tr -d '`$();|&<>!' | tr -s ' '
}

# Parse a YAML field using available tool. Returns value on stdout.
# Usage: _yaml_get <file> <key_path>
# key_path uses dot notation: name, inputs.0.type, etc.
_yaml_get() {
  local file="$1"
  local key="$2"

  if [ "$_yaml_tool" = "yq" ]; then
    yq e ".$key" "$file" 2>/dev/null
  else
    # Python fallback: handle simple dot-notation paths
    python3 - "$file" "$key" <<'PYEOF' 2>/dev/null || echo "null"
import yaml, sys
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
keys = sys.argv[2].split('.')
val = data
for k in keys:
    if isinstance(val, list):
        val = val[int(k)]
    elif isinstance(val, dict):
        val = val.get(k)
    else:
        val = None
    if val is None:
        break
if val is None:
    print('null')
elif isinstance(val, bool):
    print(str(val).lower())
elif isinstance(val, list):
    for item in val:
        print(item)
else:
    print(val)
PYEOF
  fi
}

# Convert entire YAML file to JSON
_yaml_to_json() {
  local file="$1"
  if [ "$_yaml_tool" = "yq" ]; then
    yq e -o=json "$file" 2>/dev/null
  else
    python3 - "$file" <<'PYEOF' 2>/dev/null
import yaml, json, sys
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
print(json.dumps(data))
PYEOF
  fi
}

_write_output() {
  local summary="$1"
  local path="$2"
  printf '%s → %s\n' "$summary" "$path"
}

_err() {
  echo "ERROR: $*" >&2
}

# --- Validation ---

cmd_validate() {
  local skill_file="$1"
  local issues=()
  local pass=true

  # File existence
  if [ ! -f "$skill_file" ]; then
    echo "FAIL: file not found: $skill_file"
    return 1
  fi

  # Parse to JSON
  local json
  json=$(_yaml_to_json "$skill_file")
  if [ -z "$json" ] || [ "$json" = "null" ]; then
    echo "FAIL: could not parse YAML file: $skill_file"
    return 1
  fi

  # --- Required field checks ---
  local required_fields=("name" "display_name" "version" "description" "trigger_patterns" "purpose")
  for field in "${required_fields[@]}"; do
    local val
    val=$(printf '%s' "$json" | jq -r ".$field // empty" 2>/dev/null)
    if [ -z "$val" ]; then
      issues+=("missing required field: $field")
      pass=false
    fi
  done

  # --- name format (kebab-case) ---
  local name
  name=$(printf '%s' "$json" | jq -r '.name // ""')
  if [ -n "$name" ] && ! printf '%s' "$name" | grep -qE '^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$'; then
    issues+=("name must be kebab-case: '$name'")
    pass=false
  fi

  # --- version semver ---
  local version
  version=$(printf '%s' "$json" | jq -r '.version // ""')
  if [ -n "$version" ] && ! printf '%s' "$version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
    issues+=("version must be semver (e.g. 1.0.0): '$version'")
    pass=false
  fi

  # --- trigger_patterns: must be non-empty array, each a valid regex ---
  # Note: grep -E returns exit 1 for no match, exit 2 for invalid regex.
  # We test validity by running grep and checking for exit code 2 specifically.
  local pattern_count
  pattern_count=$(printf '%s' "$json" | jq '.trigger_patterns | length // 0' 2>/dev/null || echo 0)
  if [ "$pattern_count" -eq 0 ]; then
    issues+=("trigger_patterns must have at least 1 entry")
    pass=false
  else
    local i=0
    while [ $i -lt "$pattern_count" ]; do
      local pat
      pat=$(printf '%s' "$json" | jq -r ".trigger_patterns[$i]" 2>/dev/null)
      # Run grep; exit 2 means invalid regex, exit 0/1 means valid (match/no-match)
      printf 'test' | grep -E "$pat" >/dev/null 2>&1
      local grep_exit=$?
      if [ "$grep_exit" -eq 2 ]; then
        issues+=("trigger_patterns[$i] is not a valid regex: '$pat'")
        pass=false
      fi
      i=$((i + 1))
    done
  fi

  # --- references: check referenced files exist ---
  local ref_count
  ref_count=$(printf '%s' "$json" | jq '.references | length // 0' 2>/dev/null || echo 0)
  if [ "$ref_count" -gt 0 ]; then
    local skill_dir
    skill_dir="$(cd "$(dirname "$skill_file")" && pwd)"
    local i=0
    while [ $i -lt "$ref_count" ]; do
      local ref_path ref_name
      ref_path=$(printf '%s' "$json" | jq -r ".references[$i].path" 2>/dev/null)
      ref_name=$(printf '%s' "$json" | jq -r ".references[$i].name" 2>/dev/null)
      if [ "$ref_path" != "null" ] && [ -n "$ref_path" ]; then
        local abs_path
        abs_path="$skill_dir/$ref_path"
        if [ ! -f "$abs_path" ] && [ ! -d "$abs_path" ]; then
          issues+=("reference '$ref_name' path not found: $ref_path")
          pass=false
        fi
      fi
      i=$((i + 1))
    done
  fi

  # --- inputs: check type enum ---
  local input_count
  input_count=$(printf '%s' "$json" | jq '.inputs | length // 0' 2>/dev/null || echo 0)
  if [ "$input_count" -gt 0 ]; then
    local valid_types="string number boolean object array filepath"
    local i=0
    while [ $i -lt "$input_count" ]; do
      local itype iname
      itype=$(printf '%s' "$json" | jq -r ".inputs[$i].type // empty" 2>/dev/null)
      iname=$(printf '%s' "$json" | jq -r ".inputs[$i].name // \"inputs[$i]\"" 2>/dev/null)
      if [ -n "$itype" ] && ! printf '%s' "$valid_types" | grep -qw "$itype"; then
        issues+=("input '$iname' has invalid type: '$itype' (allowed: $valid_types)")
        pass=false
      fi
      i=$((i + 1))
    done
  fi

  # --- Report ---
  if [ "$pass" = true ]; then
    echo "PASS: $skill_file"
    return 0
  else
    echo "FAIL: $skill_file"
    for issue in "${issues[@]}"; do
      echo "  - $issue"
    done
    return 1
  fi
}

# --- Claude compiler ---

cmd_claude() {
  local skill_file="$1"

  # Validate first
  local val_out
  val_out=$(cmd_validate "$skill_file" 2>&1)
  if printf '%s' "$val_out" | grep -q "^FAIL"; then
    echo "ERROR: skill validation failed — fix issues before compiling." >&2
    printf '%s\n' "$val_out" >&2
    return 1
  fi

  local json
  json=$(_yaml_to_json "$skill_file")

  local name display_name version description purpose
  name=$(printf '%s' "$json" | jq -r '.name')
  display_name=$(printf '%s' "$json" | jq -r '.display_name')
  version=$(printf '%s' "$json" | jq -r '.version')
  description=$(printf '%s' "$json" | jq -r '.description')
  purpose=$(printf '%s' "$json" | jq -r '.purpose')

  # Output path
  local out_dir="$OUTPUT_DIR/claude/$name"
  mkdir -p "$out_dir"
  local out_file="$out_dir/SKILL.md"

  # --- Build trigger pattern string for description ---
  local trigger_list
  trigger_list=$(printf '%s' "$json" | jq -r '.trigger_patterns[]' 2>/dev/null | sed 's/^/  - /' | tr '\n' '\n')

  # --- Build allowed-tools frontmatter ---
  local allowed_tools_count
  allowed_tools_count=$(printf '%s' "$json" | jq '.tool_restrictions.allowed | length // 0' 2>/dev/null || echo 0)

  local tools_yaml=""
  if [ "$allowed_tools_count" -gt 0 ]; then
    tools_yaml="allowed-tools:"$'\n'
    while IFS= read -r tool; do
      tools_yaml+="  - $tool"$'\n'
    done < <(printf '%s' "$json" | jq -r '.tool_restrictions.allowed[]' 2>/dev/null)
  fi

  # --- Write SKILL.md ---
  {
    echo "---"
    echo "name: $name"
    echo "description: |"
    # Indent description for YAML block scalar
    printf '%s' "$description" | sed 's/^/  /'
    echo ""
    echo "  Activates on patterns:"
    printf '%s' "$json" | jq -r '.trigger_patterns[]' 2>/dev/null | sed 's/^/  - /'
    if [ -n "$tools_yaml" ]; then
      printf '%s' "$tools_yaml"
    fi
    echo "---"
    echo ""
    printf '# %s\n' "$display_name"
    echo ""
    echo "**Version:** $version"
    echo ""
    echo "## Purpose"
    echo ""
    printf '%s\n' "$purpose"
    echo ""

    # --- Inputs ---
    local input_count
    input_count=$(printf '%s' "$json" | jq '.inputs | length // 0' 2>/dev/null || echo 0)
    if [ "$input_count" -gt 0 ]; then
      echo "## Inputs"
      echo ""
      echo "| Name | Type | Required | Description |"
      echo "|------|------|----------|-------------|"
      local i=0
      while [ $i -lt "$input_count" ]; do
        local iname itype ireq idesc
        iname=$(printf '%s' "$json" | jq -r ".inputs[$i].name")
        itype=$(printf '%s' "$json" | jq -r ".inputs[$i].type")
        ireq=$(printf '%s' "$json" | jq -r ".inputs[$i].required")
        idesc=$(printf '%s' "$json" | jq -r ".inputs[$i].description" | tr '\n' ' ' | sed 's/  */ /g')
        local req_label="optional"
        [ "$ireq" = "true" ] && req_label="required"
        echo "| \`$iname\` | $itype | $req_label | $idesc |"
        i=$((i + 1))
      done
      echo ""
    fi

    # --- Outputs ---
    local output_count
    output_count=$(printf '%s' "$json" | jq '.outputs | length // 0' 2>/dev/null || echo 0)
    if [ "$output_count" -gt 0 ]; then
      echo "## Outputs"
      echo ""
      echo "| Name | Type | Description |"
      echo "|------|------|-------------|"
      local i=0
      while [ $i -lt "$output_count" ]; do
        local oname otype odesc
        oname=$(printf '%s' "$json" | jq -r ".outputs[$i].name")
        otype=$(printf '%s' "$json" | jq -r ".outputs[$i].type")
        odesc=$(printf '%s' "$json" | jq -r ".outputs[$i].description" | tr '\n' ' ' | sed 's/  */ /g')
        echo "| \`$oname\` | $otype | $odesc |"
        i=$((i + 1))
      done
      echo ""
    fi

    # --- Stages ---
    local stage_count
    stage_count=$(printf '%s' "$json" | jq '.stages | length // 0' 2>/dev/null || echo 0)
    if [ "$stage_count" -gt 0 ]; then
      echo "## Stages"
      echo ""
      local i=0
      while [ $i -lt "$stage_count" ]; do
        local sname sdesc sauto
        sname=$(printf '%s' "$json" | jq -r ".stages[$i].name")
        sdesc=$(printf '%s' "$json" | jq -r ".stages[$i].description" | tr '\n' ' ' | sed 's/  */ /g')
        sauto=$(printf '%s' "$json" | jq -r ".stages[$i].auto_advance // false")
        local display_n=$((i + 1))
        printf '### Stage %d: %s\n' "$display_n" "$(printf '%s' "$sname" | sed 's/_/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2); print}')"
        echo ""
        printf '%s\n' "$sdesc"
        [ "$sauto" = "true" ] && echo "" && echo "_Auto-advances on success._"
        echo ""
        i=$((i + 1))
      done
    fi

    # --- Scripts ---
    local script_count
    script_count=$(printf '%s' "$json" | jq '.scripts | length // 0' 2>/dev/null || echo 0)
    if [ "$script_count" -gt 0 ]; then
      echo "## Scripts"
      echo ""
      echo "| Script | Path | When |"
      echo "|--------|------|------|"
      local i=0
      while [ $i -lt "$script_count" ]; do
        local sname spath swhen
        sname=$(printf '%s' "$json" | jq -r ".scripts[$i].name")
        spath=$(printf '%s' "$json" | jq -r ".scripts[$i].path")
        swhen=$(printf '%s' "$json" | jq -r ".scripts[$i].when")
        echo "| $sname | \`$spath\` | $swhen |"
        i=$((i + 1))
      done
      echo ""
    fi

    # --- References ---
    local ref_count
    ref_count=$(printf '%s' "$json" | jq '.references | length // 0' 2>/dev/null || echo 0)
    if [ "$ref_count" -gt 0 ]; then
      echo "## References"
      echo ""
      local skill_dir
      skill_dir="$(cd "$(dirname "$skill_file")" && pwd)"
      local i=0
      while [ $i -lt "$ref_count" ]; do
        local rname rpath rembed
        rname=$(printf '%s' "$json" | jq -r ".references[$i].name")
        rpath=$(printf '%s' "$json" | jq -r ".references[$i].path")
        rembed=$(printf '%s' "$json" | jq -r ".references[$i].embed")
        if [ "$rembed" = "true" ]; then
          local abs_ref="$skill_dir/$rpath"
          if [ -f "$abs_ref" ]; then
            printf '### %s\n\n' "$rname"
            cat "$abs_ref"
            echo ""
          else
            printf '### %s\n\n_File not found: %s_\n\n' "$rname" "$rpath"
          fi
        else
          echo "- [$rname]($rpath)"
        fi
        i=$((i + 1))
      done
      echo ""
    fi

    # --- Rules ---
    local rule_count
    rule_count=$(printf '%s' "$json" | jq '.rules | length // 0' 2>/dev/null || echo 0)
    if [ "$rule_count" -gt 0 ]; then
      echo "## Rules"
      echo ""
      local i=0
      while [ $i -lt "$rule_count" ]; do
        local rule
        rule=$(printf '%s' "$json" | jq -r ".rules[$i]")
        printf '%d. %s\n' "$((i + 1))" "$rule"
        i=$((i + 1))
      done
      echo ""
    fi

    # --- Examples ---
    local ex_count
    ex_count=$(printf '%s' "$json" | jq '.examples | length // 0' 2>/dev/null || echo 0)
    if [ "$ex_count" -gt 0 ]; then
      echo "## Examples"
      echo ""
      local i=0
      while [ $i -lt "$ex_count" ]; do
        local einput ebehavior
        einput=$(printf '%s' "$json" | jq -r ".examples[$i].input")
        ebehavior=$(printf '%s' "$json" | jq -r ".examples[$i].expected_behavior" | tr '\n' ' ' | sed 's/  */ /g')
        printf '**Input:** `%s`\n' "$einput"
        printf '**Expected:** %s\n\n' "$ebehavior"
        i=$((i + 1))
      done
    fi

    # --- Eval cases ---
    local eval_count
    eval_count=$(printf '%s' "$json" | jq '.eval_cases | length // 0' 2>/dev/null || echo 0)
    if [ "$eval_count" -gt 0 ]; then
      echo "## Eval Cases"
      echo ""
      local i=0
      while [ $i -lt "$eval_count" ]; do
        local ename einput
        ename=$(printf '%s' "$json" | jq -r ".eval_cases[$i].name")
        einput=$(printf '%s' "$json" | jq -r ".eval_cases[$i].input")
        printf '### %s\n\n' "$ename"
        printf '**Input:** `%s`\n\n' "$einput"

        local contains_count
        contains_count=$(printf '%s' "$json" | jq ".eval_cases[$i].expected_output_contains | length // 0" 2>/dev/null || echo 0)
        if [ "$contains_count" -gt 0 ]; then
          echo "**Must contain:**"
          printf '%s' "$json" | jq -r ".eval_cases[$i].expected_output_contains[]" 2>/dev/null | sed 's/^/- `/' | sed 's/$/`/'
          echo ""
        fi

        local excludes_count
        excludes_count=$(printf '%s' "$json" | jq ".eval_cases[$i].expected_output_excludes | length // 0" 2>/dev/null || echo 0)
        if [ "$excludes_count" -gt 0 ]; then
          echo "**Must not contain:**"
          printf '%s' "$json" | jq -r ".eval_cases[$i].expected_output_excludes[]" 2>/dev/null | sed 's/^/- `/' | sed 's/$/`/'
          echo ""
        fi
        i=$((i + 1))
      done
    fi

    # --- Footer ---
    echo "---"
    printf '_Compiled by prism-compile.sh from %s_\n' "$(basename "$skill_file")"

  } > "$out_file"

  _write_output "OK: compiled claude/$name" "$out_file"
}

# --- Codex compiler ---

cmd_codex() {
  local skill_file="$1"

  # Validate first
  local val_out
  val_out=$(cmd_validate "$skill_file" 2>&1)
  if printf '%s' "$val_out" | grep -q "^FAIL"; then
    echo "ERROR: skill validation failed — fix issues before compiling." >&2
    printf '%s\n' "$val_out" >&2
    return 1
  fi

  local json
  json=$(_yaml_to_json "$skill_file")

  local name display_name version description purpose
  name=$(printf '%s' "$json" | jq -r '.name')
  display_name=$(printf '%s' "$json" | jq -r '.display_name')
  version=$(printf '%s' "$json" | jq -r '.version')
  description=$(printf '%s' "$json" | jq -r '.description')
  purpose=$(printf '%s' "$json" | jq -r '.purpose')

  # Output path
  local out_dir="$OUTPUT_DIR/codex/$name"
  mkdir -p "$out_dir"
  local out_file="$out_dir/AGENTS.md"

  {
    printf '# %s\n\n' "$display_name"
    printf '> Version: %s\n\n' "$version"

    # Description + trigger patterns (Codex reads this as agent description)
    echo "## Description"
    echo ""
    printf '%s\n\n' "$description"
    echo "**Activates when user input matches:**"
    printf '%s' "$json" | jq -r '.trigger_patterns[]' 2>/dev/null | sed 's/^/- `/' | sed 's/$/`/'
    echo ""

    echo "## Purpose"
    echo ""
    printf '%s\n\n' "$purpose"

    # --- Tool restrictions → Codex sandbox mode ---
    local denied_count allowed_count
    denied_count=$(printf '%s' "$json" | jq '.tool_restrictions.denied | length // 0' 2>/dev/null || echo 0)
    allowed_count=$(printf '%s' "$json" | jq '.tool_restrictions.allowed | length // 0' 2>/dev/null || echo 0)

    echo "## Sandbox"
    echo ""
    if [ "$denied_count" -gt 0 ]; then
      echo "**Denied tools (never call these):**"
      printf '%s' "$json" | jq -r '.tool_restrictions.denied[]' 2>/dev/null | sed 's/^/- /'
      echo ""
    fi
    if [ "$allowed_count" -gt 0 ]; then
      echo "**Allowed tools:**"
      printf '%s' "$json" | jq -r '.tool_restrictions.allowed[]' 2>/dev/null | sed 's/^/- /'
      echo ""
    else
      echo "All standard Codex tools are available unless denied above."
      echo ""
    fi

    # --- Inputs (simplified for Codex) ---
    local input_count
    input_count=$(printf '%s' "$json" | jq '.inputs | length // 0' 2>/dev/null || echo 0)
    if [ "$input_count" -gt 0 ]; then
      echo "## Expected Inputs"
      echo ""
      local i=0
      while [ $i -lt "$input_count" ]; do
        local iname itype ireq idesc
        iname=$(printf '%s' "$json" | jq -r ".inputs[$i].name")
        itype=$(printf '%s' "$json" | jq -r ".inputs[$i].type")
        ireq=$(printf '%s' "$json" | jq -r ".inputs[$i].required")
        idesc=$(printf '%s' "$json" | jq -r ".inputs[$i].description" | tr '\n' ' ' | sed 's/  */ /g')
        local req_label="optional"
        [ "$ireq" = "true" ] && req_label="**required**"
        echo "- \`$iname\` ($itype, $req_label): $idesc"
        i=$((i + 1))
      done
      echo ""
    fi

    # --- Steps (from stages, flattened for Codex instruction style) ---
    local stage_count
    stage_count=$(printf '%s' "$json" | jq '.stages | length // 0' 2>/dev/null || echo 0)
    if [ "$stage_count" -gt 0 ]; then
      echo "## Steps"
      echo ""
      local i=0
      while [ $i -lt "$stage_count" ]; do
        local sname sdesc
        sname=$(printf '%s' "$json" | jq -r ".stages[$i].name")
        sdesc=$(printf '%s' "$json" | jq -r ".stages[$i].description" | tr '\n' ' ' | sed 's/  */ /g')
        printf '%d. **%s:** %s\n' "$((i + 1))" "$(printf '%s' "$sname" | tr '_' ' ')" "$sdesc"
        i=$((i + 1))
      done
      echo ""
    fi

    # --- Rules → Instructions (Codex treats these as hard constraints) ---
    local rule_count
    rule_count=$(printf '%s' "$json" | jq '.rules | length // 0' 2>/dev/null || echo 0)
    if [ "$rule_count" -gt 0 ]; then
      echo "## Instructions"
      echo ""
      echo "Follow these rules strictly:"
      echo ""
      local i=0
      while [ $i -lt "$rule_count" ]; do
        local rule
        rule=$(printf '%s' "$json" | jq -r ".rules[$i]")
        echo "- $rule"
        i=$((i + 1))
      done
      echo ""
    fi

    # --- Outputs ---
    local output_count
    output_count=$(printf '%s' "$json" | jq '.outputs | length // 0' 2>/dev/null || echo 0)
    if [ "$output_count" -gt 0 ]; then
      echo "## Outputs"
      echo ""
      local i=0
      while [ $i -lt "$output_count" ]; do
        local oname otype odesc
        oname=$(printf '%s' "$json" | jq -r ".outputs[$i].name")
        otype=$(printf '%s' "$json" | jq -r ".outputs[$i].type")
        odesc=$(printf '%s' "$json" | jq -r ".outputs[$i].description" | tr '\n' ' ' | sed 's/  */ /g')
        echo "- \`$oname\` ($otype): $odesc"
        i=$((i + 1))
      done
      echo ""
    fi

    # --- Examples ---
    local ex_count
    ex_count=$(printf '%s' "$json" | jq '.examples | length // 0' 2>/dev/null || echo 0)
    if [ "$ex_count" -gt 0 ]; then
      echo "## Examples"
      echo ""
      local i=0
      while [ $i -lt "$ex_count" ]; do
        local einput ebehavior
        einput=$(printf '%s' "$json" | jq -r ".examples[$i].input")
        ebehavior=$(printf '%s' "$json" | jq -r ".examples[$i].expected_behavior" | tr '\n' ' ' | sed 's/  */ /g')
        printf '**Input:** %s\n' "$einput"
        printf '**Expected:** %s\n\n' "$ebehavior"
        i=$((i + 1))
      done
    fi

    # --- Footer ---
    echo "---"
    printf '_Compiled by prism-compile.sh from %s_\n' "$(basename "$skill_file")"

  } > "$out_file"

  _write_output "OK: compiled codex/$name" "$out_file"
}

# --- Compile all ---

cmd_all() {
  local dir="$1"

  if [ ! -d "$dir" ]; then
    _err "directory not found: $dir"
    return 1
  fi

  local count=0
  local failed=0

  while IFS= read -r -d '' skill_file; do
    echo "--- $(basename "$skill_file") ---"

    local claude_out codex_out
    claude_out=$(cmd_claude "$skill_file" 2>&1)
    local claude_exit=$?

    codex_out=$(cmd_codex "$skill_file" 2>&1)
    local codex_exit=$?

    printf '%s\n' "$claude_out"
    printf '%s\n' "$codex_out"

    count=$((count + 1))
    [ $claude_exit -ne 0 ] || [ $codex_exit -ne 0 ] && failed=$((failed + 1))
  done < <(find "$dir" -maxdepth 1 -name '*.yaml' -print0 2>/dev/null)

  if [ "$count" -eq 0 ]; then
    _err "no .yaml files found in: $dir"
    return 1
  fi

  local ok=$((count - failed))
  if [ "$failed" -gt 0 ]; then
    printf 'DONE: %d/%d compiled (%d failed)\n' "$ok" "$count" "$failed"
    return 1
  else
    printf 'DONE: %d/%d compiled\n' "$ok" "$count"
    return 0
  fi
}

# --- Main dispatch ---
CMD="${1:-}"
ARG="${2:-}"

if [ -z "$CMD" ] || [ -z "$ARG" ]; then
  cat >&2 <<'EOF'
Usage: prism-compile.sh <command> <arg>

Commands:
  claude    <skill.yaml>  — compile to Claude SKILL.md
  codex     <skill.yaml>  — compile to Codex AGENTS.md
  validate  <skill.yaml>  — validate against schema
  all       <dir>         — compile all skills in directory (both targets)
EOF
  exit 1
fi

case "$CMD" in
  validate)
    cmd_validate "$ARG"
    ;;
  claude)
    cmd_claude "$ARG"
    ;;
  codex)
    cmd_codex "$ARG"
    ;;
  all)
    cmd_all "$ARG"
    ;;
  *)
    _err "unknown command: $CMD"
    echo "Commands: validate, claude, codex, all" >&2
    exit 1
    ;;
esac
