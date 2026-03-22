## ADDED Requirements

### Requirement: Prism SHALL generate a structured spec from user intent
The system SHALL ask 2-4 sharpening questions to understand user intent, then generate a spec file at `openspec/specs/{feature}/spec.md` containing: What We're Building, Done Looks Like, Requirements (SHALL statements), Scenarios (GIVEN/WHEN/THEN), Out of Scope, and Status.

#### Scenario: User describes a simple build
- **WHEN** user says "build me a price scraper for Amazon"
- **THEN** Prism asks sharpening questions: what products, how often, where does data go

#### Scenario: Spec file is created with all required sections
- **WHEN** user answers all sharpening questions
- **THEN** Prism creates `openspec/specs/{feature}/spec.md` with all 6 sections populated (none empty)

#### Scenario: User approves the spec
- **WHEN** Prism shows a plain-English summary of the spec
- **THEN** user can approve or request revisions before proceeding

### Requirement: Requirements and Scenarios SHALL never be empty
The system SHALL generate at least 2 requirements (SHALL statements) and at least 1 scenario (GIVEN/WHEN/THEN) for every spec. The system SHALL NOT create a spec with empty Requirements or Scenarios sections.

#### Scenario: Simple task still gets requirements
- **WHEN** user asks for a simple one-page website
- **THEN** the spec contains at least 2 requirements and 1 happy path scenario

### Requirement: Spec SHALL use the user's own words
The system SHALL use plain English derived from the user's answers in the "What We're Building" and "Done Looks Like" sections. The system SHALL NOT use engineering jargon.

#### Scenario: Non-technical language preserved
- **WHEN** user says "I need it to grab prices every morning and put them in a spreadsheet"
- **THEN** the spec's "What We're Building" section uses "grab prices" and "spreadsheet", not "scrape data" and "CSV export"
