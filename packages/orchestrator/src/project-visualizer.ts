/**
 * project-visualizer.ts — Generate a self-contained HTML visualization of
 * the user's project shape and state.
 *
 * Pure function: ProjectSnapshot → HTML string. No I/O.
 * Companion to PIPELINE.html — shows features, tasks, architecture, and ship status.
 */

import type {
  ProjectSnapshot,
  FeatureEntry,
  TaskProgress,
  ShipStatusEntry,
} from "./project-snapshot";
import {
  escapeHtml,
  safeJsonEmbed,
  renderNavBar,
  renderMarkdown,
  relativeTimeScript,
  COMMON_CSS,
} from "./visualizer-common";

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

export function generateProjectHtml(snapshot: ProjectSnapshot): string {
  const warningsHtml = renderWarnings(snapshot.warnings);
  const headerHtml = renderHeader(snapshot);
  const featureMapHtml = renderFeatureMap(snapshot.features);
  const taskProgressHtml = renderTaskProgress(snapshot.taskProgress);
  const memorySections = renderMemorySections(snapshot);
  const timelineHtml = renderTimeline(snapshot);
  const timestamp = new Date(snapshot.generatedAt).toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prism Project${snapshot.projectName ? ` — ${escapeHtml(snapshot.projectName)}` : ""}</title>
<style>
${COMMON_CSS}
${PROJECT_CSS}
</style>
</head>
<body>
<div class="container">
  ${renderNavBar("project")}
  ${warningsHtml}
  ${headerHtml}
  ${featureMapHtml}
  ${taskProgressHtml}
  ${memorySections}
  ${timelineHtml}

  <footer>
    Generated: ${escapeHtml(timestamp)}${snapshot.currentPhase ? ` | Phase: ${escapeHtml(snapshot.currentPhase)}` : ""}
  </footer>
</div>

<script>
const SNAPSHOT = ${safeJsonEmbed(snapshot, snapshot.projectRoot)};

function toggleTheme() {
  var isLight = document.body.classList.toggle('light-theme');
  try { localStorage.setItem('prism-theme', isLight ? 'light' : 'dark'); } catch(e) {}
}

try {
  if (localStorage.getItem('prism-theme') === 'light') {
    document.body.classList.add('light-theme');
  }
} catch(e) {}

${relativeTimeScript()}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderWarnings(warnings: string[]): string {
  if (warnings.length === 0) return "";
  const items = warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("");
  return `<div class="warnings-banner">
  <strong>Data warnings:</strong>
  <ul>${items}</ul>
</div>`;
}

function renderHeader(snapshot: ProjectSnapshot): string {
  const name = snapshot.projectName ?? "Untitled Project";
  const summary = snapshot.productSummary
    ? `<p class="product-summary">${escapeHtml(snapshot.productSummary)}</p>`
    : "";
  const target = snapshot.targetUser
    ? `<span class="source-badge">Target: ${escapeHtml(snapshot.targetUser)}</span>`
    : "";

  return `<header>
  <div>
    <h1>${escapeHtml(name)}</h1>
    ${summary}
  </div>
  <div class="header-meta">
    ${snapshot.currentPhase ? `<span class="phase-badge">${escapeHtml(snapshot.currentPhase)}</span>` : ""}
    ${target}
    <button class="theme-toggle" onclick="toggleTheme()" title="Toggle light/dark theme" aria-label="Toggle theme">◐</button>
  </div>
</header>`;
}

function renderFeatureMap(features: FeatureEntry[]): string {
  if (features.length === 0) {
    return `<section class="feature-map"><h2>Features</h2><p class="empty-state">No product specs found</p></section>`;
  }

  const shipped = features.filter(f => f.status === "shipped");
  const inProgress = features.filter(f => f.status === "in_progress");
  const planned = features.filter(f => f.status === "planned");

  return `<section class="feature-map">
  <h2>Features</h2>
  <div class="kanban">
    ${renderKanbanColumn("Shipped", shipped, "shipped")}
    ${renderKanbanColumn("In Progress", inProgress, "in-progress")}
    ${renderKanbanColumn("Planned", planned, "planned")}
  </div>
</section>`;
}

function renderKanbanColumn(title: string, features: FeatureEntry[], className: string): string {
  const cards = features.length === 0
    ? `<p class="empty-state">None</p>`
    : features.map(f => renderFeatureCard(f)).join("");

  return `<div class="kanban-column kanban-${className}">
  <h3>${escapeHtml(title)} <span class="count">(${features.length})</span></h3>
  ${cards}
</div>`;
}

function renderFeatureCard(feature: FeatureEntry): string {
  const ac = feature.acceptanceCriteria;
  const pct = ac.total > 0 ? Math.round((ac.passing / ac.total) * 100) : 0;
  const progressBar = ac.total > 0
    ? `<div class="ac-progress"><div class="ac-bar" style="width:${pct}%"></div></div>
       <span class="ac-label">${ac.passing}/${ac.total} AC</span>`
    : "";

  return `<div class="feature-card">
  <div class="feature-title">${escapeHtml(feature.title)}</div>
  <span class="status-badge status-${feature.status}">${escapeHtml(feature.specStatus)}</span>
  ${progressBar}
</div>`;
}

function renderTaskProgress(taskProgress: TaskProgress | null): string {
  if (!taskProgress) return "";

  const pct = taskProgress.total > 0
    ? Math.round((taskProgress.completed / taskProgress.total) * 100)
    : 0;

  // Group by wave if available
  const hasWaves = taskProgress.tasks.some(t => t.wave != null);
  let tasksHtml: string;

  if (hasWaves) {
    const waves = new Map<number, typeof taskProgress.tasks>();
    for (const t of taskProgress.tasks) {
      const wave = t.wave ?? 0;
      if (!waves.has(wave)) waves.set(wave, []);
      waves.get(wave)!.push(t);
    }

    tasksHtml = Array.from(waves.entries())
      .sort(([a], [b]) => a - b)
      .map(([wave, tasks]) => {
        const items = tasks.map(t => {
          const icon = t.status === "done" || t.status === "completed" ? "✓"
            : t.status === "in_progress" ? "●" : "○";
          return `<li class="task-item task-${t.status}">${icon} ${escapeHtml(t.title)}</li>`;
        }).join("");
        return `<div class="wave-group"><h4>Wave ${wave}</h4><ul>${items}</ul></div>`;
      }).join("");
  } else {
    const items = taskProgress.tasks.map(t => {
      const icon = t.status === "done" || t.status === "completed" ? "✓"
        : t.status === "in_progress" ? "●" : "○";
      return `<li class="task-item task-${t.status}">${icon} ${escapeHtml(t.title)}</li>`;
    }).join("");
    tasksHtml = `<ul>${items}</ul>`;
  }

  return `<section class="task-progress">
  <h2>Task Progress</h2>
  <div class="progress-bar-container">
    <div class="progress-bar" style="width:${pct}%"></div>
    <span class="progress-label">${taskProgress.completed}/${taskProgress.total} (${pct}%)</span>
  </div>
  ${tasksHtml}
</section>`;
}

function renderMemorySections(snapshot: ProjectSnapshot): string {
  const sections: string[] = [];

  if (snapshot.architectureMarkdown) {
    sections.push(renderMemorySection("Architecture", snapshot.architectureMarkdown));
  }
  if (snapshot.stateMarkdown) {
    sections.push(renderMemorySection("State", snapshot.stateMarkdown));
  }
  if (snapshot.roadmapMarkdown) {
    sections.push(renderMemorySection("Roadmap", snapshot.roadmapMarkdown));
  }

  if (sections.length === 0) return "";

  return `<div class="memory-sections">${sections.join("")}</div>`;
}

function renderMemorySection(title: string, markdown: string): string {
  return `<section class="memory-section sidebar">
  <h2>${escapeHtml(title)}</h2>
  <div class="markdown-content">${renderMarkdown(markdown)}</div>
</section>`;
}

function renderTimeline(snapshot: ProjectSnapshot): string {
  const hasDecisions = snapshot.decisionsMarkdown !== null;
  const hasShips = snapshot.shipStatus.length > 0;

  if (!hasDecisions && !hasShips) return "";

  const decisionsCol = hasDecisions
    ? `<section class="sidebar">
        <h2>Decisions</h2>
        <div class="markdown-content">${renderMarkdown(snapshot.decisionsMarkdown!)}</div>
      </section>`
    : "";

  const shipsCol = hasShips
    ? `<section class="sidebar">
        <h2>Ship Status</h2>
        <ul>${snapshot.shipStatus.map(renderShipEntry).join("")}</ul>
      </section>`
    : "";

  return `<div class="sidebars">${decisionsCol}${shipsCol}</div>`;
}

function renderShipEntry(entry: ShipStatusEntry): string {
  const prLink = entry.prUrl
    ? ` <a href="${escapeHtml(entry.prUrl)}" class="pr-link">PR</a>`
    : "";
  const confidence = entry.confidence
    ? ` <span class="confidence-badge confidence-${escapeHtml(entry.confidence)}">${escapeHtml(entry.confidence)}</span>`
    : "";

  return `<li>
  <strong>${escapeHtml(entry.specTitle)}</strong>${prLink}${confidence}
  <span class="ship-date" data-timestamp="${escapeHtml(entry.shippedAt)}">${escapeHtml(new Date(entry.shippedAt).toLocaleDateString())}</span>
</li>`;
}

// ---------------------------------------------------------------------------
// Project-specific CSS
// ---------------------------------------------------------------------------

const PROJECT_CSS = `
/* Warnings banner */
.warnings-banner {
  background: color-mix(in srgb, var(--yellow) 15%, var(--surface));
  border: 1px solid var(--yellow);
  border-radius: 0.75rem;
  padding: 1rem 1.5rem;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
}
.warnings-banner ul { list-style: disc; margin-left: 1.5rem; margin-top: 0.5rem; }
.warnings-banner li { padding: 0.15rem 0; }

/* Product summary */
.product-summary {
  color: var(--text-muted);
  font-size: 1rem;
  margin-top: 0.25rem;
}

/* Feature map / Kanban */
.feature-map { margin-bottom: 2rem; }
.feature-map h2 { font-size: 1.25rem; margin-bottom: 1rem; }

.kanban {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

@media (max-width: 768px) {
  .kanban { grid-template-columns: 1fr; }
}

.kanban-column {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1rem;
  min-height: 120px;
}

.kanban-column h3 {
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--border);
}

.kanban-shipped h3 { border-bottom-color: var(--green); }
.kanban-in-progress h3 { border-bottom-color: var(--blue); }
.kanban-planned h3 { border-bottom-color: var(--gray); }

.count { color: var(--text-muted); font-weight: 400; }

.feature-card {
  background: var(--surface-hover);
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
}

.feature-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.35rem;
}

.status-badge.status-shipped { background: var(--green); color: white; }
.status-badge.status-in_progress { background: var(--blue); color: white; }
.status-badge.status-planned { background: var(--gray); color: white; }

.ac-progress {
  background: var(--border);
  border-radius: 0.25rem;
  height: 6px;
  margin-top: 0.5rem;
  overflow: hidden;
}

.ac-bar {
  background: var(--green);
  height: 100%;
  border-radius: 0.25rem;
  transition: width 0.3s;
}

.ac-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
  display: block;
}

/* Task progress */
.task-progress {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.task-progress h2 { font-size: 1.1rem; margin-bottom: 1rem; }

.progress-bar-container {
  background: var(--border);
  border-radius: 0.5rem;
  height: 24px;
  position: relative;
  margin-bottom: 1rem;
  overflow: hidden;
}

.progress-bar {
  background: var(--green);
  height: 100%;
  border-radius: 0.5rem;
  transition: width 0.3s;
}

.progress-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.8rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.wave-group { margin-bottom: 1rem; }
.wave-group h4 { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem; }

.task-progress ul { list-style: none; padding: 0; }

.task-item {
  padding: 0.3rem 0;
  font-size: 0.9rem;
}

.task-done, .task-completed { color: var(--green); }
.task-in_progress { color: var(--blue); }
.task-pending { color: var(--text-muted); }

/* Memory sections */
.memory-sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.memory-section { min-height: auto; }

.markdown-content h1 { font-size: 1.1rem; margin: 0.75rem 0 0.5rem; }
.markdown-content h2 { font-size: 1rem; margin: 0.75rem 0 0.5rem; }
.markdown-content h3 { font-size: 0.95rem; margin: 0.5rem 0 0.25rem; }
.markdown-content p { margin-bottom: 0.5rem; font-size: 0.9rem; }
.markdown-content ul { margin: 0.25rem 0 0.5rem 1.25rem; list-style: disc; }
.markdown-content li { padding: 0.15rem 0; font-size: 0.9rem; border-bottom: none; }
.markdown-content pre {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.75rem;
  overflow-x: auto;
  font-size: 0.85rem;
  margin: 0.5rem 0;
}
.markdown-content code { font-family: monospace; font-size: 0.85em; }

/* Ship entries */
.pr-link {
  font-size: 0.75rem;
  color: var(--blue);
  text-decoration: none;
  margin-left: 0.5rem;
}
.pr-link:hover { text-decoration: underline; }

.ship-date {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

.confidence-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  margin-left: 0.5rem;
}
.confidence-high { background: var(--green); color: white; }
.confidence-medium { background: var(--orange); color: white; }
.confidence-low { background: var(--red); color: white; }

/* Project print extras */
@media print {
  .kanban-column { border: 1px solid #ccc; }
  .feature-card { border: 1px solid #ddd; }
  .task-progress { border: 1px solid #ccc; }
  .memory-section { border: 1px solid #ccc; }
  .warnings-banner { border: 1px solid #ccc; background: #fffde7; }
}
`;
