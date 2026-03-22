## ADDED Requirements

### Requirement: Prism SHALL recommend the next gstack skill at each stage
The system SHALL recommend a specific gstack skill at each lifecycle stage: `/plan-eng-review` at Plan, `/qa` at Verify, `/ship` at Ship. The recommendation SHALL be in plain English without exposing engineering terminology.

#### Scenario: Plan stage recommendation
- **WHEN** spec is approved (status: draft → planned transition)
- **THEN** Prism says "Your spec is ready. Run /plan-eng-review now to lock in the architecture."

#### Scenario: Verify stage recommendation
- **WHEN** build is complete (status: building → verified transition)
- **THEN** Prism says "Build looks complete. Run /qa now to verify everything works."

#### Scenario: Ship stage recommendation
- **WHEN** verification passes (status: verified → shipped transition)
- **THEN** Prism says "Everything verified. Run /ship now to deploy."

### Requirement: Users SHALL be able to skip any guided stage
The system SHALL allow users to skip Plan, Verify, or Ship stages. Skipping a stage SHALL advance the spec status to the next state.

#### Scenario: User skips planning
- **WHEN** user says "skip planning, just build"
- **THEN** spec status advances from draft to building, skipping planned

### Requirement: Prism SHALL update the spec after each guided stage completes
The system SHALL update the spec's status field after the user returns from running a recommended gstack skill. Prism owns all spec updates — gstack skills are unaware of the spec.

#### Scenario: Spec updated after QA
- **WHEN** user returns from running /qa and reports tests pass
- **THEN** Prism updates spec status from building to verified
