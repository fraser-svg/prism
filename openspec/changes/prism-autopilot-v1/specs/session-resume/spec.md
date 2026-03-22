## ADDED Requirements

### Requirement: Prism SHALL scan for in-progress specs on activation
The system SHALL scan `openspec/specs/` for spec files with status != `shipped` when the user invokes `/prism`. If in-progress specs are found, the system SHALL offer to resume.

#### Scenario: In-progress spec found
- **WHEN** user invokes /prism and `openspec/specs/scraper/spec.md` exists with status `building`
- **THEN** Prism says "You have an in-progress build: scraper (currently building). Pick up where you left off, or start something new?"

#### Scenario: No in-progress specs
- **WHEN** user invokes /prism and all specs have status `shipped` or no specs exist
- **THEN** Prism proceeds to Stage 1 (Understand) — asks what the user wants to build

### Requirement: Prism SHALL validate spec files before offering resume
The system SHALL check that each spec file contains the required sections (What We're Building, Done Looks Like, Requirements, Scenarios, Status) before offering to resume it. Malformed specs SHALL be skipped with a warning.

#### Scenario: Malformed spec file
- **WHEN** a spec file exists but is missing the Requirements section
- **THEN** Prism skips it and says "Found a spec file for {name} but it's incomplete. Starting fresh."

#### Scenario: Corrupted spec file
- **WHEN** a spec file exists but cannot be parsed (empty or garbled content)
- **THEN** Prism skips it gracefully without crashing

### Requirement: Prism SHALL create the openspec directory if it doesn't exist
The system SHALL create `openspec/specs/` if the directory does not exist, rather than failing.

#### Scenario: First use in a project
- **WHEN** user invokes /prism in a project with no `openspec/` directory
- **THEN** Prism creates `openspec/specs/` and proceeds to Stage 1
