import type { AbsolutePath, EntityId } from "@prism/core";
import { validateEntityId } from "@prism/core";
import { homedir } from "node:os";
import type {
  CheckpointArtifactPaths,
  PlanArtifactPaths,
  PrismProjectPaths,
  ProblemArtifactPaths,
  ProjectArtifactLocator,
  ReleaseStateArtifactPaths,
  ReviewArtifactPaths,
  RunArtifactPaths,
  ShipReceiptArtifactPaths,
  SpecArtifactPaths,
  DogfoodArtifactPaths,
  IntakeBriefArtifactPaths,
  SolutionThesisArtifactPaths,
  WorkspacePaths,
} from "./contracts";

function joinPath(base: string, ...parts: string[]): AbsolutePath {
  return [base.replace(/\/$/, ""), ...parts].join("/") as AbsolutePath;
}

export const MEMORY_FILE_CONTRACTS = [
  { key: "product", relativePath: ".prism/memory/product.md", required: true },
  {
    key: "architecture",
    relativePath: ".prism/memory/architecture.md",
    required: true,
  },
  { key: "roadmap", relativePath: ".prism/memory/roadmap.md", required: true },
  { key: "state", relativePath: ".prism/memory/state.md", required: true },
  {
    key: "decisions",
    relativePath: ".prism/memory/decisions.md",
    required: true,
  },
] as const;

export function projectPaths(projectRoot: AbsolutePath): PrismProjectPaths {
  const prismDir = joinPath(projectRoot, ".prism");
  return {
    projectRoot,
    prismDir,
    memoryDir: joinPath(prismDir, "memory"),
    specsDir: joinPath(prismDir, "specs"),
    plansDir: joinPath(prismDir, "plans"),
    reviewsDir: joinPath(prismDir, "reviews"),
    runsDir: joinPath(prismDir, "runs"),
    checkpointsDir: joinPath(prismDir, "checkpoints"),
    evalsDir: joinPath(prismDir, "evals"),
    proposalsDir: joinPath(prismDir, "proposals"),
    releaseStateDir: joinPath(prismDir, "release-state"),
    problemsDir: joinPath(prismDir, "problems"),
    shipsDir: joinPath(prismDir, "ships"),
    researchDir: joinPath(prismDir, "research"),
    intakeDir: joinPath(prismDir, "intake"),
    thesesDir: joinPath(prismDir, "theses"),
    dogfoodDir: joinPath(prismDir, "dogfood"),
    telemetryFile: joinPath(prismDir, "telemetry.jsonl"),
    registryFile: joinPath(prismDir, "registry.json"),
    taskGraphFile: joinPath(prismDir, "task-graph.json"),
  };
}

export function specPaths(
  projectRoot: AbsolutePath,
  specId: EntityId
): SpecArtifactPaths {
  const specDir = joinPath(projectPaths(projectRoot).specsDir, validateEntityId(specId));
  return {
    specDir,
    specFile: joinPath(specDir, "spec.md"),
    metadataFile: joinPath(specDir, "metadata.json"),
  };
}

export function planPaths(
  projectRoot: AbsolutePath,
  planId: EntityId
): PlanArtifactPaths {
  const planDir = joinPath(projectPaths(projectRoot).plansDir, validateEntityId(planId));
  return {
    planDir,
    planFile: joinPath(planDir, "plan.md"),
    metadataFile: joinPath(planDir, "metadata.json"),
    taskGraphFile: joinPath(planDir, "task-graph.json"),
  };
}

export function reviewPaths(
  projectRoot: AbsolutePath,
  specId: EntityId
): ReviewArtifactPaths {
  const reviewDir = joinPath(projectPaths(projectRoot).reviewsDir, validateEntityId(specId));
  return {
    reviewDir,
    planningReview: joinPath(reviewDir, "planning-review.md"),
    engineeringReview: joinPath(reviewDir, "engineering-review.md"),
    qaReview: joinPath(reviewDir, "qa-review.md"),
    designReview: joinPath(reviewDir, "design-review.md"),
    shipReadinessReview: joinPath(reviewDir, "ship-readiness.md"),
  };
}

export function checkpointPaths(
  projectRoot: AbsolutePath
): CheckpointArtifactPaths {
  const checkpointsDir = projectPaths(projectRoot).checkpointsDir;
  return {
    checkpointsDir,
    latestJson: joinPath(checkpointsDir, "latest.json"),
    latestMarkdown: joinPath(checkpointsDir, "latest.md"),
    historyDir: joinPath(checkpointsDir, "history"),
  };
}

export function runPaths(
  projectRoot: AbsolutePath,
  runId: EntityId
): RunArtifactPaths {
  const runDir = joinPath(projectPaths(projectRoot).runsDir, validateEntityId(runId));
  return {
    runDir,
    summaryFile: joinPath(runDir, "summary.md"),
    verificationFile: joinPath(runDir, "verification.json"),
    reviewIndexFile: joinPath(runDir, "review-index.json"),
  };
}

export function releaseStatePaths(
  projectRoot: AbsolutePath,
  specId: EntityId
): ReleaseStateArtifactPaths {
  const releaseStateDir = joinPath(
    projectPaths(projectRoot).releaseStateDir,
    validateEntityId(specId)
  );
  return {
    releaseStateDir,
    stateFile: joinPath(releaseStateDir, "state.json"),
  };
}

export function problemPaths(
  projectRoot: AbsolutePath,
  problemId: EntityId
): ProblemArtifactPaths {
  const problemDir = joinPath(
    projectPaths(projectRoot).problemsDir,
    validateEntityId(problemId)
  );
  return {
    problemDir,
    metadataFile: joinPath(problemDir, "metadata.json"),
  };
}

export function shipReceiptPaths(
  projectRoot: AbsolutePath,
  specId: EntityId
): ShipReceiptArtifactPaths {
  const shipDir = joinPath(projectPaths(projectRoot).shipsDir, validateEntityId(specId));
  return {
    shipDir,
    receiptFile: joinPath(shipDir, "receipt.json"),
  };
}

export function dogfoodPaths(
  projectRoot: AbsolutePath
): DogfoodArtifactPaths {
  const dogfoodDir = joinPath(projectPaths(projectRoot).dogfoodDir);
  return {
    dogfoodDir,
    reportsDir: joinPath(dogfoodDir, "reports"),
    prescriptionsDir: joinPath(dogfoodDir, "prescriptions"),
    journalFile: joinPath(dogfoodDir, "learning-journal.json"),
    healthFile: joinPath(dogfoodDir, "HEALTH.md"),
    dogfoodIndexFile: joinPath(dogfoodDir, "dogfood-index.json"),
    exportFile: joinPath(dogfoodDir, "export.json"),
  };
}

export function intakeBriefPaths(
  projectRoot: AbsolutePath,
  briefId: EntityId
): IntakeBriefArtifactPaths {
  const intakeDir = joinPath(
    projectPaths(projectRoot).intakeDir,
    validateEntityId(briefId)
  );
  return {
    intakeDir,
    metadataFile: joinPath(intakeDir, "metadata.json"),
  };
}

export function solutionThesisPaths(
  projectRoot: AbsolutePath,
  thesisId: EntityId
): SolutionThesisArtifactPaths {
  const thesisDir = joinPath(
    projectPaths(projectRoot).thesesDir,
    validateEntityId(thesisId)
  );
  return {
    thesisDir,
    metadataFile: joinPath(thesisDir, "metadata.json"),
  };
}

export function workspacePaths(home?: AbsolutePath): WorkspacePaths {
  const workspaceHome = home ?? (joinPath(homedir(), ".prism") as AbsolutePath);
  return {
    workspaceHome,
    dbPath: joinPath(workspaceHome, "workspace.db"),
    settingsPath: joinPath(workspaceHome, "settings.json"),
    templatesDir: joinPath(workspaceHome, "templates"),
  };
}

export const prismArtifactLocator: ProjectArtifactLocator = {
  projectPaths,
  specPaths,
  planPaths,
  reviewPaths,
  checkpointPaths,
  runPaths,
  releaseStatePaths,
};
