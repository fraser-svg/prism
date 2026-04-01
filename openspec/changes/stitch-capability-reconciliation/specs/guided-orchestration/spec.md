## ADDED Requirements

### Requirement: Prism SHALL separate Stitch workflow knowledge from Stitch runtime availability
The system SHALL treat Stitch workflow knowledge, repo-managed Stitch readiness, and host-exposed Stitch MCP availability as separate facts. Prism SHALL NOT claim it does not know how to use Stitch when the workflow is documented locally.

#### Scenario: User asks whether Prism has Stitch
- **WHEN** the user asks whether Prism has Google Stitch
- **THEN** Prism explains whether host-exposed Stitch tools are available and whether the repo-managed Stitch path is ready
- **AND** Prism does not say it lacks Stitch knowledge if the local Stitch workflow reference exists

### Requirement: Prism SHALL compute Stitch availability from host and repo signals
The system SHALL set `STITCH_AVAILABLE` to true when either host-exposed Stitch MCP tools are present in the active runtime tool list or the repo-managed Stitch status probe reports `ready`.

#### Scenario: Host tools are available while the local proxy is not ready
- **WHEN** the active runtime tool list includes Stitch MCP tools
- **AND** the repo-managed Stitch probe reports `missing_sdk`
- **THEN** Prism still offers Stitch screen generation using the host-exposed tools

#### Scenario: Only repo-managed Stitch is available
- **WHEN** the active runtime tool list does not include Stitch MCP tools
- **AND** the repo-managed Stitch probe reports `ready`
- **THEN** Prism offers Stitch screen generation via the repo-managed workflow

### Requirement: Prism SHALL explain repo-managed Stitch failure modes precisely
The system SHALL use the repo-managed Stitch status probe to explain exact repo-managed failure reasons before falling back to the normal visual build path.

#### Scenario: Local SDK is missing
- **WHEN** the repo-managed Stitch probe reports `missing_sdk`
- **AND** host-exposed Stitch tools are not available
- **THEN** Prism tells the user the local Stitch SDK install is missing
- **AND** provides the setup step `cd scripts/stitch-mcp && npm install`

#### Scenario: Stitch key is missing
- **WHEN** the repo-managed Stitch probe reports `missing_key`
- **AND** host-exposed Stitch tools are not available
- **THEN** Prism tells the user the Stitch API key is not connected in macOS Keychain
- **AND** provides the setup step `prism: connect stitch`

#### Scenario: Keychain is unavailable or locked
- **WHEN** the repo-managed Stitch probe reports `keychain_unavailable` or `keychain_locked`
- **AND** host-exposed Stitch tools are not available
- **THEN** Prism explains that repo-managed Stitch cannot use the local Keychain-backed path in the current environment
- **AND** falls back to the normal visual build route
