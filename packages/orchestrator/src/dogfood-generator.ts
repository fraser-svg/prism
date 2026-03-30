/**
 * dogfood-generator.ts — Auto-generates DOGFOOD.md entries from recurring patterns.
 *
 * When the Learning Journal detects a newly recurring pattern, this module
 * appends a structured entry to DOGFOOD.md and tracks it in a dedup index.
 */

import type {
  AbsolutePath,
  DogfoodIndex,
  LearningJournalPattern,
} from "@prism/core";
import { dogfoodPaths } from "@prism/memory";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { severityFromOccurrences } from "./prescription-manager";

const DOGFOOD_HEADER = `# Prism Dogfood Feedback

Collected during active use.

---
`;

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readDogfoodIndex(
  projectRoot: AbsolutePath,
): Promise<DogfoodIndex> {
  const paths = dogfoodPaths(projectRoot);
  try {
    const content = await readFile(paths.dogfoodIndexFile, "utf-8");
    return JSON.parse(content) as DogfoodIndex;
  } catch {
    return { entries: [] };
  }
}

async function writeDogfoodIndex(
  projectRoot: AbsolutePath,
  index: DogfoodIndex,
): Promise<void> {
  const paths = dogfoodPaths(projectRoot);
  await writeFile(paths.dogfoodIndexFile, JSON.stringify(index, null, 2));
}

export async function generateDogfoodEntries(
  projectRoot: AbsolutePath,
  newlyRecurringDimensions: string[],
  patterns: LearningJournalPattern[],
): Promise<number> {
  if (newlyRecurringDimensions.length === 0) return 0;

  const paths = dogfoodPaths(projectRoot);
  await mkdir(paths.dogfoodDir, { recursive: true });

  const index = await readDogfoodIndex(projectRoot);

  // Read or create DOGFOOD.md
  const dogfoodPath = `${projectRoot}/DOGFOOD.md`;
  let dogfoodContent: string;
  if (await pathExists(dogfoodPath)) {
    dogfoodContent = await readFile(dogfoodPath, "utf-8");
  } else {
    dogfoodContent = DOGFOOD_HEADER;
  }

  // Find highest existing entry number
  const entryNumbers = dogfoodContent.match(/^## (\d+)\./gm) ?? [];
  let nextNumber =
    entryNumbers.length > 0
      ? Math.max(
          ...entryNumbers.map((e) =>
            parseInt(e.replace("## ", "").replace(".", ""), 10),
          ),
        ) + 1
      : 1;

  let entriesAdded = 0;

  for (const dim of newlyRecurringDimensions) {
    // Dedup check (eng review 8A): suppress if OPEN entry exists for this dimension
    const existing = index.entries.find(
      (e) => e.dimension === dim && e.status === "OPEN",
    );
    if (existing) continue;

    const pattern = patterns.find((p) => p.dimension === dim);
    if (!pattern) continue;

    const severity = severityFromOccurrences(pattern.occurrences);
    const prescriptionText: Record<string, string> = {
      guided_start:
        "Require IntakeBrief with 0 unresolved questions before planning",
      research_proof:
        "Require SolutionThesis with >= 2 alternatives before spec",
      stress_verification:
        "Include stress and edge-case scenarios in verification",
      evidence_quality:
        "Ensure high-confidence evidence on all review findings",
    };

    const entry = `
## ${nextNumber}. ${dim.replace(/_/g, " ")} (auto-detected ${new Date().toISOString().split("T")[0]})

**What happened:** ${pattern.detail}

**Expected:** ${prescriptionText[dim] ?? `Improve ${dim} dimension`}

**Severity:** ${severity}

**Status:** OPEN (auto-detected by self-healing system)
`;

    dogfoodContent += entry;
    index.entries.push({
      dimension: dim,
      dogfoodNumber: nextNumber,
      status: "OPEN",
      createdAt: new Date().toISOString(),
    });

    nextNumber++;
    entriesAdded++;
  }

  if (entriesAdded > 0) {
    await writeFile(dogfoodPath, dogfoodContent);
    await writeDogfoodIndex(projectRoot, index);
  }

  return entriesAdded;
}
