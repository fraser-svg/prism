# Session Initialization

## Phase 0: Detect Session State

```bash
mkdir -p .prism
```

Check if `.prism/intent.md` exists AND `.prism/state.json` exists with a non-empty
`intent` value.

**If returning session (intent.md exists):**

1. Read `.prism/intent.md` and `.prism/state.json`
2. Read `.prism/history.jsonl` (last 5 entries) to understand where things left off
3. Read `.prism/handoff.md` to restore the mental model — decisions, open questions, known issues
4. Reset the chat cursor:
   ```bash
   wc -l < .prism/chat.jsonl 2>/dev/null | tr -d ' ' > .prism/.chat_cursor 2>/dev/null || echo "0" > .prism/.chat_cursor
   ```
5. Restore the stage from `state.json` (do NOT overwrite it — the existing state
   is the source of truth)
6. Append a new session entry to the `sessions` array in `state.json` with the
   current start time
7. Log the session resumption:
   ```bash
   echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","action":"session_resumed","feature":"'$(cat .prism/state.json | grep -o '"current_focus":"[^"]*"' | cut -d'"' -f4)'"}' >> .prism/history.jsonl
   ```
8. Tell the founder warmly what happened last time and where you are:
   > "Welcome back. Last time we got {last completed feature or milestone} working.
   > {current_focus or next feature} is next. Want to keep going, or change direction?"
9. Via AskUserQuestion with options:
   - "Keep going" — resume at the current stage, pick up where you left off
   - "Change direction" — return to VISIONING with a fresh discovery flow
   - "Show me what we built" — summarize the features, show the state, then ask what's next
10. If "Keep going" — immediately start working on the next incomplete feature.
    Don't ask more questions. Just build.
11. If "Change direction" — return to VISIONING. Start the discovery flow fresh.
12. If "Show me what we built" — read the features list and history, summarize
    what exists in plain language, then ask what's next via AskUserQuestion.

**If fresh session (no intent.md):**

Initialize state and proceed to the visioning flow.

```bash
cat > .prism/state.json << 'STATE_EOF'
{
  "status": "visioning",
  "mode": "vision",
  "intent": "",
  "features_planned": 0,
  "features_built": 0,
  "files_count": 0,
  "complexity_score": 0,
  "drift_alert": false,
  "warnings": [],
  "sessions": [
    {"started": "TIMESTAMP", "ended": null, "features_completed": []}
  ],
  "last_updated": "TIMESTAMP"
}
STATE_EOF
# Replace TIMESTAMP placeholders with actual time
sed -i '' "s/TIMESTAMP/$(date -u +%Y-%m-%dT%H:%M:%SZ)/g" .prism/state.json
wc -l < .prism/chat.jsonl 2>/dev/null | tr -d ' ' > .prism/.chat_cursor 2>/dev/null || echo "0" > .prism/.chat_cursor
```
