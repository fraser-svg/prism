# Prism v3 Architecture

## 1. System Overview

Prism is an AI concierge that helps non-engineers build software. It accepts natural-language intent ("build me X"), generates a structured spec via OpenSpec, decomposes work into isolated worker tasks, builds code, verifies it, and guides the user through shipping. The system is split into a Brain (SKILL.md, ~360 lines of LLM instructions) and a Body (five bash scripts, ~1,100 lines of deterministic bookkeeping). The LLM handles judgment; scripts handle state. The user never sees engineering terminology, raw specs, or shell output.


## 2. Layers

### Brain: SKILL.md

The Brain is the Claude skill definition. It contains:

- Stage lifecycle logic (when to advance, regress, skip)
- Subagent dispatch rules (context firewall, prompt templates, Guardian pattern)
- Display routing (how internal stage numbers map to user-facing counters)
- Progressive disclosure rules (what the user sees vs what exists on disk)
- Recovery paths (user can always go backwards)
- Key vault command dispatch

SKILL.md is hand-maintained. It is not generated and has no automated compatibility testing. It is loaded by Claude Code on every invocation via the skill system.

### Body: Scripts

Five bash scripts handle all deterministic operations. Each script:

- Accepts positional arguments and (in some cases) stdin JSON
- Writes full structured JSON to a temp file (`/tmp/prism-{script}-{PID}.json`)
- Prints a one-line summary to stdout in the format `{summary} → {temp_file_path}`
- Returns exit 0 on completion (including logical errors captured in JSON) and non-zero only on script crashes
- Requires `jq` for full operation but degrades to string-based JSON when `jq` is absent

The calling pattern from SKILL.md is always:
```bash
bash "$SKILL_DIR/scripts/{script}.sh" {args}
```


## 3. Stage Lifecycle

### Stage Display Routes

After Stage 0 completes, Prism determines the display route. The route is a snapshot: determined once per session, never recomputed (with one exception noted below).

**Route A: Non-UI product (total = 5)**

| Internal Stage | Display Number | Label |
|----------------|----------------|-------|
| 0 | (none) | Starting up... |
| 1 | 1 | Understand |
| 2 | 2 | Plan |
| 3 | 3 | Build |
| 4 | 4 | Verify |
| 5 | 5 | Ship |

**Route B: UI product with existing DESIGN.md (total = 6)**

| Internal Stage | Display Number | Label |
|----------------|----------------|-------|
| 0 | (none) | Starting up... |
| 1 | 1 | Understand |
| 2 | 2 | Plan |
| 3 | 3 | Build |
| 4 | 4 | Verify |
| 4.5 | 5 | Design Review |
| 5 | 6 | Ship |

**Route C: UI product without DESIGN.md (total = 7)**

| Internal Stage | Display Number | Label |
|----------------|----------------|-------|
| 0 | (none) | Starting up... |
| 1 | 1 | Understand |
| 2 | 2 | Plan |
| 2.5 | 3 | Design |
| 3 | 4 | Build |
| 4 | 5 | Verify |
| 4.5 | 6 | Design Review |
| 5 | 7 | Ship |

**Route determination logic:**
- NOT a UI product: Route A
- UI product AND DESIGN.md exists: Route B
- UI product AND no DESIGN.md: Route C

**Exception:** New projects start on Route A (product type unknown). After Stage 1 Part 0 determines the product type, the route is updated if needed. This is the only time recomputation occurs.

**Skipped stages:** The total stays fixed. The counter jumps forward (e.g., "Stage 2 of 7" to "Stage 4 of 7").

**Stage regressions:** When Prism sends the user back (e.g., QA fails, return to Build), the regressed display number is shown with an explanatory message.

### Stages

#### Stage 0: Resume

**Entry condition:** Every Prism invocation.

**Actions:**
1. Run `prism-scan.sh` to detect project state
2. Route based on scan `status` field
3. Determine display route (A/B/C) from product type, or read from checkpoint on resume
4. Initialise registry only if resuming an existing change

**Scan status routing:**

| Status | Meaning | Action |
|--------|---------|--------|
| `PRODUCT_RESUME` | PRODUCT.md exists, active changes found | Resume last change. If last activity <2h ago, skip resume menu and go to last stage. |
| `PRODUCT_NEXT` | PRODUCT.md exists, no active changes | Offer next phase. User confirms, then Stage 1. |
| `FOUND` | No PRODUCT.md, one active change | Ask: resume or start new? |
| `MULTIPLE` | No PRODUCT.md, multiple active changes | List changes, ask which to resume. |
| `NONE` | No PRODUCT.md, no active changes | Proceed to Stage 1. |

**Exit condition:** Route determined, registry initialised (if resuming), scan JSON read.

#### Stage 1: Understand

**Entry condition:** Stage 0 routing complete, or user requests spec revision.

**Part 0: Product context.** Five paths based on PRODUCT.md existence and codebase state:
- No PRODUCT.md + no code: ask product-level questions, create PRODUCT.md
- No PRODUCT.md + existing code: bootstrap via subagent (read codebase, draft PRODUCT.md)
- PRODUCT.md + product-level request: check architecture drift
- PRODUCT.md + small change/bugfix: read silently, no ceremony
- PRODUCT.md + different product: ask user to replace or use new directory

**Part A: Sharpening questions (2-4).** In the main conversation. Focus: what, done criteria, exclusions, constraints.

**Part B: Spec generation.** Via subagent (hidden from user). Initialise registry if not done. Generate proposal.md and spec.md per OpenSpec strict format. Validate with `openspec validate`.

**Part B.5: Artefact verification.** Run `prism-verify.sh --files` to confirm spec files exist on disk. Never trust subagent return values alone.

**Part B.6: Auto-save.** Run `prism-save.sh`.

**Part C: Approval.** Show plain-English checklist. Collect revisions if needed, re-generate.

**Exit condition:** User approves spec. Registry stage updated to "planned". Checkpoint written.

#### Stage 2: Plan

**Entry condition:** Stage 1 approval complete.

**Actions:**
1. Invoke `/plan-eng-review` gstack skill
2. If problems found: return to Stage 1 Part B
3. If architecture changes recommended: update PRODUCT.md
4. Check if UI product needs design stage

**Skip:** User can say "skip planning" before invocation.

**Fallback:** If Skill tool errors, do the review inline.

**Exit condition:** Spec status updated to "planned". Auto-save complete. Route to Stage 2.5 (UI product, no DESIGN.md) or Stage 3.

#### Stage 2.5: Design (UI products only, Route C)

**Entry condition:** UI product detected, no DESIGN.md exists.

**Actions:** Invoke `/design-consultation` gstack skill.

**Skip:** User can say "skip design".

**Fallback:** If skill not installed, skip silently.

**Exit condition:** DESIGN.md created, or stage skipped. Proceed to Stage 3.

#### Stage 3: Build

**Entry condition:** Planning complete, or user requests fix/re-build.

**Complexity heuristic:**
- 1-2 requirements: inline build (no workers)
- 3+ requirements: worker decomposition

**Inline build flow:**
1. Build directly in conversation
2. Run `prism-verify.sh` on changed files
3. Run `prism-save.sh`
4. Update registry stage to "built"
5. Write checkpoint

**Worker decomposition flow:**
1. Map requirements to worker tasks with dependency graph
2. Register each worker via `prism-registry.sh worker`
3. Dispatch independent workers simultaneously via Agent tool
4. Per-worker: verify artefacts, extract contracts, save, update registry
5. Guardian handles failures (diagnose, rewrite prompt, respawn; max 3 attempts)
6. Drift detection after all workers complete

**Context firewall:** Workers receive only their task description, relevant file paths, constraints, and validated contracts from prior workers. They never receive user conversation, personality, vision, other workers' context, or the raw spec.

**Exit condition:** All workers completed or resolved. PRODUCT.md updated with "built" status. Checkpoint written. Proceed to Stage 4.

#### Stage 4: Verify

**Entry condition:** Build complete.

**Actions:** Invoke `/qa` gstack skill with testable URL.

**Skip:** User can say "skip QA".

**Fallback:** If Skill tool errors, do inline.

**Exit condition (pass):** UI product: proceed to Stage 4.5. Non-UI: proceed to Stage 5.

**Exit condition (fail):** Return to Stage 3 for fixes. Auto-save after fixes.

#### Stage 4.5: Design Review (UI products only, Routes B and C)

**Entry condition:** QA passed, UI product.

**Actions:** Invoke `/design-review` gstack skill.

**Constraint:** Design review runs at most once per build cycle to prevent infinite loops. If it has already run this cycle, skip to Stage 5.

**Exit condition (pass):** Proceed to Stage 5.

**Exit condition (fail, first time):** Return to Stage 3 for fixes, then re-verify.

#### Stage 5: Ship

**Entry condition:** Verification (and design review, if applicable) passed.

**Actions:**
1. Invoke `/ship` gstack skill (squash auto-save commits, create PR)
2. On success: archive OpenSpec change, update PRODUCT.md to "shipped", update registry via `prism-registry.sh archive`
3. Suggest next phase to user

**Skip:** User can defer shipping. Code remains ready.

**Fallback:** If Skill tool errors, do inline.

**Exit condition:** PR created, change archived, registry archived.

### Recovery

The user can always go backwards:
- "Change the spec": Stage 1 Part B
- "Re-plan": Stage 2
- "Fix something": Stage 3
- "Re-test": Stage 4

The spec stays as-is unless explicitly asked to change.


## 4. State Models

### 4.1 Registry: `.prism/registry.json`

**Owner:** `prism-registry.sh`

**Created by:** `prism-registry.sh init`

**Concurrency model:** mkdir-based lock at `.prism/registry.lockdir`. Spin-wait up to 5 seconds (50 attempts at 100ms). Automatic `.bak` recovery on corruption detection.

**Full JSON schema:**

```json
{
  "version": 1,
  "change": {
    "name": "string",
    "stage": "understand | planned | built | archived",
    "started": "ISO 8601 UTC timestamp",
    "last_save": "ISO 8601 UTC timestamp | null",
    "last_save_commit": "string | null",
    "branch": "string",
    "complexity": "string | null",
    "requirement_count": "number | null",
    "spec_path": "string | null"
  },
  "workers": [
    {
      "id": "string (e.g., w1, w2)",
      "status": "running | completed | failed",
      "retries": "number (incremented on failure)",
      "created": "ISO 8601 UTC timestamp",
      "last_updated": "ISO 8601 UTC timestamp",
      "output_files": ["string (relative paths, optional, set via PRISM_WORKER_EXTRA)"]
    }
  ],
  "checkpoint": {
    "stage": "number | null",
    "progress": "string | null",
    "decisions": ["string"],
    "preferences": ["string"],
    "open_questions": ["string"],
    "next_steps": ["string"]
  },
  "contracts": {},
  "events": [
    {
      "ts": "ISO 8601 UTC timestamp",
      "type": "string",
      "stage": "string",
      "message": "string"
    }
  ]
}
```

**Read/write patterns:**

| Operation | Command | Input | Effect |
|-----------|---------|-------|--------|
| Create | `init <root> <change>` | Positional args | Creates `.prism/registry.json` if absent. No-op if exists. |
| Read | `status <root> <change>` | Positional args | Reads and validates JSON, recovers from `.bak` if corrupted. |
| Update change fields | `update <root> <change>` | Stdin: JSON patch | Deep-merges patch into `.change` object. |
| Worker state | `worker <root> <change> <id> <status>` | Positional args + `PRISM_WORKER_EXTRA` env var | Creates or updates worker entry. Increments `retries` on failure. |
| Log event | `log <root> <change> <type> <message>` | Positional args | Appends to `.events` array. |
| Archive | `archive <root> <change>` | Positional args | Sets `change.stage` to "archived", adds `archived_at` timestamp. |

### 4.2 Checkpoint: stdin JSON to `prism-checkpoint.sh`

**Owner:** `prism-checkpoint.sh`

**Trigger:** After each stage transition, and on emergency compaction.

**Input format (stdin JSON):**

```json
{
  "stage": "number (required, internal stage number)",
  "stage_route": "string (required on all checkpoints after route determination: A, B, or C)",
  "stage_total": "number (required: 5, 6, or 7 depending on route)",
  "progress": "string (required, human-readable progress description)",
  "decisions": ["string (optional, architectural/product decisions made)"],
  "preferences": ["string (optional, user preferences discovered)"],
  "open_questions": ["string (optional, unresolved questions)"],
  "next_steps": ["string (required, what to do next on resume)"]
}
```

**Side effects:**
1. Merges stdin JSON into `.checkpoint` in `registry.json` (locked write)
2. Writes `.prism/session-context.md` (human-readable markdown)
3. Writes `openspec/changes/{change}/session-context.md` if the change directory exists

### 4.3 Session Context: `.prism/session-context.md`

**Owner:** `prism-checkpoint.sh` (generated, never hand-edited)

**Format:**

```markdown
# Session Context
Updated: {ISO 8601 UTC timestamp}

## Current State
- **Stage:** {stage number}
- **Progress:** {progress string}
- **Change:** {change name}

## Decisions
- {decision 1}
- {decision 2}

## Preferences
- {preference 1}

## Next Steps
- {next step 1}
```

Sections are omitted if their source arrays are empty.

**Locations:** Written to both `.prism/session-context.md` and `openspec/changes/{change}/session-context.md`.

### 4.4 Contracts: `.prism/contracts/{worker-id}.json`

**Owner:** Agent subagent (post-worker contract extraction step)

**Purpose:** Store exported symbols and function signatures from a completed worker's output files so that dependent workers can consume validated interfaces rather than raw code.

**Lifecycle:**
1. After a worker completes and passes verification, a subagent reads the worker's output files
2. The subagent extracts exported symbols/signatures
3. Validates the extraction via grep against the source files
4. Writes the contract JSON to `.prism/contracts/{worker-id}.json`

**Format (inferred from SKILL.md context; currently undocumented in scripts):**

```json
{
  "worker_id": "string (e.g., w1)",
  "exports": [
    {
      "name": "string (symbol name)",
      "type": "string (function, component, type, constant, etc.)",
      "signature": "string (full type signature or function signature)",
      "file": "string (relative path to source file)"
    }
  ]
}
```

**Note:** This format is not enforced by any script. The Brain directs the subagent to produce it; there is no Body-level validation. This is a known gap.

### 4.5 PRODUCT.md

**Owner:** Agent subagent (created and updated via subagent calls)

**Location:** Project root (`{PROJECT_ROOT}/PRODUCT.md`)

**Structure:**

```markdown
# Product: {Name}

## Vision
{1-2 paragraphs}

## Architecture
{Tech stack, key patterns, data model, ASCII diagram}

## What's Been Built
| Phase | Change Name | What Shipped | Status | Date |
|-------|-------------|-------------|--------|------|

## What's Next
| Phase | Description | Depends On | Status |
|-------|------------|-----------|--------|

## Architecture Decisions
| Decision | Why | Date | Revisit If |
|----------|-----|------|------------|
```

**Status values:**
- "What's Been Built" column: `built`, `shipped`
- "What's Next" column: `ready`, `blocked`, `in progress`, `shipped`

**Update schedule:**
- After Stage 3 (Build): add to "Built" table with status "built", update Architecture Decisions
- After Stage 2 (Plan): update Architecture Decisions if review recommends changes
- After Stage 5 (Ship): update "Built" status to "shipped", update Architecture, update "What's Next", suggest next phase

**Authority rule:** When PRODUCT.md conflicts with archived specs (`openspec/specs/`), archived specs are ground truth for what was built. PRODUCT.md is ground truth for direction (vision, what is next).

**Constraint:** One PRODUCT.md per repo. One product per repo.

### 4.6 OpenSpec Artefacts

**Spec format (strict):**
- `###` Requirements (3 hashtags exactly)
- `####` Scenarios (4 hashtags exactly)
- `SHALL` / `SHALL NOT` / `MUST` for requirements
- `WHEN` / `THEN` for scenarios
- Every requirement must have at least 1 scenario
- Minimum 2 requirements per spec

**Directory structure:**

```
openspec/
  changes/                          # Active (in-progress) changes
    {change-name}/
      proposal.md                   # Why and What
      specs/
        {feature-name}/
          spec.md                   # The spec (strict format)
      session-context.md            # Per-change session (written by prism-checkpoint.sh)
  specs/                            # Archived (shipped) specs
    {feature-name}/
      spec.md
```

**Lifecycle:** `openspec new change` creates the change directory. `openspec validate` checks formatting. `openspec archive` moves from `changes/` to `specs/`.

**Fallback:** If the openspec CLI is not installed, Prism falls back to direct directory manipulation. The scan script reads directories directly when openspec is unavailable.


## 5. Scripts

### 5.1 prism-scan.sh

**Purpose:** Detect project state at Stage 0.

**Invocation:** `bash "$SKILL_DIR/scripts/prism-scan.sh" "$PROJECT_ROOT"`

**Inputs:** Project root directory (positional argument).

**Outputs (JSON):**

```json
{
  "status": "NONE | FOUND | MULTIPLE | PRODUCT_RESUME | PRODUCT_NEXT",
  "product": {
    "exists": "boolean",
    "name": "string | null",
    "vision": "string | null"
  },
  "openspec": {
    "cli_available": "boolean",
    "changes": [{"name": "string", "specs": "number"}],
    "change_count": "number"
  },
  "registry": {
    "status": "none | found | corrupted",
    "stage": "string | null",
    "workers": "number"
  },
  "session": {
    "exists": "boolean",
    "file": "string"
  },
  "v2_compat": {
    "has_prism_log": "boolean"
  }
}
```

**Side effects:** None (read-only).

**Dependencies:** `jq` (optional: degrades to minimal JSON string), `openspec` CLI (optional: falls back to directory scan).

**Error handling:** Returns exit 0 with JSON output on all logical paths. Exit non-zero only on missing root directory.

### 5.2 prism-registry.sh

**Purpose:** Single source of truth for build state. Replaces v2's `prism-log.md`.

**Invocation:**
```
bash "$SKILL_DIR/scripts/prism-registry.sh" init    <root> <change>
bash "$SKILL_DIR/scripts/prism-registry.sh" status  <root> <change>
bash "$SKILL_DIR/scripts/prism-registry.sh" update  <root> <change>          # reads JSON patch from stdin
bash "$SKILL_DIR/scripts/prism-registry.sh" worker  <root> <change> <id> <status>
bash "$SKILL_DIR/scripts/prism-registry.sh" log     <root> <change> <type> <message>
bash "$SKILL_DIR/scripts/prism-registry.sh" archive <root> <change>
```

**Inputs:** Positional arguments for all commands. `update` reads a JSON patch from stdin. `worker` reads extra fields from the `PRISM_WORKER_EXTRA` environment variable (not stdin, as stdin is unreliable in chained commands).

**Outputs:** One-line summary to stdout, full JSON to temp file.

**Side effects:**
- Creates `.prism/` directory and `registry.json` on `init`
- Creates `.prism/registry.json.bak` before every write
- Creates `.prism/registry.lockdir` during writes (removed after)

**Dependencies:** `jq` (required; script exits with error if absent).

**Error handling:**
- Validates JSON before every write
- Recovers from `.bak` if `registry.json` is corrupted
- Sanitises all user-influenced strings (strips shell metacharacters)
- Lock acquisition times out after 5 seconds
- `init` is idempotent (no-op if registry already exists)

### 5.3 prism-checkpoint.sh

**Purpose:** Persist session context for cross-session recovery.

**Invocation:** `echo '{...}' | bash "$SKILL_DIR/scripts/prism-checkpoint.sh" "$PROJECT_ROOT" "{change}"`

**Inputs:** Project root and change name (positional). Checkpoint JSON on stdin.

**Outputs:** One-line summary to stdout, input JSON echoed to temp file.

**Side effects:**
- Merges stdin JSON into `.checkpoint` in `registry.json` (locked write)
- Writes `.prism/session-context.md`
- Writes `openspec/changes/{change}/session-context.md` (if change directory exists)

**Dependencies:** `jq` (optional: skips registry merge if absent, still writes markdown).

**Error handling:**
- Returns exit 0 with "SKIP" status if no stdin data provided
- Validates stdin is valid JSON before processing
- Uses same mkdir-lock pattern as registry for concurrent safety
- 1-second timeout on stdin read to prevent blocking

### 5.4 prism-verify.sh

**Purpose:** Post-worker syntax verification. Checks file existence, lint errors, and type errors. Does NOT check semantic correctness.

**Invocation:** `bash "$SKILL_DIR/scripts/prism-verify.sh" "$PROJECT_ROOT" --files f1,f2 --lint --compile`

**Inputs:**
- `<root>`: project root (positional, required)
- `--files f1,f2,...`: comma-separated file paths to check for existence and non-emptiness
- `--lint`: run linter if config found
- `--compile`: run TypeScript compiler if tsconfig found
- `--cwd dir`: override working directory for lint/compile

**Outputs (JSON):**

```json
{
  "passed": "boolean",
  "checks": {
    "files": "passed | failed | skipped",
    "lint": "passed | failed | skipped | skipped_no_config | skipped_no_files",
    "compile": "passed | failed | skipped | skipped_no_tsconfig | skipped_no_npx"
  },
  "errors": [
    {
      "type": "file_missing | file_empty | lint_error | compile_error",
      "file": "string (for file errors)",
      "details": "string (for lint/compile errors, first 10 lines)"
    }
  ]
}
```

**Side effects:** None (read-only, apart from invoking linters which may create caches).

**Dependencies:**
- `jq` (optional: degrades to minimal JSON)
- `npx` (optional: needed for eslint, biome, tsc)
- Linter config (eslint or biome): auto-detected from project root
- `tsconfig.json`: auto-detected from `--cwd` or project root

**Error handling:** All checks are independently gated. Missing tools cause individual checks to be skipped, not the entire verification to fail.

### 5.5 prism-save.sh

**Purpose:** Auto-save via git. Stages tracked + new files (minus blocklist), commits, and pushes.

**Invocation:** `bash "$SKILL_DIR/scripts/prism-save.sh" "$PROJECT_ROOT" "{milestone}"`

**Inputs:** Project root (positional, required). Milestone description (positional, defaults to "auto-save").

**Outputs (JSON):**

```json
{
  "status": "saved | nothing_to_save | error",
  "commit": "string (short SHA)",
  "files_staged": "number",
  "push": "pushed | push_failed | no_remote",
  "branch": "string",
  "milestone": "string",
  "reason": "string (on error: not_a_git_repo, commit_failed)"
}
```

**Side effects:**
- Creates a new branch from main/master if currently on main/master (pattern: `prism/{sanitised-milestone}`)
- Runs `git add -u` for tracked files
- Stages untracked files that pass the blocklist
- Commits with message `wip: {milestone} [prism auto-save]`
- Pushes to origin (creates tracking branch if needed)

**Blocklist (files never staged):**
```
*.env, *.env.*, .env*, *.pem, *.key, *.p12, *.pfx, *.jks, *.secret,
*_rsa, id_ed25519, .netrc, aws/credentials, *credential*, *secret*.json,
serviceAccount*, firebase*.json, token.json, .npmrc, dist/, .next/,
node_modules/, coverage/, .prism/worktrees/, __pycache__/, *.pyc,
.DS_Store, Thumbs.db
```

Additionally, filenames are checked case-insensitively for: `credential`, `secret`, `password`, `auth_token`.

**Dependencies:** `git` (required; exits with error if not in a git repo), `jq` (optional: degrades to minimal JSON).

**Error handling:**
- Save failures are always silent from the user's perspective (SKILL.md rule)
- Push failure does not fail the save; status is recorded as `push_failed`
- Branch creation failure falls back to attempting checkout of existing branch

**Auto-save milestones (triggered by SKILL.md):**
- After spec generation
- After spec approval
- After planning
- After design
- After each worker completion
- After QA fixes
- Before shipping


## 6. External Dependencies

| Tool | Usage | Required | Fallback |
|------|-------|----------|----------|
| `jq` | JSON parsing in all scripts | No (but `prism-registry.sh` requires it) | String-based minimal JSON in scan, verify, save. Registry errors out. |
| `git` | Commits, pushes, branch detection, project root resolution | No | Directory operations, no auto-save |
| `openspec` CLI | Spec lifecycle: `new change`, `validate`, `archive`, `list` | No | Direct directory/file manipulation, scan falls back to directory listing |
| gstack skills | `/plan-eng-review`, `/qa`, `/design-consultation`, `/design-review`, `/ship` | No | Inline fallback (do the operation directly in conversation) |
| `npm`/`npx` | Linters (eslint, biome), TypeScript compiler | No | Skip lint/compile checks |
| `security` (macOS) | Keychain access for key vault | No | Skip key management silently on non-macOS |
| Agent tool (Claude) | Subagent dispatch for all code generation and judgment tasks | Yes (hard dependency) | No explicit fallback; 15+ invocations rely on it |


## 7. Environment Variables

### PRISM_WORKER_EXTRA

**Purpose:** Pass additional JSON fields when registering or updating a worker in the registry.

**Set by:** The Brain (SKILL.md), when dispatching workers.

**Read by:** `prism-registry.sh worker` command.

**Format:** Valid JSON object, merged into the worker entry.

**Example:**
```bash
PRISM_WORKER_EXTRA='{"output_files":["src/auth.ts","src/login.tsx"]}' \
  bash "$SKILL_DIR/scripts/prism-registry.sh" worker "$PROJECT_ROOT" "{change}" "w1" "running"
```

**Rationale:** Stdin is unreliable in chained commands, so extra worker data is passed via environment variable instead.

**Validation:** If the value is not valid JSON, it defaults to `{}`.

### SKILL_DIR

**Purpose:** Absolute path to the Prism skill directory (where SKILL.md and scripts/ live).

**Set by:** SKILL.md initialisation block on every invocation.

**Resolution:** `find ~/.claude/skills -name "SKILL.md" -path "*/prism/*" -exec dirname {} \; 2>/dev/null | head -1`

### PROJECT_ROOT

**Purpose:** Absolute path to the project being built.

**Set by:** SKILL.md initialisation block on every invocation.

**Resolution:** `git rev-parse --show-toplevel 2>/dev/null || pwd`


## 8. Security Model

### Key Vault

- **Storage:** macOS Keychain (AES-256 at rest, unlocked at login)
- **Scope:** macOS only. Detected at Stage 0 via `uname` and `command -v security`. Skipped silently on other platforms.
- **Supported providers:** `anthropic`, `openai`, `vercel`, `stripe`
- **Keychain service names:** `prism-{provider}`, account: `prism`

### Credential Safety Rules

1. The LLM agent NEVER executes commands containing secrets. For `prism: connect`, it prints a template command for the user to run manually.
2. The `prism: inject` operation runs as a single Bash pipeline. Secrets pass through shell stdout directly to the file. The LLM context only sees "INJECT_COMPLETE: N keys" or error codes.
3. `.gitignore` is verified BEFORE inject writes `.env.local`. If `.env.local` is not gitignored, the script adds it.
4. The `-T /usr/bin/security` flag allows keychain access without GUI prompts.
5. The `-w` flag (which would expose secrets) is never used in commands the agent executes directly. It appears only in user-facing templates and the inject pipeline.

### .env.local Management

- Prism manages a block delimited by `# --- prism-managed:start ---` and `# --- prism-managed:end ---`
- User-added keys outside this block are preserved
- Old prism block is fully replaced on each inject
- Corrupt block detection: if start marker exists without end marker, inject refuses and reports `CORRUPT_BLOCK`

### Auto-save Blocklist

The blocklist in `prism-save.sh` prevents staging of secrets and build artefacts. This is a blocklist (deny-list) approach, not an allowlist. The rationale: new project files are staged by default, which prevents data loss from crashes. The blocklist catches known secret patterns.

The blocklist also checks filename substrings case-insensitively for `credential`, `secret`, `password`, and `auth_token`.


## 9. Design Decisions

### Brain/Body Split

**Decision:** LLM handles judgment (spec writing, code generation, diagnosis). Bash scripts handle all deterministic bookkeeping (state, saves, verification).

**Rationale:** LLMs are unreliable for bookkeeping (they forget, hallucinate state, lose track of files). Scripts are deterministic and testable. The split ensures state is never lost to context window limits or hallucination.

### Registry as Canonical Runtime State

**Decision:** `.prism/registry.json` is the single source of runtime truth. All state reads/writes go through `prism-registry.sh`.

**Rationale:** Eliminates conflicting state models. Prior versions had state spread across markdown logs, multiple JSON files, and LLM memory. The registry centralises this with concurrency safety (mkdir locks) and corruption recovery (.bak).

### Blocklist vs Allowlist for Auto-save

**Decision:** `prism-save.sh` uses a blocklist (deny known-bad patterns) rather than an allowlist (permit only known-good patterns).

**Rationale:** An allowlist would miss new files the user creates, leading to data loss on crashes. A blocklist stages everything by default (preventing data loss) and excludes known secret/build patterns. The tradeoff: an unusual secret filename might slip through. This is mitigated by the secondary case-insensitive substring check.

### Progressive Disclosure

**Decision:** The user sees plain-English checklists, never raw spec format. Raw specs are hidden unless: ambiguity is detected, the user asks, or the user says "change the spec".

**Rationale:** The target user is a non-engineer. Showing `### Requirement: SHALL ...` would be confusing. The spec format exists for machine precision (parseable, validatable); the user sees the human translation.

### Context Firewall

**Decision:** Build workers receive only their task description, relevant files, constraints, and validated contracts from prior workers. They never receive user conversation, personality, vision, other workers' context, or the raw spec.

**Rationale:** Workers with too much context produce worse results (they second-guess, over-engineer, or drift from the task). Narrow context produces focused output. The Brain synthesises the full picture; workers execute narrow slices.

### Guardian Pattern (Not Retry)

**Decision:** When a build worker fails, the Guardian diagnoses the failure, researches solutions, rewrites the prompt with failure context, and dispatches a new worker. Maximum 3 attempts per task.

**Rationale:** Blind retry repeats the same mistake. The Guardian pattern ensures each attempt is smarter than the last. After 3 failures, the user is offered rollback or partial completion (in plain English).

### Branch Auto-creation

**Decision:** `prism-save.sh` auto-creates a branch from main/master if the current branch is main/master. Pattern: `prism/{sanitised-milestone}`.

**Rationale:** Prevents WIP commits directly to the main branch. The user does not need to understand branches; Prism handles it.

### Dual-layer Session Persistence

**Decision:** Session state is stored in both JSON (registry checkpoint) and markdown (session-context.md).

**Rationale:** JSON is for machine consumption (fast parsing on resume). Markdown is for human readability and cross-session recovery when the registry is unavailable. The checkpoint script writes both atomically.

### One Product Per Repo

**Decision:** PRODUCT.md is singular. Each repo contains one product.

**Rationale:** Simplifies all product-level logic (architecture drift detection, phase tracking, "what's next" suggestions). Multi-product repos would require disambiguation at every stage.

### gstack Skills as Optional Dependencies

**Decision:** All gstack skills (`/plan-eng-review`, `/qa`, `/design-consultation`, `/design-review`, `/ship`) are invoked via the Skill tool but have inline fallbacks.

**Rationale:** Skills provide specialised capability, but Prism must function without them. If a skill is not installed or fails, Prism does the operation directly in conversation. Visible but functional is better than broken.


## 10. Known Limitations

1. **Agent tool is a hard dependency.** 15+ invocations in SKILL.md with no explicit fallback.
2. **OpenSpec CLI not version-pinned.** `npm install -g @fission-ai/openspec@latest` could introduce breaking changes.
3. **Contract extraction schema undefined.** `.prism/contracts/` format is free-form JSON directed by the Brain.
4. **Single-threaded builds.** No parallel workstreams for multi-track products.
5. **TypeScript-only verification.** `prism-verify.sh` only checks JS/TS linting and compilation.
6. **macOS-only key vault.** No Windows/Linux Keychain equivalent.


## 11. Product Memory Model

### 4-File Model

Product memory is split across four files at the project root:

| File | Authority | Purpose |
|------|-----------|---------|
| `PRODUCT.md` | Authoritative, manual | Product identity: vision, user, finished product, phases, what's been built |
| `ARCHITECTURE.md` | Authoritative, semi-auto | Technical shape: stack, patterns, data model, boundaries, diagram |
| `DECISIONS.md` | Authoritative, append-only | Architecture Decision Records (ADR format). Never edited, only appended. |
| `STATE.md` | Generated, never hand-edited | Current position: active change, stage, blockers, next steps |

**Authority hierarchy:** PRODUCT.md is ground truth for direction. Archived specs are ground truth for what was built. ARCHITECTURE.md is ground truth for technical decisions. DECISIONS.md is the immutable record of why decisions were made.

**Creation:** Stage 1 Part 0 creates PRODUCT.md, ARCHITECTURE.md, and DECISIONS.md from templates. STATE.md is generated on every invocation.

**Update schedule:**

| File | Stage 1 | Stage 2 | Stage 3 | Stage 5 |
|------|---------|---------|---------|---------|
| PRODUCT.md | Create | — | — | Update phases, built table |
| ARCHITECTURE.md | Create | Update if changes | Update if drift | Update shipped arch |
| DECISIONS.md | Create | Append | Append | Append |
| STATE.md | Generate | Generate | Generate | Generate |

### STATE.md Generation

`prism-state.sh` reads registry, PRODUCT.md, DECISIONS.md, and session context to produce a generated STATE.md. Called at Stage 0 on every invocation for fast context recovery.

**Input sources:**
- `.prism/registry.json` — change name, stage, workers, checkpoint, events
- `PRODUCT.md` — phase info (read but not parsed deeply)
- `DECISIONS.md` — last 5 ADR headings
- `openspec/changes/*/session-context.md` — last session context

**Output:** `STATE.md` at project root + JSON summary to temp file.

### Templates

Product memory templates live in `templates/product-memory/`:

| Template | Creates |
|----------|---------|
| `PRODUCT.md.tmpl` | Product identity with Vision, User, Finished Product, Phases, What's Been Built |
| `ARCHITECTURE.md.tmpl` | Technical shape with Stack, Structure, Data Model, Boundaries, Diagram |
| `DECISIONS.md.tmpl` | Empty decisions log with ADR template in a comment block |

Templates use `{name}` placeholder for product name substitution.


## 12. Scripts (continued)

### 12.1 prism-state.sh

**Purpose:** Generate STATE.md from registry and product data for fast context recovery.

**Invocation:** `bash "$SKILL_DIR/scripts/prism-state.sh" "$PROJECT_ROOT"`

**Inputs:** Project root directory (positional argument).

**Outputs (JSON):**

```json
{
  "status": "generated",
  "timestamp": "ISO 8601 UTC",
  "change": "string",
  "stage": "string",
  "stage_label": "string",
  "branch": "string",
  "workers": { "completed": "number", "total": "number" },
  "last_save": "string",
  "last_action": "string",
  "has_registry": "boolean",
  "has_product": "boolean",
  "has_decisions": "boolean"
}
```

**Side effects:** Writes `STATE.md` to project root.

**Dependencies:** `jq` (optional: degrades to minimal JSON).

**Error handling:** Returns exit 0 with generated output on all logical paths. Handles missing registry, missing PRODUCT.md, and missing DECISIONS.md gracefully by using defaults.


## 13. Supervisor (Task Graph Lifecycle)

### 13.1 prism-supervisor.sh

**Purpose:** Formal task graph lifecycle manager. Manages decomposition, dependency tracking, and dispatch coordination for builds with 3+ requirements. The supervisor is NOT a separate process — it is a structured JSON state machine managed by bash, with the LLM (SKILL.md) as the brain.

**Invocation:**
```
bash "$SKILL_DIR/scripts/prism-supervisor.sh" plan     <root> <change>             # stdin: task graph JSON
bash "$SKILL_DIR/scripts/prism-supervisor.sh" next     <root> <change>             # returns dispatchable tasks
bash "$SKILL_DIR/scripts/prism-supervisor.sh" complete <root> <change> <task-id>   # mark task done
bash "$SKILL_DIR/scripts/prism-supervisor.sh" fail     <root> <change> <task-id>   # mark task failed
bash "$SKILL_DIR/scripts/prism-supervisor.sh" status   <root> <change>             # full status summary
bash "$SKILL_DIR/scripts/prism-supervisor.sh" reset    <root> <change> <task-id>   # reset for guardian retry
```

**Inputs:**
- `plan`: positional args + task graph JSON on stdin
- `next`: positional args only
- `complete`: positional args + optional `PRISM_TASK_OUTPUT` env var (JSON array of file paths)
- `fail`: positional args + optional `PRISM_FAIL_REASON` env var (string)
- `status`: positional args only
- `reset`: positional args only

**State storage:** All state is stored in the `task_graph` field of `registry.json` (version 2). No separate files.

**Dependencies:** `jq` (required).

### 13.2 Task Graph JSON Schema (stdin for `plan`)

```json
{
  "tasks": [
    {
      "id": "string (user-friendly, e.g. t1, t2)",
      "name": "string (plain-English task name)",
      "requirement": "string | null (spec requirement reference)",
      "depends_on": ["string (task IDs this depends on)"],
      "files_to_read": ["string (file paths for worker context)"],
      "constraints": ["string (build constraints)"],
      "estimated_files": "number | null"
    }
  ]
}
```

### 13.3 Registry Version 2 Format

Registry version 2 extends version 1 with the `task_graph` field:

```json
{
  "version": 2,
  "change": { "..." },
  "task_graph": {
    "planned_at": "ISO 8601 UTC timestamp",
    "tasks": [
      {
        "id": "string",
        "name": "string",
        "requirement": "string | null",
        "depends_on": ["string"],
        "files_to_read": ["string"],
        "constraints": ["string"],
        "estimated_files": "number | null",
        "status": "pending | ready | running | completed | failed | blocked",
        "worker_id": "string | null",
        "retries": "number (starts at 0)",
        "max_retries": "number (default 3)",
        "started_at": "ISO 8601 UTC timestamp | null",
        "completed_at": "ISO 8601 UTC timestamp | null",
        "output_files": ["string"],
        "contracts": {},
        "failure_reason": "string | null"
      }
    ]
  },
  "workers": ["..."],
  "checkpoint": { "..." },
  "contracts": {},
  "events": ["..."]
}
```

**Backward compatibility:** When `prism-registry.sh` encounters a version 1 registry, it auto-migrates by setting `version: 2` and adding `task_graph: null`. The migration runs at the start of `status`, `update`, and `worker` commands.

**Task statuses:**
- `pending`: dependencies not yet met
- `ready`: all dependencies completed, available for dispatch
- `running`: dispatched to a worker (set by SKILL.md, not by the supervisor)
- `completed`: worker finished successfully
- `failed`: worker failed (retries < max_retries, Guardian can reset)
- `blocked`: worker failed too many times (retries >= max_retries)

### 13.4 Supervisor Lifecycle

```
plan → next → dispatch → complete/fail → next → dispatch → ... → all completed
```

1. **Plan:** Operator reads spec, creates task graph JSON, pipes to `prism-supervisor.sh plan`. The plan command validates the graph (structure, cycles, dependency references), sets initial statuses (no deps = "ready", others = "pending"), and writes to registry.

2. **Next:** Returns all tasks with status "ready". These can be dispatched in parallel via Agent tool.

3. **Dispatch:** SKILL.md dispatches each ready task as a worker via Agent tool. The supervisor itself does not dispatch — the LLM brain decides when and how to dispatch.

4. **Complete:** Marks a task as "completed". Checks all dependents: if all their dependencies are now complete, promotes them to "ready". Returns the newly ready tasks for immediate dispatch.

5. **Fail:** Marks a task as "failed", increments retries. If retries >= max_retries, marks as "blocked" instead. Guardian pattern applies: diagnose failure, rewrite prompt, then reset.

6. **Reset:** Sets a failed/blocked task back to "ready" for Guardian retry. Must be explicitly called after Guardian rewrites the prompt.

7. **Status:** Returns a full summary: total tasks, completed, running, failed, blocked, ready, pending, planned_at, and critical path length.

### 13.5 Cycle Detection Algorithm

Uses Kahn's algorithm implemented in jq:

1. Build an in-degree map (count of dependencies per task)
2. Initialize a queue with all tasks that have in-degree 0 (no dependencies)
3. While queue is not empty:
   a. Remove a task from the queue, increment processed count
   b. For each task that depends on the removed task, decrement its in-degree
   c. If any task's in-degree reaches 0, add it to the queue
4. If processed count equals total tasks: no cycle. Otherwise: cycle detected.

The algorithm runs during `plan` and rejects graphs with cycles before writing to the registry.

### 13.6 Design Decisions

**Not a separate process:** The supervisor is a structured JSON state machine, not a Python daemon or separate bash process. The LLM (SKILL.md) acts as the brain; the supervisor script is the spine. This avoids adding runtime dependencies and leverages the existing registry + locking infrastructure.

**Task IDs are user-friendly:** `t1`, `t2` instead of UUIDs. The task graph is small (typically 3-10 tasks) and exists within a single build session.

**Dual registration:** Workers are registered in both the supervisor task graph (formal lifecycle) and the legacy workers array (backward compatibility with existing status/checkpoint code).

**max_retries = 3:** Matches the existing Guardian pattern (max 3 attempts per task) defined in SKILL.md.
