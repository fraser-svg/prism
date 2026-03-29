# Design System — Prism

> Status: APPROVED — synthesized from 3 design voices (primary + Codex + Claude subagent). Approved 2026-03-28.
> Research completed: Linear, Raycast, Cursor, Warp, Notion visual analysis.
> Outside voices: Codex (system rigor review) + Claude subagent (alternative direction).

## Product Context
- **What this is:** AI concierge that takes non-technical users from idea to shipped software
- **Who it's for:** Non-technical founders, agency operators, creative builders
- **Space/industry:** AI-assisted software creation (adjacent to Cursor, Replit, but for non-engineers)
- **Project type:** Electron desktop app — split-pane workspace (chat + build stream)

## Research Findings

Analyzed 5 products in the premium desktop tool category:

| Product | Mode | Palette | Typography | Density | Takeaway |
|---------|------|---------|------------|---------|----------|
| Linear | Dark-first | Monochrome + status colors | Clean sans-serif | Dense | Too developer-centric for Prism's audience |
| Raycast | Dark-first | Dark + colorful accent icons | System-native | Medium | macOS-native feel, good motion |
| Cursor | Light, warm | Cream/off-white, minimal accent | Editorial sans | Comfortable | Closest reference — AI coding tool that chose warmth over darkness |
| Warp | Dark-first | Near-black + purple accents | Clean sans | Dense | Developer-focused, not applicable |
| Notion | Light, warm | White + warm accents, illustrated | Friendly sans + serif mix | Spacious | Gold standard for non-technical users loving a premium tool |

**Convergence:** Linear/Raycast/Warp share dark monochrome developer aesthetic.
**Opportunity:** Dark-first but warm, not cold. Prism takes the immersive depth of dark mode but rejects the sterile blue-black developer aesthetic. Warm dark surfaces make Fraunces glow.

## Aesthetic Direction
- **Direction:** Luxury/Refined with Industrial backbone
- **Decoration level:** Intentional — typography does the hierarchy, not boxes. Minimal cards/borders/dividers. Surface separation through tone and type weight, not chrome. Empty states and onboarding get more personality.
- **Mood:** A surgical instrument made by a craftsman. Precise, purposeful, with the warmth of something built by hand for someone specific. Not a hotel lobby... a private studio where serious work happens.
- **Reference sites:** linear.app, raycast.com, cursor.com, warp.dev, notion.so

## Typography
- **Display/Hero:** Fraunces (variable, optical-size axis) — warm variable serif, instantly distinctive. **Display-only: 24px minimum, ideally 32px+.** No AI tool uses a serif for display. Signals editorial craft and human judgment. Does not survive at body sizes (too much personality, too much shape variation for dense UI).
- **Body:** Instrument Sans — clean geometric sans, excellent readability at all sizes, pairs beautifully with Fraunces without competing. Not overused.
- **UI/Labels:** Instrument Sans (medium weight)
- **Data/Tables:** Geist (tabular-nums) — crisp for metrics, session costs, timestamps, build durations
- **Code:** Geist Mono — matches data font, consistent family feel
- **Loading:** Google Fonts CDN (`fonts.googleapis.com`)
- **Scale:**
  - 3xl: 48px / 3rem — Hero headings (Fraunces, weight 300)
  - 2xl: 36px / 2.25rem — Page titles (Fraunces)
  - xl: 28px / 1.75rem — Section headings (Fraunces)
  - lg: 22px / 1.375rem — Subheadings (Instrument Sans, semibold)
  - md: 16px / 1rem — Body text (Instrument Sans)
  - sm: 14px / 0.875rem — Secondary text, labels (Instrument Sans)
  - xs: 12px / 0.75rem — Captions, metadata (Instrument Sans)
  - mono: 13px / 0.8125rem — Code, data values (Geist / Geist Mono)

## Color
- **Approach:** Restrained — one accent + warm neutrals. Color is rare and meaningful. Dark-first.
- **Primary accent:** `#C47A2A` (warm amber/copper) — every AI tool uses blue or purple. Amber is a deliberate, category-defining departure. Represents craft, warmth, trust.
- **Accent tokens (mode-aware, WCAG AA compliant):**
  - `accent.brand`: `#C47A2A` — fills, highlights, large UI moments (both modes)
  - `accent.fg.light`: `#8A5520` — text/links on light backgrounds (5.9:1 on #FAFAF7, passes AA)
  - `accent.fg.dark`: `#D4923A` — text/links on dark backgrounds (passes AA on #1A1917)
  - `accent.fill`: `#C47A2A` — button fills, badges (use white text)
  - `accent.subtle-bg.light`: `#F5EDE0` — hover/selected state backgrounds (light mode)
  - `accent.subtle-bg.dark`: `#2A2118` — hover/selected state backgrounds (dark mode)
  - `accent.border`: `#C47A2A` at 40% opacity
- **Secondary:** `#2D6A4F` (deep sage) — success states, positive affirmation, growth indicators. Grounds the amber.
- **Neutrals (warm gray scale):**
  - 50: `#FAFAF7` (text on dark mode, light mode backgrounds)
  - 100: `#F3F2EE` (card/surface background, light mode)
  - 200: `#E8E6E0` (borders, dividers, light mode)
  - 300: `#D4D1C9` (disabled states)
  - 400: `#A8A49B` (placeholder text)
  - 500: `#7A766D` (secondary text, dark mode)
  - 600: `#5C584F` (body text, light mode)
  - 700: `#3D3A33` (headings, light mode)
  - 800: `#242320` (elevated surface, dark mode — cards, panels, modals)
  - 900: `#1A1917` (page background, dark mode — DEFAULT)
  - 950: `#121110` (deep background, dark mode — behind everything)
- **Graphite note** (industrial counterweight for data-dense panels):
  - `#2C2B28` — data panel backgrounds (darker, slightly cooler than surface)
  - `#38352F` — table header backgrounds
  - `#4A463E` — active row highlights in data views
- **Semantic:**
  - Success: `#2D6A4F` (deep sage — matches secondary)
  - Warning: `#D4A017` (warm gold)
  - Error: `#C1292E` (muted red — firm but not alarming)
  - Info: `#4A7FA5` (cool blue — only semantic use of blue)
- **Dark mode strategy (DEFAULT):** Warm dark surfaces (`#1A1917` base, `#242320` elevated). Text uses warm off-white (`#FAFAF7`). Never use cool blue-blacks. Accent saturation stays full in dark mode (amber reads stronger on dark).
- **Light mode strategy:** `#FAFAF7` base, `#F3F2EE` surfaces. Uses darker accent token `#8A5520` for text-level amber. Available but not default.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — non-technical users need room to breathe. More generous than Linear/Cursor, less spacious than Notion marketing pages.
- **Scale:**
  - 2xs: 2px — hairline gaps
  - xs: 4px — tight internal padding
  - sm: 8px — compact spacing, icon gaps
  - md: 16px — standard padding, between elements
  - lg: 24px — section gaps, card padding
  - xl: 32px — between major sections
  - 2xl: 48px — page-level margins
  - 3xl: 64px — hero spacing, view transitions

## Layout
- **Approach:** Grid-disciplined — strict columns, predictable alignment
- **Grid:** 12-column at ≥1280px, 8-column at ≥768px, single column at <768px
- **Max content width:** 1440px (app frame), 720px (chat pane), flexible (workspace pane)
- **Split-pane default:** 40% chat / 60% workspace (user-resizable)
- **Navigation:** Collapsible during sessions. No persistent sidebar when inside a workspace. Full window dedicated to the work. Navigation appears on hover (left edge) or keyboard shortcut, then disappears. Session list and project switching live in the collapsed nav.
- **Border radius:**
  - sm: 4px — inputs, small elements
  - md: 8px — cards, modals, buttons
  - lg: 12px — major containers, checkpoint overlays
  - full: 9999px — avatars, status badges
- **Component language (industrial backbone):**
  - Thin but visible borders (1px, `neutral-800` in dark mode)
  - Dense list/table rhythm — tighter row spacing than cards
  - Restrained corner radii — md (8px) is the most common, not lg
  - Fewer soft shadows, more tonal separation
  - Strong selected/focus states (amber border or amber subtle-bg)

## Motion
- **Approach:** Intentional — measured and confident, never decorative in productivity flows.
- **Easing:**
  - Enter: ease-out (elements arriving)
  - Exit: ease-in (elements leaving)
  - Move: ease-in-out (repositioning)
  - Spring: cubic-bezier(0.34, 1.56, 0.64, 1) (checkpoint card emphasis only)
- **Duration:**
  - Instant: 0ms — utility interactions (toggles, selections in dense views)
  - Micro: 80ms — hover states
  - Short: 150ms — button clicks, small reveals
  - Medium: 300ms — pane changes, eased slide/fade
  - Long: 500ms — checkpoint card appearance, major state changes
- **Loading states:** No spinners. No progress bars. No skeleton screens. Text writes in at a pace that feels like thought, not streaming tokens. When Prism is working, the UI gets quieter, not busier. Absence of noise signals confidence.

## Design Risks (Deliberate Departures)

These are intentional departures from category conventions:

1. **Warm amber accent instead of blue/purple** — Instant visual identity. Every AI product from Cursor to ChatGPT to Claude uses blue, violet, or teal. Amber is overcrowded-category-proof. Gain: differentiation + warmth. Cost: lose the "AI = blue" association (overcrowded anyway). Validated by Codex with accessibility fix.

2. **Serif display font (Fraunces), display-only** — Developer tools never use serifs. But Prism isn't a developer tool. Fraunces at 24px+ signals editorial craft and human judgment. Restricted from body/UI sizes per Codex review. Gain: personality + trust + distinction. Cost: lose the geometric-sans "tech" look.

3. **Dark-first with warm neutrals** — Most non-technical tools default light. But dark surfaces make Fraunces glow, create focus immersion, and signal "this is a workspace, not a website." Warm darks (never blue-blacks) maintain approachability. Gain: immersion + typography impact + differentiation from light-mode AI tools. Cost: unfamiliar to some non-technical users (mitigated by light mode option).

4. **Collapsible navigation** — Every tool has a persistent sidebar. Prism collapses navigation entirely during sessions. The workspace takes the full window. Structure appears on demand, then disappears. Gain: total immersion in the work, feels like the tool respects your focus. Cost: discoverability of features (mitigated by onboarding + keyboard shortcuts).

5. **No loading chrome** — No spinners, progress bars, or skeleton screens. Response text writes in at thought-pace. The UI gets quieter during processing, not busier. Gain: confidence, calm, feels like working with a thoughtful partner. Cost: must handle long waits gracefully (subtle ambient state change for >3s waits).

## Outside Voice Review

| Voice | Key Feedback | Incorporated |
|-------|-------------|--------------|
| Codex | Fraunces must be display-only (24px+) | Yes — restricted in typography spec |
| Codex | Amber fails WCAG AA on light (`#C47A2A` = 3.26:1 on `#FAFAF7`) | Yes — added mode-aware accent tokens with `#8A5520` for light-mode text |
| Codex | Need industrial backbone under the warmth | Yes — added component language spec + graphite note for data panels |
| Codex | Split accent tokens by mode and function | Yes — 7 accent tokens defined |
| Subagent | Go dark-first | Yes — dark mode is now default |
| Subagent | Typography does hierarchy, not boxes | Yes — component language prioritizes tonal separation over borders/cards |
| Subagent | Kill the sidebar during sessions | Yes — collapsible navigation spec added |
| Subagent | No loading spinners, typographic animation | Yes — loading states spec added |
| Subagent | Swap amber for sage | No — amber is the identity. Sage stays as secondary/success color. |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-28 | Initial design system drafted | Created by /design-consultation. Competitive research: Linear, Raycast, Cursor, Warp, Notion. |
| 2026-03-28 | Amber accent over blue/purple | Category differentiation — every AI tool converges on blue/violet. |
| 2026-03-28 | Fraunces serif for display | Editorial personality for non-developer audience. Pairs with Instrument Sans body. |
| 2026-03-28 | Light-first with warm dark mode | Original direction for non-technical comfort. |
| 2026-03-28 | Outside voice review (Codex + Claude subagent) | Three-voice synthesis. Codex flagged accessibility + component rigor. Subagent proposed dark-first + collapsible nav + typographic loading. |
| 2026-03-28 | Switched to dark-first | Subagent insight: Fraunces glows on dark surfaces, dark creates immersion. All three voices agreed on warm (not cold) darks. |
| 2026-03-28 | Added mode-aware accent tokens | Codex caught WCAG AA failure: `#C47A2A` on `#FAFAF7` = 3.26:1. Added `#8A5520` for light-mode text. |
| 2026-03-28 | Collapsible navigation during sessions | Subagent departure. Full workspace immersion, nav on demand only. |
| 2026-03-28 | No loading chrome | Subagent departure. Typographic animation instead of spinners/skeletons. Absence of noise = confidence. |
| 2026-03-28 | Industrial component backbone | Codex review. Thin borders, tighter table rhythm, graphite data panel backgrounds, strong focus states. |
| 2026-03-28 | Kept amber, rejected sage swap | Amber is category-defining identity. Sage stays as secondary/success only. |
