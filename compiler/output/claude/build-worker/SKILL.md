---
name: build-worker
description: |
  Executes a single scoped build task from a decomposed dependency graph. Reads only the files and contracts it needs, writes working code, and returns a file manifest for verification and contract extraction.
  Activates on patterns:
  - TASK: .+
  - build worker .+
  - implement .+ (task|worker)
  - worker dispatch
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# Build Worker

**Version:** 1.0.0

## Purpose

Implements one decomposed unit of work from the Stage 3 dependency graph. Each worker is deliberately context-limited — it sees only its task, the files it must read, hard constraints from the spec, and validated contracts from prior workers. This isolation prevents context bleed between workers and keeps each dispatch fast and focused.

## Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | string | required | Plain-English description of exactly what this worker must implement. Should map to 1-3 spec requirements.  |
| `files_to_read` | array | required | List of relative file paths (max 10) the worker must read before starting. Includes relevant source files, types, and API definitions.  |
| `constraints` | string | required | Hard constraints from the spec and PRODUCT.md Architecture Decisions. Workers MUST NOT violate these (e.g., "Use PostgreSQL, not SQLite").  |
| `shared_context` | string | optional | Validated exported symbols, interfaces, and API contracts from prior workers that this worker depends on. Extracted from .prism/contracts/{worker-id}.json.  |
| `project_root` | filepath | required | Absolute path to the project root.  |
| `worker_id` | string | required | Unique identifier for this worker (e.g., "w3"). Used for registry tracking and contract storage.  |

## Outputs

| Name | Type | Description |
|------|------|-------------|
| `file_manifest` | string | Newline-separated list of all files created or modified, relative to project_root. The Operator uses this to run prism-verify.sh and extract contracts. Must be the last thing returned.  |
| `working_code` | file | One or more source files written to disk. Must be syntactically valid and satisfy the task constraints.  |

## Stages

### Stage 1: Read Context

Read all files listed in files_to_read. Read shared_context contracts from prior workers. Do NOT read anything outside this list. 

_Auto-advances on success._

### Stage 2: Plan Implementation

Silently determine the implementation approach. Identify what to create vs modify. Check constraints. No output at this stage. 

_Auto-advances on success._

### Stage 3: Write Code

Write all code for this task. Each file should be complete and syntactically valid. Do not leave TODO stubs or placeholder implementations. 

_Auto-advances on success._

### Stage 4: Self Verify

Re-read each written file and confirm it is syntactically valid and satisfies the task constraints. Fix any issues before returning. 

_Auto-advances on success._

### Stage 5: Return Manifest

Output the file manifest — a newline-separated list of all files created or modified. This MUST be the final output so the Operator can parse it. 

## Scripts

| Script | Path | When |
|--------|------|------|
| syntax-verify | `$SKILL_DIR/scripts/prism-verify.sh` | on_complete |
| registry-update | `$SKILL_DIR/scripts/prism-registry.sh` | on_complete |

## Rules

1. CONTEXT FIREWALL: Read ONLY files_to_read and shared_context. Never read the full spec, user conversation, or other workers' source files.
2. Never import or depend on files not listed in files_to_read or shared_context.
3. Code must be complete — no TODO comments, no placeholder implementations, no stub functions.
4. Constraints are hard limits. If a constraint makes the task impossible, return ERROR with explanation — do not silently ignore it.
5. The file manifest MUST be the last content in the response, one path per line.
6. Do not create new directories without listing them in the manifest.
7. Do not modify files outside the task scope, even if they look broken.
8. Empty output or unclear output is treated as failure by the Operator. Always return a manifest.
9. If a dependency's contract is missing from shared_context, halt and return ERROR — do not guess the interface.
10. Standalone UI screen tasks (landing pages, dashboards, signup flows) are handled by the Operator via Stitch at Stage 2.5 — you will not receive them. When you do receive visual tasks, write code that integrates into the existing project (components, styles, routes).

## Examples

**Input:** `TASK: Build the user authentication middleware. FILES TO READ: src/types/user.ts, src/lib/db.ts. CONSTRAINTS: Use JWT tokens, 24h expiry. No session cookies. SHARED CONTEXT: UserType interface from w1.`
**Expected:** Reads src/types/user.ts and src/lib/db.ts. Writes src/middleware/auth.ts with JWT validation logic. Returns manifest: "src/middleware/auth.ts" 

**Input:** `TASK: Create the login API route. FILES TO READ: src/middleware/auth.ts, src/types/user.ts. CONSTRAINTS: POST /api/auth/login, return JWT on success, 400 on invalid credentials.`
**Expected:** Writes src/app/api/auth/login/route.ts with POST handler. Returns manifest listing only modified files. 

## Eval Cases

### manifest_always_returned

**Input:** `TASK: Create a hello world function. FILES TO READ: src/index.ts. CONSTRAINTS: TypeScript only.`

**Must contain:**
- `src/`

**Must not contain:**
- `TODO`
- `placeholder`

### constraint_respected

**Input:** `TASK: Add data storage. FILES TO READ: src/types.ts. CONSTRAINTS: Use PostgreSQL, NOT SQLite.`

**Must contain:**
- `postgres`

**Must not contain:**
- `sqlite`
- `SQLite`

---
_Compiled by prism-compile.sh from build-worker.yaml_
