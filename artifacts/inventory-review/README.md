# Inventory and shared navigation — local review

Open http://127.0.0.1:3000/inventory after signing in. Use a phone viewport (402 or 440 CSS pixels, for example). The original desktop QR and public landing page remain unchanged. No push or production deployment was performed.

## Changes

- One shared Today / Roster / Resources / Planner / More navigation on all signed-in app routes, with active states and an accessible secondary menu.
- Compact shared header; FAQ and sign-out stay accessible through More.
- Mobile inventory redesign: stock summary, game-provided artwork, resource categories, search by name/ID, quantity sorting, in-stock filter, incremental item rendering, and planner/farming shortcuts.
- Game inventory now requests full object metadata and paginates. Unknown quantities stay unknown; refresh failures preserve a clearly labeled older snapshot. Existing Premium entitlement remains unchanged.

## Verification

- Local production build passed; this did not deploy the application.
- 80 focused unit tests passed (inventory route, view helpers, and navigation).
- 28 Playwright tests passed including authentication setup: inventory states/actions, shared navigation, and dashboard regressions at 320/390/402/440px.
- Focused ESLint passed with the existing AppHeader image-element warning.
- Populated-state browser screenshots in this folder use sample fixtures, not account balances. Browser testing used Chromium, not physical iPhones or Safari.
- API contract tests use mocks aligned with the repository's official API specification; live upstream inventory was not verified by this test run.

The dashboard-only navigation component was replaced by the shared AppNavigation component.
