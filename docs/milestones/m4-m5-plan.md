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

## M5: Desktop Shell Enablement (Electron)

### Goal
Ship a macOS Electron app that gives non-developers a visual workspace for Prism. Core stays a library; the shell is a thin rendering client. No terminal required.

### Why Electron, Not Tauri

The original plan specified Tauri. Electron wins for Prism because:
- **Main process is Node.js.** All existing packages (`@prism/core`, `@prism/workspace`, `@prism/orchestrator`, `@prism/memory`, `@prism/guardian`, `@prism/execution`) import directly. No sidecar, no WASM compilation, no serialization boundary gymnastics.
- **`better-sqlite3` works natively** in Electron's main process. No need for `sql.js` WASM fallback.
- **Proven at scale.** VS Code, Cursor, Linear, Notion desktop, Slack. Known footguns (memory, bundle size, startup) are all solvable.
- **One language.** TypeScript end-to-end. No Rust learning curve, no cross-language debugging.

Trade-off accepted: larger binary (~120MB vs ~8MB Tauri), higher memory baseline. For a desktop workspace app targeting macOS-first, this is fine.

### What This Changes

Today, Prism Core is consumed only by CLI scripts and the skill bridge. After M5, a macOS Electron app renders a workspace UI powered by the same packages.

```
┌─────────────────────────────────────────────┐
│  Electron                                    │
│  ┌────────────────────────────────────────┐  │
│  │  Renderer Process (React)              │  │
│  │  Chat pane (40%) + Workspace pane (60%)│  │
│  └──────────────┬─────────────────────────┘  │
│                 │ contextBridge / ipcRenderer │
│  ┌──────────────┴─────────────────────────┐  │
│  │  Main Process (Node.js)                │  │
│  │  ┌──────────┐ ┌───────────────┐        │  │
│  │  │@prism/   │ │@prism/        │        │  │
│  │  │workspace │ │orchestrator   │        │  │
│  │  └──────────┘ └───────────────┘        │  │
│  │  ┌──────────┐ ┌───────────────┐        │  │
│  │  │@prism/   │ │@prism/        │        │  │
│  │  │memory    │ │guardian       │        │  │
│  │  └──────────┘ └───────────────┘        │  │
│  │  SQLite (better-sqlite3, WAL mode)     │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### What Already Exists

These are NOT new code to write. They already exist and will be consumed directly:

| Package | What it provides to the shell |
|---------|-------------------------------|
| `@prism/workspace` | `WorkspaceFacade` — project list, health badges, resume, search, event log, integration cabinet |
| `@prism/orchestrator` | `resumeProject()`, `createSpec()`, `createPlan()`, `runVerificationGate()`, workflow state |
| `@prism/memory` | Artifact repositories, checkpoint read/write, product memory |
| `@prism/guardian` | Verification, release state, review orchestration |
| `@prism/core` | Entity types, workflow phases, gate definitions |

The app-facing API is NOT a new package. It's a thin typed layer in `apps/desktop/src/main/api.ts` that aggregates calls to existing packages and exposes them via Electron IPC.

### Phases

#### M5.1 — Electron Scaffold + IPC Layer

Directory: `apps/desktop/`

Deliverables:
- Electron app scaffolded with `electron-forge` (Vite plugin for fast dev)
- Main process: imports `@prism/workspace`, `@prism/orchestrator` directly
- **Prerequisite: Script dependency audit** — Core services (resumeProject, runVerificationGate) shell out to bash scripts (prism-verify.sh, prism-save.sh, prism-supervisor.sh) that depend on jq, npx, git. Audit every shell-out path and determine: (a) rewrite as pure TypeScript, (b) bundle the script + declare system deps, or (c) mark as "CLI-only, not available in desktop." This must be resolved before IPC handlers can reliably call these services.
- **5-second SQLite poll for external changes** — When the CLI writes artifacts via its own WorkspaceFacade instance, the desktop's SQLite index stays stale. Add a polling mechanism (re-query key tables every 5 seconds or check WAL file mtime) to detect external writes and refresh the UI. Prevents the desktop and CLI from disagreeing on project state.
- `apps/desktop/src/main/api.ts` — typed API aggregating existing package calls. Note: the API layer resolves project IDs to projectRoot paths via the ProjectRegistry, since core services take `(projectRoot: AbsolutePath, projectId: EntityId, changeName?: string)`, not just IDs:
  - `workspace.status()` → `WorkspaceFacade.workspaceStatus()`
  - `workspace.listProjects()` → `ProjectRegistry.list()`
  - `project.resume(id)` → registry.get(id).rootPath → `resumeProject(rootPath, id, changeName?)`
  - `project.createSpec(id, spec)` → registry.get(id).rootPath → `createSpec(rootPath, spec)`
  - `project.runVerification(id)` → registry.get(id).rootPath → `runVerificationGate(rootPath)`
  - `project.health(id)` → `ProjectHealth.computeBadge(id)`
- `apps/desktop/src/main/ipc.ts` — typed IPC channel definitions using `contextBridge`
- `apps/desktop/src/preload/index.ts` — exposes typed API to renderer via `contextBridge.exposeInMainWorld`
- Renderer: React + Vite, loads DESIGN.md fonts (Fraunces, Instrument Sans, Geist)
- Proof: `npm run dev` launches a macOS window showing real workspace data

IPC pattern (Electron standard):
```typescript
// main/ipc.ts — register handlers
ipcMain.handle('workspace:status', () => api.workspace.status());
ipcMain.handle('project:resume', (_, id) => api.project.resume(id));

// preload/index.ts — expose to renderer
contextBridge.exposeInMainWorld('prism', {
  workspace: { status: () => ipcRenderer.invoke('workspace:status') },
  project: { resume: (id) => ipcRenderer.invoke('project:resume', id) },
});

// renderer — consume
const status = await window.prism.workspace.status();
```

Exit criteria:
- `npm run dev` launches a macOS Electron window
- Window renders real project list from `~/.prism/workspace.db`
- IPC types are shared between main and renderer (single source of truth)
- All existing package tests still pass (no changes to core packages)

Test requirements (M5.1):
- Unit: `api.ts` — 6 wrapper functions tested with Result<T,E> ok/error paths
- Unit: `result.ts` — ok/error construction, error code mapping
- Type: `ipc-channels.ts` — compile-time check that all channels have handlers + preload entries
- E2E (Playwright): app launches, window appears, renders workspace data

#### M5.2 — Core Views (Design System Applied)

Screen Hierarchy (Information Architecture):

**Home View (no project selected):**
1st: Project list with health badges (primary workspace content)
2nd: Workspace status summary (Fraunces 2xl, `#FAFAF7` on `#1A1917`)
3rd: "Start new project" action (amber `#C47A2A` fill CTA, white text)

**Project View (split-pane active):**
LEFT PANE (40% — Chat):
  1st: Current phase indicator (always visible, pinned top — Instrument Sans sm semibold, amber accent for active phase)
  2nd: Latest message / agent response (scrollable main area — Instrument Sans md)
  3rd: Input area + "Build" action (pinned bottom — amber fill CTA)
  Rule: chat pane has 3 zones (top bar, scroll area, input dock). Nothing else competes.

RIGHT PANE (60% — Workspace):
  1st: Active artifact (spec, plan, or verification result — ONE at a time, not cards)
  2nd: Artifact metadata (status, timestamps — Geist Mono xs, `neutral-500`)
  3rd: Navigation tabs for artifact types (specs | plans | runs | reviews)
  Rule: workspace pane shows the current artifact in full. Tab switching, not card grids.

**Resume View (returning to existing project):**
  1st: Checkpoint summary (Fraunces xl, what happened last — `#FAFAF7`)
  2nd: Recommended next action (amber fill CTA)
  3rd: Session history (collapsed by default, expandable)

Deliverables:
- Split-pane layout: 40% chat / 60% workspace, user-resizable, min 280px per pane. Divider: 1px `neutral-800` (`#242320`). Pane backgrounds: `neutral-900` (`#1A1917`).
- Dark mode default: page bg `#1A1917`, elevated surfaces `#242320`, deep bg `#121110`. Text: `#FAFAF7`. Accent: `#C47A2A` (fills), `#D4923A` (text on dark). Border: 1px `neutral-800`.
- Project list view: project name in Instrument Sans md (16px), health badge as colored dot (8px, border-radius full) — sage `#2D6A4F` healthy, amber `#D4A017` warning, red `#C1292E` error, `neutral-400` new. Row padding: lg (24px) horizontal, sm (8px) vertical. Active row: `accent.subtle-bg.dark` (`#2A2118`).
- Project detail view: artifact displayed in workspace pane per screen hierarchy spec above.
- Navigation: persistent back/home icon (top-left, 44px touch target, `neutral-400` default, `#FAFAF7` hover) + `Cmd+\` keyboard shortcut to toggle sidebar. Sidebar: 280px wide, `#121110` bg, slides in 300ms ease-out. Hover-edge trigger (8px invisible hit area) as secondary path. First-run: sidebar starts expanded.
- Typography applied: Fraunces 300 weight for display (3xl 48px hero, 2xl 36px titles, xl 28px sections). Instrument Sans for body (md 16px), labels (sm 14px semibold), secondary (xs 12px). Geist Mono for code/data (13px, tabular-nums).
- No loading chrome: text writes in at ~40 chars/second in word-fragment groups. >3s wait: bg darkens to `#121110`, placeholder text fades in. No spinners, no progress bars, no skeleton screens.
- Empty states: Fraunces xl heading + Instrument Sans sm context + amber CTA. Warm, directive, never just "No items found." (See interaction state table for per-feature copy.)
- Light/dark mode toggle: sun/moon icon in sidebar footer. Defaults to dark. Manual toggle only (no system preference detection in M5). All DESIGN.md light-mode tokens (`#FAFAF7` base, `#F3F2EE` surfaces, `#8A5520` accent text) apply when toggled.

Interaction States:

| Feature | Loading | Empty | Error | Success | Partial |
|---------|---------|-------|-------|---------|---------|
| Project list | Immediate shell (`#1A1917` bg), project names fade in 0→1 opacity over 300ms as SQLite returns | Fraunces xl: "Nothing here yet." + Instrument Sans sm: "Open a terminal in any project folder and run `prism init` to register it." + amber CTA: "Register a project" | Instrument Sans sm, `error` red: "Couldn't read workspace. [Try again]" with retry CTA | N/A (list is the default state) | Projects load one-by-one as registry resolves paths |
| Health badges | Neutral-400 dot (unknown) until computed | Gray dot + "new" label | Amber dot + "check failed" tooltip | Green/amber/red dot per health status | Badge updates independently of project name |
| Chat pane (thinking, >3s) | First 3s: no change (confidence). After 3s: input area text placeholder fades to "Prism is thinking..." in neutral-400 italic. Pane background shifts from `#1A1917` to `#121110` (subtle darken = "quieter"). No spinner. No animation. | N/A | N/A | N/A | N/A |
| Chat pane (responding) | Text writes in at ~40 chars/second (thought-pace per DESIGN.md). No cursor blink. Characters appear in groups of 3-5 (word fragments, not one-by-one). | N/A | N/A | N/A | N/A |
| Chat pane (empty/new session) | N/A | Fraunces xl: "What do you want to build?" centered vertically. Instrument Sans sm below: "Describe your idea and Prism will figure out the rest." Input area active with amber border. | N/A | N/A | N/A |
| Build button | Amber fill dims to 60% opacity, label changes to "Building..." — no spinner. Button disabled. | N/A | Label: "Build failed" in error red for 3s, then reverts to "Build". Error details appear in chat. | Label: "Done" in sage `#2D6A4F` for 2s, then reverts. | N/A |
| Verification results | N/A | N/A | Structured failure: check name (Instrument Sans sm bold), details (Instrument Sans sm), file path + line (Geist Mono xs, clickable). Red left accent line (2px `#C1292E`). | Green left accent line (2px `#2D6A4F`), check name + "passed" | Mixed: passing checks collapsed, failing checks expanded |
| Workspace artifact (right pane) | Content fades in 0→1 over 300ms | Instrument Sans md: "No {spec|plan|run} yet for this project." + context sentence about what creates one. | Instrument Sans sm, error red: "Couldn't load {artifact}. [Retry]" | N/A (artifact display is default) | N/A |
| Resume/checkpoint display | N/A | Instrument Sans md: "No checkpoint saved. Start a session to create one." | N/A | Checkpoint summary renders immediately (data is local SQLite, fast) | N/A |
| Phase indicator | All 7 phases shown as dots/labels. Active phase: amber. Future: neutral-400. Past: neutral-500. | N/A | Phase stuck >10min: subtle amber pulse on active phase dot (1s cycle) | Phase complete: dot transitions from amber to sage over 500ms | N/A |

Accessibility & Window Behavior:

- **Minimum window size:** 900×600. Below 900px width, split-pane collapses to single-pane mode (workspace pane hidden, chat pane full-width, tab to switch between panes).
- **Keyboard navigation:**
  - `Tab` / `Shift+Tab`: move focus through interactive elements in reading order
  - `Cmd+\`: toggle sidebar
  - `Cmd+1` / `Cmd+2`: switch focus between chat pane / workspace pane
  - `Cmd+Enter`: submit message / trigger build (same as clicking Build CTA)
  - `Escape`: close sidebar, dismiss modals, cancel current input
  - Focus ring: 2px amber `#C47A2A` outline, 2px offset. Visible on all interactive elements when keyboard-navigating.
- **ARIA landmarks:** `<main>` for workspace content, `<nav>` for sidebar, `<aside>` for chat pane, `role="status"` for phase indicator (live region, announces phase changes to screen readers).
- **Focus management:** When sidebar closes, focus returns to last focused element in main content. When project opens, focus moves to chat input. When build completes, focus moves to result.
- **Color contrast:** All text meets WCAG AA. Amber text on dark uses `#D4923A` (not `#C47A2A`). Status colors tested against `#1A1917` bg.
- **Touch targets:** All clickable elements minimum 44×44px (relevant for trackpad users with accessibility needs).

Exit criteria:
- All 5 DESIGN.md typography tiers render correctly
- Dark mode passes WCAG AA with mode-aware accent tokens
- Split-pane is user-resizable with 40/60 default, collapses to single-pane below 900px
- Navigation collapses fully during sessions, toggle via persistent icon + `Cmd+\`
- Keyboard navigation reaches all interactive elements with visible focus ring
- At least one view (project list) shows real data with proper badges

Test requirements (M5.2):
- Component: ProjectList (renders projects, health badges, empty state with 0 projects)
- Component: ProjectDetail (specs, plans, runs display)
- Component: SplitPane (resizable, 40/60 default, respects min widths)
- Component: CollapsibleNav (hover trigger, keyboard shortcut, hides during sessions)
- Visual: baseline screenshots for dark mode + light mode (regression detection)

#### M5.3 — Chat Integration + Session Flow

This is the critical view. The chat pane is where non-developers interact with Prism.

**Prerequisite: Session model design** — The core has checkpoints, specs, plans, runs, and workflow state, but no "session" entity. M5.3 requires:
- A `Session` entity (id, projectId, startedAt, messages[], currentPhase, checkpointId)
- Message persistence (where do chat messages live? SQLite table? JSON artifact?)
- Agent streaming protocol (how does the renderer receive incremental agent output?)
- "Build" button semantics (what does it actually invoke? The skill bridge? A direct orchestrator call?)
This prerequisite must be designed before M5.3 implementation begins. It may belong in `@prism/core` entities or as a new workspace table.

Deliverables:
- Chat message styling: User messages right-aligned with amber subtle-bg (`#2A2118`), rounded corners (md 8px). Prism responses left-aligned, no background (base `#1A1917`). Both Instrument Sans md. Alignment creates instant visual parsing.
- Build button semantics: contextual, only appears after Prism generates a plan. Clicking triggers `resumeProject()` to advance workflow from plan → execute. Before a plan exists, the chat input IS the action — no Build button visible. Button: amber fill `#C47A2A`, white text, pinned to input dock.
- Chat pane with message history (user + Prism responses)
- Session state tied to Prism workflow phases (understand → identify_problem → spec → plan → execute → verify → release)
- Phase indicator showing current workflow stage (7 phases from `DEFAULT_WORKFLOW_SEQUENCE` in workflow.ts)
- Spec/plan display inline in chat (not separate views)
- "Build" button that triggers execution without terminal knowledge
- Verification results shown as structured pass/fail list (not cards, not terminal output — see interaction state table for visual spec)
- Resume: re-opening a project shows the last checkpoint context

What this does NOT include:
- Actual Claude API integration (that's the skill bridge, already exists)
- Terminal emulator embedded in the app
- Code editor

Exit criteria:
- A user can see their Prism session state without opening a terminal
- Workflow phase transitions are visible in the UI
- Verification results render as structured pass/fail list (per interaction state table)
- Resume from checkpoint displays the summary, not raw JSON

Test requirements (M5.3):
- Component: ChatPane (message history renders, scroll behavior)
- Component: PhaseIndicator (all 7 workflow phases display correctly, current phase highlighted)
- Component: VerificationCard (pass/fail states, failure details readable)
- Component: ResumeDisplay (checkpoint summary, not raw JSON)
- E2E (Playwright): open project → see session state → phase indicator matches workflow

#### M5.4 — Packaging & Distribution

Deliverables:
- macOS `.dmg` build via `electron-builder`
- Code signing configuration (Apple Developer ID)
- Auto-update via `electron-updater` (GitHub Releases as update source)
- App icon and branding (amber accent from DESIGN.md)
- First-run experience (user journey):

  **Step 1: Install** — Drag to Applications. Standard macOS. No friction.
  *User feels: familiar, safe.*

  **Step 2: First launch** — Window appears instantly (dark `#1A1917`, Fraunces 3xl centered: "Prism"). Workspace initialization (`~/.prism/` creation) happens in background (<500ms). No setup wizard. No account creation. No onboarding carousel.
  *User feels: this is fast, this respects my time.*

  **Step 3: Empty home** — Sidebar expanded (first-run default). Project list area shows the empty state: Fraunces xl "Nothing here yet." with context text and amber CTA "Register a project". Below the CTA, one sentence: "Point Prism at a folder and describe what you want to build."
  *User feels: I know exactly what to do next. Not overwhelmed.*

  **Step 4: First project** — User clicks CTA, native folder picker opens. Selects a folder. Project appears in list with "new" badge. Sidebar collapses. Split-pane opens. Chat pane shows: Fraunces xl "What do you want to build?" with active input area.
  *User feels: this is the moment. I'm talking to something that will build for me.*

  No terminal. No config files. No git knowledge. Four steps from install to first conversation.
- GitHub Actions CI: build + sign + publish `.dmg` on release tags

Exit criteria:
- `npm run make` produces a signed `.dmg` that installs and launches
- Auto-update checks GitHub Releases for new versions
- First launch creates `~/.prism/` workspace if it doesn't exist
- CLI skill and desktop app coexist (same `~/.prism/` workspace)

Test requirements (M5.4):
- E2E (Playwright): .dmg installs, app launches, first-run creates `~/.prism/`
- Unit: auto-update configuration points to correct GitHub Releases URL
- Integration: CLI and desktop app coexist — both can read/write workspace.db without corruption (busy_timeout test)

Test infrastructure:
- Two test layers: vitest (unit + component, fast) + Playwright (Electron E2E, slower)
- vitest config extended with `@testing-library/react` for component tests
- Playwright config for Electron: `electron.launch({ args: ['apps/desktop/dist/main.js'] })`
- CI: unit tests on every push, E2E on PR + release

### M5 Dependencies
- M4 complete (workspace substrate must exist for desktop to consume) ✓
- Electron 33+ (current stable, ESM support)
- React 19 for renderer
- electron-forge (Vite plugin) for dev tooling
- electron-builder for production builds
- Apple Developer account for code signing

### M5 Architecture Decisions (from eng review 2026-03-28)

1. **Inline SQL migrations as TS constants** — `workspace-database.ts` reads migration `.sql` files from disk at runtime via `readdirSync`. This breaks inside Electron's asar archive. Convert to a TypeScript file exporting migration strings. Eliminates filesystem dependency entirely.
2. **Add `apps/*` to monorepo workspaces** — Root `package.json` workspaces array is `["packages/*"]`. Must add `"apps/*"` so `apps/desktop/` can resolve `@prism/*` workspace dependencies.
3. **Add `busy_timeout` pragma (3000ms)** — CLI skill and desktop app will both access `~/.prism/workspace.db`. WAL mode handles concurrent reads, but concurrent writes can hit `SQLITE_BUSY`. A 3-second busy timeout handles transient contention gracefully.
4. **Wire `db.close()` into Electron lifecycle** — Register cleanup on `before-quit` and `will-quit` events. On macOS, closing all windows doesn't quit the app, so the database connection persists. Explicit cleanup prevents WAL checkpoint lock contention with CLI. Document that SQLite's built-in WAL recovery handles crash scenarios automatically.
5. **Shared IPC channel constants + mapped types** — Define all IPC channel names in `apps/desktop/src/shared/ipc-channels.ts` with TypeScript mapped types. Main process handlers, preload bridge, and renderer types all derive from this single source. Compile-time error if any channel is missing from any layer.
6. **Typed `Result<T, E>` wrapper on all IPC handlers** — Every IPC handler returns `{ok: true, data: T} | {ok: false, error: {code: string, message: string}}`. No raw throws across the IPC boundary. The renderer gets structured error info for user-friendly messages. Non-developers should never see a stack trace.
7. **Immediate window with async data hydration** — Show the Electron window immediately with a static shell (dark background `#1A1917`, app chrome, Fraunces title). Hydrate workspace data asynchronously via IPC after the window is visible. Prevents 2-3 second blank window during cold start. Matches DESIGN.md "no loading chrome" principle.
8. **Script dependency audit (from Codex outside voice)** — Core services shell out to bash scripts. Each script's dependencies must be mapped and resolved before the Electron IPC layer can reliably expose them. Some may need TypeScript rewrites; others may be CLI-only.
9. **Session model design prerequisite for M5.3 (from Codex outside voice)** — No session/chat entity exists in the core. M5.3 requires a session model (entity, persistence, streaming protocol) designed before implementation.
10. **5-second SQLite poll for external changes (from Codex outside voice)** — CLI writes bypass the desktop's writeCallback. Poll for external SQLite changes to keep the desktop in sync.
11. **API layer resolves IDs to paths via registry (from Codex outside voice)** — Core services take `projectRoot` not project IDs. The api.ts layer must do the registry lookup.

### M5 Risks
1. **`better-sqlite3` native module in Electron** — requires `electron-rebuild` or `@electron/rebuild`. Well-documented but can be fiddly with Electron version mismatches. Mitigate: pin versions, test rebuild in CI early.
2. **macOS notarization pipeline** — needs CI setup (Apple credentials in GitHub secrets). Can block distribution. Mitigate: set up signing in M5.4 as first task, not last.
3. **Scope creep into "building the full app"** — M5 is enablement + core views. The chat integration (M5.3) is the highest-risk phase for scope creep. The line is: display session state, don't orchestrate sessions. The skill bridge handles orchestration.
4. **Bundle size** — Electron + `better-sqlite3` + React. Expect ~150MB .dmg. Acceptable for macOS desktop app. Monitor but don't optimize prematurely.

---

## Sequencing

```
M4.1 (workspace bootstrap) ✓
  → M4.2 (SQLite) ✓
  → M4.3 (integrations cabinet) ✓
  → M4.4 (multi-project resolution) ✓
    → M5.1 (Electron scaffold + IPC)
      → M5.2 (core views + design system)
      → M5.3 (chat integration + sessions)  ← can overlap with M5.2
        → M5.4 (packaging + distribution)
```

M4 is complete. M5.2 and M5.3 can overlap (different renderer components, no shared state beyond IPC types from M5.1). M5.4 should start signing setup early (can run in parallel with M5.2/M5.3 core work).

## Estimated Scope

- M4: ~4 phases, moderate complexity, mostly TypeScript, one new dependency (SQLite) ✓ COMPLETE
- M5: ~4 phases, moderate complexity, all TypeScript, Electron + React. No new language. ~30 min CC per phase.

## What This Does NOT Include

- Full product UI design or implementation (M5 covers core views, not every screen)
- User authentication or accounts
- Cloud sync or collaboration
- Provider explosion (many AI providers)
- Enterprise features
- Terminal emulator in the app
- Code editor in the app
- Claude API integration in the app (skill bridge handles this)
- Windows/Linux builds (macOS-first, cross-platform deferred)
- Settings/preferences UI (use workspace.json directly for now)
- Notification system (push notifications for run completion, etc.)
- Multi-window support (single window per workspace)
- Plugin/extension system

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (DIFF via /ship) | 0 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score: 3/10 → 8/10, 10 decisions |

- **UNRESOLVED:** 0 across all reviews
- **VERDICT:** ENG + DESIGN CLEARED — ready to implement
