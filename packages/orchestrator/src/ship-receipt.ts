/**
 * ship-receipt.ts — Ship receipt entity persistence for Prism Stage 5.
 *
 * Records a durable JSON artifact at .prism/ships/{specId}/receipt.json
 * capturing the full ship outcome (PR, commit, deploy, reviews).
 *
 * Usage: cli.ts record-ship <projectRoot> <specId>  (reads receipt JSON from stdin)
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { AbsolutePath, EntityId } from "@prism/core";
import type { ShipReceipt } from "@prism/core";
import { shipReceiptPaths } from "@prism/memory";

// ---------------------------------------------------------------------------
// Stdin shape (what SKILL.md pipes in)
// ---------------------------------------------------------------------------

interface ShipReceiptInput {
  projectId?: string;
  specId?: string;
  prUrl?: string | null;
  commitSha: string;
  commitMessage: string;
  branch: string;
  baseBranch: string;
  tagName?: string | null;
  deployUrl?: string | null;
  deployPlatform?: string | null;
  deployHealthStatus?: string | null;
  specSummary?: string;
  reviewVerdicts?: Record<string, string | null>;
  changelogUpdated?: boolean;
  confidence?: {
    level: 'high' | 'medium' | 'low' | 'unknown' | 'user-accepted-low';
    method: string;
    concerns: string[];
    escalated: boolean;
    escalationCount: number;
    checksRun: string[];
    checksSkipped: string[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateEntityId(): EntityId {
  return randomUUID() as EntityId;
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Exported command
// ---------------------------------------------------------------------------

export async function execRecordShip(args: string[], stdinData?: unknown): Promise<ShipReceipt> {
  const projectRoot = args[0] as AbsolutePath;
  const specId = args[1] as EntityId;
  if (!projectRoot) throw new Error("missing required argument: projectRoot");
  if (!specId) throw new Error("missing required argument: specId");

  // Read input from stdin or batch
  let input: ShipReceiptInput;
  if (stdinData) {
    input = stdinData as ShipReceiptInput;
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf-8");
    if (!raw.trim()) throw new Error("empty stdin");
    input = JSON.parse(raw) as ShipReceiptInput;
  }

  const ts = now();
  const receipt: ShipReceipt = {
    id: generateEntityId(),
    projectId: (input.projectId ?? "unknown") as EntityId,
    specId,
    prUrl: input.prUrl ?? null,
    commitSha: input.commitSha,
    commitMessage: input.commitMessage,
    branch: input.branch,
    baseBranch: input.baseBranch,
    tagName: input.tagName ?? null,
    deployUrl: input.deployUrl ?? null,
    deployPlatform: input.deployPlatform ?? null,
    deployHealthStatus: input.deployHealthStatus ?? null,
    specSummary: input.specSummary ?? "",
    reviewVerdicts: input.reviewVerdicts ?? {},
    changelogUpdated: input.changelogUpdated ?? false,
    shippedAt: ts,
    ...(input.confidence ? { confidence: input.confidence } : {}),
    createdAt: ts,
    updatedAt: ts,
  };

  // Write to disk
  const paths = shipReceiptPaths(projectRoot, specId);
  await mkdir(dirname(paths.receiptFile), { recursive: true });
  await writeFile(paths.receiptFile, JSON.stringify(receipt, null, 2), "utf-8");

  return receipt;
}

/**
 * Read a previously written ship receipt (utility for resume/display).
 */
export async function readShipReceipt(
  projectRoot: AbsolutePath,
  specId: EntityId,
): Promise<ShipReceipt | null> {
  try {
    const paths = shipReceiptPaths(projectRoot, specId);
    const raw = await readFile(paths.receiptFile, "utf-8");
    return JSON.parse(raw) as ShipReceipt;
  } catch {
    return null;
  }
}
