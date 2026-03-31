/**
 * pipeline-visualizer.ts — Generate a self-contained HTML visualization of
 * Prism's pipeline state.
 *
 * Pure function: PipelineSnapshot → HTML string. No I/O.
 * The generated HTML includes inline SVG, CSS, and JS with no external dependencies.
 *
 * Accessibility: designed for dyslexic users — spatial layout, color-coded stages,
 * large click targets, high-contrast text.
 */

import type { PipelineSnapshot, StageDescriptor } from "./pipeline-snapshot";
import { sparkline } from "./health-dashboard";

// ---------------------------------------------------------------------------
// HTML escaping — defense-in-depth for embedded strings
// ---------------------------------------------------------------------------

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Safe JSON embed that prevents </script> injection and strips absolute paths */
function safeJsonEmbed(snapshot: PipelineSnapshot): string {
  const sanitized = {
    ...snapshot,
    projectRoot: undefined,
    stages: snapshot.stages.map(s => ({
      ...s,
      artifacts: s.artifacts.map(a => ({
        ...a,
        path: a.path.replace(snapshot.projectRoot, "."),
      })),
    })),
  };
  return JSON.stringify(sanitized).replace(/<\//g, "<\\/");
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

export function generatePipelineHtml(snapshot: PipelineSnapshot): string {
  const stagesHtml = snapshot.stages.map((s, i) => renderStage(s, i, snapshot.stages.length)).join("\n");
  const recommendationsHtml = renderRecommendations(snapshot);
  const weaknessesHtml = renderWeaknesses(snapshot);
  const lineageHtml = renderArtifactLineage(snapshot);
  const timestamp = new Date(snapshot.generatedAt).toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prism Pipeline — ${escapeHtml(snapshot.currentPhase)}</title>
<style>
${CSS_STYLES}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Prism Pipeline</h1>
    <div class="header-meta">
      <span class="phase-badge">${escapeHtml(snapshot.currentPhase)}</span>
      <span class="source-badge">${escapeHtml(snapshot.resumeSource)}</span>
      ${snapshot.healthScore !== null ? `<span class="health-badge">${snapshot.healthScore}/100 ${trendArrow(snapshot.healthTrend)}</span>` : ""}
      <button class="theme-toggle" onclick="toggleTheme()" title="Toggle light/dark theme" aria-label="Toggle theme">◐</button>
    </div>
  </header>

  <section class="pipeline">
    <div class="pipeline-flow">
      ${stagesHtml}
    </div>
  </section>

  <section class="detail-panel" id="detail-panel">
    <p class="detail-placeholder">Click a stage to see details</p>
  </section>

  ${lineageHtml}

  <div class="sidebars">
    <section class="sidebar recommendations">
      <h2>Recommendations</h2>
      ${recommendationsHtml}
    </section>
    <section class="sidebar weaknesses">
      <h2>Weaknesses</h2>
      ${weaknessesHtml}
    </section>
  </div>

  <footer>
    Generated: ${escapeHtml(timestamp)} | Source: ${escapeHtml(snapshot.resumeSource)} | Phase: ${escapeHtml(snapshot.currentPhase)}
    ${snapshot.activeSpecId ? ` | Spec: ${escapeHtml(snapshot.activeSpecId)}` : ""}
  </footer>
</div>

<script>
const SNAPSHOT = ${safeJsonEmbed(snapshot)};

function selectStage(idx) {
  const stage = SNAPSHOT.stages[idx];
  if (!stage) return;

  document.querySelectorAll('.stage').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.stage')[idx]?.classList.add('selected');

  const panel = document.getElementById('detail-panel');
  const gateHtml = stage.gateRequirements.length > 0
    ? '<h4>Gate Requirements</h4><ul>' + stage.gateRequirements.map(g =>
        '<li class="' + (g.met ? 'gate-met' : 'gate-unmet') + '">' +
        (g.met ? '\\u2713 ' : '\\u2717 ') + esc(g.description) + '</li>'
      ).join('') + '</ul>'
    : '';

  const artifactHtml = stage.artifacts.length > 0
    ? '<h4>Artifacts</h4><ul>' + stage.artifacts.map(a =>
        '<li class="' + (a.present ? 'artifact-present' : 'artifact-missing') + '">' +
        (a.present ? '\\u25CF ' : '\\u25CB ') + esc(a.name) + '</li>'
      ).join('') + '</ul>'
    : '';

  const blockerHtml = stage.blockers.length > 0
    ? '<h4>Blockers</h4><ul class="blockers">' + stage.blockers.map(b =>
        '<li>' + esc(b) + '</li>'
      ).join('') + '</ul>'
    : '';

  panel.innerHTML =
    '<h3>' + esc(stage.label) + ' <span class="status-tag status-' + stage.status + '">' + stage.status + '</span></h3>' +
    '<p>' + esc(stage.description) + '</p>' +
    gateHtml + artifactHtml + blockerHtml;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function toggleTheme() {
  const body = document.body;
  const isLight = body.classList.toggle('light-theme');
  try { localStorage.setItem('prism-theme', isLight ? 'light' : 'dark'); } catch {}
}

// Restore theme preference
try {
  if (localStorage.getItem('prism-theme') === 'light') {
    document.body.classList.add('light-theme');
  }
} catch {}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Component renderers
// ---------------------------------------------------------------------------

function renderStage(stage: StageDescriptor, index: number, total: number): string {
  const statusClass = `stage-${stage.status}`;
  const icon = stageIcon(stage.status);
  const arrow = index < total - 1
    ? `<div class="arrow" title="${escapeHtml(getGateTooltip(stage))}">${stage.status === "completed" ? "→" : "⇢"}</div>`
    : "";

  return `<div class="stage ${statusClass}" onclick="selectStage(${index})" tabindex="0" role="button" aria-label="${escapeHtml(stage.label)}: ${stage.status}">
  <div class="stage-icon">${icon}</div>
  <div class="stage-label">${escapeHtml(stage.label)}</div>
</div>${arrow}`;
}

function getGateTooltip(stage: StageDescriptor): string {
  if (stage.gateRequirements.length === 0) return "";
  return stage.gateRequirements
    .map(g => `${g.met ? "✓" : "✗"} ${g.description}`)
    .join("\n");
}

function stageIcon(status: string): string {
  switch (status) {
    case "completed": return "✓";
    case "current": return "●";
    case "blocked": return "✗";
    case "upcoming": return "○";
    default: return "○";
  }
}

function trendArrow(trend: string): string {
  switch (trend) {
    case "improving": return "↑";
    case "degrading": return "↓";
    default: return "→";
  }
}

function renderRecommendations(snapshot: PipelineSnapshot): string {
  if (snapshot.recommendations.length === 0) {
    return "<p class='empty-state'>No recommendations</p>";
  }

  return "<ul>" + snapshot.recommendations
    .map(r =>
      `<li class="rec rec-${escapeHtml(r.severity)}"><span class="rec-source">${escapeHtml(r.source)}</span> ${escapeHtml(r.text)}</li>`
    )
    .join("") + "</ul>";
}

function renderWeaknesses(snapshot: PipelineSnapshot): string {
  if (snapshot.weaknesses.length === 0) {
    return "<p class='empty-state'>No weaknesses detected</p>";
  }

  return "<ul>" + snapshot.weaknesses
    .map(w => {
      const spark = sparkline(w.recentScores);
      const recurringTag = w.recurring ? " <span class='recurring-tag'>recurring</span>" : "";
      return `<li class="weakness">
        <strong>${escapeHtml(w.dimension.replace(/_/g, " "))}</strong>${recurringTag}
        <span class="sparkline">${escapeHtml(spark)}</span>
        avg ${w.avgScore.toFixed(1)} ${trendArrow(w.trend)}
        <div class="weakness-detail">${escapeHtml(w.detail)}</div>
      </li>`;
    })
    .join("") + "</ul>";
}

function renderArtifactLineage(snapshot: PipelineSnapshot): string {
  const lineageOrder = [
    { name: "IntakeBrief", stage: "identify_problem" },
    { name: "Specification", stage: "spec" },
    { name: "Plan", stage: "plan" },
    { name: "Checkpoint", stage: "execute" },
    { name: "Reviews", stage: "verify" },
    { name: "Ship Receipt", stage: "release" },
  ];

  const items = lineageOrder.map(item => {
    const stage = snapshot.stages.find(s => s.id === item.stage);
    const artifact = stage?.artifacts.find(a => a.name === item.name);
    const present = artifact?.present ?? false;
    const statusClass = present ? "lineage-present" : "lineage-missing";
    return `<span class="lineage-node ${statusClass}" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
  });

  return `<section class="artifact-lineage">
    <h2>Artifact Lineage</h2>
    <div class="lineage-chain">${items.join('<span class="lineage-arrow">→</span>')}</div>
  </section>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS_STYLES = `
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-hover: #334155;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --green: #22c55e;
  --blue: #3b82f6;
  --red: #ef4444;
  --orange: #f97316;
  --gray: #6b7280;
  --border: #334155;
}

.light-theme {
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface-hover: #f1f5f9;
  --text: #1e293b;
  --text-muted: #64748b;
  --border: #e2e8f0;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  font-size: 16px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

header h1 {
  font-size: 1.75rem;
  font-weight: 700;
}

.header-meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.phase-badge, .source-badge, .health-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.phase-badge { background: var(--blue); color: white; }
.source-badge { background: var(--surface); border: 1px solid var(--border); }
.health-badge { background: var(--green); color: white; }

.theme-toggle {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 1.25rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-toggle:hover { background: var(--surface-hover); }

/* Pipeline flow */
.pipeline { margin-bottom: 2rem; }

.pipeline-flow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 1rem 0;
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 1.25rem;
  border-radius: 0.75rem;
  cursor: pointer;
  min-width: 100px;
  text-align: center;
  transition: transform 0.15s, box-shadow 0.15s;
  border: 2px solid transparent;
}

.stage:hover, .stage:focus { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); outline: none; }
.stage.selected { border-color: var(--blue); }

.stage-icon { font-size: 1.5rem; margin-bottom: 0.25rem; }
.stage-label { font-size: 0.8rem; font-weight: 600; white-space: nowrap; }

.stage-completed { background: var(--green); color: white; }
.stage-current { background: var(--blue); color: white; animation: pulse 2s infinite; }
.stage-blocked { background: var(--red); color: white; }
.stage-upcoming { background: var(--surface); border: 2px dashed var(--gray); color: var(--text-muted); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.arrow {
  font-size: 1.25rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Detail panel */
.detail-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
  min-height: 120px;
}

.detail-placeholder { color: var(--text-muted); font-style: italic; }

.detail-panel h3 { margin-bottom: 0.5rem; font-size: 1.25rem; }
.detail-panel h4 { margin-top: 1rem; margin-bottom: 0.5rem; font-size: 0.95rem; color: var(--text-muted); }
.detail-panel ul { list-style: none; padding-left: 0.5rem; }
.detail-panel li { padding: 0.25rem 0; }

.gate-met { color: var(--green); }
.gate-unmet { color: var(--red); }
.artifact-present { color: var(--green); }
.artifact-missing { color: var(--text-muted); }
.blockers li { color: var(--red); }

.status-tag {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.5rem;
  text-transform: uppercase;
  font-weight: 600;
}

.status-completed { background: var(--green); color: white; }
.status-current { background: var(--blue); color: white; }
.status-blocked { background: var(--red); color: white; }
.status-upcoming { background: var(--gray); color: white; }

/* Artifact lineage */
.artifact-lineage {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.artifact-lineage h2 { font-size: 1.1rem; margin-bottom: 1rem; }

.lineage-chain {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow-x: auto;
  flex-wrap: wrap;
}

.lineage-node {
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.lineage-present { background: var(--green); color: white; }
.lineage-missing { background: var(--surface-hover); color: var(--text-muted); border: 1px dashed var(--gray); }
.lineage-arrow { color: var(--text-muted); font-size: 1rem; }

/* Sidebars */
.sidebars {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

@media (max-width: 768px) {
  .sidebars { grid-template-columns: 1fr; }
}

.sidebar {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.sidebar h2 { font-size: 1.1rem; margin-bottom: 1rem; }
.sidebar ul { list-style: none; padding: 0; }
.sidebar li { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
.sidebar li:last-child { border-bottom: none; }

.empty-state { color: var(--text-muted); font-style: italic; }

.rec-source {
  display: inline-block;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--surface-hover);
  color: var(--text-muted);
  margin-right: 0.5rem;
  text-transform: uppercase;
}

.rec-critical { border-left: 3px solid var(--red); padding-left: 0.75rem; }
.rec-high { border-left: 3px solid var(--orange); padding-left: 0.75rem; }
.rec-medium { border-left: 3px solid var(--blue); padding-left: 0.75rem; }

.weakness { line-height: 1.8; }
.weakness strong { display: block; text-transform: capitalize; }
.weakness-detail { font-size: 0.85rem; color: var(--text-muted); }
.sparkline { font-family: monospace; letter-spacing: 1px; margin: 0 0.5rem; }
.recurring-tag {
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--red);
  color: white;
  margin-left: 0.5rem;
  vertical-align: middle;
}

footer {
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-muted);
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

/* Print stylesheet */
@media print {
  body { background: white; color: black; }
  .theme-toggle, .detail-placeholder { display: none; }
  .stage { border: 1px solid #ccc !important; color: black !important; }
  .stage-completed { background: #e8f5e9 !important; }
  .stage-current { background: #e3f2fd !important; animation: none !important; }
  .stage-blocked { background: #ffebee !important; }
  .stage-upcoming { background: #f5f5f5 !important; }
  .sidebar, .detail-panel, .artifact-lineage { border: 1px solid #ccc; }
  @page { margin: 1.5cm; }
}
`;
