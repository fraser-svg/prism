import { describe, it, expect } from "vitest";
import { PHASE_PROMPTS, PHASE_STATUS_MESSAGES } from "./phase-prompts";

const PHASES = [
  "understand",
  "identify_problem",
  "spec",
  "plan",
  "execute",
  "verify",
  "release",
] as const;

describe("PHASE_PROMPTS", () => {
  it.each(PHASES)("phase '%s' has a non-empty string prompt", (phase) => {
    expect(typeof PHASE_PROMPTS[phase]).toBe("string");
    expect(PHASE_PROMPTS[phase].length).toBeGreaterThan(0);
  });

  it.each(PHASES)("phase '%s' prompt contains 'Prism'", (phase) => {
    expect(PHASE_PROMPTS[phase]).toContain("Prism");
  });
});

describe("PHASE_STATUS_MESSAGES", () => {
  it.each(PHASES)("phase '%s' has a status message", (phase) => {
    expect(PHASE_STATUS_MESSAGES).toHaveProperty(phase);
  });

  it.each(PHASES)("phase '%s' status message is a non-empty string", (phase) => {
    expect(typeof PHASE_STATUS_MESSAGES[phase]).toBe("string");
    expect(PHASE_STATUS_MESSAGES[phase].length).toBeGreaterThan(0);
  });
});
