# Design System — Prism

> Status: DRAFT — proposed via /design-consultation, pending final user approval.
> Research completed: Linear, Raycast, Cursor, Warp, Notion visual analysis.

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
**Opportunity:** Cursor and Notion prove warm, light, editorial approaches work — even for technical products. Prism's non-technical audience makes this the obvious direction.

## Aesthetic Direction
- **Direction:** Luxury/Refined with Industrial undertones
- **Decoration level:** Intentional — subtle warmth in backgrounds (not sterile white), surface separation through shadow and tone rather than borders. Empty states and onboarding get more personality.
- **Mood:** A well-designed hotel lobby where everything just works. Confident, warm, unhurried. Whispers competence rather than shouting complexity.
- **Reference sites:** linear.app, raycast.com, cursor.com, warp.dev, notion.so

## Typography
- **Display/Hero:** Fraunces (variable, optical-size axis) — warm variable serif, instantly distinctive. No AI tool uses a serif for display. Signals editorial craft and human judgment — exactly what Prism's Socratic discovery represents.
- **Body:** Instrument Sans — clean geometric sans, excellent readability at all sizes, pairs beautifully with Fraunces without competing. Not overused.
- **UI/Labels:** Instrument Sans (medium weight)
- **Data/Tables:** Geist (tabular-nums) — crisp for metrics, session costs, timestamps, build durations
- **Code:** Geist Mono — matches data font, consistent family feel
- **Loading:** Google Fonts CDN (`fonts.googleapis.com`)
- **Scale:**
  - 3xl: 48px / 3rem — Hero headings (Fraunces)
  - 2xl: 36px / 2.25rem — Page titles (Fraunces)
  - xl: 28px / 1.75rem — Section headings (Fraunces)
  - lg: 22px / 1.375rem — Subheadings (Instrument Sans, semibold)
  - md: 16px / 1rem — Body text (Instrument Sans)
  - sm: 14px / 0.875rem — Secondary text, labels (Instrument Sans)
  - xs: 12px / 0.75rem — Captions, metadata (Instrument Sans)
  - mono: 13px / 0.8125rem — Code, data values (Geist / Geist Mono)

## Color
- **Approach:** Restrained — one accent + warm neutrals. Color is rare and meaningful.
- **Primary:** `#C47A2A` (warm amber/copper) — every AI tool uses blue or purple. Amber is a deliberate, category-defining departure. Represents craft, warmth, trust.
- **Secondary:** `#2D6A4F` (deep sage) — used for success states, positive affirmation, and growth indicators. Grounds the amber.
- **Neutrals (warm gray scale):**
  - 50: `#FAFAF7` (page background, light mode)
  - 100: `#F3F2EE` (card/surface background)
  - 200: `#E8E6E0` (borders, dividers)
  - 300: `#D4D1C9` (disabled states)
  - 400: `#A8A49B` (placeholder text)
  - 500: `#7A766D` (secondary text)
  - 600: `#5C584F` (body text, light mode)
  - 700: `#3D3A33` (headings, light mode)
  - 800: `#242320` (surface, dark mode)
  - 900: `#1A1917` (page background, dark mode)
  - 950: `#121110` (deep background, dark mode)
- **Semantic:**
  - Success: `#2D6A4F` (deep sage — matches secondary)
  - Warning: `#D4A017` (warm gold)
  - Error: `#C1292E` (muted red — firm but not alarming)
  - Info: `#4A7FA5` (cool blue — only semantic use of blue)
- **Dark mode strategy:** Warm dark surfaces (`#1A1917` base, `#242320` elevated). Reduce accent saturation ~15%. Text flips to warm off-white (`#FAFAF7`). Never use cool blue-blacks.

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
- **Border radius:**
  - sm: 4px — inputs, small elements
  - md: 8px — cards, modals, buttons
  - lg: 12px — major containers, checkpoint overlays
  - full: 9999px — avatars, status badges

## Motion
- **Approach:** Intentional — smooth transitions that aid comprehension. The chat stream should feel alive. Checkpoint cards appear with gentle emphasis. Nothing bouncy or playful — measured and confident.
- **Easing:**
  - Enter: ease-out (elements arriving)
  - Exit: ease-in (elements leaving)
  - Move: ease-in-out (repositioning)
  - Spring: cubic-bezier(0.34, 1.56, 0.64, 1) (checkpoint card emphasis only)
- **Duration:**
  - Micro: 80ms — hover states, toggles
  - Short: 150ms — button clicks, small reveals
  - Medium: 300ms — view transitions, card entrances
  - Long: 500ms — checkpoint card appearance, major state changes

## Design Risks (Deliberate Departures)

These are intentional departures from category conventions:

1. **Warm amber accent instead of blue/purple** — Instant visual identity. Every AI product from Cursor to ChatGPT to Claude uses blue, violet, or teal. Amber is overcrowded-category-proof. Gain: differentiation + warmth. Cost: lose the "AI = blue" association (overcrowded anyway).

2. **Serif display font (Fraunces)** — Developer tools never use serifs. But Prism isn't a developer tool. Fraunces signals editorial craft and human judgment. Gain: personality + trust + distinction. Cost: lose the geometric-sans "tech" look.

3. **Warm neutrals throughout** — Most tools use cool grays. Warm off-whites and warm darks feel like a workspace you'd want to spend time in. Gain: comfort + approachability. Cost: lose the "clinical precision" vibe (which Prism doesn't want anyway).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-28 | Initial design system drafted | Created by /design-consultation. Competitive research: Linear, Raycast, Cursor, Warp, Notion. Proposal optimized for non-technical user trust + category differentiation. |
| 2026-03-28 | Amber accent over blue/purple | Category differentiation — every AI tool converges on blue/violet. Amber signals craft and warmth. |
| 2026-03-28 | Fraunces serif for display | Editorial personality for a non-developer audience. Pairs with Instrument Sans body. |
| 2026-03-28 | Light-first with warm dark mode | Non-technical users default to light mode. Warm darks (not blue-blacks) maintain brand coherence. |
