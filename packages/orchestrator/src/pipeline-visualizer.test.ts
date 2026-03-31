import { describe, it, expect } from "vitest";
import type { PipelineSnapshot } from "./pipeline-snapshot";
import { generatePipelineHtml, escapeHtml } from "./pipeline-visualizer";

function makeSnapshot(overrides: Partial<PipelineSnapshot> = {}): PipelineSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-31T12:00:00.000Z",
    projectRoot: "/tmp/test-project",
    activeSpecId: "spec-1",
    currentPhase: "execute",
    resumeSource: "checkpoint",
    stages: [
      {
        id: "understand",
        label: "Understand",
        description: "Discover the problem space",
        status: "completed",
        gateRequirements: [],
        artifacts: [],
        blockers: [],
      },
      {
        id: "identify_problem",
        label: "Identify Problem",
        description: "Frame the core problem",
        status: "completed",
        gateRequirements: [],
        artifacts: [{ name: "IntakeBrief", present: true, path: "/tmp/.prism/intake" }],
        blockers: [],
      },
      {
        id: "spec",
        label: "Spec",
        description: "Write specification",
        status: "completed",
        gateRequirements: [],
        artifacts: [{ name: "Specification", present: true, path: "/tmp/.prism/specs/spec-1" }],
        blockers: [],
      },
      {
        id: "plan",
        label: "Plan",
        description: "Create quality-gated plan",
        status: "completed",
        gateRequirements: [],
        artifacts: [{ name: "Plan", present: true, path: "/tmp/.prism/plans" }],
        blockers: [],
      },
      {
        id: "execute",
        label: "Execute",
        description: "Build the solution",
        status: "current",
        gateRequirements: [
          { description: "checkpoint exists", met: true },
        ],
        artifacts: [{ name: "Checkpoint", present: true, path: "/tmp/.prism/checkpoints" }],
        blockers: [],
      },
      {
        id: "verify",
        label: "Verify",
        description: "Run verification",
        status: "upcoming",
        gateRequirements: [],
        artifacts: [],
        blockers: [],
      },
      {
        id: "release",
        label: "Release",
        description: "Ship it",
        status: "upcoming",
        gateRequirements: [],
        artifacts: [],
        blockers: [],
      },
    ],
    recommendations: [
      { source: "prescription", severity: "high", text: "Require SolutionThesis" },
      { source: "checkpoint", severity: "info", text: "Continue building" },
    ],
    weaknesses: [
      {
        dimension: "research_proof",
        trend: "degrading",
        avgScore: 4.0,
        recentScores: [5, 4, 3],
        detail: "Research proof consistently low",
        recurring: true,
      },
    ],
    healthScore: 58,
    healthTrend: "stable",
    ...overrides,
  };
}

describe("generatePipelineHtml", () => {
  it("produces valid HTML with all stage classes", () => {
    const html = generatePipelineHtml(makeSnapshot());

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("stage-completed");
    expect(html).toContain("stage-current");
    expect(html).toContain("stage-upcoming");
  });

  it("renders all 7 stage labels", () => {
    const html = generatePipelineHtml(makeSnapshot());

    expect(html).toContain("Understand");
    expect(html).toContain("Identify Problem");
    expect(html).toContain("Spec");
    expect(html).toContain("Plan");
    expect(html).toContain("Execute");
    expect(html).toContain("Verify");
    expect(html).toContain("Release");
  });

  it("includes recommendations", () => {
    const html = generatePipelineHtml(makeSnapshot());

    expect(html).toContain("Require SolutionThesis");
    expect(html).toContain("Continue building");
    expect(html).toContain("rec-high");
  });

  it("includes weaknesses with recurring tag", () => {
    const html = generatePipelineHtml(makeSnapshot());

    expect(html).toContain("research proof");
    expect(html).toContain("recurring-tag");
    expect(html).toContain("Research proof consistently low");
  });

  it("renders artifact lineage", () => {
    const html = generatePipelineHtml(makeSnapshot());

    expect(html).toContain("Artifact Lineage");
    expect(html).toContain("IntakeBrief");
    expect(html).toContain("Specification");
    expect(html).toContain("Ship Receipt");
  });

  it("embeds snapshot as safe JSON without script injection", () => {
    const snapshot = makeSnapshot({
      stages: makeSnapshot().stages.map(s => ({
        ...s,
        blockers: s.id === "execute" ? ['</script><script>alert("xss")</script>'] : s.blockers,
      })),
    });

    const html = generatePipelineHtml(snapshot);

    // The literal </script> should be escaped in the JSON embed
    expect(html).not.toContain('</script><script>alert');
    // But the data should still be present (escaped)
    expect(html).toContain("<\\/script>");
  });

  it("handles empty snapshot gracefully", () => {
    const html = generatePipelineHtml(makeSnapshot({
      recommendations: [],
      weaknesses: [],
      healthScore: null,
      activeSpecId: null,
    }));

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("No recommendations");
    expect(html).toContain("No weaknesses detected");
    // No health badge element when healthScore is null (class exists in CSS but span should not render)
    expect(html).not.toMatch(/class="health-badge">\d/);
  });

  it("includes dark/light theme toggle", () => {
    const html = generatePipelineHtml(makeSnapshot());

    expect(html).toContain("theme-toggle");
    expect(html).toContain("toggleTheme");
    expect(html).toContain("light-theme");
    expect(html).toContain("localStorage");
  });

  it("includes print stylesheet", () => {
    const html = generatePipelineHtml(makeSnapshot());

    expect(html).toContain("@media print");
    expect(html).toContain("@page");
  });

  it("includes footer with generation metadata", () => {
    const html = generatePipelineHtml(makeSnapshot());

    expect(html).toContain("Generated:");
    expect(html).toContain("Source: checkpoint");
    expect(html).toContain("Phase: execute");
    expect(html).toContain("Spec: spec-1");
  });

  it("renders blocked stage with correct class", () => {
    const snapshot = makeSnapshot({
      stages: makeSnapshot().stages.map(s =>
        s.id === "execute" ? { ...s, status: "blocked" as const, blockers: ["test failure"] } : s
      ),
    });

    const html = generatePipelineHtml(snapshot);
    expect(html).toContain("stage-blocked");
  });
});

describe("escapeHtml", () => {
  it("escapes all dangerous characters", () => {
    expect(escapeHtml('<script>"alert\'&')).toBe(
      "&lt;script&gt;&quot;alert&#39;&amp;"
    );
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles strings with no special characters", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});
