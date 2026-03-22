# Session Initialization

## Phase 0: Detect Session State

```bash
mkdir -p .prism

# Check jq availability (required for safe JSON logging)
which jq >/dev/null 2>&1 || echo "WARNING: jq not installed. Research/verification logging will not work. Install with: brew install jq"

# gstack version sync check
PRISM_MOD=$(stat -f %m "$0" 2>/dev/null || stat -c %Y "$0" 2>/dev/null || echo 0)
GSTACK_MOD=$(stat -f %m ~/.claude/skills/gstack/SKILL.md 2>/dev/null || stat -c %Y ~/.claude/skills/gstack/SKILL.md 2>/dev/null || echo 0)
if [ -n "$GSTACK_MOD" ] && [ -n "$PRISM_MOD" ] && [ "$GSTACK_MOD" -gt "$PRISM_MOD" ]; then
  echo "WARNING: gstack updated since Prism was last modified. Check for compatibility."
fi

# Log session start marker (hooks check for entries after this marker)
if command -v jq >/dev/null 2>&1; then
  jq -n --arg action "session_start" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{action: $action, ts: $ts}' >> .prism/history.jsonl 2>/dev/null || true
else
  printf '{"action":"session_start","ts":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .prism/history.jsonl 2>/dev/null || true
fi
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
6. **State migration** — silently upgrade older sessions to include triad fields:
   - If `acceptance_criteria` field is missing from state.json: add it as `false`
   - If `socratic_depth` field is missing: add it as `"standard"` (safe default)
   - If `socratic_rounds` field is missing: add it as `0`
   - If `.prism/acceptance-criteria.md` does not exist but intent.md has features:
     generate acceptance criteria silently from the existing features in intent.md
     (both user-facing and machine-facing layers). Set `acceptance_criteria: true`.
     Log: `{"action": "criteria_migrated", "ts": "...", "source": "intent.md"}`
   - If `.prism/config.json` does not exist: use defaults (no Obsidian path). Do
     NOT create config.json unless the founder configures something.
   - If features in state.json lack `verification` objects: add `"verification": null`
     to each feature silently.
   **No user interruption during migration.** This happens before the welcome-back.
7. Append a new session entry to the `sessions` array in `state.json` with the
   current start time
8. Log the session resumption:
   ```bash
   echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","action":"session_resumed","feature":"'$(cat .prism/state.json | grep -o '"current_focus":"[^"]*"' | cut -d'"' -f4)'"}' >> .prism/history.jsonl
   ```
9. Tell the founder warmly what happened last time and where you are:
   > "Welcome back. Last time we got {last completed feature or milestone} working.
   > {current_focus or next feature} is next. Want to keep going, or change direction?"
10. Via AskUserQuestion with options:
   - "Keep going" — resume at the current stage, pick up where you left off
   - "Change direction" — return to VISIONING with a fresh discovery flow
   - "Show me what we built" — summarize the features, show the state, then ask what's next
11. If "Keep going" — immediately start working on the next incomplete feature.
    Don't ask more questions. Just build.
12. If "Change direction" — return to VISIONING. Start the discovery flow fresh.
13. If "Show me what we built" — read the features list and history, summarize
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
