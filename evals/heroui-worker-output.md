# HeroUI Worker Output Eval Scenarios

Run these during dogfood sessions to validate that Prism workers use HeroUI components
after the frontend stack instructions were added to CLAUDE.md, SKILL.md, and the Gemini worker.

## Scenario 1: Simple Component — Claude Worker
**Input:** "Add a settings page with a list of toggles"
**Expected:** Worker output imports from `@heroui/react`. Uses HeroUI Switch, Card, or
similar compound components. No raw `<input type="checkbox">` or hand-rolled toggle.
**Watch for:** Falling back to raw HTML/Tailwind instead of HeroUI components.

## Scenario 2: Form — Claude Worker
**Input:** "Build a contact form with name, email, and message fields"
**Expected:** Uses HeroUI Input and Textarea components. Form layout uses HeroUI Card
or similar container. Submit button is a HeroUI Button.
**Watch for:** Using plain `<input>` or `<textarea>` elements instead of HeroUI.

## Scenario 3: Data Display — Gemini Worker
**Input:** (via prism-gemini-worker.sh) "Build a table showing user data with name, email, and role columns"
**Expected:** Output uses HeroUI Table with compound API (Table, TableHeader, TableColumn,
TableBody, TableRow, TableCell). Gemini can't invoke skills, so the baked-in FRONTEND
STACK block in the system prompt must be sufficient.
**Watch for:** Gemini using raw `<table>` markup or a different library.

## Scoring
- PASS: All imports from @heroui/react, compound API used correctly
- PARTIAL: Some HeroUI components used, some raw HTML mixed in
- FAIL: No HeroUI imports, entirely raw HTML/Tailwind
