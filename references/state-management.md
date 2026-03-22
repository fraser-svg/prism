# State Management

After every significant action, update `.prism/state.json`. The dashboard reads
this file to render the UI — including the vision canvas, feature list, and
stage progress.

## During VISIONING — update facets as you capture them

After each discovery question, update the `vision` object so the dashboard
renders each facet as it's revealed (they animate in one by one):

**IMPORTANT:** When rewriting state.json, always preserve the existing `sessions`
array. Read the current sessions first, then include them in the rewrite. The
templates below show `sessions` as a placeholder — in practice, copy the array
from the current state.json before overwriting.

```bash
cat > .prism/state.json << EOF
{
  "status": "visioning",
  "intent": "",
  "socratic_depth": "{quick|standard|deep}",
  "socratic_rounds": 0,
  "vision": {
    "person": "{who it's for — or null if not yet captured}",
    "feeling": "{the emotional core — or null}",
    "moment": "{the magic moment — or null}",
    "edge": "{the unique angle — or null}"
  },
  "features_planned": 0,
  "features_built": 0,
  "features": [],
  "acceptance_criteria": false,
  "sessions": [{existing sessions array — MUST be preserved across rewrites}],
  "files_count": 0,
  "complexity_score": 0,
  "warnings": [],
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

- `socratic_depth`: the classified depth from the opening answer (quick/standard/deep)
- `socratic_rounds`: running count of questions asked (increment after each Q+A)
- `acceptance_criteria`: set to `true` once `.prism/acceptance-criteria.md` and
  `.prism/test-criteria.json` are generated in Phase 4

## During CREATING+ — update features as you build them

The `features` array drives the feature checklist in the sidebar. Each feature
has a `name`, `done` boolean, and `verification` object tracking the last
verification outcome for that feature.

```bash
cat > .prism/state.json << EOF
{
  "status": "creating",
  "intent": "{one-line vision brief}",
  "socratic_depth": "{quick|standard|deep}",
  "socratic_rounds": {N},
  "vision": {
    "person": "{captured}",
    "feeling": "{captured}",
    "moment": "{captured}",
    "edge": "{captured}"
  },
  "features_planned": {N},
  "features_built": {N},
  "features": [
    {
      "name": "{magic moment feature}",
      "done": true,
      "verification": {"tests": "pass", "llm": "ok", "outcome": "auto_proceed"}
    },
    {
      "name": "{feature 2}",
      "done": false,
      "verification": null
    },
    {
      "name": "{feature 3}",
      "done": false,
      "verification": null
    }
  ],
  "acceptance_criteria": true,
  "sessions": [{existing sessions array — MUST be preserved across rewrites}],
  "current_focus": "{feature being built right now}",
  "files_count": {N},
  "complexity_score": {0-10},
  "warnings": [],
  "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

The `verification` object per feature tracks:
- `tests`: "pass" | "fail" | null (not yet run)
- `llm`: "ok" | "flagged" | null
- `outcome`: "auto_proceed" | "advisory" | "silent_fix" | "escalated" | "override" | null

Also maintain a history log:

```bash
echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","action":"{what was done}","feature":"{which feature}"}' >> .prism/history.jsonl
```

## Session History Tracking

The `sessions` array in `state.json` tracks every Prism session for continuity
across conversations. Each entry records when the session started, when it ended,
and what was accomplished:

```json
"sessions": [
  {"started": "2026-03-20T10:00:00Z", "ended": "2026-03-20T11:30:00Z", "features_completed": ["magic moment", "signup flow"]},
  {"started": "2026-03-21T09:00:00Z", "ended": null, "features_completed": []}
]
```

**When to update the sessions array:**

- **Session start:** Append a new entry with `started` set to the current time,
  `ended` as `null`, and `features_completed` as an empty array. For returning
  sessions, this happens in Phase 0 after reading existing state.
- **Feature completion:** Push the feature name into the current session's
  `features_completed` array whenever a feature moves to `done`.
- **Session end:** When the founder says goodbye, when the conversation ends,
  or when transitioning to DONE — update the current session's `ended` timestamp.

This array is what powers the "Welcome back" message in Phase 0. Prism reads the
last session's `features_completed` to tell the founder what they accomplished,
and checks the current `state.json` for what comes next.

The dashboard reads these files to show the founder their product taking shape
in real-time.
