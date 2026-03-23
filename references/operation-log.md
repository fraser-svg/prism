# Operation Log

Prism maintains a machine-readable log of every action it takes during a build.

## Log Location

`openspec/changes/{change-name}/prism-log.md`

The log is created when Stage 1 begins and appended to as Prism progresses.

## How to Log

Use the **Agent tool** (subagent) to append entries. This keeps logging invisible
to the user.

Agent prompt for logging:

> "You are a logger for Prism. Append the following entry to the file at
> `{log-file-path}`. Create the file if it doesn't exist. Use the Read tool
> to read the current contents first, then use the Write tool to write the
> full file with the new entry appended at the end.
>
> Entry to append:
> ```
> ## {ISO-timestamp} — Stage {N}: {Stage Name}
> - Action: {what Prism did}
> - Result: {outcome}
> - Detail: {optional context — file paths, validation status, user decisions}
> ```
>
> Return: 'Logged' or describe any error."

## When to Log

Log every significant action — verbose for diagnostics while Prism is being developed.

| Event | Action text | Result text |
|-------|------------|-------------|
| Stage 0 scan | "Scanned for in-progress work" | "Found: {name}" or "None found" |
| Stage 1 start | "Asked sharpening questions" | Summary of user's answers |
| Spec generated | "Generated OpenSpec spec via subagent" | Spec path + validation status |
| Spec approved | "User approved spec" | "Approved" or "Approved with revisions" |
| Stage 2 invoked | "Auto-invoked /plan-eng-review" | Outcome from planning |
| Stage 2 skipped | "User skipped planning" | "Skipped" |
| Stage 3 start | "Started build" | Number of requirements |
| Requirement built | "Built requirement: {name}" | Status |
| Drift detected | "Drift detected" | Description + user decision |
| Stage 4 invoked | "Auto-invoked /qa" | QA outcome |
| Stage 4 skipped | "User skipped QA" | "Skipped" |
| Stage 5 invoked | "Auto-invoked /ship" | Ship outcome |
| Change archived | "Archived change" | Archive status |
| Recovery/backstep | "User requested backstep to Stage {N}" | Reason |
| Error/retry | "Subagent failed, retrying" | Retry outcome |
| Spec change | "User requested spec change" | Delta summary |

## Log Format

Each entry is a level-2 markdown heading with ISO timestamp, followed by bullet
points. This is both human-scannable and machine-parseable
(regex: `^## (.+?) — Stage (\d): (.+)$`).

## Rules

- Never skip logging. Every stage transition and significant action gets an entry.
- Logging failures are silent — never surface a logging error to the user.
- Wait for the logging subagent to return before proceeding. Do not start the next operation while logging is in progress.
- Each active change has its own log file.
