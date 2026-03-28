import type { AbsolutePath, EntityId, ReviewType, ReviewVerdict, SpecType } from "@prism/core";
import { createReviewRepository } from "@prism/memory";

/** Required review matrix per spec type. */
const REVIEW_MATRIX: Record<SpecType, ReviewType[]> = {
  product: ["planning", "engineering", "qa", "design", "ship_readiness"],
  change: ["engineering", "qa"],
  task: ["engineering"],
};

export function getRequiredReviewMatrix(specType: SpecType): ReviewType[] {
  return REVIEW_MATRIX[specType] ?? ["engineering"];
}

export interface ReviewCheckResult {
  required: ReviewType[];
  present: ReviewType[];
  passing: ReviewType[];
  missing: ReviewType[];
  failing: ReviewType[];
  holding: ReviewType[];
  complete: boolean;
}

/**
 * Checks which required reviews exist and their verdicts for a given spec.
 *
 * Reviews are stored as individual JSON files per review type inside the
 * composite review directory for the spec:
 *   .prism/reviews/<specId>/<reviewType>.json
 *
 * Each file contains at minimum `{ "verdict": ReviewVerdict }`.
 */
export async function checkRequiredReviews(
  specId: EntityId,
  specType: SpecType,
  projectRoot: AbsolutePath,
): Promise<ReviewCheckResult> {
  const required = getRequiredReviewMatrix(specType);
  const repo = createReviewRepository(projectRoot);

  const present: ReviewType[] = [];
  const passing: ReviewType[] = [];
  const failing: ReviewType[] = [];
  const holding: ReviewType[] = [];

  for (const reviewType of required) {
    const slot = `${reviewType}.json`;
    const content = await repo.readFile(specId, slot);
    if (content) {
      present.push(reviewType);
      try {
        const review = JSON.parse(content) as { verdict: ReviewVerdict };
        if (review.verdict === "pass") passing.push(reviewType);
        else if (review.verdict === "fail") failing.push(reviewType);
        else if (review.verdict === "hold") holding.push(reviewType);
      } catch {
        // Corrupt review file — treat as present but not passing
      }
    }
  }

  const missing = required.filter(r => !present.includes(r));

  return {
    required,
    present,
    passing,
    missing,
    failing,
    holding,
    complete: missing.length === 0 && failing.length === 0 && holding.length === 0 && passing.length === required.length,
  };
}

export async function runReviewChecks(
  specId: EntityId,
  specType: SpecType,
  projectRoot: AbsolutePath,
): Promise<ReviewCheckResult> {
  return checkRequiredReviews(specId, specType, projectRoot);
}

export async function isReviewComplete(
  specId: EntityId,
  specType: SpecType,
  projectRoot: AbsolutePath,
): Promise<boolean> {
  const result = await checkRequiredReviews(specId, specType, projectRoot);
  return result.complete;
}
