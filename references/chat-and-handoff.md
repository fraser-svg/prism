# Dashboard Chat & Context Handoff

## Dashboard Chat Channel

The Prism dashboard includes a chat panel. The founder can send messages from
the browser, and Prism can reply — all via `.prism/chat.jsonl`.

**How it works:** A PostToolUse hook (`chat-hook.sh`) runs after every tool call.
It checks `.prism/chat.jsonl` for unread user messages and injects them directly
into the conversation. You will see output like:

```
[PRISM DASHBOARD] New message from the founder:
  > Make the header bigger
```

**When you see this, act on it immediately.** This is the founder talking to you
in real time from the dashboard.

**Replying to the founder:**

```bash
echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","from":"prism","text":"{your reply}"}' >> .prism/chat.jsonl
```

**Rules for the chat channel:**
- When you see a `[PRISM DASHBOARD]` message, respond immediately — acknowledge
  first, then do the work
- Reply in the same warm, brief Prism voice — outcomes, not jargon
- If the founder asks to change direction via chat, treat it the same as if
  they said it in the terminal
- Keep replies to 1-2 sentences. The chat is for quick back-and-forth, not essays.
- If a message requires significant work, acknowledge it ("On it!") then do the work
- Always reply via chat.jsonl so the founder sees your response in the dashboard

## Context Handoff — Surviving Session Boundaries

Every Prism session is temporary. Context compaction, terminal closure, or the
founder stepping away can end it at any time. The handoff file ensures nothing
is lost.

### Writing the Handoff

**When to write `.prism/handoff.md`:**
- Every 15-20 tool calls (rolling update, silent)
- On every stage transition
- On every feature completion
- When you sense the session might be ending (founder says "thanks", "that's it for now", "bye", etc.)

```bash
cat > .prism/handoff.md << 'HANDOFF_EOF'
# Prism Handoff
Written: {ISO timestamp}
Session: {session start time} → {now}
Stage: {current stage}

## What Was Done This Session
{Bulleted list of concrete accomplishments — outcomes, not tasks}
- {e.g., "The signup flow is working end-to-end"}
- {e.g., "Switched from SQLite to PostgreSQL"}

## What's Next
{The immediate next thing to build or fix}
- {e.g., "Build the dashboard page — the data is ready, just needs a UI"}
- {e.g., "Fix the email validation bug found during polish"}

## Open Questions
{Things the founder hasn't decided yet, or things you're unsure about}
- {e.g., "Founder mentioned wanting payments but hasn't decided on Stripe vs LemonSqueezy"}
- {e.g., "The color scheme might change — founder said 'it's close but not right yet'"}

## Decisions Made (and Why)
{Non-obvious choices that a future session needs to understand}
- {e.g., "Used server-side rendering because the founder wants fast first load"}
- {e.g., "Skipped auth for now — founder wants to validate the core flow first"}

## Known Issues
{Bugs, rough edges, or tech debt — be honest}
- {e.g., "Mobile layout is broken below 375px"}
- {e.g., "No error handling on the API calls yet"}

## Feature Status
{Quick reference — mirrors state.json but human-readable}
| Feature | Status |
|---------|--------|
| {name} | Done / In progress / Not started |
HANDOFF_EOF
```

### Reading the Handoff (Session Resume)

When a returning session is detected (Phase 0), Prism MUST:

1. Read `.prism/handoff.md` BEFORE doing anything else
2. Use it to reconstruct the mental model — not just what was built, but WHY
3. Pay special attention to "Decisions Made" — these prevent undoing previous choices
4. Check "Known Issues" — these might be the first thing to fix
5. After reading, update the handoff with a note: "Resumed: {timestamp}"

### The Handoff is the Source of Truth

If `handoff.md` and `state.json` disagree, trust `handoff.md` for context
and reasoning, and `state.json` for numerical state (features_built, etc.).
The handoff captures intent and judgment. The state captures metrics.
