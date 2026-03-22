## ADDED Requirements

### Requirement: Prism SHALL build code directly while referencing the spec
The system SHALL handle the Build stage itself — reading the spec, writing code, and checking each chunk of work against the spec's requirements. The system SHALL NOT delegate building to a gstack skill.

#### Scenario: Build references spec requirements
- **WHEN** Prism starts building a feature
- **THEN** Prism reads the spec's Requirements section and implements each one

#### Scenario: Requirements checked off during build
- **WHEN** a requirement is implemented
- **THEN** Prism notes which requirements are done vs remaining

### Requirement: Prism SHALL detect drift between build state and spec
The system SHALL periodically compare what is being built against the spec's requirements and surface divergence as a question to the user. Drift detection SHALL be non-blocking — the user can always say "yes, that's intentional."

#### Scenario: Drift detected — extra functionality added
- **WHEN** the build includes a database but the spec only mentions a CSV file
- **THEN** Prism asks: "You asked for CSV output. The build now includes a database. Is that intentional?"

#### Scenario: User confirms intentional drift
- **WHEN** user says "yes, I want the database too"
- **THEN** Prism updates the spec to include the new requirement and continues building

#### Scenario: User rejects drift
- **WHEN** user says "no, remove the database"
- **THEN** Prism removes the extra functionality and continues building per the original spec

### Requirement: Build errors SHALL be surfaced in plain English
The system SHALL surface build failures in plain English without engineering jargon. The system SHALL NOT show raw error messages or stack traces to the user.

#### Scenario: Build fails
- **WHEN** a build step produces an error
- **THEN** Prism says something like "The login page isn't working yet — there's an issue with the form. Let me fix it."
