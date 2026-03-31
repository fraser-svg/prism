// project-snapshot.ts
//
// Extract a structured snapshot of the user's project shape and state
// for the PROJECT.html visualizer. Pure extraction, no I/O side effects.
//
// Reads from product.md, specs, task graph, memory files, ship receipts,
// release state, and the latest checkpoint. Missing files produce null,
// corrupt files produce a warning.

import type {
  AbsolutePath,
  EntityId,
  ReleaseState,
  ShipReceipt,
  Spec,
} from "@prism/core";
import {
  projectPaths,
  pathExists,
  createSpecRepository,
  createCheckpointRepository,
  shipReceiptPaths,
  releaseStatePaths,
  planPaths,
} from "@prism/memory";
import { readFile, readdir } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeatureEntry {
  specId: string;
  title: string;
  status: "shipped" | "in_progress" | "planned";
  specStatus: string;
  acceptanceCriteria: { total: number; passing: number };
  shippedAt: string | null;
}

export interface TaskProgressEntry {
  id: string;
  title: string;
  status: string;
  wave?: number;
}

export interface TaskProgress {
  total: number;
  completed: number;
  tasks: TaskProgressEntry[];
}

export interface ShipStatusEntry {
  specId: string;
  specTitle: string;
  prUrl: string | null;
  shippedAt: string;
  confidence: string | null;
}

export interface ProjectSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  projectRoot: string;

  projectName: string | null;
  productSummary: string | null;
  targetUser: string | null;

  features: FeatureEntry[];
  taskProgress: TaskProgress | null;

  architectureMarkdown: string | null;
  stateMarkdown: string | null;
  roadmapMarkdown: string | null;
  decisionsMarkdown: string | null;

  shipStatus: ShipStatusEntry[];

  currentPhase: string | null;
  blockers: string[];
  nextActions: string[];

  warnings: string[];
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export async function extractProjectSnapshot(
  projectRoot: AbsolutePath,
): Promise<ProjectSnapshot> {
  const paths = projectPaths(projectRoot);
  const warnings: string[] = [];

  // 1. Product identity from product.md
  const { projectName, productSummary, targetUser } = await readProductIdentity(
    `${paths.memoryDir}/product.md`,
    warnings,
  );

  // 2. Specs → feature map (type=product only)
  const features = await readFeatures(projectRoot, warnings);

  // 3. Task progress (root task-graph.json first, plan-level fallback)
  const taskProgress = await readTaskProgress(projectRoot, warnings);

  // 4. Memory markdown files
  const architectureMarkdown = await readMemoryFile(`${paths.memoryDir}/architecture.md`, "architecture.md", warnings);
  const stateMarkdown = await readMemoryFile(`${paths.memoryDir}/state.md`, "state.md", warnings);
  const roadmapMarkdown = await readMemoryFile(`${paths.memoryDir}/roadmap.md`, "roadmap.md", warnings);
  const decisionsMarkdown = await readMemoryFile(`${paths.memoryDir}/decisions.md`, "decisions.md", warnings);

  // 5. Ship status
  const shipStatus = await readShipStatus(projectRoot, features, warnings);

  // 6. Checkpoint
  const { currentPhase, blockers, nextActions } = await readCheckpointInfo(projectRoot);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectRoot,
    projectName,
    productSummary,
    targetUser,
    features,
    taskProgress,
    architectureMarkdown,
    stateMarkdown,
    roadmapMarkdown,
    decisionsMarkdown,
    shipStatus,
    currentPhase,
    blockers,
    nextActions,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readProductIdentity(
  productMdPath: string,
  warnings: string[],
): Promise<{ projectName: string | null; productSummary: string | null; targetUser: string | null }> {
  if (!(await pathExists(productMdPath))) {
    return { projectName: null, productSummary: null, targetUser: null };
  }

  let content: string;
  try {
    content = await readFile(productMdPath, "utf-8");
  } catch {
    warnings.push("product.md exists but could not be read");
    return { projectName: null, productSummary: null, targetUser: null };
  }

  const lines = content.split("\n");
  let projectName: string | null = null;
  let productSummary: string | null = null;
  let targetUser: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!projectName && trimmed.startsWith("# ")) {
      projectName = trimmed.slice(2).trim();
      continue;
    }
    if (projectName && !productSummary && trimmed && !trimmed.startsWith("#")) {
      productSummary = trimmed;
      continue;
    }
    const targetMatch = trimmed.match(/^\*{0,2}target\s*(?:user|audience)\s*:?\s*\*{0,2}\s+(.+)/i);
    if (targetMatch) {
      targetUser = targetMatch[1]!.trim();
    }
  }

  return { projectName, productSummary, targetUser };
}

async function readFeatures(
  projectRoot: AbsolutePath,
  warnings: string[],
): Promise<FeatureEntry[]> {
  const specRepo = createSpecRepository(projectRoot);
  let specIds: EntityId[];
  try {
    specIds = await specRepo.list();
  } catch {
    return [];
  }

  const features: FeatureEntry[] = [];

  for (const specId of specIds) {
    let spec: Spec | null;
    try {
      spec = await specRepo.readMetadata(specId);
    } catch {
      warnings.push(`specs/${specId}/metadata.json is corrupt`);
      continue;
    }

    if (!spec || spec.type !== "product") continue;

    // Determine shipped status via ReleaseState, fallback to receipt
    const featureStatus = await resolveFeatureStatus(projectRoot, specId, spec.status);
    const passing = spec.acceptanceCriteria.filter(ac => ac.status === "passing").length;

    let shippedAt: string | null = null;
    if (featureStatus === "shipped") {
      shippedAt = await getShipDate(projectRoot, specId);
    }

    features.push({
      specId,
      title: spec.title,
      status: featureStatus,
      specStatus: spec.status,
      acceptanceCriteria: { total: spec.acceptanceCriteria.length, passing },
      shippedAt,
    });
  }

  return features;
}

async function resolveFeatureStatus(
  projectRoot: AbsolutePath,
  specId: EntityId,
  specStatus: string,
): Promise<"shipped" | "in_progress" | "planned"> {
  // Check ReleaseState first
  try {
    const rsPath = releaseStatePaths(projectRoot, specId);
    if (await pathExists(rsPath.stateFile)) {
      const raw = await readFile(rsPath.stateFile, "utf-8");
      const rs = JSON.parse(raw) as ReleaseState;
      if (rs.decision === "go") return "shipped";
    }
  } catch {
    // Fall through to other heuristics
  }

  // Check for ship receipt as fallback
  try {
    const receiptPath = shipReceiptPaths(projectRoot, specId);
    if (await pathExists(receiptPath.receiptFile)) return "shipped";
  } catch {
    // Fall through
  }

  // Status-based grouping
  if (specStatus === "approved" || specStatus === "implemented") return "in_progress";
  return "planned";
}

async function getShipDate(projectRoot: AbsolutePath, specId: EntityId): Promise<string | null> {
  try {
    const receiptPath = shipReceiptPaths(projectRoot, specId);
    const raw = await readFile(receiptPath.receiptFile, "utf-8");
    const receipt = JSON.parse(raw) as ShipReceipt;
    return receipt.shippedAt ?? null;
  } catch {
    return null;
  }
}

async function readTaskProgress(
  projectRoot: AbsolutePath,
  warnings: string[],
): Promise<TaskProgress | null> {
  const paths = projectPaths(projectRoot);

  // Try root task-graph.json first (runtime truth from supervisor)
  let taskGraphPath = paths.taskGraphFile;
  if (!(await pathExists(taskGraphPath))) {
    // Fallback: find active plan's task graph via checkpoint
    const fallbackPath = await findPlanTaskGraph(projectRoot);
    if (!fallbackPath) return null;
    taskGraphPath = fallbackPath;
  }

  let raw: string;
  try {
    raw = await readFile(taskGraphPath, "utf-8");
  } catch {
    warnings.push("task-graph.json exists but could not be read");
    return null;
  }

  let graph: unknown;
  try {
    graph = JSON.parse(raw);
  } catch {
    warnings.push("task-graph.json contains invalid JSON");
    return null;
  }

  return parseTaskGraph(graph);
}

async function findPlanTaskGraph(projectRoot: AbsolutePath): Promise<string | null> {
  // Read checkpoint to find active spec
  const checkpointRepo = createCheckpointRepository(projectRoot);
  try {
    const checkpoint = await checkpointRepo.readLatest();
    if (!checkpoint?.activeSpecId) return null;

    // Scan plans directory for a plan matching this spec
    const paths = projectPaths(projectRoot);
    let planIds: string[];
    try {
      planIds = (await readdir(paths.plansDir, { withFileTypes: true }))
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return null;
    }

    for (const planId of planIds) {
      const pp = planPaths(projectRoot, planId as EntityId);
      if (await pathExists(pp.taskGraphFile)) {
        // Check if this plan's metadata matches the active spec
        try {
          const metaRaw = await readFile(pp.metadataFile, "utf-8");
          const meta = JSON.parse(metaRaw) as { specId?: string };
          if (meta.specId === checkpoint.activeSpecId) {
            return pp.taskGraphFile;
          }
        } catch {
          // Try next plan
        }
      }
    }
  } catch {
    // Checkpoint read failed
  }
  return null;
}

function parseTaskGraph(graph: unknown): TaskProgress | null {
  if (!graph || typeof graph !== "object") return null;

  // Support both array format and {tasks: [...]} format
  const tasks: TaskProgressEntry[] = [];
  const items = Array.isArray(graph) ? graph : (graph as Record<string, unknown>).tasks;
  if (!Array.isArray(items)) return null;

  let completed = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const id = String(t.id ?? t.name ?? `task-${tasks.length}`);
    const title = String(t.title ?? t.name ?? t.description ?? id);
    const status = String(t.status ?? "pending");
    const wave = typeof t.wave === "number" ? t.wave : undefined;

    if (status === "done" || status === "completed") completed++;

    tasks.push({ id, title, status, wave });
  }

  if (tasks.length === 0) return null;
  return { total: tasks.length, completed, tasks };
}

async function readMemoryFile(
  filePath: string,
  fileName: string,
  warnings: string[],
): Promise<string | null> {
  if (!(await pathExists(filePath))) return null;

  try {
    const content = await readFile(filePath, "utf-8");
    return content.trim() || null;
  } catch {
    warnings.push(`${fileName} exists but could not be read`);
    return null;
  }
}

async function readShipStatus(
  projectRoot: AbsolutePath,
  features: FeatureEntry[],
  warnings: string[],
): Promise<ShipStatusEntry[]> {
  const entries: ShipStatusEntry[] = [];

  // Read receipts for shipped features
  for (const feature of features) {
    if (feature.status !== "shipped") continue;

    try {
      const receiptPath = shipReceiptPaths(projectRoot, feature.specId as EntityId);
      if (!(await pathExists(receiptPath.receiptFile))) continue;

      const raw = await readFile(receiptPath.receiptFile, "utf-8");
      const receipt = JSON.parse(raw) as ShipReceipt;

      entries.push({
        specId: feature.specId,
        specTitle: feature.title,
        prUrl: receipt.prUrl,
        shippedAt: receipt.shippedAt,
        confidence: receipt.confidence?.level ?? null,
      });
    } catch {
      warnings.push(`ships/${feature.specId}/receipt.json is corrupt`);
    }
  }

  // Sort by shipped date, most recent first
  entries.sort((a, b) => b.shippedAt.localeCompare(a.shippedAt));
  return entries;
}

async function readCheckpointInfo(
  projectRoot: AbsolutePath,
): Promise<{ currentPhase: string | null; blockers: string[]; nextActions: string[] }> {
  const checkpointRepo = createCheckpointRepository(projectRoot);
  try {
    const checkpoint = await checkpointRepo.readLatest();
    if (!checkpoint) return { currentPhase: null, blockers: [], nextActions: [] };

    return {
      currentPhase: checkpoint.phase,
      blockers: checkpoint.blockers,
      nextActions: checkpoint.nextRecommendedActions,
    };
  } catch {
    return { currentPhase: null, blockers: [], nextActions: [] };
  }
}
