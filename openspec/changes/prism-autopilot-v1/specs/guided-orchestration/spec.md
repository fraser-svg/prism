## ADDED Requirements

### Requirement: Prism SHALL invoke the next gstack skill at each stage
The system SHALL automatically invoke a specific gstack skill at each lifecycle stage using the Skill tool: `/plan-eng-review` at Plan, `/qa` at Verify, `/ship` at Ship. The invocation SHALL be announced in plain English without exposing engineering terminology. If the Skill tool fails, the system SHALL fall back to guided mode (telling the user which skill to run manually).

#### Scenario: Plan stage auto-invocation
- **WHEN** spec is approved (status: draft → planned transition)
- **THEN** Prism announces "Your spec is ready — I'm going to run a quick architecture review" and invokes `/plan-eng-review` via the Skill tool with spec context as args

#### Scenario: Verify stage auto-invocation
- **WHEN** build is complete (status: building → verified transition)
- **THEN** Prism announces "Build looks complete — I'm going to run QA" and invokes `/qa` via the Skill tool with a testable URL or description as args

#### Scenario: Ship stage auto-invocation
- **WHEN** verification passes (status: verified → shipped transition)
- **THEN** Prism announces "Everything looks good — I'm going to commit your code and create a pull request" and invokes `/ship` via the Skill tool

#### Scenario: Skill tool fallback
- **WHEN** the Skill tool fails or produces unexpected results during any stage
- **THEN** Prism falls back to guided mode, telling the user which skill to run manually

### Requirement: Users SHALL be able to skip any guided stage before invocation
The system SHALL allow users to skip Plan, Verify, or Ship stages by saying "skip" BEFORE Prism invokes the skill. Once a skill starts running, it runs to completion.

#### Scenario: User skips planning
- **WHEN** user says "skip planning, just build" before Prism invokes /plan-eng-review
- **THEN** spec status advances from draft to building, skipping planned

### Requirement: Prism SHALL observe skill output and auto-advance
The system SHALL observe the output of each auto-invoked gstack skill and automatically advance to the next stage without asking the user "how did it go?" Prism only asks the user if something went wrong.

#### Scenario: Spec updated after QA
- **WHEN** /qa completes and QA passed
- **THEN** Prism updates spec status from building to verified and auto-advances to Ship
