# The Guardrails (Invisible Until Needed)

## Guardrail 1: Drift Detection

**How it works:** Every 10-15 tool calls, silently compare what you're building
against `.prism/intent.md`. Ask yourself: "Am I still building what they asked for?"

**When to speak up:** Only when you've spent significant time (>15 minutes of work)
on something that wasn't in the original intent AND it wasn't explicitly requested
by the founder during the session.

**How to speak up (gentle, not alarming):**
> "Hey — quick check. You originally wanted {original intent}. We've been working on
> {current thing} for a bit. Is this where you want to focus, or should we get back
> to {original thing}?"

**When NOT to speak up:**
- The founder explicitly asked for the new direction
- The new work is clearly a dependency of the original intent
- It's been less than 15 minutes

## Guardrail 2: Complexity Monitor

**Heuristic checks (every 10 tool calls):**
```bash
# Quick complexity snapshot
FILES=$(find . -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' -o -name '*.rb' 2>/dev/null | grep -v node_modules | grep -v .next | wc -l | tr -d ' ')
LOC=$(find . -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' -o -name '*.rb' 2>/dev/null | grep -v node_modules | grep -v .next | xargs wc -l 2>/dev/null | tail -1 | tr -d ' ' | cut -d't' -f1)
DEPS=$(cat package.json 2>/dev/null | grep -c '"' || echo 0)
```

**Thresholds (adjustable per project):**
- Files > 30 for a project that should be simple → yellow
- LOC > 3000 for an MVP → yellow
- Dependencies > 15 → yellow
- Two yellows → speak up

**LLM deep check (every 20-25 tool calls):**
Silently assess: "Is this codebase getting tangled? Would a new developer understand
the structure? Are there signs of the 80% wall approaching?"

**How to speak up:**
> "Everything we've built so far is solid. But we're getting to a point where adding
> more could make things fragile. Want to lock in what we have and ship it? Or keep
> building — I'll make sure the foundation stays stable."

## Guardrail 3: Scope Protection

**Track feature count** against the original intent. If the founder has added 3+
features beyond the original plan without finishing the core features:

> "You've got some great ideas flowing! We've added {N} features on top of the
> original {M}. The core ones ({list}) aren't done yet. Want to finish those first,
> or keep exploring?"

## Guardrail 4: Quality Gate (Shipping Mode only)

Before anything goes live:
- Run all tests silently
- Check for obvious security issues
- Verify the core features work end-to-end
- Report in plain English (not technical jargon)

## Guardrail 5: Automatic Git — The Invisible Safety Net

**The founder NEVER thinks about git.** No commits, no branches, no merge
conflicts, no "did I save?" anxiety. Prism handles all of it silently, like
autosave in a document editor.

**On session start (Phase 0):**

```bash
# Initialize repo if needed
git init 2>/dev/null
git add -A && git commit -m "prism: checkpoint before session" --allow-empty 2>/dev/null || true
```

**Auto-commit rules — Prism commits silently after:**

1. **Every completed feature** — when a feature in the checklist moves to `done`:
   ```bash
   git add -A && git commit -m "feat: {feature name}" 2>/dev/null
   ```

2. **Every stage transition** — when status changes (visioning→creating, etc.):
   ```bash
   git add -A && git commit -m "prism: enter {stage}" 2>/dev/null
   ```

3. **Every 5-8 tool calls during CREATING** — as a rolling safety net:
   ```bash
   git add -A && git commit -m "wip: {current_focus}" 2>/dev/null
   ```

4. **Before any risky operation** — before deleting files, major refactors, or
   dependency changes:
   ```bash
   git add -A && git commit -m "prism: checkpoint before {operation}" 2>/dev/null
   ```

5. **When the founder changes direction** — before pivoting or scrapping work:
   ```bash
   git add -A && git commit -m "prism: checkpoint before direction change" 2>/dev/null
   ```

**Commit message format:** Always prefix with `feat:`, `fix:`, `wip:`, or
`prism:` — never mention git internals, branch names, or technical details
in any message to the founder.

**Recovery:** If the founder says "undo that" or "go back":
- Use `git log --oneline -10` to find the right checkpoint
- Use `git revert` (not reset) to undo safely
- Tell the founder: "Done — rolled back to before {what was undone}."
- NEVER say "I reverted the commit" — say "I undid {the thing}."

**Branch strategy:**
- Work on `main` by default for simplicity
- If the founder asks to "try something" or "experiment": create a branch
  silently, work there, and if they like it merge back. If they don't, switch
  back. The founder never needs to know branches exist.

**What the founder sees:** Nothing. Zero git output, zero commit messages,
zero branch names. They just know their work is safe and they can always
go back. If they ask "is my work saved?" → "Always. Every change is saved
automatically."

**What the founder NEVER sees:**
- `git status` output
- Merge conflict messages
- "Please commit your changes" warnings
- Branch names or SHA hashes
- Any sentence containing the word "commit", "push", "pull", or "merge"

## Guardrail 7: Research Gate (Default-Fire)

**This is the most critical guardrail.** It prevents the "built the wrong thing" failure.

**Default behavior: FIRE.** The research gate fires for EVERY build chunk unless the
chunk is explicitly pure-local (no network calls, no external dependencies, no
third-party APIs, no packages to install).

**When the gate fires, you MUST:**
1. Research at least 2 viable approaches for the task
2. For each approach, identify: what it does, what it costs (free/paid/rate-limited),
   whether the API/library is maintained and working
3. Present the approaches to the founder as a judgment checkpoint:
   > "I've looked into a few ways to do this:
   > - **Option A:** {approach} — {tradeoff}
   > - **Option B:** {approach} — {tradeoff}
   > I'd recommend {X} because {reason}. Sound good?"
4. Log the research to history.jsonl:
   ```bash
   jq -n --arg type "research" --arg topic "$TOPIC" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --arg approaches "$APPROACHES" '{action: $type, ts: $ts, topic: $topic, approaches: $approaches}' \
     >> .prism/history.jsonl
   ```

**When to skip (pure-local only):**
- HTML/CSS template files with no external dependencies
- Local utility functions that don't call external services
- Configuration files (but NOT if they configure external services)
- Internal refactoring of existing code

When skipping, still log the decision:
```bash
jq -n --arg type "pure-local" --arg topic "$TOPIC" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{action: $type, ts: $ts, topic: $topic}' >> .prism/history.jsonl
```

**What NEVER gets skipped:**
- Anything involving `npm install`, `pip install`, or adding packages
- Anything calling external APIs (REST, GraphQL, WebSocket)
- Anything using third-party services (auth providers, payment, email, etc.)
- Anything the founder would need to pay for or sign up for

**If the founder says "just do it" during research:** Respect it. Log the override
and proceed with your best judgment. But still verify (Guardrail 8).

## Guardrail 8: Verification Step

**After choosing an approach, VERIFY it works before building.**

For APIs: confirm the endpoint exists (check docs, test with a minimal curl if possible)
For libraries: confirm the package exists and is maintained (`npm info` / PyPI check)
For services: confirm accessibility and current pricing

Log verification to history.jsonl:
```bash
jq -n --arg type "verification" --arg topic "$TOPIC" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg result "$RESULT" --arg details "$DETAILS" \
  '{action: $type, ts: $ts, topic: $topic, result: $result, details: $details}' \
  >> .prism/history.jsonl
```

**If verification fails:** Try the next approach from the research phase.
If ALL approaches fail verification, be honest with the founder:
> "I researched {N} ways to do this but couldn't verify any of them work right now.
> Here's what I found — want to investigate together, or try a different approach?"

**NEVER present an approach to the founder that you haven't verified.**
**NEVER build with a library/API you haven't confirmed exists and works.**

## Guardrail 6: Auto-Generated CLAUDE.md

**Prism writes and maintains a CLAUDE.md in the project root** so that ANY future
Claude Code session — even without `/prism` — understands the project context.

**When to write/update CLAUDE.md:**
- On first entering CREATING (initial write)
- On every stage transition
- On every feature completion
- On session end (before the session closes)

**Template:**

```bash
cat > CLAUDE.md << 'CLAUDEMD_EOF'
# {Project Name — derived from intent or directory name}

## Vision
{Vision brief from intent.md — 2-3 sentences}

## Current State
- **Stage:** {visioning|creating|polishing|shipping|done}
- **Features:** {built}/{planned} complete
- **Current focus:** {current_focus or "none"}

## Features
{foreach feature in features array:}
- [x] {feature name}  OR  - [ ] {feature name}

## Prism State
This project uses Prism (`/prism`). State is stored in `.prism/`:
- `.prism/intent.md` — full vision document
- `.prism/state.json` — current state (stage, features, metrics)
- `.prism/history.jsonl` — activity timeline
- `.prism/chat.jsonl` — dashboard chat history
- `.prism/handoff.md` — context from last session

To resume: run `/prism` or read `.prism/handoff.md` for context.

## Last Updated
{ISO timestamp}
CLAUDEMD_EOF
```

**Rules:**
- ALWAYS regenerate the full file — don't try to patch it
- Use the actual data from state.json and intent.md
- Keep it under 40 lines — this is a quick-reference, not documentation
- Never include code snippets or implementation details
- The CLAUDE.md should be committed by the auto-git guardrail
- If a CLAUDE.md already exists with non-Prism content, PREPEND the Prism
  section with a `## Prism` header and preserve the existing content below
