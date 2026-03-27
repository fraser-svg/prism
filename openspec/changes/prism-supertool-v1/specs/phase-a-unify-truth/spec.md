## ADDED Requirements

### Requirement: Canonical Architecture Document
The system SHALL have a single ARCHITECTURE.md file at the skill root that describes the complete system shape, state models, script responsibilities, stage lifecycle, and external dependencies.

#### Scenario: Architecture document creation
- **WHEN** ARCHITECTURE.md does not exist
- **THEN** the system creates it from the architecture truth report, covering: layers, state models, scripts, stages, dependencies, and design decisions

#### Scenario: Architecture document accuracy
- **WHEN** ARCHITECTURE.md exists
- **THEN** every script, reference, and stage described in SKILL.md has a corresponding entry in ARCHITECTURE.md

### Requirement: Stale Artifact Removal
The system SHALL NOT contain unreferenced code from prior versions that could confuse future development.

#### Scenario: Remove v0.3 hooks
- **WHEN** hooks/research-gate.sh and hooks/verification-gate.sh exist but are not referenced in SKILL.md
- **THEN** they are removed from the repository

#### Scenario: Remove legacy dashboard
- **WHEN** dashboard/ directory exists but is not active in v3
- **THEN** it is removed from the repository

#### Scenario: Archive v1 meta-specs
- **WHEN** openspec/changes/prism-autopilot-v1/ describes v1 behaviour that no longer matches v3
- **THEN** the change is archived or clearly marked as historical

### Requirement: Undocumented State Documentation
The system SHALL document all state contracts that exist in code but lack formal documentation.

#### Scenario: Checkpoint schema
- **WHEN** prism-checkpoint.sh accepts JSON input
- **THEN** the expected JSON schema is documented in ARCHITECTURE.md with required and optional fields

#### Scenario: Contract extraction format
- **WHEN** workers produce output that is stored in .prism/contracts/
- **THEN** the contract JSON format is documented in ARCHITECTURE.md

#### Scenario: Worker extra metadata
- **WHEN** PRISM_WORKER_EXTRA environment variable is used to pass data to prism-registry.sh
- **THEN** the expected format and fields are documented in ARCHITECTURE.md

### Requirement: Documentation Reconciliation
The system SHALL NOT have multiple conflicting documents describing the same aspect of the system.

#### Scenario: Vision and roadmap alignment
- **WHEN** docs/VISION.md and docs/ROADMAP.md exist
- **THEN** they are either updated to reflect v3 reality or consolidated into ARCHITECTURE.md

#### Scenario: Planning artifacts
- **WHEN** planning/ directory contains work-in-progress notes
- **THEN** actionable items are captured in the governing change and stale notes are removed

### Requirement: Script Validation
The system SHALL verify that all existing scripts pass their test suite after Phase A changes.

#### Scenario: Test suite passes
- **WHEN** Phase A changes are complete
- **THEN** running test-scripts.sh produces 0 failures
