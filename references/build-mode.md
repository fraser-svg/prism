# Build Mode — Two-Tier Context Split

Prism decomposes the build into tasks and dispatches them as worker subagents.
Each worker receives only its task description, relevant files, and constraints —
never the user's conversation, personality, or vision. No gstack skill is involved.

## Architecture

```
OPERATOR (main conversation)
  │
  │ Reads spec requirements + PRODUCT.md
  │ Decomposes into TaskPrompts
  │ Strips all user context
  │
  ├──▶ WORKER 1 (Agent tool subagent)
  │      Task desc + files + constraints + shared types
  │      Has: Bash, Read, Write, Edit, Grep, Glob
  │      Returns: success + summary OR failure + error
  │
  ├──▶ WORKER 2 ...
  │
  └──▶ WORKER N (max 5)
  │
  │ After each worker: Status Relay to user
  │ On failure: Guardian diagnoses + rewrites + respawns
  │ After all workers: Drift Detection
  │
  ▼
STAGE 4 (Verify)
```

## Task Decomposition

Read the spec's `### Requirement:` sections. For each requirement:

1. Translate it into a standalone task description (1-2 paragraphs, plain English)
2. Identify which existing files the worker needs to read
3. Extract constraints from spec's "Out of Scope" + PRODUCT.md Architecture Decisions
4. Include shared context: interfaces, type definitions, API schemas, database
   migrations — technical contracts needed for compatible code

**Rules:**
- One requirement = one TaskPrompt (merge small related requirements).
  When merging, list each merged requirement explicitly in the TaskPrompt
  so Guardian escalation can name all of them if the task fails.
- Cap at 5 tasks. If 6+ requirements, merge related ones.
- Minimum 2 tasks for builds with 3+ requirements
- If decomposition produces 0 tasks: fall back to inline build — read the spec
  requirements directly and build each one sequentially in the main conversation
  (the pre-v2 approach). Log the decomposition failure for debugging.

## TaskPrompt Template

This is the ONLY thing a worker sees:

```
You are a build worker for Prism. Complete this task:

WORKING DIRECTORY: {project_root}
All file operations must be relative to this directory. Do NOT read or modify
files outside it.

TASK: {task description — 1-2 paragraphs, plain English}
FILES TO READ FIRST: {relevant file paths, max 10}
CONSTRAINTS: {from spec "Out of Scope" + architecture decisions}
SHARED CONTEXT: {interfaces, types, API contracts workers need}

Build this task. Write working code. If you hit an error, describe what
went wrong and what you tried. Do not improvise beyond the task description.
```

## Context Firewall

**Workers NEVER receive:**
- User conversation history
- The Operator personality instructions
- Vision statements or product feelings
- Other workers' task descriptions or outputs
- PRODUCT.md Vision section or build history
- The Operator's reasoning about decomposition

**Workers CAN receive:**
- Task description (translated from spec requirement)
- Relevant existing code file paths
- Constraints from spec + architecture decisions
- Shared technical contracts (interfaces, types, schemas, migrations)

The firewall prevents the 80% wall. Workers start fresh every time — they can't
accumulate context debt. The Operator can't pollute workers with irrelevant context
because the Task Decomposer is the translation layer.

## Status Relay

After each worker completes, the Operator translates the result into a plain-English
progress update for the user:

**Good:**
- "Login page done. 2 of 4 requirements left."
- "The scraper is working. Moving on to the scheduler."
- "Hit a snag with the API connection — working on a fix."

**Bad (never say):**
- "Worker 2 returned exit code 1 with stderr output"
- "Agent tool subagent failed on file write operation"

If a worker returns empty or unclear output: **treat it as a failure** and route
to the Guardian. Do NOT count it as progress — an empty response likely means the
worker crashed or timed out without producing code. Log the empty result.

## Guardian Pattern

When a worker fails, the Guardian diagnoses WHY before retrying. This runs in
the Operator context (which has full build awareness).

```
CURRENT (v1.1.0.0): fail → retry same prompt → give up → do inline
GUARDIAN (v2.0):     fail → read error → diagnose → rewrite prompt → retry → (3x) → escalate
```

**Guardian steps:**

1. Read the worker's error output (returned by Agent tool)
2. Analyze in Operator context: what went wrong?
   - Missing dependency? → Add dependency install to retry prompt
   - Wrong file path? → Correct the path in retry prompt
   - Unclear requirement? → Simplify and narrow the task scope
   - API or service changed? → Research the change, add context to retry
3. Rewrite the TaskPrompt with failure context and corrections
4. Dispatch a NEW worker via Agent tool with the rewritten prompt
5. After 3 failures on the same task: escalate to the user in plain English.
   If the task was merged from multiple requirements, name ALL of them in the
   escalation message so the user knows what's stuck.

**Escalation example (keep it non-technical — the user is NOT an engineer):**
"I'm having trouble getting the login and password reset working. I've tried a
few different approaches. Can you tell me more about how login should work for
your users?"

**Context reset recovery:** If resuming a build mid-session (e.g., after context
compaction), check the operation log for prior `guardian_retries` entries on the
current task before restarting the retry counter. Don't reset to 0 on resume.

**What makes this different from retry:** Each Guardian dispatch is smarter than
the last. Retry sends the same prompt hoping for luck. Guardian reads the failure,
diagnoses the cause, and writes a BETTER prompt.

## Resilience — Research Before Giving Up

Before telling the user something isn't possible (applies to both Guardian retries
AND escalated issues):

1. **Research alternatives.** Use web search, check documentation, look for packages or
   patterns that solve the problem. The user should never have to ask you to research.
2. **If research finds a solution: implement it.** Do not just describe how it could be
   done. "Here's how we could do it" is not building. Building is building.
3. **If genuinely no solution exists:** explain why clearly, describe what you tried, and
   suggest an alternative approach. Never just say "that's not possible" without evidence.

## Drift Detection

After ALL workers complete, compare what's built against the spec:

**Check for:**
- Files or features that exist but aren't in the spec's Requirements
- Requirements that were supposed to be built but were skipped
- Scope that grew beyond the spec's "Out of Scope" section

**When drift is detected:**
- Surface it as a question, never a blocker
- Example: "You asked for a scraper that saves to CSV. I notice we now have a database too. Is that intentional?"
- If user says YES → update the spec to include the new requirement, continue
- If user says NO → remove the extra work, continue with original spec

**When drift is NOT detected:**
- Say nothing. Invisible by default.

## Communicating with the User

The user sees the Operator's status relays and drift questions. Workers are invisible.
All communication is plain English — no engineering jargon, no raw errors, no file paths
unless the user uses them first.
