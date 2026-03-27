# Phase C: Native Supervisor

## Overview

Add a formal task graph lifecycle manager to Prism v3. The supervisor is a structured JSON state machine managed by bash (not a separate Python process), with the LLM as the brain. It enhances the existing registry + checkpoint system with dependency-aware task scheduling, cycle detection, and coordinated dispatch.

### Requirement: Task Graph Planning

The system SHALL accept a task graph JSON on stdin via `prism-supervisor.sh plan` and validate it before persisting to the registry.

The system SHALL reject task graphs with:
- Missing `tasks` array
- Tasks without `id` or `name` fields
- Duplicate task IDs
- Cyclic dependencies (detected via Kahn's algorithm)
- Dependencies referencing non-existent task IDs

The system SHALL set initial task statuses based on dependencies:
- Tasks with no dependencies: `ready`
- Tasks with unmet dependencies: `pending`

The system SHALL store the task graph in the `task_graph` field of `registry.json`.

#### Scenario: Valid graph is accepted
WHEN a valid task graph JSON with 2 tasks (t1 with no deps, t2 depending on t1) is piped to `plan`
THEN the command exits 0
AND t1 has status `ready`
AND t2 has status `pending`
AND both tasks are stored in `registry.json` under `task_graph.tasks`

#### Scenario: Cyclic graph is rejected
WHEN a task graph where t1 depends on t2 and t2 depends on t1 is piped to `plan`
THEN the command exits non-zero
AND stderr contains "cycle"

#### Scenario: Bad dependency reference is rejected
WHEN a task graph where t1 depends on non-existent t99 is piped to `plan`
THEN the command exits non-zero
AND stderr contains "non-existent"

### Requirement: Task Dispatch Coordination

The system SHALL provide a `next` command that returns all tasks with status `ready`.

The system SHALL provide a `complete` command that:
- Marks the specified task as `completed`
- Promotes dependent tasks to `ready` if all their dependencies are now complete
- Returns the set of newly ready tasks

The system SHALL provide a `fail` command that:
- Increments the task's retry counter
- Sets status to `failed` if retries < max_retries (default 3)
- Sets status to `blocked` if retries >= max_retries

#### Scenario: Next returns only ready tasks
WHEN `next` is called on a graph with 1 ready task and 1 pending task
THEN only the ready task is returned

#### Scenario: Complete promotes dependents
WHEN t1 is completed and t2 depends only on t1
THEN t2 is promoted to `ready`
AND the newly ready set contains t2

#### Scenario: Fail blocks after max retries
WHEN a task is failed 3 times (with resets between failures)
THEN the task status becomes `blocked`

### Requirement: Guardian Reset

The system SHALL provide a `reset` command that sets a `failed` or `blocked` task back to `ready`.

The system SHALL NOT allow resetting a task that is not in `failed` or `blocked` status.

#### Scenario: Reset allows retry
WHEN a failed task is reset
THEN its status becomes `ready`
AND its failure_reason is cleared

#### Scenario: Reset rejects non-failed task
WHEN `reset` is called on a `ready` task
THEN the command exits non-zero

### Requirement: Status Summary

The system SHALL provide a `status` command that returns counts of tasks by status (total, completed, running, ready, pending, failed, blocked) and the critical path length.

#### Scenario: Correct counts after partial completion
WHEN 1 of 3 tasks is completed (with 2 newly promoted)
THEN status shows completed=1, ready=2, total=3

### Requirement: Registry Version 2

The registry SHALL be upgraded to version 2, adding the `task_graph` field (default `null`).

The system SHALL auto-migrate version 1 registries to version 2 when accessed by `status`, `update`, or `worker` commands.

The `init` command SHALL create version 2 registries with `task_graph: null`.

#### Scenario: V1 auto-migration
WHEN a v1 registry (no task_graph field) is accessed via `status`
THEN the registry version becomes 2
AND the `task_graph` field exists (set to null)

### Requirement: SKILL.md Integration

SKILL.md Stage 3 SHALL use the supervisor for builds with 3+ requirements:
- Decompose requirements into a task graph and pipe to `plan`
- Use `next` to get dispatchable tasks
- Use `complete`/`fail` after each worker
- Use `reset` for Guardian retries
- Use `status` for progress updates

Builds with 1-2 requirements SHALL NOT use the supervisor (inline build path unchanged).

#### Scenario: Supervisor dispatch loop
WHEN a build has 3+ requirements
THEN the Operator creates a task graph, plans it via supervisor, and dispatches workers in dependency order using the next/complete/fail/reset loop
