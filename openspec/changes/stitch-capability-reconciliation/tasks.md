## 1. Artifact And Probe

- [x] 1.1 Add `scripts/prism-stitch-status.sh` with the agreed JSON contract.
- [x] 1.2 Ensure the probe performs live checks only and does not reuse the cached provider probe.
- [x] 1.3 Add script tests covering `missing_sdk`, `missing_key`, `keychain_locked`, `keychain_unavailable`, and `ready`.

## 2. Orchestration Logic

- [x] 2.1 Update `SKILL.md` to define `HOST_STITCH_TOOLS_AVAILABLE`, `REPO_STITCH_STATUS`, and `STITCH_AVAILABLE`.
- [x] 2.2 Replace the Stage 2.5 Stitch gate with dual-source capability handling.
- [x] 2.3 Require Prism to explain repo-managed Stitch failures in plain English rather than claiming ignorance.

## 3. Docs And Changelog

- [x] 3.1 Update `references/stitch-frontend.md` with readiness modes and troubleshooting.
- [x] 3.2 Update `references/key-management.md` to clarify `prism:` commands are Prism chat commands.
- [x] 3.3 Add a changelog note for missing SDK symptoms and host-vs-repo Stitch distinction.

## 4. Verification

- [x] 4.1 Run `bash scripts/test-scripts.sh`.
- [x] 4.2 Run `bash scripts/test-stitch-proxy.sh`.
