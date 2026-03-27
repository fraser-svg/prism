# Phase B: Upgrade Product Memory

## Status
`planned`

### 4-File Product Memory Model

The system SHALL split product memory into four files with distinct authority levels:
- `PRODUCT.md` (authoritative, manual): product identity, vision, user, finished product, phases
- `ARCHITECTURE.md` (authoritative, semi-auto): technical shape, stack, patterns, data model, boundaries
- `DECISIONS.md` (authoritative, append-only): architecture decision records in ADR format
- `STATE.md` (generated, never hand-edited): current position generated from registry data

The system SHALL NOT allow manual edits to STATE.md.

The system SHALL NOT allow edits to existing entries in DECISIONS.md; new entries SHALL only be appended.

#### Scenario: New product creation
WHEN a user starts a new product with no existing code or specs
THEN PRODUCT.md, ARCHITECTURE.md, and DECISIONS.md SHALL be created from templates in `templates/product-memory/`

#### Scenario: Bootstrap existing project
WHEN a repo has existing code but no product memory files
THEN all three authoritative files SHALL be drafted from codebase analysis and presented for approval

#### Scenario: Partial product files
WHEN PRODUCT.md exists but ARCHITECTURE.md or DECISIONS.md do not
THEN the missing files SHALL be created from templates and populated from existing PRODUCT.md content

### STATE.md Generation

The system SHALL generate STATE.md by running `prism-state.sh` at Stage 0 on every invocation.

The script SHALL read from `.prism/registry.json`, `PRODUCT.md`, `DECISIONS.md`, and session context files.

The generated STATE.md SHALL contain: Active Work (change, stage, branch), Progress (workers, last save, last action), Blockers, Next Steps, and Recent Decisions sections.

#### Scenario: Generate with full data
WHEN registry, PRODUCT.md, and DECISIONS.md all exist
THEN STATE.md SHALL be generated with all sections populated from their respective sources

#### Scenario: Generate with missing registry
WHEN no `.prism/registry.json` exists
THEN STATE.md SHALL still be generated with default/empty values and exit 0

#### Scenario: Generate with missing product files
WHEN PRODUCT.md or DECISIONS.md do not exist
THEN STATE.md SHALL still be generated, omitting data from missing sources

#### Scenario: Resume reads STATE.md
WHEN Stage 0 resumes an existing session
THEN STATE.md SHALL be read for fast context recovery before proceeding

### Decision Recording

The system SHALL append architecture decisions to DECISIONS.md at Stage 2 (Plan), Stage 3 (Build), and Stage 5 (Ship).

Each decision record SHALL follow the ADR format: title, date, context, decision, alternatives, consequences, revisit trigger.

#### Scenario: Plan stage decision
WHEN /plan-eng-review recommends architecture changes at Stage 2
THEN the decision SHALL be appended to DECISIONS.md and ARCHITECTURE.md SHALL be updated

#### Scenario: Build stage decision
WHEN architecture changes during Stage 3 build
THEN the decision SHALL be appended to DECISIONS.md

#### Scenario: Ship stage decision
WHEN a change is shipped at Stage 5
THEN a shipping decision SHALL be appended to DECISIONS.md with deployment strategy and notable choices

### Architecture Drift Detection

The system SHALL check for drift between ARCHITECTURE.md and the codebase at Stage 1 for product-level requests.

Drift detection SHALL compare: dependencies vs Stack section, directory structure vs Structure section, and config files vs Boundaries section.

The system SHALL NOT compare prose descriptions against code semantics.

#### Scenario: Dependency drift detected
WHEN a new major dependency exists in package.json but not in ARCHITECTURE.md
THEN the user SHALL be asked whether to update the architecture doc

#### Scenario: No drift
WHEN ARCHITECTURE.md matches the current codebase state
THEN drift detection SHALL complete silently without user interaction

### Product Memory Templates

The system SHALL provide templates in `templates/product-memory/` for PRODUCT.md, ARCHITECTURE.md, and DECISIONS.md.

Templates SHALL use `{name}` placeholder for product name substitution.

PRODUCT.md template SHALL contain: Vision, User, Finished Product, Phases table, and What's Been Built table.

ARCHITECTURE.md template SHALL contain: Stack, Structure, Data Model, Boundaries, and Diagram sections.

DECISIONS.md template SHALL contain: an explanatory header and an ADR template in a comment block.

#### Scenario: Template instantiation
WHEN templates are used to create product memory files
THEN `{name}` placeholders SHALL be replaced with the actual product name
