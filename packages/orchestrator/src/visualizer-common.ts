/**
 * visualizer-common.ts — Shared utilities for Prism's HTML visualizers.
 *
 * Both PIPELINE.html and PROJECT.html share CSS tokens, escaping, nav bar,
 * and JSON embed safety. This module is the single home for all of that.
 */

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Safe JSON embed — prevents </script> injection, strips absolute paths
// ---------------------------------------------------------------------------

export function safeJsonEmbed<T>(data: T, stripPath?: string): string {
  let obj = data;
  if (stripPath) {
    // Deep-clone and replace absolute paths with relative
    const json = JSON.stringify(data);
    const escaped = stripPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    obj = JSON.parse(json.replace(new RegExp(escaped, "g"), ".")) as T;
  }
  return JSON.stringify(obj).replace(/<\//g, "<\\/");
}

// ---------------------------------------------------------------------------
// Navigation bar
// ---------------------------------------------------------------------------

export function renderNavBar(activePage: "pipeline" | "project"): string {
  const pipelineClass = activePage === "pipeline" ? "nav-active" : "";
  const projectClass = activePage === "project" ? "nav-active" : "";

  return `<nav class="prism-nav">
  <a href="PIPELINE.html" class="nav-link ${pipelineClass}">Pipeline</a>
  <a href="PROJECT.html" class="nav-link ${projectClass}">Project</a>
</nav>`;
}

// ---------------------------------------------------------------------------
// Minimal markdown to HTML converter
// ---------------------------------------------------------------------------

export function renderMarkdown(md: string): string {
  if (!md.trim()) return "";

  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let inList = false;

  for (const line of lines) {
    // Code fences
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        result.push("</code></pre>");
        inCodeBlock = false;
      } else {
        if (inList) { result.push("</ul>"); inList = false; }
        result.push("<pre><code>");
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      result.push(escapeHtml(line));
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { result.push("</ul>"); inList = false; }
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (inList) { result.push("</ul>"); inList = false; }
      const level = headingMatch[1]!.length;
      result.push(`<h${level}>${inlineFormat(headingMatch[2]!)}</h${level}>`);
      continue;
    }

    // Bullet lists
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) { result.push("<ul>"); inList = true; }
      result.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
      continue;
    }

    // Paragraph
    if (inList) { result.push("</ul>"); inList = false; }
    result.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inCodeBlock) result.push("</code></pre>");
  if (inList) result.push("</ul>");

  return result.join("\n");
}

function inlineFormat(text: string): string {
  let out = escapeHtml(text);
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  out = out.replace(/`(.+?)`/g, "<code>$1</code>");
  return out;
}

// ---------------------------------------------------------------------------
// Relative time script (client-side JS)
// ---------------------------------------------------------------------------

export function relativeTimeScript(): string {
  return `
function relativeTime(iso) {
  var d = new Date(iso);
  var now = Date.now();
  var diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  if (diff < 2592000) return Math.floor(diff / 604800) + 'w ago';
  return d.toLocaleDateString();
}
document.querySelectorAll('[data-timestamp]').forEach(function(el) {
  el.textContent = relativeTime(el.getAttribute('data-timestamp'));
});`;
}

// ---------------------------------------------------------------------------
// Common CSS — shared across all visualizers
// ---------------------------------------------------------------------------

export const COMMON_CSS = `
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
  --yellow: #eab308;
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

/* Navigation */
.prism-nav {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0.5rem;
}

.nav-link {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem 0.5rem 0 0;
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.9rem;
  transition: color 0.15s, background 0.15s;
}

.nav-link:hover { color: var(--text); background: var(--surface-hover); }
.nav-link.nav-active { color: var(--text); background: var(--surface); border-bottom: 2px solid var(--blue); margin-bottom: -2px; }

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

.phase-badge, .source-badge, .health-badge, .status-badge {
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
  .theme-toggle, .prism-nav { display: none; }
  .sidebar { border: 1px solid #ccc; }
  @page { margin: 1.5cm; }
}
`;
