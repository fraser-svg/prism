# Session Context — Cross-Session Memory

Prism captures a rich session summary at key moments so that returning to the
project feels like picking up a conversation, not starting from scratch.

## Why

When context is cleared or the user returns in a new session, Prism's Stage 0
Resume only reads the last 3 log entries and change status. This loses all the
nuance: what was discussed, what decisions were made, what the user cares about,
what was tried and rejected. The result feels "stupid and slow."

## Session Context File

Location: `openspec/changes/{change-name}/session-context.md`

For product-level context (not tied to a specific change):
Location: `.prism/session-context.md`

## What Gets Captured

The session context is a structured summary of the conversation, NOT a transcript.

```markdown
# Session Context

## Last Updated
{ISO timestamp}

## Current State
- Stage: {current stage number and name}
- Change: {change-name}
- Progress: {e.g., "3 of 5 requirements built", "QA passed, ready to ship"}

## Key Decisions Made
- {Decision 1 — e.g., "User chose SQLite over Postgres for simplicity"}
- {Decision 2 — e.g., "Skipped design consultation — user wants minimal UI"}

## User Preferences Discovered
- {Preference — e.g., "User prefers dark mode defaults"}
- {Preference — e.g., "User wants to keep the API simple, no pagination yet"}

## What Was Discussed
- {Topic — e.g., "Explored three approaches for auth: sessions, JWT, OAuth. User picked sessions."}
- {Topic — e.g., "User described their workflow: they process invoices weekly in batches"}

## What Was Tried and Rejected
- {Rejected approach — e.g., "Tried using Puppeteer for scraping, hit CORS issues, switched to server-side fetch"}

## Open Questions
- {Question — e.g., "User hasn't decided on pricing model yet — revisit when building billing"}

## Next Steps
- {What Prism was about to do when the session ended}
```

## When to Write Session Context

Update the session context at these moments (via subagent, silent):

| Trigger | What to capture |
|---------|----------------|
| After Stage 1 approval | User's answers, decisions, product preferences |
| After Stage 2 completes | Architecture decisions from planning review |
| After each worker completes (Stage 3) | Build progress, any issues encountered |
| After Stage 4 (QA) | Test results, what was fixed |
| Before shipping (Stage 5) | Full state summary |
| On context compaction warning | Emergency dump of current conversation state |

## How to Write Session Context

Use a subagent:

> "You are a helper for Prism. Update the session context file.
>
> Read the current session context at `{path}` (if it exists).
> Update it with the following new information:
>
> - Current stage: {stage}
> - New decisions: {decisions from this phase}
> - New preferences: {any user preferences discovered}
> - Progress update: {current progress}
> - What just happened: {summary of this phase}
> - Next steps: {what Prism will do next}
>
> Merge with existing content — don't overwrite previous decisions or preferences.
> Update the timestamp. Write the file.
>
> Return: 'Updated' or describe any error."

## How Stage 0 Uses Session Context

When resuming, the Stage 0 subagent should read session context IN ADDITION to
the operation log:

> "... (existing Stage 0 prompt) ...
> 8. If `openspec/changes/{name}/session-context.md` exists, read it in full.
>    Extract: current state, key decisions, user preferences, open questions,
>    and next steps.
> 9. If `.prism/session-context.md` exists, read it for product-level context.
>
> Include in your response:
> - CONTEXT: {key decisions | user preferences | open questions | next steps}
> This gives the Operator enough context to resume naturally without re-asking
> questions the user already answered."

When session context is available, the Operator should use it to:
- Skip questions the user already answered
- Reference decisions already made ("Last time you chose SQLite — still good?")
- Pick up exactly where things left off ("We were about to start QA.")
- Respect previously stated preferences without asking again

## Rules

- Session context is ALWAYS written via subagent — invisible to the user.
- Session context failures are non-blocking. If writing fails, continue silently.
- Session context is additive — each update merges with previous content.
- Session context is NOT a transcript. It's a structured summary of decisions,
  preferences, and state. Keep it concise — under 50 lines.
- Session context does NOT replace the operation log. The log tracks actions.
  Session context tracks meaning.
