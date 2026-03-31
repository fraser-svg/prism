import { describe, it, expect } from "vitest";
import type { ProjectSnapshot } from "./project-snapshot";
import { generateProjectHtml } from "./project-visualizer";

function makeSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-31T12:00:00.000Z",
    projectRoot: "/tmp/test-project",
    projectName: "Test Product",
    productSummary: "A tool for building things faster.",
    targetUser: "Agency operators",
    features: [
      {
        specId: "spec-1",
        title: "Feature A",
        status: "shipped",
        specStatus: "approved",
        acceptanceCriteria: { total: 3, passing: 3 },
        shippedAt: "2026-03-30T12:00:00.000Z",
      },
      {
        specId: "spec-2",
        title: "Feature B",
        status: "in_progress",
        specStatus: "approved",
        acceptanceCriteria: { total: 5, passing: 2 },
        shippedAt: null,
      },
      {
        specId: "spec-3",
        title: "Feature C",
        status: "planned",
        specStatus: "draft",
        acceptanceCriteria: { total: 0, passing: 0 },
        shippedAt: null,
      },
    ],
    taskProgress: {
      total: 5,
      completed: 3,
      tasks: [
        { id: "t1", title: "Build UI", status: "done", wave: 1 },
        { id: "t2", title: "Write tests", status: "done", wave: 1 },
        { id: "t3", title: "API layer", status: "done", wave: 1 },
        { id: "t4", title: "Deploy", status: "in_progress", wave: 2 },
        { id: "t5", title: "Monitor", status: "pending", wave: 2 },
      ],
    },
    architectureMarkdown: "# Architecture\n\nMonorepo with 4 packages.",
    stateMarkdown: "# State\n\nAll systems go.",
    roadmapMarkdown: null,
    decisionsMarkdown: "# Decisions\n\n- Chose TypeScript",
    shipStatus: [
      {
        specId: "spec-1",
        specTitle: "Feature A",
        prUrl: "https://github.com/test/pr/1",
        shippedAt: "2026-03-30T12:00:00.000Z",
        confidence: "high",
      },
    ],
    currentPhase: "execute",
    blockers: [],
    nextActions: ["continue building"],
    warnings: [],
    ...overrides,
  };
}

describe("generateProjectHtml", () => {
  it("produces valid HTML with title and metadata", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("Test Product");
    expect(html).toContain("A tool for building things faster.");
    expect(html).toContain("Agency operators");
  });

  it("renders kanban columns for features", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain("Shipped");
    expect(html).toContain("In Progress");
    expect(html).toContain("Planned");
    expect(html).toContain("Feature A");
    expect(html).toContain("Feature B");
    expect(html).toContain("Feature C");
    expect(html).toContain("kanban-shipped");
    expect(html).toContain("kanban-in-progress");
    expect(html).toContain("kanban-planned");
  });

  it("renders task progress with wave groups", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain("Task Progress");
    expect(html).toContain("3/5");
    expect(html).toContain("60%");
    expect(html).toContain("Wave 1");
    expect(html).toContain("Wave 2");
    expect(html).toContain("Build UI");
    expect(html).toContain("Deploy");
  });

  it("renders memory sections from markdown", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain("Architecture");
    expect(html).toContain("Monorepo with 4 packages");
    expect(html).toContain("State");
    expect(html).toContain("All systems go");
    // roadmapMarkdown is null, should not appear
    expect(html).not.toContain("Roadmap");
  });

  it("renders ship status with PR link and confidence", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain("Ship Status");
    expect(html).toContain("Feature A");
    expect(html).toContain("https://github.com/test/pr/1");
    expect(html).toContain("confidence-high");
  });

  it("renders nav bar with project active", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain('href="PIPELINE.html"');
    expect(html).toContain('href="PROJECT.html"');
    expect(html).toMatch(/PROJECT\.html.*nav-active/);
  });

  it("handles empty snapshot gracefully", () => {
    const html = generateProjectHtml(makeSnapshot({
      projectName: null,
      productSummary: null,
      targetUser: null,
      features: [],
      taskProgress: null,
      architectureMarkdown: null,
      stateMarkdown: null,
      roadmapMarkdown: null,
      decisionsMarkdown: null,
      shipStatus: [],
      currentPhase: null,
    }));

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Untitled Project");
    expect(html).toContain("No product specs found");
    // Task progress section should not appear
    expect(html).not.toContain("Task Progress");
  });

  it("prevents XSS in snapshot data", () => {
    const html = generateProjectHtml(makeSnapshot({
      projectName: '<script>alert("xss")</script>',
    }));

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("embeds snapshot as safe JSON without script injection", () => {
    const html = generateProjectHtml(makeSnapshot({
      productSummary: '</script><script>alert("xss")</script>',
    }));

    // The literal </script> should be escaped in the JSON embed
    expect(html).not.toContain('</script><script>alert');
    expect(html).toContain("<\\/script>");
  });

  it("includes theme toggle and localStorage", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain("theme-toggle");
    expect(html).toContain("toggleTheme");
    expect(html).toContain("localStorage");
  });

  it("includes print stylesheet", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain("@media print");
  });

  it("renders warnings banner when warnings exist", () => {
    const html = generateProjectHtml(makeSnapshot({
      warnings: ["task-graph.json contains invalid JSON", "specs/spec-2/metadata.json is corrupt"],
    }));

    expect(html).toContain("warnings-banner");
    expect(html).toContain("Data warnings");
    expect(html).toContain("task-graph.json contains invalid JSON");
    expect(html).toContain("specs/spec-2/metadata.json is corrupt");
  });

  it("omits warnings banner when no warnings", () => {
    const html = generateProjectHtml(makeSnapshot({ warnings: [] }));

    // The CSS class exists in the stylesheet, but the actual banner div should not render
    expect(html).not.toContain("Data warnings");
  });

  it("renders footer with generation metadata", () => {
    const html = generateProjectHtml(makeSnapshot());

    expect(html).toContain("Generated:");
    expect(html).toContain("Phase: execute");
  });

  it("strips project root from embedded JSON", () => {
    const html = generateProjectHtml(makeSnapshot({
      projectRoot: "/Users/secret/project",
    }));

    // The JSON embed should not contain the absolute path
    expect(html).not.toContain("/Users/secret/project");
  });

  it("renders acceptance criteria progress bar", () => {
    const html = generateProjectHtml(makeSnapshot());

    // Feature B has 2/5 AC passing = 40%
    expect(html).toContain("2/5 AC");
    expect(html).toContain('style="width:40%"');
  });
});
