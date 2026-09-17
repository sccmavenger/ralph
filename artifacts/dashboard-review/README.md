# H + G local dashboard review

Implemented only the signed-in dashboard redesign. No GitHub push or production deployment was performed. Public homepage, manifest, root layout, and desktop QR component have no content changes.

## Review

Open http://127.0.0.1:3000/dashboard with a valid login. Use a phone-width browser viewport (for example 402 or 440 CSS pixels); the original desktop QR screen is intentionally retained above 768px.

The PNGs in this folder are browser screenshots of the implementation with mocked sample rewards and wallet values, not live account data. Full-page captures include the fixed bottom navigation at the initial viewport position; the actual page scrolls beneath it.

## Verification

- Production build passed locally (no deployment).
- Focused lint passed with one existing AppHeader image-element warning.
- 31 unit tests passed across dashboard briefing and wallet formatting.
- Dashboard page/resilience/resource run: 18 passed, including authentication setup.
- Daily briefing/farming/meta/planner/tower widget regression run: 22 passed, including authentication setup.
- Final resource-layout run: 12 passed, including authentication setup. Covers 320/390/402/440px widths, expiry removal, partial data and retries, wallet edits/errors, inline rewards, More dialog keyboard behavior, and original desktop QR.
- Viewport tests used Chromium, not physical iPhones or Safari.

Live MSF requests from the saved test account returned authorization errors (403). Populated/error states were tested using intercepted responses. Existing Tower history also reported a missing database table during the legacy widget regression run; no schema or infrastructure changes were made.
