# M4 & M5 Implementation Plan

## Context

M3 (Skill-Bridge) is functionally complete. Dogfooding is ongoing but Fraser is choosing to begin M4/M5 planning and implementation in parallel. The typed core is solid: domain entities, workflow engine, gate evaluator, bridge CLI, and artifact repositories all exist and pass tests.

## What Already Exists

The domain model (`packages/core/src/entities.ts`) already defines:
- `Workspace` — id, homePath, activeProjectId, settingsPath, runtimeDatabasePath
- `Project` — id, name, slug, status, rootPath, primaryPlatform, productType
- `IntegrationConnection` — provider, status, scope, approvalRequired
- `ProviderProfile` — provider, capabilities, authMethod, availabilityStatus

The `packages/memory` package has:
- `ProjectArtifactLocator` interface and `prismArtifactLocator` implementation
- All artifact path resolution for a single project root
- Repository contracts for specs, plans, reviews, runs, checkpoints, release state

Architecture decisions already made:
- ADR-002: Hybrid local storage (files for truth, SQLite for indexed state)
- Storage layout doc defines `~/.prism/` workspace home and `<project>/.prism/` project artifacts
- Module boundaries define `packages/ui` for app-facing contracts

## M4: Local-First Workspace Substrate

### Goal
Support multiple projects with durable memory and operational state from a single Prism installation.

### What This Changes

Today, every operation takes a `projectRoot: AbsolutePath` and computes paths from there. There is no workspace-level state, no project registry, no way to switch between projects, and no SQLite layer.

After M4:
- `~/.prism/` exists as workspace home
- A project registry tracks known projects
- SQLite stores indexed workspace state
- Artifact resolution works across projects
- Integrations have a cabinet model (workspace-level, not project-level)

### Phases

#### M4.1 — Workspace Bootstrap

New package: `packages/workspace` (or extend `packages/memory`)

Deliverables:
- `WorkspaceManager` that initializes `~/.prism/` on first use
- `workspace.json` settings file with workspace ID, default project, preferences
- `ProjectRegistry` — CRUD for tracked projects (backed by `~/.prism/projects.json` initially)
- `registerProject(rootPath)` / `listProjects()` / `setActiveProject(id)` / `removeProject(id)`
- Wire into existing `projectPaths()` so artifact locator resolves from registry

Exit criteria:
- Can register 3+ projects and switch between them
- Workspace home is created and idempotent
- All existing tests still pass (no breaking changes to per-project APIs)

#### M4.2 — SQLite Workspace State

Deliverables:
- Add `better-sqlite3` (or `sql.js` for portability) dependency
- `WorkspaceDatabase` class managing `~/.prism/workspace.db`
- Schema: `projects`, `runs`, `reviews`, `specs` index tables
- Write-through: when artifact repos write files, they also index into SQLite
- Read queries: `recentRuns(limit)`, `projectStatus(id)`, `searchSpecs(query)`
- Migration system (numbered SQL files, version tracking)

Exit criteria:
- SQLite indexes stay consistent with file artifacts
- Queries return correct results across multiple registered projects
- Database is optional (graceful degradation if missing/corrupt)

#### M4.3 — Integrations Cabinet

Deliverables:
- `IntegrationCabinet` manages `~/.prism/integrations/` directory
- Cabinet stores connection metadata per provider (not secrets — those stay in keychain/env)
- `registerIntegration(provider, config)` / `listIntegrations()` / `getIntegration(provider)`
- Provider profiles stored at workspace level, shared across projects
- Validation: can a project use a given integration? (scope check)

Exit criteria:
- Integration metadata persists across sessions
- Projects can reference workspace-level integrations
- No secrets stored in plaintext files

#### M4.4 — Multi-Project Artifact Resolution

Deliverables:
- Extend `ProjectArtifactLocator` to resolve across projects via registry
- `WorkspaceArtifactLocator` wraps per-project locators
- Cross-project queries: "show me all specs across all projects"
- Progress surface: `workspaceStatus()` returns rollup of all project states

Exit criteria:
- Can query artifacts from any registered project
- Workspace status rollup is accurate
- Path resolution never leaks between projects

### M4 Dependencies
- No new external runtime dependencies beyond SQLite
- No changes to existing skill/bridge integration
- `packages/core` entities already define the needed types

### M4 Risks
1. SQLite in a Tauri context — need to pick a driver that works in both Node and Tauri (sql.js is WASM-based, works everywhere)
2. File watching for consistency — defer to M5, use write-through for now
3. Migration complexity — keep schema simple, version from day 1

---

## M5: Desktop Shell Enablement

### Goal
Prepare Prism Core for consumption by a Tauri desktop shell. Core stays a library; the shell is a thin client.

### What This Changes

Today, Prism Core is consumed only by CLI scripts and the skill bridge. After M5, a Tauri app can import core packages and render a workspace UI.

### Phases

#### M5.1 — App-Facing API Layer

New package: `packages/ui` (defined in module boundaries, not yet created)

Deliverables:
- `AppService` facade that exposes high-level operations:
  - `createProject()`, `openProject()`, `listProjects()`
  - `startSpec()`, `getSpec()`, `listSpecs()`
  - `runWorkflow()`, `getWorkflowState()`
  - `getCheckpoint()`, `resumeFromCheckpoint()`
  - `workspaceStatus()`, `projectStatus()`
- All methods return plain serializable objects (no class instances, no AbsolutePath branded types in return values)
- Error types are explicit union types, not thrown exceptions
- Every method is synchronous or returns a Promise (no callbacks, no event emitters at this layer)

Exit criteria:
- AppService can power a UI without importing memory/orchestrator/guardian directly
- All return types are JSON-serializable
- Comprehensive test coverage of the facade

#### M5.2 — IPC Contract for Tauri

Deliverables:
- Define Tauri command contract (TypeScript types that match Rust `#[tauri::command]` signatures)
- `packages/ui/src/ipc.ts` — typed IPC message definitions
- Request/response pairs for every AppService method
- Event types for push notifications (run progress, review complete, gate failure)
- Serialization boundary: all IPC payloads are plain JSON

Exit criteria:
- IPC types compile and match AppService signatures
- Event types cover all observable state changes
- No `AbsolutePath` or branded types cross the IPC boundary

#### M5.3 — Tauri Shell Scaffold

Deliverables:
- `apps/desktop/` — Tauri project scaffolded with `create-tauri-app`
- macOS-first configuration (signing, notarization config stubs)
- Rust side: thin command handlers that call into Node core via sidecar or WASM
- Frontend: minimal React/Solid shell that calls IPC commands
- Proof: can list projects, show workspace status, open a project view

Decision required: **Sidecar vs WASM**
- Sidecar: Tauri launches a Node process, communicates via stdio/IPC. Simpler migration path, full Node compatibility.
- WASM: Compile core to WASM, run in Tauri's webview. No sidecar, but requires all deps to be WASM-compatible (SQLite via sql.js works, fs access needs abstraction).
- Recommendation: **Start with sidecar** for speed, migrate to WASM if bundle size or startup time matters.

Exit criteria:
- `tauri dev` launches a macOS window
- Window shows real data from workspace registry
- No core logic lives in the Tauri app — it's purely a rendering shell

#### M5.4 — Packaging & Distribution

Deliverables:
- macOS `.dmg` build via Tauri
- Code signing configuration (Apple Developer ID)
- Auto-update configuration (Tauri updater plugin)
- First-run experience: workspace initialization flow
- CLI fallback: all features remain accessible via CLI even without desktop app

Exit criteria:
- Can build a signed `.dmg` that installs and launches
- Auto-update checks work (even if update server is stubbed)
- CLI and desktop app coexist without conflicts

### M5 Dependencies
- M4 complete (workspace substrate must exist for desktop to consume)
- Tauri v2 (stable, Rust-based)
- React or Solid for frontend (decision during M5.3)
- Apple Developer account for signing

### M5 Risks
1. Tauri + Node sidecar complexity — well-documented pattern but adds process management
2. macOS notarization pipeline — needs CI setup, can block distribution
3. Scope creep into "building the full app" — M5 is enablement, not the product UI

---

## Sequencing

```
M4.1 (workspace bootstrap)
  → M4.2 (SQLite)
  → M4.3 (integrations cabinet)
  → M4.4 (multi-project resolution)
    → M5.1 (app-facing API)
      → M5.2 (IPC contract)
        → M5.3 (Tauri scaffold)
          → M5.4 (packaging)
```

M4.1 and M4.2 could overlap. M4.3 is independent of M4.2. M5 phases are strictly sequential.

## Estimated Scope

- M4: ~4 phases, moderate complexity, mostly TypeScript, one new dependency (SQLite)
- M5: ~4 phases, higher complexity, introduces Rust/Tauri, packaging pipeline

## What This Does NOT Include

- Full product UI design or implementation
- User authentication or accounts
- Cloud sync or collaboration
- Provider explosion (many AI providers)
- Enterprise features
