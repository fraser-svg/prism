/**
 * self-healing.ts — Orchestrates the full self-healing pipeline for Prism.
 *
 * Pipeline: report card → journal → prescriptions → health dashboard → dogfood.
 * Triggered at session end (verify→release gate) or via bridge session-end command.
 */

import type { AbsolutePath, EntityId } from "@prism/core";
import { generateReportCard, recoverPendingReports } from "./report-card-generator";
import { updateLearningJournal } from "./learning-journal";
import { createPrescription, checkPrescriptionResolution, readActivePrescriptions } from "./prescription-manager";
import { generateHealthDashboard } from "./health-dashboard";
import { generateDogfoodEntries } from "./dogfood-generator";

export interface SelfHealingResult {
  reportCardGenerated: boolean;
  sessionId: string;
  overallScore: number | null;
  journalUpdated: boolean;
  newlyRecurring: string[];
  prescriptionsCreated: string[];
  prescriptionsResolved: string[];
  dogfoodEntriesAdded: number;
  healthDashboardUpdated: boolean;
  recoveredSessions: string[];
}

/**
 * Run the full self-healing pipeline at session end.
 * Triggered by verify→release gate transition or bridge session-end command.
 */
export async function runSelfHealingPipeline(opts: {
  projectRoot: AbsolutePath;
  projectId: EntityId;
  sessionId: string;
  events: Array<{ eventType: string; metadata: Record<string, unknown> | null }>;
  availableCapabilities: string[];
  crashRecovery?: boolean;
  /** If true, warns that session may be incomplete (bridge session-end mid-session) */
  sessionIncomplete?: boolean;
}): Promise<SelfHealingResult> {
  const result: SelfHealingResult = {
    reportCardGenerated: false,
    sessionId: opts.sessionId,
    overallScore: null,
    journalUpdated: false,
    newlyRecurring: [],
    prescriptionsCreated: [],
    prescriptionsResolved: [],
    dogfoodEntriesAdded: 0,
    healthDashboardUpdated: false,
    recoveredSessions: [],
  };

  // Eng review 13A: completeness check for bridge session-end called mid-session
  if (opts.sessionIncomplete) {
    console.warn("Self-healing: session-end called before verify→release gate. Report card may reflect incomplete session.");
  }

  try {
    // Step 1: Generate report card
    const reportCard = await generateReportCard({
      projectRoot: opts.projectRoot,
      projectId: opts.projectId,
      sessionId: opts.sessionId,
      events: opts.events,
      availableCapabilities: opts.availableCapabilities,
      crashRecovery: opts.crashRecovery,
    });
    result.reportCardGenerated = true;
    result.overallScore = reportCard.overallScore;

    // Step 2: Update learning journal
    const { journal, newlyRecurring } = await updateLearningJournal(
      opts.projectRoot,
      opts.projectId,
    );
    result.journalUpdated = true;
    result.newlyRecurring = newlyRecurring;

    // Step 3: Create prescriptions for newly recurring patterns
    for (const dim of newlyRecurring) {
      const pattern = journal.patterns.find(p => p.dimension === dim);
      if (pattern) {
        const prescription = await createPrescription(opts.projectRoot, pattern);
        result.prescriptionsCreated.push(prescription.dimension);
      }
    }

    // Step 4: Check prescription resolution
    const resolved = await checkPrescriptionResolution(opts.projectRoot, journal.patterns);
    result.prescriptionsResolved = resolved;

    // Step 5: Generate dogfood entries
    result.dogfoodEntriesAdded = await generateDogfoodEntries(
      opts.projectRoot,
      newlyRecurring,
      journal.patterns,
    );

    // Step 6: Generate health dashboard
    await generateHealthDashboard(opts.projectRoot);
    result.healthDashboardUpdated = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Self-healing pipeline error: ${message}`);
  }

  return result;
}

/**
 * Run crash recovery: find pending reports and orphan sessions, complete them.
 */
export async function runCrashRecovery(opts: {
  projectRoot: AbsolutePath;
  projectId: EntityId;
  events: Array<{ eventType: string; metadata: Record<string, unknown> | null }>;
  availableCapabilities: string[];
}): Promise<string[]> {
  return recoverPendingReports(
    opts.projectRoot,
    opts.projectId,
    opts.events,
    opts.availableCapabilities,
  );
}

/**
 * Get active prescriptions for display during resume.
 */
export { readActivePrescriptions } from "./prescription-manager";
