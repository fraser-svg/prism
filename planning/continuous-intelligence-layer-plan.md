# Plan: Make Prism Hunt for the Optimum Solution

## Context

Prism currently discovers **what to build** (Socratic discovery) but not **how best to build it**. The pipeline is spec-driven and deterministic — it takes the first viable path from discovery to build without researching alternatives, comparing approaches, or leveraging proven skills. The `research-gate.sh` hook enforces that research was *logged* but doesn't *do* the research. Workers execute tasks directly without checking if a library already solves the problem.

**Goal:** Prism should proactively hunt for the optimum solution at every stage — researching packages, comparing approaches, leveraging proven skills, and learning from every build. The user sees outcomes, not process. Prism acts on its intelligence silently.

**CEO Review Mode:** SCOPE EXPANSION. 8 expansions accepted, 1 deferred.

---

## Core Design Principle (from CEO review)

> The user only cares about the outcome and the function being achieved. Prism hunts for skills and solutions silently. It acts on its knowledge automatically. No announcements, no toolbox presentations, no "I found these skills." Just smarter builds.

---

## What Changes

### 1. Continuous Intelligence Layer (permeates every stage)

Not a single "research phase" — intelligence woven into every stage:

**Stage 1 (Discover):** Catalogue informs what questions to ask. If catalogue has domain matches, Prism silently adds relevant requirements to the spec draft and confirms: "I've included payment processing based on what we've built before. Sound right?" Max 2 nudges per discovery session (sort matching entries by `successCount` descending, break ties by `lastUsedAt` descending, take top 2).

**Stage 2 (Plan):** Full research + approach comparison (see sections 2-3 below).

**Stage 3 (Build):** Workers get research context. Guardian learns from failures and writes to catalogue.

**Stage 4 (Verify):** QA targets known failure patterns from catalogue. "Auth built with NextAuth.js: known issue with CSRF token rotation. Checking specifically for that."

**Files:** `SKILL.md` (all stage sections), `references/reviews/qa-review.md` (add failure pattern injection)

---

### 2. Research Phase (embedded in Stage 2, before planning review)

**Where:** After spec approval, before planning review. Not a new display stage — runs silently inside Stage 2.

**What it does:**
- For each requirement, parallel research subagents:
  1. Query the **Catalogue** (local, instant)
  2. Search npm/PyPI/crates.io for packages solving 80%+ of the requirement
  3. Search GitHub (`gh search code`, `gh search repos`) for proven implementations
  4. Scan available Claude Code skills that match the task domain
- All searches fire simultaneously (parallel execution)
- Stream progress to user ("Checking what's already out there...")
- Hard timeout at budget limit, use whatever results are available
- **Anti-hallucination:** Subagent prompt constrained to search-results-only (never recommend from training data). After subagent returns, verify each package exists (`npm info` / `pip show`). Drop any that don't.

**Complexity gating:**
- **Quick** (1-2 requirements): Catalogue query only (~0.5s)
- **Standard** (3-4 requirements): Package search + catalogue (30s budget)
- **Deep** (5+ requirements): Full sweep (2min budget)

**Research transparency:** Write to `.prism/research/{change}/`:
- `report.json` — structured findings
- `approaches.md` — human-readable comparison
- `decision.md` — selected approach and rationale

**Research orchestration:** Research is orchestrated via Agent tool subagents (not bash parallelism). The Operator dispatches multiple Agent-tool research subagents simultaneously — one per search source — matching the existing worker dispatch pattern. `prism-research.sh` handles only catalogue queries and result persistence (not network calls). Package verification (`npm info` / `pip show`) runs in parallel via backgrounded bash calls within the research subagent.

**Files to modify/create:**
- `SKILL.md` — Add research sub-step at the beginning of Stage 2, after spec approval
- `references/research-protocol.md` — New: research subagent prompt
- `scripts/prism-research.sh` — New: `run`, `log`, `summary` commands
- `packages/core/src/entities.ts` — Add `ResearchFinding`, `ResearchReport` types
- `packages/memory/src/paths.ts` — Add `researchDir` to artifact paths

**Graceful degradation:** All searches fail → proceed as today. Log `research_skipped` to telemetry.

---

### 3. Multi-Approach Planning (enhance Stage 2)

**Where:** Inside Stage 2, after research, before planning review.

**What it does:**
- Generate 2-3 competing approaches via subagent
- Present as visual comparison table (plain text in conversation + persisted to `.prism/research/{change}/approaches.md`):
  ```
  APPROACH        | EFFORT | RISK   | PROVEN?        | DEPENDENCIES
  ----------------|--------|--------|----------------|-------------
  ✅ NextAuth.js   | S      | Low    | Proven (3x)    | next-auth
  JWT custom      | M      | Medium | Emerging       | jsonwebtoken
  Clerk managed   | S      | Low    | Emerging       | @clerk/nextjs
  ```
- Auto-select top approach. User can override: "Want me to switch?"

**Confidence indicators** (based on catalogue data):
- **Proven** (10+ successful builds): "I'm very confident — used successfully many times"
- **Established** (3-9 successful builds): "This has worked well before"
- **Emerging** (< 3 successful builds): "This is newer territory — I'll be extra careful during QA"

**Complexity gating:** Inline builds (1-2 reqs) skip. Worker builds (3+) get comparison.

**Files to modify/create:**
- `SKILL.md` — Add approach comparison step in Stage 2
- `references/reviews/approach-comparison.md` — New: comparison subagent prompt
- `packages/core/src/entities.ts` — Add `ImplementationApproach`, `ApproachComparison` types

---

### 4. Skill Catalogue (grows over time)

**Where:** Cross-cutting. Persistent at workspace level (`.prism/skill-catalogue.json`).

**What it is:** Registry of proven solutions — libraries, patterns, approaches that Prism has used successfully. Entries have confidence labels (emerging/established/proven) based on usage count.

**Confidence labels** (based on `successCount`, not `usageCount`):
- `successCount < 3` → **emerging**
- `successCount 3-9` → **established**
- `successCount 10+` → **proven**

**Domain taxonomy:** Free-text tags derived from the spec requirements and package metadata. No fixed taxonomy — domains emerge organically from builds. Catalogue queries are performed by the LLM (research subagent), not shell-script string operations. The subagent reads the catalogue entries and semantically matches them against the spec requirements (e.g., a requirement mentioning "login" would match catalogue entries tagged with "auth" or "authentication"). This avoids brittle substring matching and leverages the LLM's understanding of semantic similarity.

**How entries are added (automatic, silent):**
- After build passes QA: record all libraries/patterns used, tagged by domain keywords extracted from the spec
- After Guardian recovery succeeds: record successful approach, demote failed one (with failure reason)
- After research finding is used and build succeeds: promote finding

**Catalogue lifecycle:**
- **Max entries:** 500. When exceeded, evict entries with `successCount == 0` and `lastUsedAt` > 6 months ago. If still over 500, evict lowest-confidence entries first.
- **Migration:** Existing workspaces without `.prism/skill-catalogue.json` initialize with an empty catalogue on first access. No migration needed.

**How entries are consulted (automatic, silent):**
- Stage 1: domain matches inform discovery questions
- Stage 2: queried FIRST, before external search. Proven matches short-circuit external research
- Stage 3: injected into worker RESEARCH CONTEXT
- Stage 4: failure patterns fed to QA review

**Storage:** `.prism/skill-catalogue.json`
```json
{
  "entries": [{
    "id": "nextauth-email-auth",
    "name": "NextAuth.js email/password",
    "category": "library",
    "domain": ["auth", "email-login"],
    "description": "Drop-in auth with email/password, session management, CSRF",
    "usageCount": 3,
    "successCount": 3,
    "failureCount": 0,
    "failureReasons": [],
    "lastUsedAt": "2026-03-28T...",
    "source": "research"
  }]
}
```

**Corruption safety:** Atomic writes (write to `.tmp`, `mv` to `.json`). On JSON parse error: rename corrupt file to `.bak`, log warning, proceed with empty catalogue.

**Files to create:**
- `scripts/prism-catalogue.sh` — `query`, `record`, `promote`, `demote`, `list` commands (with atomic write + validation)

---

### 5. Worker Pre-Build Research Context

**Where:** Stage 3, injected into each worker's task prompt.

**Worker dispatch template update:**
```
> WORKING DIRECTORY: {project_root}
> TASK: {description}. FILES TO READ: {paths}. CONSTRAINTS: {constraints}.
> SHARED CONTEXT: {validated contracts from prior workers}.
> RESEARCH CONTEXT: {recommended packages, catalogue matches, approach constraints}.
> Prefer the recommended libraries/patterns unless they don't fit. If you discover
> a better approach, note why.
> Build this task. Write working code.
> When done, list ALL files you created or modified (one per line, relative paths).
```

**Files to modify:**
- `SKILL.md` — Update worker dispatch template (lines 548-553)
- `compiler/output/claude/build-worker/SKILL.md` — Add `research_context` input + "Check Research Context" step

---

### 6. Guardian Learning Loop

**Where:** Stage 3, Guardian section (lines 584-596).

**What changes:** When Guardian recovers from a worker failure using a different approach:
1. Log WHY the first approach failed (error category + context)
2. Log WHAT worked instead (approach + library + pattern)
3. Write both to catalogue: `demote` the failed approach, `record` the successful one
4. Next time a similar task appears, skip the known-bad approach

**Files to modify:**
- `SKILL.md` — Extend Guardian section with catalogue write after recovery

---

### 7. Silent Skill Discovery

**Where:** Internal to research phase. NOT user-facing.

**What it does:** During research, scan `~/.claude/skills/` directories for SKILL.md files. Extract the `name` and `purpose` fields from each. Match purpose text against spec requirement keywords using substring matching. If a skill could help, Prism uses it automatically during the appropriate stage. No announcement to user.

**Scope constraint:** Only scan skills with a parseable SKILL.md. Match on purpose/description text using the research subagent's semantic understanding (same LLM-driven matching as catalogue domain queries). Require 2+ keyword overlaps between skill purpose and spec requirements before considering a skill relevant. Max 10 skills evaluated per research phase. The catalogue is never accessed from TypeScript — it is owned entirely by shell scripts and LLM subagents.

**Files to modify:**
- `references/research-protocol.md` — Add skill scanning step to research subagent prompt
- `SKILL.md` — Add skill scan results to research context

---

### 8. Strengthen Planning Review (adversarial research)

**Where:** `references/reviews/planning-review.md`

**Add to Scope Challenge (Step 0):**
- "For each new dependency or abstraction in the plan, search for an existing library that handles it. If one exists with >1000 weekly downloads, flag the custom implementation as P2 (Over-Engineering)."
- "If the research report (`.prism/research/{change}/decision.md`) recommended a specific approach and the plan deviates, flag as P1 and require justification."

**Files to modify:**
- `references/reviews/planning-review.md` — Add research-aware checks

---

### 9. Targeted QA from Failure Patterns

**Where:** Stage 4, QA review.

**What it does:** Before QA runs, query catalogue for failure data on libraries/patterns used in this build. Inject known failure patterns into the QA prompt as priority checks.

**Files to modify:**
- `SKILL.md` — Add catalogue query before QA invocation
- `references/reviews/qa-review.md` — Add "Known Failure Patterns" input section

---

### 10. Research Telemetry (6 new events)

Add to `prism-telemetry.sh` valid events:
- `research_complete` — sources queried, findings count, duration, timeout hit?
- `approach_selected` — which approach, confidence level, user override?
- `catalogue_write` — entry id, source (build/guardian/research), domain
- `catalogue_query` — stage, matches found, confidence levels
- `package_verified` — package name, exists (true/false), filtered out?
- `guardian_learning` — failed approach, successful approach, task type

**Files to modify:**
- `scripts/prism-telemetry.sh` — Add event names to valid events
- `SKILL.md` — Emit telemetry calls at each integration point

---

## Implementation Sequence

**Phase 1 — Foundation (entities + scripts):**
1. Add entity types to `packages/core/src/entities.ts`: `ResearchFinding`, `ResearchReport`, `ImplementationApproach`, `ApproachComparison` (4 types — catalogue entry schema is shell-only JSON)
2. Add `researchDir` to `packages/memory/src/paths.ts`
3. Create `scripts/prism-catalogue.sh` (with atomic writes + JSON validation + .bak recovery + eviction at 500 entries)
4. Create `scripts/prism-research.sh` (catalogue queries + result persistence only — network calls are via Agent tool subagents)

**Phase 2 — Reference prompts:**
1. Create `references/research-protocol.md` — research subagent prompt (search-results-only constraint, package verification step, skill scanning with max 10 skills)
2. Create `references/reviews/approach-comparison.md` — visual table format, confidence labels
3. Update `references/reviews/planning-review.md` — research-aware scope challenge
4. Update `references/reviews/qa-review.md` — known failure patterns input

**Phase 3a — SKILL.md: Stage 2 (research + planning):**
1. Stage 2: Add research sub-step at beginning of Stage 2 (Agent tool subagents for parallel search + hard timeout)
2. Stage 2: Add approach comparison (visual table + auto-select + confidence labels)
3. Add telemetry: `research_complete`, `approach_selected`, `package_verified`
4. **Verify:** Run Prism through Stage 1 → Stage 2 on a test project. Confirm research runs, approaches shown, planning review receives research context.

**Phase 3b — SKILL.md: Stage 3 (workers + Guardian):**
1. Stage 3: Update worker dispatch template with RESEARCH CONTEXT block
2. Stage 3: Extend Guardian with catalogue learning loop (demote/record on recovery)
3. Wire catalogue promotion into post-build flow
4. Add telemetry: `catalogue_write`, `guardian_learning`
5. **Verify:** Run a test build with 3+ requirements. Confirm workers receive research context, catalogue entries written after QA pass.

**Phase 3c — SKILL.md: Stage 1 + Stage 4 (discovery + QA):**
1. Stage 1: Add catalogue-informed discovery nudges (max 2, silent, selected by highest successCount)
2. Stage 4: Add catalogue failure pattern query before QA invocation
3. Wire catalogue promotion into post-QA flow
4. Add telemetry: `catalogue_query`
5. **Verify:** Run a second build on same workspace. Confirm catalogue entries from first build are found, discovery nudges appear, QA targets known failure patterns.

**Phase 4 — Build worker upgrade:**
1. Update `compiler/output/claude/build-worker/SKILL.md` — `research_context` input + Check Research Context step

**Phase 5 — Documentation:**
1. Update `references/skill-catalog.md` with research phase documentation
2. Update `CHANGELOG.md`

---

## Security Note

Shell-escape all user-provided strings before passing to `gh search` or `npm search` commands in `prism-research.sh`. Prevent shell injection from spec requirement text flowing into search queries.

---

## Verification

1. **Script unit tests:** `prism-catalogue.sh` CRUD operations, atomic write, corruption recovery, confidence labels
2. **Script unit tests:** `prism-research.sh` parallel execution, timeout, package verification
3. **Anti-hallucination test:** Research subagent with known fake package → verify it's filtered out by `npm info`
4. **End-to-end:** Full Prism session with 3+ requirements → research runs → approaches shown → workers get context → build passes → catalogue updated
5. **Degradation test:** No network → research degrades gracefully → build proceeds normally
6. **Catalogue growth test:** Two builds on same workspace → second build finds catalogue entries from first
7. **Guardian learning test:** Worker fails → Guardian recovers → catalogue records failure and success
8. **Research gate compatibility:** `research-gate.sh` recognizes entries from `prism-research.sh`
9. **Telemetry test:** All 6 new events appear in `.prism/telemetry.jsonl` after a full session

---

## Key Design Decisions

- **User sees outcomes, not process.** Prism acts on its intelligence silently. No skill announcements, no "I found these tools." Just smarter builds.
- **Not a new display stage.** Research runs inside Stage 2. No stage counter change.
- **Auto-select, explain briefly, allow override.** Non-technical users don't evaluate technical tradeoffs.
- **Catalogue at workspace level.** Cross-project knowledge accumulation.
- **Complexity-gated.** Quick tasks get catalogue-only (instant). Deep tasks get full research.
- **Anti-hallucination: belt AND suspenders.** Prompt constrained to search results + output verified via package manager.
- **Atomic writes + .bak recovery.** Catalogue is a growing asset; corruption is unacceptable.
- **Parallel research + streaming + hard timeout.** Speed + trust + predictability. Timeout mechanism: the Operator checks wall-clock time and proceeds with whatever Agent tool subagent results have returned within the budget window. Subagents that haven't returned are abandoned (their results, if they arrive later, are ignored).
- **LLM-driven domain matching.** The research subagent performs semantic matching between catalogue entries and spec requirements — no brittle substring matching in shell scripts.
- **Confidence labels, not percentages.** Emerging / established / proven. Plain English.
- **Stale research cleanup.** Orphaned `.prism/research/{change}/` directories from abandoned builds are small text files. Accept them as artifacts — no active garbage collection needed.
- **Research satisfies existing hook.** Automated research replaces manual compliance.

---

## Accepted Scope Expansions (CEO Review)

1. **Continuous Intelligence Layer** — catalogue permeates every stage, not just planning
2. **Guardian Learning Loop** — failures become institutional knowledge
3. **Silent Skill Discovery** — Prism finds and uses skills automatically
4. **Confidence Indicators** — emerging/established/proven labels
5. **Research Transparency Directory** — `.prism/research/{change}/` with report, approaches, decision
6. **Discovery Nudges** — catalogue-informed spec suggestions (max 2, silent)
7. **Targeted QA from Failure Patterns** — catalogue failure data feeds QA
8. **Approach Comparison Visual Table** — scannable format with checkmark recommendation

## Deferred to TODOS.md

- **Cross-User Catalogue Sharing** — export/import + community seed. Build the catalogue first, prove it works, then add sharing.

## NOT in Scope

- M5 Desktop Shell (per CLAUDE.md stop-building list)
- Provider abstractions
- Broad integrations
- Enterprise governance

---

## Critical Files

| File | Change Type | What Changes |
|------|-------------|-------------|
| `SKILL.md` | Heavy modify | Research phase, approach comparison, worker context, Guardian learning, catalogue queries at 4 stages, telemetry |
| `packages/core/src/entities.ts` | Modify | Add 4 entity types: `ResearchFinding`, `ResearchReport`, `ImplementationApproach`, `ApproachComparison` (catalogue entry is shell-only JSON, not in TS) |
| `packages/memory/src/paths.ts` | Modify | Add `researchDir` |
| `scripts/prism-catalogue.sh` | New | Catalogue CRUD with atomic writes |
| `scripts/prism-research.sh` | New | Parallel research with timeout |
| `scripts/prism-telemetry.sh` | Modify | 6 new event types |
| `references/research-protocol.md` | New | Research subagent prompt |
| `references/reviews/approach-comparison.md` | New | Comparison subagent prompt |
| `references/reviews/planning-review.md` | Modify | Research-aware scope challenge |
| `references/reviews/qa-review.md` | Modify | Failure pattern input |
| `references/skill-catalog.md` | Modify | Document research phase |
| `compiler/output/claude/build-worker/SKILL.md` | Modify | Research context input |
| `hooks/research-gate.sh` | No change | Existing hook satisfied by new automated research |
