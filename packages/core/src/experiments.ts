/**
 * experiments.ts — Core types for the Prism autoresearch experiment system.
 *
 * Supports A/B experimentation on prompt variants with dimension-specific
 * scoring. Session ID parity determines baseline (even) vs variant (odd).
 */

import type { EntityId, ISODateString } from "./common";

export type ExperimentLevel = "prompt";
export type ExperimentStatus = "active" | "decided" | "promoted" | "discarded";

export interface ExperimentVariant {
  id: string;
  label: string;
  content: string;
  contentHash: string;
}

export interface ExperimentMetric {
  dimension: string;
  value: number;
  sessionId: string;
  variant: "baseline" | "test";
  timestamp: ISODateString;
}

export interface ExperimentDecision {
  winner: "baseline" | "test" | "inconclusive";
  baselineAvg: number;
  testAvg: number;
  improvement: number;
  confidence: "low" | "medium" | "high";
  decidedAt: ISODateString;
}

export interface Experiment {
  id: string;
  level: ExperimentLevel;
  status: ExperimentStatus;
  createdAt: ISODateString;
  expiresAfter: number;
  sessionsRun: number;
  hypothesis: string;
  dimension: string;
  targetFile: string;
  targetSection: string;
  baselineVariant: ExperimentVariant;
  testVariant: ExperimentVariant;
  metrics: ExperimentMetric[];
  decision: ExperimentDecision | null;
}

export interface ExperimentRegistry {
  schemaVersion: 1;
  globalEnabled: boolean;
  maxConcurrentPerLevel: number;
  levelsEnabled: Record<ExperimentLevel, boolean>;
  experiments: Record<ExperimentLevel, string[]>;
}
