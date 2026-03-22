## Why

Non-engineers using Claude Code + gstack hit a wall: gstack has powerful workflow skills (office-hours, QA, ship) but the lifecycle is opaque — users don't know which skills to use, when, or in what order. Separately, AI builds drift because plans exist only as natural language that the AI can't reliably verify against. This change creates a concierge layer that generates structured specs and guides users through the right gstack skills automatically.

## What Changes

- New Claude Code personal skill at `~/.claude/skills/prism/` that acts as an orchestrator
- Generates OpenSpec-style structured specs (requirements + scenarios) from user intent via sharpening questions
- Guides users through gstack's skill lifecycle (plan → build → verify → ship) without requiring engineering knowledge
- Prism handles the Build stage directly, referencing the spec as a contract
- Spec persists in project repo at `openspec/specs/{feature}/spec.md` for cross-session continuity
- Drift detection compares build state against spec requirements during Build stage
- Session resume scans for incomplete specs on activation
- Replaces existing Prism v0.3 skill (old repo at `/Users/foxy/prism/` archived after dogfood)

## Capabilities

### New Capabilities
- `spec-generation`: Generate structured specs with Requirements (SHALL statements) and Scenarios (GIVEN/WHEN/THEN) from sharpening questions. Specs always include both sections — never empty.
- `guided-orchestration`: Recommend the right gstack skill at each lifecycle stage (Plan → Build → Verify → Ship). User invokes skills manually; Prism tells them which and when.
- `build-mode`: Prism builds code directly, referencing the spec at each chunk. Drift detection surfaces divergence as questions, not blockers.
- `session-resume`: Scan `openspec/specs/` for specs with status != `shipped`, validate spec integrity, offer to resume in-progress builds.
- `spec-lifecycle`: Track spec status through 5 states: draft → planned → building → verified → shipped. Post-ship confirmation required before marking shipped.

### Modified Capabilities
<!-- No existing specs to modify — this is a greenfield project -->

## Impact

- New personal skill directory: `~/.claude/skills/prism/` (7 files: SKILL.md + 5 references + 1 template)
- New `openspec/specs/` directories in any project repo where Prism is used
- Existing Prism v0.3 at `/Users/foxy/prism/` becomes archived (after dogfood confirms replacement works)
- Depends on gstack skills at runtime (plan-eng-review, qa, ship) — invoked by user recommendation, not programmatically
- SKILL.md must stay under 500 lines per Anthropic's best practices; logic delegated to reference files
