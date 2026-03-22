## ADDED Requirements

### Requirement: Specs SHALL transition through exactly 5 states
The system SHALL track spec status through: `draft` → `planned` → `building` → `verified` → `shipped`. Each state corresponds to one orchestrator stage.

#### Scenario: Full lifecycle
- **WHEN** a user completes the entire flow (understand → plan → build → verify → ship)
- **THEN** the spec transitions: draft → planned → building → verified → shipped

#### Scenario: Stage skip
- **WHEN** user skips the Plan stage
- **THEN** spec status goes from draft directly to building (skipping planned)

### Requirement: Ship status SHALL require post-deploy confirmation
The system SHALL NOT mark a spec as `shipped` until the user confirms the deployment succeeded. The system SHALL ask "Did the deploy succeed?" after the user runs /ship.

#### Scenario: Successful deploy
- **WHEN** user runs /ship and confirms "yes, deploy succeeded"
- **THEN** Prism marks spec status as `shipped`

#### Scenario: Failed deploy
- **WHEN** user runs /ship and says "no, deploy failed"
- **THEN** Prism keeps spec status at `verified` and offers to troubleshoot

### Requirement: Spec changes SHALL update the spec and re-enter the build cycle
The system SHALL allow users to request changes to a shipped spec. The system SHALL update the spec with the new requirements, show a plain-English summary of what changed, and re-enter the build cycle at the Build stage.

#### Scenario: Change to shipped spec
- **WHEN** user says "add a remember-me checkbox to the login"
- **THEN** Prism updates the spec with new requirements, shows summary, and re-enters Build stage with status set to `building`

### Requirement: Specs SHALL persist in the project repo
The system SHALL store specs at `openspec/specs/{feature}/spec.md` within the project repository. Specs SHALL be committed to version control. The system SHALL NOT store specs in user-level directories (like `~/.prism/`).

#### Scenario: Spec survives across sessions
- **WHEN** user closes Claude Code and reopens it the next day
- **THEN** the spec file is still at `openspec/specs/{feature}/spec.md` and Prism discovers it on resume
