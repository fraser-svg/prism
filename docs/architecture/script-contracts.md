# Shell Script JSON Contracts

Reference for the bridge adapter layer. Each script writes JSON to a temp file
(`/tmp/prism-{name}-{PID}.json`) and prints a one-line summary to stdout in the
format: `SUMMARY -> /tmp/prism-{name}-{PID}.json`.

Exit code 0 means the script completed (check JSON for logical errors).
Non-zero means the script itself crashed (see stderr).

---

## prism-scan.sh

Detects project state: product memory, active changes, registry, session context.

### Usage

```
bash scripts/prism-scan.sh <root>
```

| Arg    | Required | Description              |
|--------|----------|--------------------------|
| `root` | yes      | Project root directory   |

### Stdout

```
OK: status=PRODUCT_RESUME changes=2 product=true -> /tmp/prism-scan-{PID}.json
```

### Temp file: `/tmp/prism-scan-{PID}.json`

```json
{
  "status": "PRODUCT_RESUME",
  "product": {
    "exists": true,
    "name": "My App",
    "vision": "A tool that does X"
  },
  "openspec": {
    "cli_available": false,
    "changes": [
      { "name": "add-auth", "specs": 1 }
    ],
    "change_count": 1
  },
  "registry": {
    "status": "found",
    "stage": "build",
    "workers": 3
  },
  "session": {
    "exists": true,
    "file": ".prism/session-context.md"
  },
  "v2_compat": {
    "has_prism_log": false
  },
  "product_memory": {
    "model": "split",
    "files": ["product.md", "architecture.md", "state.md"],
    "file_count": 3
  }
}
```

### Key fields

| Field                        | Type     | Values / Notes                                          |
|------------------------------|----------|---------------------------------------------------------|
| `status`                     | string   | `"NONE"`, `"FOUND"`, `"MULTIPLE"`, `"PRODUCT_NEXT"`, `"PRODUCT_RESUME"` |
| `product.exists`             | boolean  | Whether `PRODUCT.md` exists                             |
| `product.name`               | string   | First `# ` heading from PRODUCT.md, or `"null"`         |
| `product.vision`             | string   | First paragraph after heading, or `"null"`               |
| `openspec.cli_available`     | boolean  | Whether `openspec` CLI is on PATH                       |
| `openspec.changes`           | array    | `[{name: string, specs: number}]`                       |
| `openspec.change_count`      | number   | Length of changes array                                  |
| `registry.status`            | string   | `"none"`, `"found"`, `"corrupted"`                      |
| `registry.stage`             | string   | Current stage from registry, or `"null"`                |
| `registry.workers`           | number   | Worker count from registry                               |
| `session.exists`             | boolean  | Whether a session-context.md was found                  |
| `session.file`               | string   | Path to session-context.md, or `""`                     |
| `v2_compat.has_prism_log`    | boolean  | Whether legacy `prism-log.md` exists                    |
| `product_memory.model`       | string   | `"none"`, `"legacy"`, `"split"`                         |
| `product_memory.files`       | array    | List of found split memory filenames                     |
| `product_memory.file_count`  | number   | Count of split memory files found                        |

### Notes
- Degrades gracefully if `jq` is not installed (returns minimal JSON without structured fields).
- Degrades gracefully if `openspec` CLI is not installed (reads `openspec/changes/` directory directly).

---

## prism-registry.sh

Single source of truth for build state. JSON task registry with locking.

### Usage

```
bash scripts/prism-registry.sh init    <root> <change>
bash scripts/prism-registry.sh status  <root> <change>
bash scripts/prism-registry.sh update  <root> <change>          # reads JSON patch from stdin
bash scripts/prism-registry.sh worker  <root> <change> <id> <status>
bash scripts/prism-registry.sh log     <root> <change> <type> <message>
bash scripts/prism-registry.sh reset   <root> [<change>]
bash scripts/prism-registry.sh archive <root> <change>
```

| Arg       | Required | Description                                |
|-----------|----------|--------------------------------------------|
| `root`    | yes      | Project root directory                     |
| `change`  | varies   | Change name (required for init/update/worker/log/archive) |
| `id`      | worker   | Worker ID string                           |
| `status`  | worker   | Worker status string                       |
| `type`    | log      | Event type string                          |
| `message` | log      | Event message string                       |

Worker extra data is passed via env var `PRISM_WORKER_EXTRA` (JSON object), not stdin.

### Stdout (varies by subcommand)

```
OK: initialized registry for add-auth -> /tmp/prism-registry-{PID}.json
OK: stage=build workers=2/4 -> /tmp/prism-registry-{PID}.json
OK: updated change fields -> /tmp/prism-registry-{PID}.json
OK: worker w1 -> completed (4 total) -> /tmp/prism-registry-{PID}.json
OK: logged stage_transition (5 events) -> /tmp/prism-registry-{PID}.json
OK: reset registry (was: add-auth) -> /tmp/prism-registry-{PID}.json
OK: archived add-auth -> /tmp/prism-registry-{PID}.json
```

### Temp file: `/tmp/prism-registry-{PID}.json`

For `init` and `status`, the full registry JSON:

```json
{
  "version": 1,
  "change": {
    "name": "add-auth",
    "stage": "understand",
    "started": "2026-03-28T10:00:00Z",
    "last_save": null,
    "last_save_commit": null,
    "branch": "feature/add-auth",
    "complexity": null,
    "requirement_count": null,
    "spec_path": null
  },
  "workers": [],
  "checkpoint": {
    "stage": null,
    "progress": null,
    "decisions": [],
    "preferences": [],
    "open_questions": [],
    "next_steps": []
  },
  "contracts": {},
  "events": []
}
```

For `reset`:

```json
{ "status": "reset", "previous": "add-auth" }
```

Or:

```json
{ "status": "clean" }
```

### Key fields (full registry)

| Field                        | Type        | Notes                                           |
|------------------------------|-------------|-------------------------------------------------|
| `version`                    | number      | Always `1`                                      |
| `change.name`                | string      | Change name                                     |
| `change.stage`               | string      | `"understand"`, `"plan"`, `"design"`, `"build"`, `"verify"`, `"design_review"`, `"ship"`, `"archived"` |
| `change.started`             | string      | ISO-8601 UTC timestamp                          |
| `change.last_save`           | string/null | Last save timestamp                             |
| `change.last_save_commit`    | string/null | Last save commit SHA                            |
| `change.branch`              | string      | Git branch name                                 |
| `change.complexity`          | any/null    | Set via update                                  |
| `change.requirement_count`   | number/null | Set via update                                  |
| `change.spec_path`           | string/null | Set via update                                  |
| `workers[]`                  | array       | Worker entries                                  |
| `workers[].id`               | string      | Worker ID                                       |
| `workers[].status`           | string      | Worker status                                   |
| `workers[].retries`          | number      | Retry count (incremented on `"failed"`)         |
| `workers[].created`          | string      | ISO-8601 creation timestamp                     |
| `workers[].last_updated`     | string      | ISO-8601 last update timestamp                  |
| `checkpoint`                 | object      | Merged from prism-checkpoint.sh                 |
| `checkpoint.stage`           | number/null | Numeric stage (auto-synced from change.stage)   |
| `checkpoint.progress`        | string/null | Progress description                            |
| `checkpoint.decisions`       | array       | Decision strings                                |
| `checkpoint.preferences`     | array       | Preference strings                              |
| `checkpoint.open_questions`  | array       | Open question strings                           |
| `checkpoint.next_steps`      | array       | Next step strings                               |
| `contracts`                  | object      | Empty initially, populated via update           |
| `events[]`                   | array       | Event log entries                               |
| `events[].ts`                | string      | ISO-8601 timestamp                              |
| `events[].type`              | string      | Event type                                      |
| `events[].stage`             | string      | Stage at time of event                          |
| `events[].message`           | string      | Event message                                   |

### Stage constant mapping (string to numeric)

```json
{
  "understand": 1,
  "plan": 2,
  "design": 2.5,
  "build": 3,
  "verify": 4,
  "design_review": 4.5,
  "ship": 5,
  "archived": 99
}
```

### Notes
- Requires `jq`.
- Uses mkdir-based locking at `<root>/.prism/registry.lockdir`.
- Maintains `.bak` file for crash recovery.
- `update` reads a JSON patch from stdin and deep-merges it into `.change`. When `stage` is in the patch, `checkpoint.stage` is auto-synced to the numeric value.
- `worker` reads extra JSON from `PRISM_WORKER_EXTRA` env var (not stdin).

---

## prism-checkpoint.sh

Persists session context into the registry and writes a human-readable `session-context.md`.

### Usage

```
echo '{"stage":3,"progress":"2/4 built","decisions":["chose SQLite"]}' | \
  bash scripts/prism-checkpoint.sh <root> <change>
```

| Arg      | Required | Description            |
|----------|----------|------------------------|
| `root`   | yes      | Project root directory |
| `change` | yes      | Change name            |
| Stdin    | yes      | JSON checkpoint data   |

### Stdout

```
OK: checkpoint saved (stage=3 progress=2/4 built) -> /tmp/prism-checkpoint-{PID}.json
```

Or if no stdin:

```
SKIP: no checkpoint data on stdin -> /tmp/prism-checkpoint-{PID}.json
```

### Temp file: `/tmp/prism-checkpoint-{PID}.json`

Echoes back the stdin JSON as-is:

```json
{
  "stage": 3,
  "progress": "2/4 built",
  "decisions": ["chose SQLite"],
  "preferences": ["TypeScript over JS"],
  "open_questions": ["Which ORM?"],
  "next_steps": ["implement auth layer"]
}
```

### Key fields (stdin input schema)

| Field            | Type         | Notes                              |
|------------------|--------------|------------------------------------|
| `stage`          | number/string | Numeric or string stage identifier |
| `progress`       | string       | Human-readable progress string     |
| `decisions`      | string[]     | List of decisions made             |
| `preferences`    | string[]     | List of user preferences           |
| `open_questions` | string[]     | Unresolved questions               |
| `next_steps`     | string[]     | Planned next steps                 |

### Side effects

1. Merges stdin JSON into `<root>/.prism/registry.json` under the `.checkpoint` key.
2. Writes `<root>/.prism/session-context.md` (human-readable markdown).
3. If `<root>/openspec/changes/<change>/` exists, also writes `session-context.md` there.

### Error output

```json
{ "status": "no_data" }
{ "status": "error", "reason": "invalid_json" }
```

---

## prism-state.sh

Manages the split product memory model (`product.md`, `architecture.md`, `roadmap.md`, `state.md`, `decisions.md`).

### Usage

```
bash scripts/prism-state.sh read    <root>
bash scripts/prism-state.sh update  <root> <file> <section>      # stdin: new section content
bash scripts/prism-state.sh migrate <root>
bash scripts/prism-state.sh status  <root>
```

| Arg       | Required | Description                                    |
|-----------|----------|------------------------------------------------|
| `root`    | yes      | Project root directory                         |
| `file`    | update   | Target file: `product.md`, `architecture.md`, `roadmap.md`, `state.md`, or `decisions.md` |
| `section` | update   | Section heading to replace (matched case-insensitively) |
| Stdin     | update   | New content for the section                    |

### Subcommand: `read`

**Stdout:** `OK: model=split files=3 -> /tmp/prism-state-{PID}.json`

**JSON (model=split):**

```json
{
  "model": "split",
  "files": [
    { "file": "product.md", "mtime": "2026-03-28T10:00:00Z" },
    { "file": "architecture.md", "mtime": "2026-03-27T15:00:00Z" }
  ],
  "file_count": 2,
  "summary": {
    "product": "First 10 non-empty lines of product.md...",
    "architecture": "First 10 non-empty lines of architecture.md..."
  }
}
```

**JSON (model=legacy):**

```json
{
  "model": "legacy",
  "files": ["PRODUCT.md"],
  "summary": { "product": "First 10 non-empty lines of PRODUCT.md..." }
}
```

**JSON (model=none):**

```json
{ "model": "none", "files": [], "summary": null }
```

### Subcommand: `update`

**Stdout:** `OK: updated product.md section 'Vision' -> /tmp/prism-state-{PID}.json`

**JSON:**

```json
{ "file": "product.md", "section": "Vision", "action": "updated" }
```

Or if the file did not exist:

```json
{ "file": "product.md", "section": "Vision", "action": "created" }
```

### Subcommand: `migrate`

**Stdout:** `OK: migrated PRODUCT.md -> split files (created=5 skipped=0) -> /tmp/prism-state-{PID}.json`

**JSON:**

```json
{
  "action": "migrate",
  "source": "/path/to/PRODUCT.md",
  "dest": "/path/to/.prism/memory",
  "created": 5,
  "skipped": 0
}
```

### Subcommand: `status`

**Stdout:** `OK: model=split exists=3 missing=2 -> /tmp/prism-state-{PID}.json`

**JSON:**

```json
{
  "model": "split",
  "files": [
    { "file": "product.md", "exists": true, "mtime": "2026-03-28T10:00:00Z", "bytes": 1234 },
    { "file": "architecture.md", "exists": true, "mtime": "2026-03-27T15:00:00Z", "bytes": 567 },
    { "file": "roadmap.md", "exists": false, "mtime": null, "bytes": 0 },
    { "file": "state.md", "exists": false, "mtime": null, "bytes": 0 },
    { "file": "decisions.md", "exists": true, "mtime": "2026-03-26T12:00:00Z", "bytes": 890 }
  ],
  "exists_count": 3,
  "missing_count": 2,
  "has_legacy_product_md": true
}
```

### Key fields (status)

| Field                    | Type    | Notes                                    |
|--------------------------|---------|------------------------------------------|
| `model`                  | string  | `"none"`, `"legacy"`, `"split"`          |
| `files[]`                | array   | One entry per known memory file          |
| `files[].file`           | string  | Filename                                 |
| `files[].exists`         | boolean | Whether the file exists                  |
| `files[].mtime`          | string/null | ISO-8601 modification time            |
| `files[].bytes`          | number  | File size in bytes                       |
| `exists_count`           | number  | Count of existing files                  |
| `missing_count`          | number  | Count of missing files                   |
| `has_legacy_product_md`  | boolean | Whether PRODUCT.md exists at root        |

---

## prism-supervisor.sh

Task graph execution manager: validates DAGs, schedules tasks, tracks completion/failure.

### Usage

```
echo '[{"id":"w1","task":"build auth","depends_on":[]}]' | \
  bash scripts/prism-supervisor.sh plan     <root> <change>

bash scripts/prism-supervisor.sh next     <root> <change>
bash scripts/prism-supervisor.sh status   <root> <change>
bash scripts/prism-supervisor.sh complete <root> <change> <worker-id>
bash scripts/prism-supervisor.sh fail     <root> <change> <worker-id> <reason>
```

| Arg         | Required  | Description                          |
|-------------|-----------|--------------------------------------|
| `root`      | yes       | Project root directory               |
| `change`    | yes       | Change name                          |
| `worker-id` | complete/fail | Task ID to mark                 |
| `reason`    | fail      | Failure reason string                |
| Stdin       | plan      | JSON array of task objects           |

### Subcommand: `plan`

Validates the task graph (structure, no duplicate IDs, no missing deps, no cycles via Kahn's algorithm), then stores it.

**Stdin format:**

```json
[
  { "id": "w1", "task": "build auth module", "depends_on": [], "route_hint": "any" },
  { "id": "w2", "task": "build db layer", "depends_on": ["w1"], "route_hint": "any" }
]
```

`route_hint` is optional in input; defaults to `"any"` if omitted.

**Stdout:** `OK: plan stored (2 tasks) -> /tmp/prism-supervisor-{PID}.json`

**JSON (stored at `<root>/.prism/task-graph.json`):**

```json
{
  "version": 1,
  "change": "add-auth",
  "created": "2026-03-28T10:00:00Z",
  "tasks": [
    {
      "id": "w1",
      "task": "build auth module",
      "depends_on": [],
      "route_hint": "any",
      "status": "pending",
      "retries": 0,
      "created": "2026-03-28T10:00:00Z",
      "last_updated": "2026-03-28T10:00:00Z",
      "worker_id": null,
      "reason": null
    }
  ]
}
```

**Error JSON:**

```json
{ "status": "ERROR", "error": "no task graph provided on stdin" }
{ "status": "ERROR", "errors": "task graph contains a cycle (Kahn topology sort failed)" }
```

### Subcommand: `next`

Returns tasks whose dependencies are all completed and that are not blocked by abandoned tasks.

**Stdout:** `OK: 2 ready tasks -> /tmp/prism-supervisor-{PID}.json`

**JSON:**

```json
[
  { "id": "w1", "task": "build auth module", "depends_on": [], "route_hint": "any" },
  { "id": "w3", "task": "build UI", "depends_on": [], "route_hint": "visual" }
]
```

### Subcommand: `status`

**Stdout:** `OK: total=5 completed=2 running=1 failed=0 -> /tmp/prism-supervisor-{PID}.json`

**JSON:**

```json
{
  "total": 5,
  "completed": 2,
  "running": 1,
  "failed": 0,
  "abandoned": 0,
  "ready": 1,
  "blocked": 1,
  "critical_path_remaining": 3
}
```

### Subcommand: `complete`

**Stdout:** `OK: w1 completed (3 remaining) -> /tmp/prism-supervisor-{PID}.json`

**JSON:**

```json
{
  "status": "completed",
  "worker_id": "w1",
  "remaining": 3,
  "next_ready": [
    { "id": "w2", "task": "build db layer", "depends_on": ["w1"], "route_hint": "any" }
  ]
}
```

Idempotent: if already completed, returns:

```json
{
  "status": "no-op",
  "message": "already completed",
  "worker_id": "w1",
  "remaining": 3
}
```

### Subcommand: `fail`

**Stdout (retriable):** `WARN: w2 failed (retry 1/3) -> /tmp/prism-supervisor-{PID}.json`
**Stdout (abandoned):** `ERROR: w2 abandoned after 3 retries -> /tmp/prism-supervisor-{PID}.json`

**JSON:**

```json
{
  "worker_id": "w2",
  "status": "failed",
  "retries": 1,
  "reason": "type errors in auth.ts",
  "blocked_downstream": [],
  "can_retry": true
}
```

When abandoned (retries >= 3):

```json
{
  "worker_id": "w2",
  "status": "abandoned",
  "retries": 3,
  "reason": "persistent type errors",
  "blocked_downstream": ["w3", "w4"],
  "can_retry": false
}
```

### Key fields

| Field                    | Type     | Notes                                            |
|--------------------------|----------|--------------------------------------------------|
| `status` (complete)      | string   | `"completed"` or `"no-op"`                       |
| `remaining`              | number   | Tasks not yet completed or abandoned             |
| `next_ready`             | array    | Newly unblocked tasks after this completion      |
| `next_ready[].route_hint`| string   | Provider routing hint for each ready task        |
| `status` (fail)          | string   | `"failed"` or `"abandoned"`                      |
| `retries`                | number   | Cumulative retry count                           |
| `can_retry`              | boolean  | `true` if retries < 3                            |
| `blocked_downstream`     | string[] | Task IDs transitively blocked by abandonment     |

### `route_hint` values

| Value      | Meaning                                              |
|------------|------------------------------------------------------|
| `"any"`    | No routing preference — use the default Claude agent |
| `"visual"` | Visual/UI task — prefer Gemini; falls back to Claude |

### Task status transitions

```
pending -> running -> completed
                   -> failed (retries < 3) -> running (retry)
                   -> abandoned (retries >= 3) -> blocks dependents
```

### Notes
- Requires `jq`.
- Uses mkdir-based locking at `<root>/.prism/supervisor.lockdir`.
- Validates the full DAG on `plan`: structure, unique IDs, valid dep references, cycle detection.
- Stores graph at `<root>/.prism/task-graph.json`.

---

## prism-verify.sh

Post-worker syntax verification: file existence, lint, and TypeScript compile checks.

### Usage

```
bash scripts/prism-verify.sh <root> [--files f1,f2,...] [--lint] [--compile] [--cwd dir]
```

| Arg         | Required | Description                                     |
|-------------|----------|-------------------------------------------------|
| `root`      | yes      | Project root directory                          |
| `--files`   | no       | Comma-separated list of files to check          |
| `--lint`    | no       | Run linter (auto-detects eslint or biome)       |
| `--compile` | no       | Run `tsc --noEmit` (auto-detects tsconfig.json) |
| `--cwd`     | no       | Working directory override for checks           |

### Stdout

```
OK: all checks passed (files=passed lint=passed compile=passed) -> /tmp/prism-verify-{PID}.json
FAIL: 2 errors (files=failed lint=skipped compile=failed) -> /tmp/prism-verify-{PID}.json
```

### Temp file: `/tmp/prism-verify-{PID}.json`

```json
{
  "passed": false,
  "checks": {
    "files": "failed",
    "lint": "passed",
    "compile": "skipped_no_tsconfig"
  },
  "errors": [
    { "type": "file_missing", "file": "src/auth.ts" },
    { "type": "file_empty", "file": "src/db.ts" },
    { "type": "lint_error", "details": "first 10 lines of lint output..." },
    { "type": "compile_error", "details": "first 10 lines of tsc output..." }
  ]
}
```

### Key fields

| Field              | Type    | Values                                                               |
|--------------------|---------|----------------------------------------------------------------------|
| `passed`           | boolean | `true` if all enabled checks passed                                 |
| `checks.files`     | string  | `"skipped"`, `"passed"`, `"failed"`                                  |
| `checks.lint`      | string  | `"skipped"`, `"skipped_no_config"`, `"skipped_no_files"`, `"passed"`, `"failed"` |
| `checks.compile`   | string  | `"skipped"`, `"skipped_no_tsconfig"`, `"skipped_no_npx"`, `"passed"`, `"failed"` |
| `errors[]`         | array   | Error objects (empty when `passed` is true)                          |
| `errors[].type`    | string  | `"file_missing"`, `"file_empty"`, `"lint_error"`, `"compile_error"`  |
| `errors[].file`    | string  | Present for file_missing/file_empty errors                           |
| `errors[].details` | string  | Present for lint_error/compile_error (first 10 lines of output)      |

### Notes
- Auto-detects linter: checks for eslint config files or `biome.json`/`biome.jsonc`.
- When `--files` is provided with `--lint`, only lints files with JS/TS extensions.
- Degrades gracefully if `jq` is not installed.

---

## prism-save.sh

Smart auto-save: stages files, commits, and pushes. Never commits directly to main/master.

### Usage

```
bash scripts/prism-save.sh <root> "<milestone>"
```

| Arg         | Required | Description                        |
|-------------|----------|------------------------------------|
| `root`      | yes      | Project root directory             |
| `milestone` | no       | Commit message label (default: `"auto-save"`) |

### Stdout

```
OK: saved 12 files (abc1234) push=pushed -> /tmp/prism-save-{PID}.json
SKIP: nothing to save -> /tmp/prism-save-{PID}.json
```

### Temp file: `/tmp/prism-save-{PID}.json`

```json
{
  "status": "saved",
  "commit": "abc1234",
  "files_staged": 12,
  "push": "pushed",
  "branch": "prism/add-auth",
  "milestone": "add-auth checkpoint"
}
```

### Key fields

| Field          | Type   | Values                                           |
|----------------|--------|--------------------------------------------------|
| `status`       | string | `"saved"`, `"nothing_to_save"`, `"error"`        |
| `commit`       | string | Short SHA of the commit                          |
| `files_staged` | number | Count of files staged and committed              |
| `push`         | string | `"pushed"`, `"push_failed"`, `"no_remote"`       |
| `branch`       | string | Branch name (auto-created if on main/master)     |
| `milestone`    | string | The milestone label used in the commit message   |

### Error outputs

```json
{ "status": "error", "reason": "not_a_git_repo" }
{ "status": "error", "reason": "commit_failed" }
{ "status": "nothing_to_save" }
```

### Behavior notes
- If on `main` or `master`, auto-creates a branch `prism/<sanitized-milestone>`.
- Stages all tracked file changes (`git add -u`).
- Stages new untracked files except those matching the blocklist (secrets, credentials, build artifacts, etc.).
- Commit message format: `wip: <milestone> [prism auto-save]`.
- Push is best-effort; sets upstream tracking if needed.
- Blocklist includes: `*.env*`, `*.pem`, `*.key`, `*credential*`, `*secret*`, `node_modules/`, `dist/`, `.next/`, `coverage/`, `.DS_Store`, etc.

---

## prism-telemetry.sh

Append-only JSONL telemetry log for self-improvement analytics.

### Usage

```
bash scripts/prism-telemetry.sh record   <root> <event-type> '<data-json>'
bash scripts/prism-telemetry.sh summary  <root> [--last-n N]
bash scripts/prism-telemetry.sh failures <root> [--cluster]
```

| Arg          | Required | Description                                      |
|--------------|----------|--------------------------------------------------|
| `root`       | yes      | Project root directory                           |
| `event-type` | record   | One of the valid event types (see below)         |
| `data-json`  | record   | JSON object with event data (default: `{}`)      |
| `--last-n`   | summary  | Number of recent events to analyze (default: 20) |
| `--cluster`  | failures | Group failures by normalized error pattern       |

### Valid event types

`build_start`, `build_complete`, `build_fail`, `worker_complete`, `worker_fail`,
`guardian_retry`, `qa_pass`, `qa_fail`, `ship`, `user_intervention`, `stage_skip`,
`discovery_complete`, `gemini_fallback`

### Subcommand: `record`

Appends a single JSONL line to `<root>/.prism/telemetry.jsonl`.

**Stdout:** `OK: recorded build_complete -> /tmp/prism-telemetry-{PID}.json`

**JSON (also the JSONL line appended to the log):**

```json
{
  "timestamp": "2026-03-28T10:00:00Z",
  "epoch_ms": 1774965600000,
  "event_type": "build_complete",
  "change_name": "add-auth",
  "duration_ms": 45000,
  "metadata": {
    "worker_count": 4,
    "files_changed": 12
  }
}
```

`change_name` and `duration_ms` are extracted from `data-json` if present; remaining fields go into `metadata`.

### Subcommand: `summary`

**Stdout:** `OK: summary builds=5 success_rate=0.8 -> /tmp/prism-telemetry-{PID}.json`

**JSON:**

```json
{
  "total_builds": 5,
  "success_rate": 0.8,
  "avg_build_duration": 42000,
  "most_common_failures": [
    { "pattern": "type errors", "count": 2 }
  ],
  "guardian_retry_rate": 0.2,
  "user_intervention_rate": 0.1,
  "events_analyzed": 20
}
```

### Subcommand: `failures`

**Stdout (no cluster):** `OK: 3 failures -> /tmp/prism-telemetry-{PID}.json`

**JSON:** Array of failure event objects from the JSONL log.

**Stdout (--cluster):** `OK: 2 failure clusters -> /tmp/prism-telemetry-{PID}.json`

**JSON (clustered):**

```json
[
  {
    "pattern": "type errors in auth module",
    "count": 3,
    "examples": [ { "timestamp": "...", "event_type": "build_fail", "metadata": {} } ],
    "first_seen": "2026-03-25T10:00:00Z",
    "last_seen": "2026-03-28T10:00:00Z"
  }
]
```

### Key fields (record entry)

| Field         | Type        | Notes                                        |
|---------------|-------------|----------------------------------------------|
| `timestamp`   | string      | ISO-8601 UTC                                 |
| `epoch_ms`    | number      | Unix epoch milliseconds                      |
| `event_type`  | string      | One of the valid event types                 |
| `change_name` | string/null | Extracted from data-json if present          |
| `duration_ms` | number/null | Extracted from data-json if present          |
| `metadata`    | object      | Remaining data-json fields after extraction  |

### Key fields (summary)

| Field                    | Type        | Notes                                  |
|--------------------------|-------------|----------------------------------------|
| `total_builds`           | number      | Count of build_complete + build_fail   |
| `success_rate`           | number/null | Ratio as decimal (0.0 - 1.0)          |
| `avg_build_duration`     | number/null | Average ms for successful builds       |
| `most_common_failures`   | array       | Top 5 failure patterns                 |
| `guardian_retry_rate`    | number/null | Ratio of guardian_retry to total_builds|
| `user_intervention_rate` | number/null | Ratio of user_intervention to total_builds |
| `events_analyzed`        | number      | How many events were included          |

### Notes
- Requires `jq`.
- Storage format is JSONL (one JSON object per line) at `<root>/.prism/telemetry.jsonl`.
- Append-only -- the log file is never rewritten.
- Failure clustering normalizes error strings: lowercase, first 40 chars, alphanumeric only.
- The `failures` subcommand matches `fail`, `error`, and `fallback` event types.

---

## prism-gemini-worker.sh

Gemini API adapter: reads files into a prompt, calls Google's Gemini API with structured JSON mode, writes output files to a staging directory, verifies them, then promotes to the project root.

Unlike other scripts, this adapter does **not** write to a shared `/tmp/prism-{name}-{PID}.json` temp file. It writes its result to `.prism/staging/{worker_id}/result.json` and prints a one-line summary to stdout.

### Usage

```
echo '<json_payload>' | bash scripts/prism-gemini-worker.sh <root> <worker_id> [--dry-run]
```

| Arg          | Required | Description                                     |
|--------------|----------|-------------------------------------------------|
| `root`       | yes      | Project root directory                          |
| `worker_id`  | yes      | Worker ID string (used for staging path)        |
| `--dry-run`  | no       | Validates input and prints prompt; skips API call |
| Stdin        | yes      | JSON task payload (see below)                   |

### Stdin format

```json
{
  "task": "Add type definitions for the auth module",
  "files_to_read": ["src/types.ts", "src/auth.ts"],
  "constraints": "TypeScript strict mode, no any",
  "shared_context": "...",
  "model": "gemini-2.5-pro"
}
```

| Field            | Required | Description                                      |
|------------------|----------|--------------------------------------------------|
| `task`           | yes      | Natural-language task description                |
| `files_to_read`  | no       | Files to include in the prompt (max 10, 100KB each) |
| `constraints`    | no       | Additional constraints passed to the model       |
| `shared_context` | no       | Shared context from the orchestrator             |
| `model`          | no       | Gemini model name (default: `gemini-2.5-pro`)    |

### Stdout

```
OK: {worker_id} — 2 files written -> .prism/staging/{worker_id}/result.json
FAIL: {worker_id} — {reason} -> .prism/staging/{worker_id}/result.json
```

Exit code is always `0`. Check the result JSON for logical errors.

### Result file: `.prism/staging/{worker_id}/result.json`

**Success:**

```json
{
  "status": "completed",
  "worker_id": "w1",
  "provider": "google",
  "model": "gemini-2.5-pro",
  "file_manifest": [
    { "path": "src/types.ts", "bytes": 1234 }
  ]
}
```

**Failure:**

```json
{
  "status": "failed",
  "worker_id": "w1",
  "provider": "google",
  "model": "gemini-2.5-pro",
  "reason": "safety_block",
  "file_manifest": []
}
```

### Key fields

| Field           | Type    | Values / Notes                                                    |
|-----------------|---------|-------------------------------------------------------------------|
| `status`        | string  | `"completed"` or `"failed"`                                       |
| `worker_id`     | string  | Echoes the `worker_id` CLI arg                                    |
| `provider`      | string  | Always `"google"`                                                 |
| `model`         | string  | Model used (from stdin or default)                                |
| `file_manifest` | array   | Files promoted to project root on success; empty on failure       |
| `reason`        | string  | Present on failure: `"safety_block"`, `"no_candidates"`, `"bad_finish_reason"`, `"invalid_json_response"`, `"api_error"`, `"missing_api_key"`, `"file_limit_exceeded"`, `"input_too_large"`, `"malformed_input"` |

### Staging and promotion flow

1. Model output is written to `.prism/staging/{worker_id}/` (never directly to project root).
2. Each output file is verified (exists, non-empty, path traversal rejected).
3. On success, all staged files are atomically promoted to the project root.
4. On failure, staged files are cleaned up; `result.json` is preserved for diagnostics.

### Notes
- Requires `jq` and `curl`.
- API key must be stored in the macOS Keychain as `prism-google` (see `references/key-management.md`).
- `--dry-run` validates input and prints the assembled prompt without making an API call.
- Retries 5xx errors up to 3 times with exponential backoff.
- Parallel safety: each worker uses an isolated staging directory keyed by `worker_id`.

---

## prism-deploy.sh

Deploys a project to Vercel via CLI. Handles token retrieval, CLI installation,
env var sync, health verification, and deploy state persistence.

### Usage

```
bash scripts/prism-deploy.sh <project_root> [mode]
```

| Arg             | Required | Description                                    |
|-----------------|----------|------------------------------------------------|
| `project_root`  | yes      | Project root directory                         |
| `mode`          | no       | `"preview"` (default), `"production"`, `"status"` |

### Stdout

```
OK: url=https://my-app-abc123.vercel.app mode=preview -> /tmp/prism-deploy-{PID}.json
FAIL: reason=no_token -> /tmp/prism-deploy-{PID}.json
```

### Temp file: `/tmp/prism-deploy-{PID}.json`

```json
{
  "status": "ok|fail",
  "url": "https://...",
  "mode": "preview|production",
  "reason": null,
  "project_id": null,
  "duration_ms": 45000,
  "env_synced": 3,
  "detail": ""
}
```

### Key fields

| Field         | Type    | Values / Notes                                                    |
|---------------|---------|-------------------------------------------------------------------|
| `status`      | string  | `"ok"` or `"fail"`                                                |
| `url`         | string  | Vercel deploy URL on success; `null` on failure                   |
| `mode`        | string  | `"preview"` or `"production"`                                     |
| `reason`      | string  | Present on failure: `"no_token"`, `"no_cli"`, `"install_failed"`, `"no_npm"`, `"not_deployable"`, `"build_error"`, `"timeout"`, `"auth_401"`, `"forbidden_403"`, `"rate_limited_429"`, `"network"`, `"conflict"`, `"unhealthy"`, `"no_url_parsed"` |
| `env_synced`  | number  | Count of Prism-managed env vars pushed to Vercel                  |
| `duration_ms` | number  | Deploy duration in milliseconds                                   |
| `detail`      | string  | Additional error context (last 5 lines of stderr on failure)      |

### Notes
- Requires `jq` and `curl`.
- Token retrieved from macOS Keychain (`prism-vercel`), passed via env var (never CLI args).
- Auto-installs Vercel CLI via `npm i -g vercel` if missing.
- Verifies deploy URL health with up to 3 retries at 15s intervals.
- Persists deploy state to `$PROJECT_ROOT/.prism/deploy-state.json`.
- Records telemetry via `prism-telemetry.sh` (`deploy_start`, `deploy_complete`, `deploy_fail`).
- Uses portable timeout (background + wait + kill) instead of GNU `timeout`.

---

## Typed Bridge CLI Commands (Ship Stage)

These commands are implemented in TypeScript (`packages/orchestrator/src/cli.ts`) and
invoked via `npx tsx packages/orchestrator/src/cli.ts <command> <args>`. They output
JSON to stdout and use exit code 0 for success, 1 for errors.

---

## ship

Squashes branch commits, pushes, creates PR via `gh`, and tags with spec-derived slug.

### Usage

```
npx tsx packages/orchestrator/src/cli.ts ship <projectRoot> <specId> [--base main] [--message "override"]
```

| Arg         | Required | Description                                 |
|-------------|----------|---------------------------------------------|
| `projectRoot` | yes    | Project root directory                      |
| `specId`      | yes    | Spec entity ID for commit message/tag       |
| `--base`      | no     | Base branch (default: `main`)               |
| `--message`   | no     | Override commit message                     |

### Output JSON

```json
{
  "status": "shipped | partial | failed",
  "squash": { "status": "squashed | skipped | failed", "commit": "abc1234", "message": "feat: ..." },
  "push": { "status": "pushed | no_remote | failed", "branch": "feat/..." },
  "pr": { "status": "created | already_exists | gh_not_installed | failed", "url": "https://..." },
  "tag": { "status": "created | already_exists | failed", "name": "prism/..." },
  "spec_summary": "...",
  "review_verdicts": { "engineering": "pass", "qa": "pass", "design": null, "codex": null }
}
```

---

## deploy-detect

Detects deployment platform from project config files.

### Usage

```
npx tsx packages/orchestrator/src/cli.ts deploy-detect <projectRoot>
```

### Output JSON

```json
{
  "platform": "vercel | netlify | railway | fly | render | none",
  "auto_deploy": true,
  "config_file": "vercel.json"
}
```

---

## deploy-trigger

Triggers deployment via platform CLI with optional health-check polling.

### Usage

```
npx tsx packages/orchestrator/src/cli.ts deploy-trigger <projectRoot> [--health-check]
```

### Output JSON

```json
{
  "platform": "vercel | netlify | railway | fly | render | none",
  "deploy_status": "triggered | not_triggered | cli_not_installed | failed",
  "health_status": "healthy | unhealthy | skipped"
}
```

---

## record-ship

Persists a durable ship receipt entity at `.prism/ships/{specId}/receipt.json`.

### Usage

```
npx tsx packages/orchestrator/src/cli.ts record-ship <projectRoot> <specId> < receipt-input.json
```

### Stdin JSON

```json
{
  "commitSha": "abc1234",
  "commitMessage": "feat: ...",
  "branch": "feat/...",
  "baseBranch": "main",
  "prUrl": "https://...",
  "tagName": "prism/...",
  "deployUrl": "https://...",
  "deployPlatform": "vercel",
  "specSummary": "...",
  "reviewVerdicts": { "engineering": "pass" }
}
```

### Output JSON

Full `ShipReceipt` entity with `id`, `shippedAt`, and all input fields.
