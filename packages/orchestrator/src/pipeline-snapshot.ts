/**
 * pipeline-snapshot.ts — Extract a structured snapshot of Prism's pipeline state.
 *
 * Composes existing modules (resume-engine, gate-evaluator, prescription-manager,
 * health-dashboard) into a single PipelineSnapshot JSON contract. This contract
 * is the future IPC interface for the Electron desktop shell.
 *
 * Data flow:
 *   resumeFromArtifacts() ──┐
 *   evaluateTransition()  ──┤──► PipelineSnapshot JSON
 *   readActivePrescriptions()─┤
 *   dogfood artifacts ────────┘
 */

import type {
  AbsolutePath,
  EntityId,
  LearningJournal,
  WorkflowPhase,
} from "@prism/core";
import { dogfoodPaths, projectPaths } from "@prism/memory";
import { readFile, access } from "node:fs/promises";

import { resumeFromArtifacts } from "./resume-engine";
import { evaluateTransition } from "./gate-evaluator";
import { readActivePrescriptions } from "./prescription-manager";
import { deriveProjectId } from "./bridge-adapters";
import { DEFAULT_WORKFLOW_SEQUENCE, getNextWorkflowPhase } from "./workflow";

// ---------------------------------------------------------------------------
// Types — the PipelineSnapshot contract
// ---------------------------------------------------------------------------

export interface GateRequirement {
  description: string;
  met: boolean;
}

export interface ArtifactStatus {
  name: string;
  present: boolean;
  path: string;
}

export interface StageDescriptor {
  id: string;
  label: string;
  description: string;
  status: "completed" | "current" | "blocked" | "upcoming";
  gateRequirements: GateRequirement[];
  artifacts: ArtifactStatus[];
  blockers: string[];
}

export interface Recommendation {
  source: "prescription" | "checkpoint";
  severity: string;
  text: string;
}

export interface Weakness {
  dimension: string;
  trend: string;
  avgScore: number;
  recentScores: (number | null)[];
  detail: string;
  recurring: boolean;
}

export interface PipelineSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  projectRoot: string;
  activeSpecId: string | null;
  currentPhase: WorkflowPhase;
  resumeSource: string;
  stages: StageDescriptor[];
  recommendations: Recommendation[];
  weaknesses: Weakness[];
  healthScore: number | null;
  healthTrend: string;
}

// ---------------------------------------------------------------------------
// Stage metadata
// ---------------------------------------------------------------------------

const STAGE_META: Record<string, { label: string; description: string }> = {
  understand: {
    label: "Understand",
    description: "Discover the problem space through Socratic dialogue",
  },
  identify_problem: {
    label: "Identify Problem",
    description: "Frame the core problem with an IntakeBrief",
  },
  spec: {
    label: "Spec",
    description: "Write an approved specification with acceptance criteria",
  },
  plan: {
    label: "Plan",
    description: "Create a quality-gated plan with task graph",
  },
  execute: {
    label: "Execute",
    description: "Build the solution with checkpoint tracking",
  },
  verify: {
    label: "Verify",
    description: "Run verification and reviews against acceptance criteria",
  },
  release: {
    label: "Release",
    description: "Ship with PR, deploy detection, and ship receipt",
  },
};

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export async function extractPipelineSnapshot(
  projectRoot: AbsolutePath,
): Promise<PipelineSnapshot> {
  const projectId = deriveProjectId(undefined, projectRoot);

  // Step 1: Resume to get current state
  const resume = await resumeFromArtifacts(projectRoot, projectId);
  const currentPhase = resume.workflow.phase;
  const activeSpecId = resume.workflow.activeSpecId;
  const blockers = resume.summary.blockers;
  const nextActions = resume.summary.nextActions;

  // Step 2: Evaluate the current→next gate
  const nextPhase = getNextWorkflowPhase(currentPhase);
  let gateResult = { allowed: false, blockers: [] as string[], evidence: [] as string[] };
  if (nextPhase) {
    try {
      gateResult = await evaluateTransition(
        currentPhase,
        nextPhase,
        projectRoot,
        activeSpecId ?? undefined,
      );
    } catch {
      // Gate evaluation failed — leave as default
    }
  }

  // Step 3: Build stage descriptors
  const currentIdx = DEFAULT_WORKFLOW_SEQUENCE.indexOf(currentPhase);
  const stages: StageDescriptor[] = await Promise.all(
    DEFAULT_WORKFLOW_SEQUENCE.map(async (phase, idx) => {
      const meta = STAGE_META[phase] ?? { label: phase, description: "" };

      let status: StageDescriptor["status"];
      if (idx < currentIdx) {
        status = "completed";
      } else if (idx === currentIdx) {
        status = (blockers.length > 0 || gateResult.blockers.length > 0) ? "blocked" : "current";
      } else {
        status = "upcoming";
      }

      // Gate requirements: only populated for the current→next transition
      const gateRequirements: GateRequirement[] = [];
      if (idx === currentIdx && nextPhase) {
        for (const evidence of gateResult.evidence) {
          gateRequirements.push({ description: evidence, met: true });
        }
        for (const blocker of gateResult.blockers) {
          gateRequirements.push({ description: blocker, met: false });
        }
      }

      // Artifacts: check stage-specific files
      const artifacts = await getStageArtifacts(projectRoot, phase, activeSpecId);

      return {
        id: phase,
        label: meta.label,
        description: meta.description,
        status,
        gateRequirements,
        artifacts,
        blockers: idx === currentIdx ? blockers : [],
      };
    }),
  );

  // Step 4: Read prescriptions → recommendations
  const recommendations: Recommendation[] = [];
  try {
    const prescriptions = await readActivePrescriptions(projectRoot);
    for (const p of prescriptions) {
      recommendations.push({
        source: "prescription",
        severity: p.severity,
        text: p.prescription,
      });
    }
  } catch {
    // No prescriptions available
  }

  // Add checkpoint next actions as recommendations
  for (const action of nextActions) {
    recommendations.push({
      source: "checkpoint",
      severity: "info",
      text: action,
    });
  }

  // Step 5: Read learning journal → weaknesses
  const weaknesses: Weakness[] = [];
  let healthScore: number | null = null;
  let healthTrend = "stable";

  try {
    const paths = dogfoodPaths(projectRoot);
    const journalContent = await readFile(paths.journalFile, "utf-8");
    const journal = JSON.parse(journalContent) as LearningJournal;

    healthScore = journal.overallAvgScore != null
      ? Math.round(journal.overallAvgScore * 10)
      : null;
    healthTrend = journal.overallTrend ?? "stable";

    for (const pattern of journal.patterns) {
      weaknesses.push({
        dimension: pattern.dimension,
        trend: pattern.trend,
        avgScore: pattern.avgScore,
        recentScores: pattern.recentScores,
        detail: pattern.detail,
        recurring: pattern.recurring,
      });
    }
  } catch {
    // Journal missing or corrupt — weaknesses stay empty
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectRoot,
    activeSpecId,
    currentPhase,
    resumeSource: resume.source,
    stages,
    recommendations,
    weaknesses,
    healthScore,
    healthTrend,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function getStageArtifacts(
  projectRoot: AbsolutePath,
  phase: WorkflowPhase,
  activeSpecId: EntityId | null,
): Promise<ArtifactStatus[]> {
  const paths = projectPaths(projectRoot);
  const artifacts: ArtifactStatus[] = [];

  switch (phase) {
    case "understand":
      artifacts.push({
        name: ".prism directory",
        present: await pathExists(paths.prismDir),
        path: paths.prismDir,
      });
      break;
    case "identify_problem":
      artifacts.push({
        name: "IntakeBrief",
        present: await pathExists(paths.intakeDir),
        path: paths.intakeDir,
      });
      break;
    case "spec":
      if (activeSpecId) {
        const specPath = `${paths.specsDir}/${activeSpecId}`;
        artifacts.push({
          name: "Specification",
          present: await pathExists(specPath),
          path: specPath,
        });
      }
      break;
    case "plan":
      artifacts.push({
        name: "Plan",
        present: await pathExists(paths.plansDir),
        path: paths.plansDir,
      });
      break;
    case "execute":
      artifacts.push({
        name: "Checkpoint",
        present: await pathExists(paths.checkpointsDir),
        path: paths.checkpointsDir,
      });
      break;
    case "verify":
      artifacts.push({
        name: "Reviews",
        present: await pathExists(paths.reviewsDir),
        path: paths.reviewsDir,
      });
      break;
    case "release":
      artifacts.push({
        name: "Ship Receipt",
        present: await pathExists(paths.shipsDir),
        path: paths.shipsDir,
      });
      break;
  }

  return artifacts;
}
