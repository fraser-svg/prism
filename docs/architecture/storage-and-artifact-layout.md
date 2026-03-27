# Storage And Artifact Layout

## Purpose

This document defines where Prism Core should store durable truth in the local-first MVP.

The rule is simple:
- human-readable truth goes in files
- indexed operational state goes in SQLite
- temporary execution output stays ephemeral unless promoted into a durable artifact

## Storage Model

Prism MVP uses a hybrid local-first storage approach:

1. File-based artifacts for durable, inspectable project truth
2. SQLite for indexed runtime and workspace state
3. Ephemeral temp output for command/script interchange

## Top-Level Storage Zones

### 1. Workspace Home

Purpose:
- stores workspace-wide state for the Prism installation

Owns:
- workspace settings
- project registry index
- provider profiles
- integration metadata
- local runtime database

Recommended shape:

```text
~/.prism/
  workspace.db
  settings.json
  providers/
  integrations/
  logs/
```

### 2. Project Root

Purpose:
- stores project-specific source code plus Prism’s durable project artifacts

Owns:
- project memory
- specs
- plans
- reviews
- checkpoints
- evaluation artifacts
- task graphs

Recommended shape:

```text
<project-root>/
  .prism/
    memory/
    specs/
    plans/
    reviews/
    runs/
    checkpoints/
    evals/
    telemetry.jsonl
    registry.json
    task-graph.json
```

## What Lives In Files

Files should hold:
- product brief and memory documents
- architecture notes
- roadmap and state documents
- decision logs
- specs and scoped task artifacts
- review outputs
- ship-readiness outputs
- checkpoint summaries
- eval definitions and baselines
- human-readable run summaries

Why:
- inspectable by humans
- resilient across tooling changes
- easy to diff and version
- useful for support, debugging, and resumption

## What Lives In SQLite

SQLite should hold indexed operational state such as:
- workspace project index
- recent project metadata
- project status rollups
- run index
- review index
- verification index
- provider and integration status
- lightweight search metadata
- event indexing for fast workspace views

Why:
- fast querying across many projects
- easier dashboards and desktop views
- avoids expensive filesystem scans for every UI render

SQLite should not become the only place where product truth exists.

## What Stays Ephemeral

Ephemeral outputs include:
- `/tmp` JSON handoff files from scripts
- transient command stdout/stderr
- in-progress worker scratchpads
- active process state that can be reconstructed

Ephemeral data becomes durable only if it is promoted into:
- a checkpoint
- a review artifact
- a verification result
- telemetry
- product memory

## Artifact Layout By Concern

### Product Memory

Canonical location:

```text
.prism/memory/
  product.md
  architecture.md
  roadmap.md
  state.md
  decisions.md
```

### Specs

Canonical location:

```text
.prism/specs/
  <spec-id>/
    spec.md
    metadata.json
```

### Plans

Canonical location:

```text
.prism/plans/
  <plan-id>/
    plan.md
    task-graph.json
    metadata.json
```

### Reviews

Canonical location:

```text
.prism/reviews/
  <spec-id>/
    planning-review.md
    engineering-review.md
    qa-review.md
    design-review.md
    ship-readiness.md
```

### Runs

Canonical location:

```text
.prism/runs/
  <run-id>/
    summary.md
    verification.json
    review-index.json
```

### Checkpoints

Canonical location:

```text
.prism/checkpoints/
  latest.json
  latest.md
  history/
```

### Telemetry And Eval

Canonical location:

```text
.prism/telemetry.jsonl
.prism/evals/
.prism/proposals/
```

## Global Vs Project Scope

### Global / Workspace Scope

Use workspace storage for:
- installed provider availability
- integration cabinet metadata
- cross-project index and search
- app preferences
- desktop shell state

### Project Scope

Use project storage for:
- product intent
- specs and plans
- task graphs
- reviews
- verification
- checkpoints
- project-specific telemetry

## Migration Rule

Existing artifacts should be preserved and normalized, not discarded.

Implications:
- current `.prism/memory` remains canonical
- current `registry.json` and `task-graph.json` can remain transitional runtime artifacts
- legacy `PRODUCT.md` remains readable but should migrate forward into split memory
- `openspec/` artifacts may remain as historical records until superseded by canonical Prism Core spec storage

## Storage Rules

1. No durable project truth should exist only in model context.
2. No critical release decision should exist only in SQLite.
3. Files should remain understandable without opening the app.
4. SQLite should accelerate the experience, not hide the truth.
5. Temporary command handoff files must never be treated as canonical artifacts.
