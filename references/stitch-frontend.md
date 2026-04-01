# Stitch Frontend Generation

Google Stitch generates complete UI screens (HTML + screenshots) from text prompts.
It is a dedicated frontend generation service, separate from the Gemini code worker.

Prism always knows the Stitch workflow. Availability is a separate question from workflow
knowledge.

## Readiness Modes

Prism can reach Stitch in two ways:

1. **Host-managed Stitch**
   - Stitch MCP tools are already exposed by the active runtime.
   - If the runtime tool list includes `create_project`, `generate_screen_from_text`,
     `edit_screens`, `generate_variants`, or `getHtml`, Prism can use Stitch directly.

2. **Repo-managed Stitch**
   - The workspace-local MCP proxy in `scripts/stitch-mcp/` is used.
   - This requires both the local SDK install and a Stitch API key in macOS Keychain.

If host-managed Stitch is available, Prism may use it even when the repo-managed proxy is not ready.
If host-managed Stitch is not available, Prism should check `bash scripts/prism-stitch-status.sh`
to explain the exact repo-managed failure mode before falling back.
## When to Use Stitch vs Gemini Worker

| Use Case | Tool | Why |
|----------|------|-----|
| Standalone UI screens or pages (landing pages, dashboards, signup flows) | **Stitch** | Purpose-built for complete screen generation with layout, styling, and interactivity |
| Code that integrates into an existing project (components, API routes, utilities) | **Gemini worker** | Needs project context, file structure awareness, and import resolution |
| Rapid visual exploration (multiple design variants) | **Stitch** | `generate_variants` produces multiple options in one call |
| Modifying existing source files | **Gemini worker** | Stitch generates standalone output, not patches |

**Rule of thumb:** If the output is a self-contained HTML page or screen, use Stitch.
If the output needs to fit into existing code, use the Gemini worker.

## Latency Expectations

Stitch generation takes **20–40 seconds** per screen. Always tell the user before
calling: "Generating your screen with Stitch — this takes about 30 seconds."

Do not call Stitch in a tight loop. Batch screen generation where possible.

## Verification Bypass

Stitch output **bypasses Prism's worker/verification pipeline**. The generated HTML
is returned directly to the user without passing through the Guardian, QA review, or
engineering review stages.

This means:
- Stitch output is not covered by Prism's quality gates
- The user is responsible for reviewing Stitch output before integrating it
- If the user wants Prism-grade verification, they should paste the Stitch HTML into
  the project and run the normal build/verify flow

Future work: feed Stitch output into the worker/verification pipeline automatically
(see TODOS.md — Stitch pipeline integration).

## Stitch Workflow

1. **Create project:** `create_project` — sets up a Stitch workspace
2. **Generate screen:** `generate_screen_from_text` — produces HTML + screenshot from a prompt
3. **Iterate:** `edit_screens` — refine an existing screen with follow-up instructions
4. **Explore variants:** `generate_variants` — produce multiple design options (use creative ranges and aspect ratios)
5. **Extract code:** `getHtml` — returns a download URL for the screen's HTML (fetch the URL to get the markup)

### Model Selection

- `GEMINI_3_PRO` — higher quality, slower. Use for final screens.
- `GEMINI_3_FLASH` — faster, good enough for exploration and iteration.

### Device Types

Stitch supports targeting device form factors (desktop, mobile, tablet) when generating
screens. Specify the target device to get appropriate layouts and breakpoints.

## Setup Checklist

1. Install the SDK:
   ```bash
   cd scripts/stitch-mcp && npm install
   ```

2. In Prism chat, connect your Stitch API key:
   ```
   prism: connect stitch
   ```

3. In Prism chat, verify connection:
   ```
   prism: status
   ```
   Should show `stitch: connected`.

## Troubleshooting

- `missing_sdk`:
  Repo-managed Stitch is missing the local SDK install. Run `cd scripts/stitch-mcp && npm install`.
- `missing_key`:
  Repo-managed Stitch does not have a connected Stitch API key. In Prism chat, run `prism: connect stitch`.
- `keychain_locked`:
  Repo-managed Stitch cannot read the local key until the macOS Keychain is unlocked.
- `keychain_unavailable`:
  Repo-managed Stitch cannot use the local Keychain-backed path in the current environment.
- Host-managed Stitch available but repo-managed broken:
  Prism can still use Stitch if the active runtime already exposes the Stitch MCP tools.
