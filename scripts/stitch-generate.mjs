#!/usr/bin/env node
// stitch-generate.mjs — Generate all Prism frontend screens with Google Stitch

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdkPath = resolve(__dirname, "stitch-mcp/node_modules/@google/stitch-sdk/dist/src/index.js");
const { stitch } = await import(sdkPath);

const OUT_DIR = resolve(__dirname, "../.context/stitch-output");

const SCREENS = [
  {
    name: "portfolio",
    prompt: `Design a premium dark dashboard for a project management tool called "Prism" used by agency operators.

Background: #0a0a0f (near black). Font: Lexend (clean sans-serif).

TOP BAR: Fixed height ~56px. Left: "Prismatic" logo text in white. Center: search input with subtle border (#2a2a3a), placeholder "Search projects...". Right: "+ Client" ghost button and "+ Project" primary button (#4d8eff).

MAIN CONTENT: Below the bar, a heading "Portfolio" with a subtle description "Your active projects".

CLIENT GROUPS: Projects are grouped by client. Each group has:
- A client header banner with: client name (bold, white), project count badge, and a thin colored accent line on the left edge
- Below: a responsive 3-column grid of project cards (280px min width)

PROJECT CARDS: Each card has #111118 background, subtle border (#2a2a3a), rounded corners (12px).
Inside each card:
- Top: Project name (white, medium weight) with a small colored dot on the right indicating risk (green=#34d399 healthy, amber=#f59e0b at risk, red=#ef4444 blocked)
- Middle: A horizontal pipeline strip — 7 small rectangular segments in a row. Each segment is colored: green (#34d399) for completed, bright blue (#4d8eff) with subtle glow for current stage, red (#ef4444) for blocked, dark gray (#3a3a4a) for upcoming. The segments should have tiny gaps between them.
- Bottom row: Current stage label in muted text (#8888a0), and if deployed a small "live" badge (green outline).

Show 2 client groups with 3-4 project cards each. Make it feel premium, spacious, and confident. Subtle hover effects on cards (slight lift). No gradients on backgrounds — keep it flat and dark. The overall vibe should be: "this is a serious tool for professionals."`,
  },
  {
    name: "control-room",
    prompt: `Design a dark project detail page called "Control Room" for a product engineering tool.

Background: #0a0a0f. Font: Lexend. Accent blue: #4d8eff.

HEADER SECTION:
- Back arrow "← Portfolio" breadcrumb link (muted #8888a0)
- Large project name: "Meridian Dashboard" (white, bold, 24px)
- Below: file path in monospace font (muted): ~/projects/meridian-dashboard
- Right side: "Open Session" button in accent blue (#4d8eff), rounded

TAB BAR: Two tabs — "Pipeline" (active, with accent blue underline) and "Context". Clean, minimal tab design.

PIPELINE VISUALIZATION (main content, left ~70%):
A horizontal pipeline showing 7 stages as connected cards:
Stage names: Understand → Plan → Spec → Design → Build → Verify → Ship

Each stage is a card (~120px wide) with:
- A colored status dot at the top (green=#34d399 completed, blue=#4d8eff current with pulse glow, gray=#3a3a4a upcoming)
- Stage name below the dot
- Thin connecting lines between stages

Show "Build" as the current stage (blue glow). Understand, Plan, Spec, Design as completed (green). Verify and Ship as upcoming (gray).

STAGE DETAIL CARD (below pipeline):
An expanded card for the selected "Build" stage showing:
- Stage name + "In Progress" status chip (blue)
- "Gate Requirements" section: checklist of 4 items, 2 checked (green checkmarks), 2 unchecked (gray circles)
  - ✓ All specs approved
  - ✓ Architecture reviewed
  - ○ Tests passing
  - ○ Code review complete
- "Artifacts" section: 3 items with filled/empty circles indicating completion
- "Blockers" section: 1 red item "Waiting for API credentials"

RIGHT RAIL (30%, ~300px):
- "Timeline" header with scrollable list of 5 recent events. Each event has:
  - A small colored type chip (green "gate", blue "action", amber "decision")
  - Timestamp (relative: "2h ago", "yesterday")
  - One-line summary
- Below timeline: "Health" section with a score "72/100" displayed as a radial progress gauge (accent blue arc on dark bg)
- Below health: "Deploy" section with URL link

Dark, professional, information-dense but not cluttered. Premium feel.`,
  },
  {
    name: "login",
    prompt: `Design a dark, minimal login page for a product called "Prismatic" — a product engineering platform.

Background: #0a0a0f (near black). Font: Lexend.

CENTER OF PAGE: A card (#111118 background, subtle border #2a2a3a, rounded 16px, ~400px wide) containing:

1. LOGO AREA: "Prismatic" in white, bold, ~28px. Below: tagline "Product engineering for operators" in muted text (#8888a0), ~14px.

2. SOCIAL BUTTONS (full width, stacked):
   - "Continue with Google" button — white background, dark text, Google "G" icon on left, rounded 8px
   - "Continue with GitHub" button — dark (#1a1a24) background, white text, GitHub icon on left, rounded 8px
   - Both buttons ~44px height, good spacing between them

3. DIVIDER: A horizontal line with "or" text centered on it, muted color

4. EMAIL/PASSWORD FORM:
   - Email input field — dark background (#0a0a0f), subtle border (#2a2a3a), rounded 8px, placeholder "Email"
   - Password input field — same styling, placeholder "Password", with eye icon toggle on right
   - "Sign In" primary button — full width, #4d8eff background, white text, rounded 8px, ~44px height

5. FOOTER TEXT: "Don't have an account? Sign up" — muted text with "Sign up" as accent blue link

Overall: clean, confident, trustworthy. No decorative elements. The card should feel like it's floating on the dark background with a very subtle shadow. Premium SaaS login feel.`,
  },
  {
    name: "client-context",
    prompt: `Design a dark knowledge management page for a product engineering tool.

Background: #0a0a0f. Font: Lexend. Accent: #4d8eff.

BREADCRUMB: "← Portfolio / Acme Corp — Knowledge" at top, muted text with accent blue on "Acme Corp"

LAYOUT: Two-column, left 70% and right 30% sidebar.

LEFT COLUMN:
1. DROP ZONE: A large dashed-border (#2a2a3a) rounded rectangle (~200px tall) with:
   - Upload icon (subtle, muted)
   - "Drop files, folders, or paste notes" text (muted)
   - "or click to browse" smaller text below

2. TEXT NOTE INPUT: Below the drop zone, a textarea (#111118 bg, border #2a2a3a) with placeholder "Add a note..." and a small "Save" button on the right

3. CONTEXT ITEMS LIST: Below, a list of 4 uploaded items. Each item is a row with:
   - File type icon (document, image, etc.)
   - File name (white text)
   - Status badge on right:
     - Green "Extracted" badge for 2 items
     - Blue "Extracting..." badge with subtle pulse for 1 item
     - Amber "Queued" badge for 1 item
   - Hover action icons: re-extract, delete (only shown conceptually)

RIGHT SIDEBAR:
Header: "What Prism Knows" (white, bold)

KNOWLEDGE CATEGORIES: 4 groups with colored left borders:
- Blue border (#4d8eff) "Business" — 3 entries like "Target market: SMB agencies", "Revenue model: Per-seat SaaS", "Key competitor: Bolt.new"
- Green border (#34d399) "Technical" — 2 entries like "Stack: React + Express + SQLite", "Deploy: Railway auto-deploy"
- Purple border (#a78bfa) "Design" — 2 entries like "Brand colors: Blue + Dark", "Font: Lexend"
- Amber border (#f59e0b) "History" — 1 entry like "Founded: 2025, Pre-revenue"

Each entry shows: key-value text + small confidence percentage (e.g., "92%") in muted text

BOTTOM OF SIDEBAR: "Context Health" card with score "78/100", progress bar (accent blue fill), and 4 small status indicators (has profile ✓, has docs ✓, recent ✓, categories ✓)

Professional, organized, information-rich. The sidebar should feel like an intelligent summary panel.`,
  },
  {
    name: "providers",
    prompt: `Design a dark settings/providers page for a product engineering tool.

Background: #0a0a0f. Font: Lexend. Accent: #4d8eff.

HEADER: "Providers" title (white, bold, 24px) on left. "Refresh" button on right (ghost style, with refresh icon).

TABLE: Clean, modern table on #111118 surface with rounded corners (12px), subtle border (#2a2a3a).

Columns: Provider | Status | Tasks | Last Check

5 rows of data:
1. "Claude (Anthropic)" | Green badge "Healthy" | "142" | "2 min ago"
2. "GPT-4 (OpenAI)" | Green badge "Healthy" | "89" | "2 min ago"
3. "Gemini (Google)" | Amber badge "Degraded" | "23" | "5 min ago"
4. "Stitch (Google)" | Green badge "Healthy" | "7" | "1 min ago"
5. "Codex (OpenAI)" | Red badge "Unavailable" | "0" | "15 min ago"

Status badges: colored background with matching text
- Healthy: green bg (#34d399 at 15% opacity), green text
- Degraded: amber bg (#f59e0b at 15% opacity), amber text
- Unavailable: red bg (#ef4444 at 15% opacity), red text

Table rows have subtle hover state (slightly lighter background). Good vertical spacing between rows (~52px row height). Monospace font for the "Last Check" column.

Below the table: A subtle info line "5 providers configured · 3 healthy · 1 degraded · 1 unavailable" in muted text.

Minimal, clean, professional. This should look like a premium monitoring dashboard.`,
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Creating Stitch project...");
  const projectResult = await stitch.callTool("create_project", {
    title: "Prism Portfolio MVP",
  });
  const projectId = projectResult.name.split("/").pop();
  console.log(`Project created: ${projectId}\n`);

  const project = stitch.project(projectId);

  for (const screen of SCREENS) {
    console.log(`Generating: ${screen.name}... (~30s)`);
    try {
      // Generate via callTool
      const result = await stitch.callTool("generate_screen_from_text", {
        projectId,
        prompt: screen.prompt,
        deviceType: "DESKTOP",
        modelId: "GEMINI_3_1_PRO",
      });

      // Extract screen ID from design component
      const designComp = result.outputComponents?.find(c => c.design);
      if (!designComp?.design?.screens?.[0]) {
        console.log(`  No design output for ${screen.name}`);
        console.log(`  Components:`, result.outputComponents?.map(c => Object.keys(c)));
        continue;
      }

      const screenData = designComp.design.screens[0];
      const screenId = screenData.id;
      console.log(`  Screen ID: ${screenId}`);

      // Get HTML and image via high-level API
      const screenObj = await project.getScreen(screenId);

      const htmlUrl = await screenObj.getHtml();
      const htmlResp = await fetch(htmlUrl);
      const html = await htmlResp.text();
      await writeFile(resolve(OUT_DIR, `${screen.name}.html`), html);
      console.log(`  Saved: ${screen.name}.html (${html.length} bytes)`);

      const imgUrl = await screenObj.getImage();
      const imgResp = await fetch(imgUrl);
      const imgBuf = Buffer.from(await imgResp.arrayBuffer());
      await writeFile(resolve(OUT_DIR, `${screen.name}.png`), imgBuf);
      console.log(`  Saved: ${screen.name}.png`);

    } catch (err) {
      console.error(`  FAILED ${screen.name}: ${err.message}`);
    }
    console.log();
  }

  console.log("Done! Check .context/stitch-output/");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
