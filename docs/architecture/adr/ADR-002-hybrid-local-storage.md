# ADR-002: Hybrid Local Storage

## Status

Accepted

## Date

2026-03-27

## Context

Prism needs:
- durable local-first product truth
- inspectable artifacts
- fast multi-project querying for a future desktop workspace

A file-only approach is transparent but weak for indexed workspace operations.
A DB-only approach is fast but risks hiding product truth in opaque state.

## Decision

Prism MVP will use hybrid local storage:
- file-based artifacts for durable project truth
- SQLite for indexed workspace and runtime state
- ephemeral temp files for script/process handoff only

## Consequences

### Positive

- preserves transparency and versionability
- supports fast workspace/project queries later
- fits local-first desktop architecture
- avoids hidden-state dependence

### Negative

- requires explicit ownership of what lives where
- introduces dual persistence concerns

## Rules

1. Human-readable product truth belongs in files.
2. Indexed operational state belongs in SQLite.
3. Temporary handoff files are never canonical.
4. No critical project meaning should exist only in the database.
