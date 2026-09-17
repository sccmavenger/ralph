# Dashboard redesign concepts

These are visual proposals only, generated with the built-in image-generation tool. All application changes from the abandoned landing and dashboard implementations were reverted before generating these options. Production was not deployed.

- A — Daily Sweep: emphasizes available free offers, claimable milestone rewards, and expiry times.
- B — Spend Wisely: emphasizes character priorities, known material gaps, and farming sources.
- C — Daily Command Center (recommended): orders the day around collection, investment, and farming, with direct access to the existing tools.

All numbers, times, rewards, character priorities, and balances in the images are illustrative. The proposed five-item navigation is part of the design option, not a change to the current app. These are phone-layout concepts, not proof of physical iPhone/Safari compatibility. An implementation would be checked across compact and large phone viewports after selection.

Current building blocks: daily briefing (free offers and claimable milestones), wallet (self-reported Gold and Cores), planner priorities/gaps, farming targets/sources, inventory, and Advisor. No automatic claim or spend capability is proposed. Complete coverage of every daily resource source would require verifying source availability and freshness; the UI must not promise that nothing remains unclaimed when data is unavailable.

## Generation prompts

### A

Use case: ui-mockup. Create a high fidelity, realistically buildable mobile dashboard design for the signed-in /dashboard page of MSF Companion, a Marvel Strike Force resource-planning companion. This is OPTION A: DAILY SWEEP, focused on resources players might leave uncollected today. This is a design mockup, NOT a public marketing or login page.
Canvas: a crisp large portrait design presentation, one complete front-on phone screen with subtle thin rounded black frame and safe areas, logical viewport about 402x874, rendered large for legible reading. Small external title above phone "A / DAILY SWEEP", subtitle "Collect before you log off". Neutral dark backdrop. No perspective or hand holding phone.
Visual system: mature dark navy #0b1120, slate cards #1e293b, white and muted slate text, warm amber for time-sensitive collection, restrained blue buttons. Modern SF Pro-like sans serif; readable 14-16 logical px body, 44px tap rows. Small red MSF square logo and "Companion" header, notification bell, modest avatar; same structure as an existing real app.
Inside screen from top to bottom:
- iOS-style status area. Compact header.
- "Good evening, Commander" and small visible "Concept • Sample data".
- Dominant amber-accent panel "Don't leave these behind" with large "3 available opportunities". Two generous rows: gold coin icon, "Free offer", "250K Gold • Ends in 2h 15m", chevron; purple materials icon, "Milestone rewards", "2 tiers ready to collect", chevron. Primary button "Review available rewards". Footnote "Collect in the game or web store."
- Compact wallet strip: "YOUR WALLET", "Self-reported"; "Gold 8.6M" with gold coin, "Cores 1,240" with cyan crystal; small "Update balances".
- "Farm with purpose" card showing "Character shards" / "Prioritize event requirements" and "Find farming sources →". Do not invent guaranteed drop amounts.
- Compact "Before you spend" row "Compare your next upgrade" and link "Open planner →".
- Compact bottom 5 icon nav "Today", "Roster", "Resources", "Planner", "More", Today active amber. Home indicator.
Keep only this content, plenty of breathing room. Strong hierarchy favoring the collectable opportunities. Do not show pricing, signup, QR codes, claim-all buttons, auto-claim, automatic wallet sync, fake ROI percentages, or giant fictional hero art. Use small tasteful gold/crystal/material icons. Render quoted text cleanly and accurately. User should clearly see a daily action dashboard.

### B

Use case: ui-mockup. Create a high fidelity, realistically buildable mobile dashboard redesign of the signed-in /dashboard page of MSF Companion for Marvel Strike Force. OPTION B: SPEND WISELY, investment-first resource prioritization. This is an app dashboard, never a landing or signup page.
Composition: one complete front-on phone screen, logical 402x874 portrait layout with modern iPhone safe areas and subtle thin black rounded frame, large crisp text. External title "B / SPEND WISELY", subtitle "Choose the next upgrade with confidence". Neutral dark presentation background, no perspective.
Color system: navy #0b1120, slate panels #1e293b, blue #3b82f6 primary, violet for planning, gold coin and cyan core icons. SF Pro-like typography, 14-16px logical body, 44px+ touch targets, generous gaps.
Inside screen in this order:
- iOS status, red MSF square + "Companion" header, bell and avatar.
- "Your next investment" bold header, small "Concept • Sample data".
- Integrated horizontal wallet card "Gold 8.6M" "Cores 1,240"; visible qualifier "Self-reported • Update".
- Main blue/violet bordered decision card: eyebrow "PRIORITY 01"; name "Nightcrawler" with small NC monogram portrait. Subtitle "Gear 17 → 18". Simple purple event icon and "Supports 2 upcoming events". A clear honest amber shortfall strip "Known gap: 18 gear pieces". Bottom two evenly sized buttons "Review upgrade" and "Find sources". Small legible qualifier "Known requirements, not a full cost estimate".
- "Keep your options open" compact card with two rows: "Inventory" / "Check materials on hand"; "Investment planner" / "Compare character priorities". No fabricated optimal return metrics.
- Slim urgent amber collection panel "3 rewards to review" with "Earliest expiry: 2h 15m" and "Review →".
- Bottom five item navigation "Today", "Roster", "Resources", "Planner", "More", Today active blue; home indicator.
This concept must feel distinctly like a prioritized investment card dashboard, not a checklist. Avoid visual clutter. No pricing, login CTA, QR, spend now / automated purchasing, exact total affordability assertion, automatic wallet balances, invented live rates. Good gaming-tool taste without game-art overload. Accurate clean short text.

### C

Use case: ui-mockup. Create a high fidelity realistic mobile app dashboard redesign for the signed-in /dashboard of MSF Companion, Marvel Strike Force. OPTION C: DAILY COMMAND CENTER, a balanced collect / plan / farm dashboard. This is a design proposal for choosing a future layout, not an implemented UI.
Composition: one front-on complete iPhone-style screen with logical 402x874 viewport and safe areas, rendered large enough for crisp legible text, restrained thin black frame on dark neutral board. External title "C / DAILY COMMAND CENTER"; subtitle "Collect first. Spend with a plan." No angled device or surrounding decoration.
Use the app's deep navy #0b1120 and slate #1e293b. Tasteful emerald for collecting, blue for planning, amber urgency. SF Pro-like readable type, compact information with 44px+ tap zones.
Screen top to bottom:
- iOS status, red MSF square plus "Companion", bell, avatar.
- compact greeting "Ready for today, Commander?" small "Concept • Sample data".
- a narrow wallet band: gold icon "8.6M Gold", cyan core icon "1,240 Cores", visible "Self-reported • Update".
- section title "Make today count". Three vertically stacked numbered action rows with large number and icon, keeping each task short and actionable:
  01 amber: "Collect available rewards" / "1 free offer + 2 milestone tiers" / small time badge "2h 15m earliest expiry" and chevron.
  02 blue: "Review your next upgrade" / "Nightcrawler • Supports 2 events" / small "Check known shortfalls" and chevron.
  03 emerald: "Choose today's farming" / "Find sources for priority materials" and chevron.
- prominent rounded grid of four quick access tools, 2 by 2: "Inventory" with stacked materials line icon, "Farming" with route icon, "Planner" target icon, "Advisor" chat sparkle icon.
- small low-priority collapsed row "Roster & mode insights" with "TCP • Events • War • Crucible" and chevron.
- bottom nav "Today", "Roster", "Resources", "Planner", "More"; Today active blue, home indicator.
Do not add completion checkboxes or imply app automatically knows tasks completed; these are ordered actions from available data. No pricing, signup, QR, claim all, automatic wallet sync, fake efficiency percentages or exact resource savings. Keep visibly different from a large investment hero: a compact everyday action feed with balanced priority and less scrolling. Clean premium product design, not concept art. Exact readable typography.

## Targeted edit to C

Replaced the accidental MARVEL logo with MSF and adjacent MSF Companion text with Companion. Changed the Farming subtitle to Gear • Shards • Sources. Preserved the rest of the concept.

