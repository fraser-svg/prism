## Context

Prism v0.3 is a Claude Code skill that does everything itself: Socratic visioning, building, verification, guardrails. It works but is monolithic. The user (a non-engineer) also uses gstack, which has excellent workflow skills (office-hours, QA, ship) but requires engineering knowledge to navigate.

The new Prism Autopilot replaces v0.3 with an orchestrator that generates OpenSpec-style specs and guides users through gstack's lifecycle. It lives as a personal skill at `~/.claude/skills/prism/` (available across all projects).

Key constraint: SKILL.md must stay under 500 lines (Anthropic's recommendation). All detailed logic lives in reference files.

## Goals / Non-Goals

**Goals:**
- Generate structured specs (Requirements + Scenarios) from user intent
- Guide non-engineers through the gstack lifecycle without requiring engineering knowledge
- Build code directly while referencing the spec as a contract
- Detect drift between build state and spec requirements
- Persist specs in the repo for cross-session continuity
- Resume in-progress builds across sessions

**Non-Goals:**
- Autopilot mode (silently invoking gstack skills) — deferred to V2
- Web platform or UI
- Modifying gstack skills
- Multi-user collaboration
- Spec versioning beyond git history

## Decisions

### D1: Guided mode over autopilot (V1)
**Choice:** Prism recommends gstack skills; user invokes them manually.
**Alternative:** Silent skill invocation via the Skill tool.
**Rationale:** Skill chaining is unverified and the integration surface is large (path resolution, argument shape, output parsing). Guided mode delivers value on day one with zero integration risk. Autopilot can be layered on after contracts are proven.

### D2: Prism owns the spec; gstack skills are unaware
**Choice:** Prism reads and updates the spec. gstack skills never interact with it.
**Alternative:** Pass spec content as arguments to gstack skills.
**Rationale:** gstack skills aren't modified. Passing a spec as input doesn't guarantee the skill respects it. Honest ownership avoids false expectations.

### D3: Prism IS the builder
**Choice:** Prism handles the Build stage directly — reads spec, writes code, checks requirements.
**Alternative:** Delegate to a gstack build skill (none exists) or spawn a subagent.
**Rationale:** Claude Code already writes code. Prism just needs to feed it the spec as context and check requirements. No new abstraction needed.

### D4: SKILL.md as thin dispatcher, logic in reference files
**Choice:** SKILL.md contains stage definitions and routing. Reference files contain detailed instructions per stage.
**Alternative:** Everything in SKILL.md.
**Rationale:** 500-line budget is tight for an orchestrator handling 6 stages, spec generation, drift detection, and guided recommendations. Reference files are loaded on-demand per Anthropic's skill architecture.

### D5: Requirements and Scenarios always required
**Choice:** Every spec gets at least 2-3 requirements and 1 scenario. Never empty.
**Alternative:** Optional sections for simple tasks.
**Rationale:** Empty Requirements/Scenarios gut the spec's value — drift detection and QA have nothing to verify against. Generating them costs seconds with AI.

### D6: Five-state lifecycle matching five stages
**Choice:** draft → planned → building → verified → shipped
**Alternative:** Fewer states (draft → complete).
**Rationale:** 1:1 mapping between stages and states is explicit and prevents status model bugs (e.g., "shipped" vs "complete" confusion).

### D7: Build new before archiving old
**Choice:** Create new skill, dogfood it, archive old Prism only after success.
**Alternative:** Archive first, build new.
**Rationale:** Don't burn the old bridge until the new one holds weight. Zero rollback risk.

## Risks / Trade-offs

- **[gstack skill reliability]** gstack skills are 800-1200 lines (over Anthropic's 500-line recommendation). Prism recommends them but can't guarantee they execute correctly. → Mitigation: error handling surfaces failures in plain English; spec ensures overall direction stays correct regardless.
- **[500-line budget]** SKILL.md as a dispatcher may feel fragmented across 6 reference files. → Mitigation: clear file naming and SKILL.md contains a navigation map.
- **[Drift detection false positives]** LLM comparison of build state against spec is inherently noisy. → Mitigation: surface as questions, never blockers. User can always say "yes, that's intentional."
- **[gstack compatibility]** gstack evolves independently. A skill rename or interface change breaks guided recommendations. → Mitigation: behavioral contracts documented in skill-catalog.md; error handling surfaces broken contracts.

## Open Questions

1. How should drift detection work mechanically? Current plan says "periodically compare" but doesn't define frequency, input, or threshold.
2. Should the spec template include a "Chosen Approach" section after the Plan stage, or is that design doc territory?
