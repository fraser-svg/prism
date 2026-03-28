---
name: openspec-propose
description: Propose a new change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.2.0"
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- tasks.md (implementation steps)

When ready to implement, run /opsx:apply

---

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory**
   ```bash
   openspec new change "<name>"
   ```
   This creates a scaffolded change at `openspec/changes/<name>/` with `.openspec.yaml`.

3. **Get the artifact build order**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to get:
   - `applyRequires`: array of artifact IDs needed before implementation (e.g., `["tasks"]`)
   - `artifacts`: list of all artifacts with their status and dependencies

4. **Create artifacts in sequence until apply-ready**

   Use the **TodoWrite tool** to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each artifact that is `ready` (dependencies satisfied)**:
      - Get instructions:
        ```bash
        openspec instructions <artifact-id> --change "<name>" --json
        ```
      - The instructions JSON includes:
        - `context`: Project background (constraints for you - do NOT include in output)
        - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
        - `template`: The structure to use for your output file
        - `instruction`: Schema-specific guidance for this artifact type
        - `outputPath`: Where to write the artifact
        - `dependencies`: Completed artifacts to read for context
      - Read any completed dependency files for context
      - Create the artifact file using `template` as the structure
      - Apply `context` and `rules` as constraints - but do NOT copy them into the file
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until all `applyRequires` artifacts are complete**
      - After creating each artifact, re-run `openspec status --change "<name>" --json`
      - Check if every artifact ID in `applyRequires` has `status: "done"` in the artifacts array
      - Stop when all `applyRequires` artifacts are done

   c. **If an artifact requires user input** (unclear context):
      - Use **AskUserQuestion tool** to clarify
      - Then continue with creation

5. **Show final status**
   ```bash
   openspec status --change "<name>"
   ```

**Output**

After completing all artifacts, summarize:
- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/opsx:apply` or ask me to implement to start working on the tasks."

**Artifact Creation Guidelines**

- Follow the `instruction` field from `openspec instructions` for each artifact type
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output

**Implementation Alternatives** (in design.md, before tasks):
- Generate 2-3 approaches: one minimal viable, one recommended, one ideal
- Each with: name, description, effort (low/med/high), risk, 2-3 pros, 2-3 cons
- Present to user with AskUserQuestion (one question, three options)
- Selected approach guides task generation

**Goal-Backward Methodology** (before writing tasks):
- Derive: Phase Goal → Observable Truths → Required Artifacts → Required Wiring
- Write the `goalBackwardTrace` narrative first, then generate tasks that produce the required artifacts
- Every acceptance criterion must be covered by at least one task's must-haves truths
- Every artifact must appear in at least one task's files list

**Structured Task Format** (in tasks.md):

Each task MUST use this format:

```markdown
### Task N: [Action-oriented title]

**Files:** `path/to/file.ts`, `path/to/other.ts`
**Action:** [Specific implementation — what to do, how, constraints]
**Verify:** [Executable command or concrete check]
**Done:** [Measurable acceptance criteria]

**Avoid:**
- [What NOT to do and WHY]

**Failure Scenario:** [What Claude will be tempted to do wrong, and why it fails.
E.g., "Claude will be tempted to create a generic middleware for all auth types.
This always leads to over-engineering. Stick to JWT-only."]

**Must-Haves:**
- Truth (ac-0): [Observable behaviour when done] (verified by: [how])
- Truth (ac-1): [Another observable truth matching spec criterion]
- Artifact: `path/to/file.ts` provides [what]
- Link: `file-a.ts` -> `file-b.ts` via [mechanism], pattern: `[regex]`

**Wave:** [0-based execution wave]
**Context Budget:** ~[N]%
**Depends On:** [Task IDs or "none"]
```

**Traceability rule:** Every truth must reference an acceptance criterion ID in lowercase
(e.g., `ac-0`, `ac-1`) matching the spec's `AcceptanceCriterion.id` as generated by
`bridge-adapters.ts` (format: `ac-${index}`). This enables deterministic coverage checking.

**Dual Write** (after generating tasks.md):
- Also write the typed task graph JSON via the bridge CLI:
  ```bash
  npx tsx packages/orchestrator/src/cli.ts write-task-graph "$PROJECT_ROOT" "$PLAN_ID" <<< '{JSON}'
  ```
- The JSON must match the `TaskGraph` type with structured `TaskNode` fields (files, action, verify, done, mustHaves, wave, contextBudgetPct)

**Context Budget Calculation:**
- Estimate lines per file (default 50 per file)
- Sum all files across a task = estimated context consumption
- Rough heuristic: 100 lines ~ 1% context budget
- Total across all tasks must be < 50%

**Auto-Split** (when context budget > 50%):
- Split at wave boundaries (never mid-wave)
- Present to user: "This is a N-session build. Session 1: [wave 0 tasks]. Session 2: [wave 1+ tasks]."
- User approves the split before proceeding

**Traceability Matrix** (after generating all tasks):

Show a visual coverage table:
```
Requirement                     | Tasks      | Coverage
User can create a new project   | Task 1, 3  | Full
User can invite team members    | Task 4     | Full
System sends email notification | (none)     | MISSING
```
If any row shows MISSING, flag it and ask user whether to add a task or mark it out of scope.

**Execution Preview** (after plan approval, before execution):

Show a timeline computed from wave groupings + context budget estimates:
```
Here's what will happen:
  Wave 0: Create data models (2 tasks, ~8 min)
  Wave 1: Build API endpoints + UI components (3 tasks, ~15 min)
  Wave 2: Wire everything together (1 task, ~5 min)
  Total: ~28 min estimated
```
Time estimates: each 1% context budget ~ 30 seconds of execution time (rough heuristic).

**Guardrails**
- Create ALL artifacts needed for implementation (as defined by schema's `apply.requires`)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next
