/**
 * prescription-manager.ts — Prescription lifecycle for Prism self-healing engine.
 *
 * Creates, reads, resolves, and dismisses prescriptions based on recurring
 * patterns detected in the Learning Journal.
 */

import type {
  AbsolutePath,
  Prescription,
  PrescriptionSeverity,
  LearningJournalPattern,
  EntityId,
} from "@prism/core";
import { dogfoodPaths } from "@prism/memory";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const RESOLUTION_CONSECUTIVE_THRESHOLD = 3;
const RESOLUTION_SCORE_THRESHOLD = 7;
const MAX_SHOWN_ON_RESUME = 3;

const PRESCRIPTION_TEMPLATES: Record<string, string> = {
  guided_start:
    "Require IntakeBrief with 0 unresolved questions before advancing to plan stage",
  research_proof:
    "Require SolutionThesis with >= 2 alternatives before advancing to spec stage",
  stress_verification:
    "Include at least 1 stress and 1 edge-case scenario in verification plans",
  evidence_quality:
    "Ensure all review findings have high-confidence evidence backing",
};

export function severityFromOccurrences(
  occurrences: number,
): PrescriptionSeverity {
  if (occurrences >= 8) return "critical";
  if (occurrences >= 5) return "high";
  return "medium";
}

export async function createPrescription(
  projectRoot: AbsolutePath,
  pattern: LearningJournalPattern,
): Promise<Prescription> {
  const paths = dogfoodPaths(projectRoot);
  await mkdir(paths.prescriptionsDir, { recursive: true });

  // Dedup guard: use uncapped read to avoid missing prescriptions beyond display limit
  const existing = await readAllActivePrescriptions(projectRoot);
  const existingForDim = existing.find(
    (p) => p.dimension === pattern.dimension,
  );
  if (existingForDim) return existingForDim;

  const prescription: Prescription = {
    schemaVersion: 1,
    id: randomUUID() as EntityId,
    dimension: pattern.dimension,
    prescription:
      PRESCRIPTION_TEMPLATES[pattern.dimension] ??
      `Improve ${pattern.dimension} scores`,
    severity: severityFromOccurrences(pattern.occurrences),
    createdAt: new Date().toISOString(),
    status: "active",
    resolvedAt: null,
    basedOnSessions: pattern.occurrences,
    patternDetail: pattern.detail,
  };

  const filename = `${pattern.dimension}-${prescription.createdAt.replace(/[:.]/g, "-")}.json`;
  await writeFile(
    `${paths.prescriptionsDir}/${filename}`,
    JSON.stringify(prescription, null, 2),
  );

  return prescription;
}

const severityOrder: Record<PrescriptionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Read ALL active prescriptions (no cap). Used internally for dedup and resolution. */
async function readAllActivePrescriptions(
  projectRoot: AbsolutePath,
): Promise<Prescription[]> {
  const paths = dogfoodPaths(projectRoot);
  const prescriptions: Prescription[] = [];

  try {
    const files = await readdir(paths.prescriptionsDir);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      try {
        const content = await readFile(
          `${paths.prescriptionsDir}/${file}`,
          "utf-8",
        );
        const p = JSON.parse(content) as Prescription;
        if (p.status === "active") {
          prescriptions.push(p);
        }
      } catch {
        console.warn(
          `Prescription manager: skipping corrupt file: ${file}`,
        );
      }
    }
  } catch {
    // Prescriptions dir doesn't exist
  }

  return prescriptions.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );
}

/** Read active prescriptions for display (capped at MAX_SHOWN_ON_RESUME). */
export async function readActivePrescriptions(
  projectRoot: AbsolutePath,
): Promise<Prescription[]> {
  const all = await readAllActivePrescriptions(projectRoot);
  return all.slice(0, MAX_SHOWN_ON_RESUME);
}

/**
 * Check if any active prescriptions should be resolved.
 * Resolution: 3 consecutive non-null scores >= 7 in recentScores (nulls skipped per 10A).
 */
export async function checkPrescriptionResolution(
  projectRoot: AbsolutePath,
  patterns: LearningJournalPattern[],
): Promise<string[]> {
  const paths = dogfoodPaths(projectRoot);
  const resolved: string[] = [];

  try {
    const files = await readdir(paths.prescriptionsDir);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      try {
        const filePath = `${paths.prescriptionsDir}/${file}`;
        const content = await readFile(filePath, "utf-8");
        const p = JSON.parse(content) as Prescription;

        if (p.status !== "active") continue;

        const pattern = patterns.find((pat) => pat.dimension === p.dimension);
        if (!pattern) continue;

        // Check consecutive high scores (nulls transparent per eng review 10A)
        const validScores = pattern.recentScores.filter(
          (s): s is number => s !== null,
        );
        let consecutive = 0;
        for (let i = validScores.length - 1; i >= 0; i--) {
          if (validScores[i]! >= RESOLUTION_SCORE_THRESHOLD) {
            consecutive++;
          } else {
            break;
          }
        }

        if (consecutive >= RESOLUTION_CONSECUTIVE_THRESHOLD) {
          p.status = "resolved";
          p.resolvedAt = new Date().toISOString();
          await writeFile(filePath, JSON.stringify(p, null, 2));
          resolved.push(p.dimension);
        }
      } catch {
        console.warn(
          `Prescription manager: error checking resolution for ${file}`,
        );
      }
    }
  } catch {
    // Prescriptions dir doesn't exist
  }

  return resolved;
}

/**
 * Dismiss a prescription by ID.
 */
export async function dismissPrescription(
  projectRoot: AbsolutePath,
  prescriptionId: string,
): Promise<boolean> {
  const paths = dogfoodPaths(projectRoot);

  try {
    const files = await readdir(paths.prescriptionsDir);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const filePath = `${paths.prescriptionsDir}/${file}`;
      const content = await readFile(filePath, "utf-8");
      const p = JSON.parse(content) as Prescription;

      if (p.id === prescriptionId && p.status === "active") {
        p.status = "dismissed";
        p.dismissedAt = new Date().toISOString();
        await writeFile(filePath, JSON.stringify(p, null, 2));
        return true;
      }
    }
  } catch {
    // Prescriptions dir doesn't exist
  }

  return false;
}
