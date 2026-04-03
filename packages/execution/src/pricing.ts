// Static pricing table for provider cost estimation.
// Update when provider pricing changes.
// Last verified: 2026-04-03
// Sources:
//   Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
//   Google:    https://ai.google.dev/pricing

export const PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  anthropic: { inputPer1k: 0.003, outputPer1k: 0.015 },
  google: { inputPer1k: 0.00125, outputPer1k: 0.005 },
  stitch: { inputPer1k: 0, outputPer1k: 0 },
};
