## Why

Prism currently treats Stitch availability as equivalent to the cached Keychain provider probe. That is too coarse. It causes false negatives when Prism knows the Stitch workflow but the repo-managed proxy is not ready, and it also fails to account for Stitch tools that may already be exposed by the active host MCP runtime.

This undermines user trust in two ways:
- Prism can claim it does not have Stitch integrated even though the repo includes a Stitch proxy and workflow docs.
- Prism can miss host-exposed Stitch tools because repo-managed readiness and host-managed availability are different signals.

## What Changes

- Add a dedicated repo-managed Stitch readiness probe at `scripts/prism-stitch-status.sh`.
- Update `SKILL.md` to separate workflow knowledge, repo-managed readiness, and host-exposed Stitch tool availability.
- Replace the Stage 2.5 Stitch gate with a dual-source capability model.
- Update reference docs so operators know `prism:` commands are chat commands and understand the difference between repo-managed and host-managed Stitch.

## Capabilities

### New Capabilities
- `guided-orchestration`: Prism distinguishes repo-managed Stitch readiness from host-exposed Stitch tool availability before offering Stitch screen generation.
- `guided-orchestration`: Prism can explain exact repo-managed Stitch failures (`missing_sdk`, `missing_key`, `keychain_locked`, `keychain_unavailable`) instead of claiming it does not know Stitch.

### Modified Capabilities
- `guided-orchestration`: Stage 2.5 Stitch routing now prefers host-exposed Stitch MCP tools when present and falls back to repo-managed Stitch when the local proxy is ready.

## Impact

- New script contract for live Stitch readiness probing.
- `SKILL.md` gains explicit runtime state for Stitch capability truth.
- Documentation now distinguishes between host-managed Stitch and repo-managed Stitch.
- No change to `.mcp.json`, Stitch proxy startup logic, or the Stitch generation workflow itself.
