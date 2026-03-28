import { readFile } from "node:fs/promises";
import type {
  AbsolutePath,
  EntityId,
  PlanQualityDimension,
  PlanQualityResult,
  TaskGraph,
  TaskNode,
  TraceabilityEntry,
} from "@prism/core";
import {
  createSpecRepository,
  createPlanRepository,
  planPaths,
} from "@prism/memory";

export async function evaluatePlanQuality(
  projectRoot: AbsolutePath,
  planId: EntityId,
  specId: EntityId,
): Promise<PlanQualityResult> {
  const planRepo = createPlanRepository(projectRoot);
  const plan = await planRepo.readMetadata(planId);

  if (!plan) {
    return legacyResult("Plan not found");
  }

  // Legacy bypass: planVersion missing or 1
  if (!plan.planVersion || plan.planVersion === 1) {
    return legacyResult("This plan uses the legacy format. Quality checks were skipped.");
  }

  // Read task graph
  const paths = planPaths(projectRoot, planId);
  let taskGraph: TaskGraph;
  try {
    const raw = await readFile(paths.taskGraphFile, "utf-8");
    taskGraph = JSON.parse(raw) as TaskGraph;
  } catch {
    // v2 plan with unreadable task graph = blocker, not legacy bypass
    return {
      passed: false,
      legacy: false,
      score: 0,
      dimensions: [dim("Task Graph", false, true, 0, "task-graph.json is missing or contains invalid JSON")],
      summary: "task-graph.json is missing or contains invalid JSON. Fix before building.",
      traceability: [],
    };
  }

  if (!taskGraph.tasks || !Array.isArray(taskGraph.tasks)) {
    return {
      passed: false,
      legacy: false,
      score: 0,
      dimensions: [dim("Task Graph", false, true, 0, "task-graph.json has no tasks array")],
      summary: "task-graph.json has no tasks array. Fix before building.",
      traceability: [],
    };
  }

  const tasks = taskGraph.tasks;

  // Read spec for acceptance criteria
  const specRepo = createSpecRepository(projectRoot);
  const spec = await specRepo.readMetadata(specId);
  const acceptanceCriteria = spec?.acceptanceCriteria ?? [];

  // Build traceability matrix
  const traceability = buildTraceabilityMatrix(acceptanceCriteria, tasks);

  // Evaluate all 8 dimensions
  const dimensions: PlanQualityDimension[] = [
    evalRequirementCoverage(traceability),
    evalTaskCompleteness(tasks),
    evalDependencyCorrectness(tasks),
    evalKeyLinksPlanned(plan.phases, tasks),
    evalScopeSanity(tasks, plan.scopeMode),
    evalVerificationDerivation(tasks),
    evalContextBudget(tasks, plan.totalContextBudgetPct),
    evalArtifactCompleteness(plan.phases, tasks),
  ];

  const score = dimensions.reduce((sum, d) => sum + d.score, 0);
  const hasAnyBlocker = dimensions.some((d) => d.hasBlocker);
  const passed = score >= 70 && !hasAnyBlocker;

  return {
    passed,
    legacy: false,
    score,
    dimensions,
    summary: toPlainEnglishSummary(dimensions, traceability, passed),
    traceability,
  };
}

function legacyResult(summary: string): PlanQualityResult {
  return {
    passed: true,
    legacy: true,
    score: 50,
    dimensions: [],
    summary,
    traceability: [],
  };
}

// ---------------------------------------------------------------------------
// Traceability
// ---------------------------------------------------------------------------

interface ACLike {
  id: EntityId;
  description: string;
}

function buildTraceabilityMatrix(
  criteria: ACLike[],
  tasks: TaskNode[],
): TraceabilityEntry[] {
  return criteria.map((ac) => {
    const matchingTaskIds = tasks
      .filter((t) =>
        t.mustHaves?.truths?.some((truth) => truth.id === ac.id),
      )
      .map((t) => t.id);

    return {
      criterionId: ac.id,
      criterionDescription: ac.description,
      matchingTaskIds,
      coverage: matchingTaskIds.length > 0 ? "full" as const : "missing" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Dimension evaluators
// ---------------------------------------------------------------------------

const MAX_SCORE = 12.5;

function evalRequirementCoverage(
  traceability: TraceabilityEntry[],
): PlanQualityDimension {
  if (traceability.length === 0) {
    return dim("Requirement Coverage", true, false, MAX_SCORE, "No acceptance criteria to check");
  }
  const missing = traceability.filter((t) => t.coverage === "missing");
  if (missing.length > 0) {
    return dim(
      "Requirement Coverage",
      false,
      true,
      0,
      `${missing.length} requirement(s) have no matching tasks: ${missing.map((m) => m.criterionDescription).join(", ")}`,
    );
  }
  return dim("Requirement Coverage", true, false, MAX_SCORE, `All ${traceability.length} requirements covered`);
}

function evalTaskCompleteness(tasks: TaskNode[]): PlanQualityDimension {
  let warnings = 0;
  let blockers = 0;
  const details: string[] = [];

  for (const task of tasks) {
    const hasFiles = task.files && task.files.length > 0;
    const hasAction = task.action && task.action.length > 0;
    const hasVerify = task.verify && task.verify.length > 0;
    const hasDone = task.done && task.done.length > 0;
    const hasMustHaves = task.mustHaves != null;

    const missing = [
      !hasFiles && "files",
      !hasAction && "action",
      !hasVerify && "verify",
      !hasDone && "done",
    ].filter(Boolean);

    if (missing.length === 4) {
      blockers++;
      details.push(`Task "${task.title}" has no structured fields`);
    } else if (missing.length > 0) {
      warnings++;
    }
    if (!hasMustHaves) {
      warnings++;
    }
  }

  if (blockers > 0) {
    return dim("Task Completeness", false, true, 0, details.join("; "));
  }
  if (warnings > 0) {
    return dim("Task Completeness", true, false, MAX_SCORE / 2, `${warnings} warning(s): some tasks missing optional structured fields`);
  }
  return dim("Task Completeness", true, false, MAX_SCORE, "All tasks have complete structured fields");
}

function evalDependencyCorrectness(tasks: TaskNode[]): PlanQualityDimension {
  const taskIds = new Set(tasks.map((t) => t.id));
  const details: string[] = [];

  // Check invalid references
  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      if (!taskIds.has(dep)) {
        details.push(`Task "${task.title}" depends on unknown task ${dep}`);
      }
    }
  }

  // Check circular dependencies
  if (hasCycle(tasks)) {
    details.push("Circular dependency detected");
  }

  // Check wave consistency
  for (const task of tasks) {
    if (task.wave == null) continue;
    for (const dep of task.dependsOn ?? []) {
      const depTask = tasks.find((t) => t.id === dep);
      if (depTask?.wave != null && depTask.wave > task.wave) {
        details.push(`Task "${task.title}" (wave ${task.wave}) depends on "${depTask.title}" (wave ${depTask.wave})`);
      }
    }
  }

  if (details.length > 0) {
    return dim("Dependency Correctness", false, true, 0, details.join("; "));
  }
  return dim("Dependency Correctness", true, false, MAX_SCORE, "No circular dependencies, all references valid");
}

function hasCycle(tasks: TaskNode[]): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    const task = taskMap.get(id as EntityId);
    if (task) {
      for (const dep of task.dependsOn ?? []) {
        if (dfs(dep)) return true;
      }
    }
    inStack.delete(id);
    return false;
  }

  return tasks.some((t) => dfs(t.id));
}

interface PhaseLike {
  requiredWiring?: Array<{ from: string; to: string; via: string; pattern: string }>;
  requiredArtifacts?: Array<{ path: string; provides: string }>;
}

function evalKeyLinksPlanned(
  phases: PhaseLike[],
  tasks: TaskNode[],
): PlanQualityDimension {
  const requiredWiring = phases.flatMap((p) => p.requiredWiring ?? []);
  if (requiredWiring.length === 0) {
    return dim("Key Links Planned", true, false, MAX_SCORE, "No required wiring specified");
  }

  const uncovered: string[] = [];
  for (const wire of requiredWiring) {
    const covered = tasks.some((t) =>
      t.mustHaves?.keyLinks?.some(
        (kl) => kl.from === wire.from && kl.to === wire.to,
      ),
    );
    if (!covered) {
      uncovered.push(`${wire.from} -> ${wire.to} via ${wire.via}`);
    }
  }

  if (uncovered.length > 0) {
    return dim("Key Links Planned", false, true, 0, `Uncovered wiring: ${uncovered.join(", ")}`);
  }
  return dim("Key Links Planned", true, false, MAX_SCORE, "All required wiring covered by tasks");
}

function evalScopeSanity(
  tasks: TaskNode[],
  scopeMode?: string,
): PlanQualityDimension {
  const count = tasks.length;
  const mode = scopeMode ?? "exact";
  const limits: Record<string, number> = {
    exact: 8,
    minimum_viable: 8,
    targeted: 15,
    full_build: 20,
  };
  const limit = limits[mode] ?? 15;

  if (count > limit) {
    return dim(
      "Scope Sanity",
      true,
      false,
      MAX_SCORE / 2,
      `${count} tasks exceeds ${mode} limit of ${limit} — consider splitting`,
    );
  }
  return dim("Scope Sanity", true, false, MAX_SCORE, `${count} tasks within ${mode} limit of ${limit}`);
}

function evalVerificationDerivation(tasks: TaskNode[]): PlanQualityDimension {
  const blockers: string[] = [];

  for (const task of tasks) {
    if (!task.verify || task.verify.length === 0) {
      blockers.push(`Task "${task.title}" has no verify step`);
    }
    if (!task.done || task.done.length === 0) {
      blockers.push(`Task "${task.title}" has no done criteria`);
    }
  }

  if (blockers.length > 0) {
    return dim("Verification Derivation", false, true, 0, blockers.join("; "));
  }
  return dim("Verification Derivation", true, false, MAX_SCORE, "Every task has verify and done criteria");
}

function evalContextBudget(
  tasks: TaskNode[],
  totalBudget?: number,
): PlanQualityDimension {
  const warnings: string[] = [];
  const total = totalBudget ?? tasks.reduce((sum, t) => sum + (t.contextBudgetPct ?? 0), 0);

  for (const task of tasks) {
    if (task.contextBudgetPct != null && task.contextBudgetPct > 25) {
      warnings.push(`Task "${task.title}" uses ${task.contextBudgetPct}% context (>25%)`);
    }
  }

  if (total > 50) {
    warnings.push(`Total context budget is ${total}% (>50%)`);
  }

  if (warnings.length > 0) {
    return dim("Context Budget", true, false, MAX_SCORE / 2, warnings.join("; "));
  }
  return dim("Context Budget", true, false, MAX_SCORE, `Context budget within limits (${total}%)`);
}

function evalArtifactCompleteness(
  phases: PhaseLike[],
  tasks: TaskNode[],
): PlanQualityDimension {
  const requiredArtifacts = phases.flatMap((p) => p.requiredArtifacts ?? []);
  if (requiredArtifacts.length === 0) {
    return dim("Artifact Completeness", true, false, MAX_SCORE, "No required artifacts specified");
  }

  const allTaskFiles = new Set(
    tasks.flatMap((t) => [...(t.files ?? []), ...(t.artifactsTouched ?? [])]),
  );

  const uncovered = requiredArtifacts.filter((a) => !allTaskFiles.has(a.path));
  if (uncovered.length > 0) {
    return dim(
      "Artifact Completeness",
      true,
      false,
      MAX_SCORE / 2,
      `${uncovered.length} required artifact(s) not in any task's files: ${uncovered.map((a) => a.path).join(", ")}`,
    );
  }
  return dim("Artifact Completeness", true, false, MAX_SCORE, "All required artifacts covered by tasks");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dim(
  name: string,
  passed: boolean,
  hasBlocker: boolean,
  score: number,
  details: string,
): PlanQualityDimension {
  return { name, passed, hasBlocker, score, details };
}

function toPlainEnglishSummary(
  dimensions: PlanQualityDimension[],
  traceability: TraceabilityEntry[],
  passed: boolean,
): string {
  if (passed) {
    const reqCount = traceability.length;
    return `Your plan covers all ${reqCount} requirement${reqCount !== 1 ? "s" : ""}. Every task has a clear verification step. No blind spots detected.`;
  }

  const issues: string[] = [];
  for (const d of dimensions) {
    if (!d.passed) {
      issues.push(d.details);
    }
  }
  return `${issues.join(". ")}. Fix these before building.`;
}
