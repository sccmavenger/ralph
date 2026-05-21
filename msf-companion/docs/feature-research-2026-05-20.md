# Feature Research — May 20, 2026

## Community Research Summary

Based on exhaustive research across Reddit (r/MarvelStrikeForce), official MSF website (blog, Crucible meta, War meta, Legendary Events), and community tools landscape.

---

## Top 10 Feature Recommendations

### 1. Tower Event Planner (HIGH IMPACT — Brand New Feature Gap)

**Status:** TECHNICALLY FEASIBLE — RECURRING EVENT (WORTH BUILDING)

**Timing Analysis (May 20, 2026):**
- Mighty Tower: Storm — Floors 7-12 opened May 15. Likely ends ~May 22-29.
- War Tower: Jeff — Starts May 22, floors 1-6 week 1, floors 7-12 week 2. Ends ~June 5.
- KEY INSIGHT: Tower Events are a PERMANENT RECURRING game mode. Each new tower
  has a different character reward + different trait requirements. Scopely will
  keep rotating these. Building this feature serves EVERY future tower.

**Tower Event Structure (from blog):**
- 2 Towers per event (Normal + Omega difficulty)
- 12 floors per tower, 6 released each week
- Each floor has a trait requirement (e.g., "X-Men" or "War teams")
- Teams go on cooldown after clearing a floor (until next week's unlock)
- War abilities are enabled in War Tower battles
- Health and ability energy do NOT persist between battles

**Existing Technical Infrastructure:**
- ✅ MSF API: `/game/v1/events?perPage=50&eventInfo=full` returns tower events as type `pickYourPoison`
- ✅ `/player/v1/roster?charInfo=full&traitFormat=id` gives full roster with traits
- ✅ RosterSnapshot model stores character traits, power, gear, stars
- ✅ `/game/v1/analysis/teamOrder/tower` — 200+ recommended tower teams with usage counts
- ⚠️ `planner-events.ts` has `event.type === "tower"` check — but live API shows towers are `pickYourPoison` type! Needs update.
- ⚠️ Per-room requirements require user auth (`player/v1/survivalTowers/{id}` → 403 with client creds)
- ⚠️ Need: Team cooldown tracking (local state or DB model)

**LIVE API FINDINGS (May 20, 2026):**

Tower structure from `/game/v1/survivalTowers`:
```json
{
  "id": "survivaltower_mighty_02",
  "name": "MIGHTY TOWER: STORM",
  "subName": "Bring your Toughest Cosmic Crucible Teams",
  "combatNodesPerTeam": 12,
  "rayCount": 3,
  "rayDepth": 5,
  "rays": [["A1","A2","A3","A4","A5"], ["B1","B2","B3","B4","B5"], ["C1","C2","","",""]],
  "startingRoomId": "A1",
  "maxDifficulty": 1
}
```

All towers available:
| ID | Name | Nodes |
|---|---|---|
| survivaltower_01 | FREEDOM SPIRE | 10 |
| survivaltower_03 | KYLN: FORGED IN FIRE | 20 |
| sc_accursedteamtower_01 | Accursed Team Tower | 10 |
| sc_fantastic4mcu_omegateamtower_01 | OMEGA BAXTER TOWER | 10 |
| sc_fantastic4mcu_teamtower_01 | BAXTER BUILDING | 10 |
| sc_magnetopf_tower_01 | POLARITY SHIFT TOWER | 18 |
| survivaltower_mighty_02 | MIGHTY TOWER: STORM | 12 |
| survivaltower_mighty_01 | MIGHTY TOWER: STORM (OMEGA) | 12 |
| survivaltower_war_01 | WAR TOWER (OMEGA) | 12 |
| survivaltower_war_02 | WAR TOWER | 12 |

Tower event in events API (NOT type "tower" — it's "pickYourPoison"):
```json
{
  "id": "69fcfd504aa9641b67badb0b",
  "type": "pickYourPoison",
  "name": "MIGHTY TOWER: STORM",
  "startTime": 1778274000, // May 8, 2026
  "endTime": 1779483600,   // May 22, 2026
  "pickYourPoison": { "typeName": "Scourge", "brackets": [...] }
}
```

KEY: Per-room requirements need user auth (`player/v1/survivalTowers/{id}` → 403 without player token).
The game/v1 endpoint only returns tower layout (rays/rooms), NOT room-specific trait requirements.
Tower meta teams from teamOrder/tower show Black Order, Gamma, Masters of Evil, Brotherhood as top picks.

**Technical Architecture:**
```
DATA LAYER:
  - GET /game/v1/survivalTowers → list all towers with layout (rays, rooms)
  - GET /game/v1/events (type=pickYourPoison, name contains "tower") → active tower events + dates
  - GET /player/v1/survivalTowers/{id}?roomInfo=full → per-room requirements (NEEDS USER AUTH)
  - GET /game/v1/analysis/teamOrder/tower → 200+ meta teams for towers
  - GET /player/v1/roster → commander's characters with traits

LOGIC LAYER:
  - Filter roster characters by each room's trait requirements
  - Optimization: allocate strongest teams to hardest rooms
  - Constraint solver: can't reuse teams across rooms (cooldown)
  - Cross-reference with teamOrder/tower for meta recommendations
  - Power threshold estimation per room

UI LAYER:
  - Tower visualization (3 rays x 5 depth, color-coded: green/yellow/red)
  - Team assignment per room (manual or auto-suggest)
  - Cooldown tracker (which teams already used)
  - "Optimize" button: AI-powered allocation across all 12 rooms
  - Meta team overlay (show recommended teams from teamOrder data)
```

**Build Estimate:** Medium (1 PRD → ~8-12 user stories)

**Proposed Features:**
- Import commander's roster, show which floors they can clear
- Suggest optimal team allocation across all 12 floors
- "Team cooldown tracker" — which teams are locked vs available
- Show minimum gear/star thresholds per floor
- Push notification: "New tower floors unlocked — here's your plan"

---

### 2. Cosmic Crucible Counter Intelligence (HIGH IMPACT — Huge Gap)

**Status:** TECHNICALLY FEASIBLE — BUILD NOW

**Why This Is Gold:**
- Official site shows 695 defensive teams with success % but ZERO counter recommendations
- msfcounters.gg is dead. Marvel.church is offline. No competitor.
- Crucible runs every 3 days, forever. This feature never expires.
- 50,000+ battles tracked for top teams (massive data).

**Existing Technical Infrastructure:**
- ✅ MSF API: `/game/v1/analysis/crucible/defense` — 697 defense teams with defends/defeats counts
- ✅ MSF API: `/game/v1/analysis/war/offense` — 1000 offense teams with total/wins (88%+ win rates)
- ✅ MSF API: `/game/v1/analysis/teamOrder/crucible` — 354 most-used crucible teams
- ✅ `kbMetaSync.ts` already fetches + indexes crucible defense data daily at 05:20 UTC
- ✅ Commander roster available with full traits/power/stars
- ✅ AI Advisor already has `cosmic_crucible` category and `counter_matchup` intelligence
- ✅ Azure AI Search KB already stores meta team docs
- ❌ CONFIRMED: `/game/v1/analysis/crucible/offense` does NOT exist (404)
- ❌ CONFIRMED: No matchup/counter endpoints exist (war/matchups, crucible/matchups, crucible/counters all 404)
- ⚠️ Need: Counter mapping logic (defense team → effective offense teams) — must be derived/AI-powered

**LIVE API FINDINGS (May 20, 2026):**

Crucible Defense data shape (697 teams):
```json
{
  "squad": ["Annihilus","Daredevil","Eclipse","NightThrasher","Speedball"],
  "defends": 571,  // times this team held on defense
  "defeats": 169   // times this team was beaten
}
```
Win rate: `defends / (defends + defeats)` = 77.2% for #1 team

War Offense data shape (1000 teams):
```json
{
  "squad": ["DaredevilModern","Elektra","HitMonkey","Punisher","SilverSable"],
  "total": 161409,
  "wins": 143041
}
```
Win rate: `wins / total` = 88.6% for #1 team

teamOrder/crucible (354 teams, usage-only):
```json
{"squad": ["AbsorbingMan","Titania","Ultron","Moonstone","KangTheConqueror"], "total": 7413}
```

Available analysis endpoints (full map):
| Endpoint | Status | Fields | Total Records |
|---|---|---|---|
| war/offense | ✅ | squad, total, wins | 1000 |
| war/defense | ✅ | squad, total, wins | ~1000 |
| crucible/defense | ✅ | squad, defends, defeats | 697 |
| crucible/offense | ❌ 404 | — | — |
| crucible/matchups | ❌ 404 | — | — |
| crucible/counters | ❌ 404 | — | — |
| teamOrder/war | ✅ | squad, total | ~354 |
| teamOrder/crucible | ✅ | squad, total | 354 |
| teamOrder/tower | ✅ | squad, total | 200+ |
| teamOrder/arena | ✅ | squad, total | ? |

**Data Available from Official API:**
- Defense teams: character IDs, defends count, defeats count
- Top team (#1): Annihilus/Daredevil/Eclipse/NightThrasher/Speedball — 77.2% hold rate (571 defends, 169 defeats)
- Top team (#2): FranklinRichards/InvisibleWomanMCU/MrFantasticMCU/Odin/Xavier — 64.6% hold rate (4286 defends, 2349 defeats)
- 697 defense teams total, some with 50,000+ tracked battles
- War offense teams CAN be cross-referenced (many crucible teams are also war teams)

**Technical Architecture:**
```
DATA LAYER (already partially built):
  - Daily sync: GET /game/v1/analysis/crucible/defense (✅ exists, 697 teams)
  - Daily sync: GET /game/v1/analysis/war/offense (✅ can add, 1000 teams)
  - Daily sync: GET /game/v1/analysis/teamOrder/crucible (✅ 354 teams)
  - Commander roster: /player/v1/roster with traits + power

INTELLIGENCE LAYER (Option C — Hybrid, since no offense API):
  - Statistical inference:
    - High-defeat-rate defenses → easily beaten → infer from teamOrder which offenses counter them
    - Cross-reference war/offense (high win rate teams often work in crucible)
    - Teams from teamOrder/crucible NOT in crucible/defense = likely offense teams
  - AI-driven recommendations:
    - Feed defense composition to AI with game knowledge
    - Use KB (team synergies, abilities, community counter data)
    - Generate counter recommendations per defense team
    - Validate against community success data
  - Community crowdsource:
    - "I beat Team X with Team Y" user reports
    - Build counter database over time from real user battles

PERSONALIZATION:
  - Filter counters to teams commander actually owns
  - Adjust confidence based on power differential
  - "You have 85% of the ideal counter — upgrade [Character] to complete it"

UI LAYER:
  - Browse top defenses (ranked by frequency you'll encounter them)
  - Select/identify opponent defense → see YOUR best counters
  - Each counter shows: team, estimated win rate, power requirement
  - "Missing pieces" — which characters to farm for better counters
```

**Revenue Model:**
- Free tier: 3 counter lookups per day
- Premium: Unlimited counters + personalized weekly Crucible prep email

**Build Estimate:** Medium (1 PRD → ~6-10 user stories)

**Proposed Features:**
- For each top-50 defense, recommend 2-3 counter teams from commander's roster
- Factor in commander's actual gear/stars (not generic)
- AI Advisor integration: "What beats Exalted X-Men in Crucible?"
- Weekly email digest: "This week's Crucible season — here's your attack plan"
- Community reporting: "I beat this team with..."

---

### 3. Resource Bottleneck Calculator (HIGH IMPACT — #1 Complaint)

Gold, ions, training mats, G21 requirements. "How much to bring Character X to G21 Level 110?" Days-to-complete timeline. Priority ranker: most power per resource spent.

---

### 4. Chapter Boost & Essence Reminder (QUICK WIN — Retention)

Essence expires after 24h if unclaimed. Push notification/email reminder. Show on Daily Briefing. Recommend traits to boost.

---

### 5. Event Calendar with Readiness Alerts (MEDIUM IMPACT)

Parse weekly blog into calendar. Show readiness % per event. 24h push notifications. Trial readiness.

---

### 6. Legendary Event Readiness Dashboard (MEDIUM IMPACT)

Show eligible characters from roster per legendary. Green/yellow/red status. Farming path to next unlock.

---

### 7. Diamond & Awakened Ability Tracker (MEDIUM IMPACT)

Track Awakened Abilities availability. Diamond progress. Priority upgrades.

---

### 8. Orb Explorer / "Where Do I Get Shards?" (QUICK WIN)

API supported: `GET /game/v1/orbRewards/{itemId}`. Search character → all orbs + drop rates.

---

### 9. War Counter Tool with Room Assignment (HIGH IMPACT)

Counter recommendations from roster. Room assignment planner. Alliance coordination.

---

### 10. Alliance Coordination Hub (LONG-TERM — Premium)

Alliance-wide roster view. War room board. Raid lane suggestions. Health dashboard.

---

## Improvements to Existing Features

| Feature | Improvement |
|---------|-------------|
| AI Advisor | Tower-specific mode with roster context |
| Daily Briefing | Essence reminder, event countdown, free claim link |
| Farming Guide | Factor in Tower requirements + Legendary eligibility |
| Event Planner | Auto-parse weekly blog (KB sync infra exists) |
| War & Crucible Meta | Personal counter recommendations |

---

## Priority Matrix

| # | Feature | Effort | Impact | Revenue |
|---|---------|--------|--------|---------|
| 1 | Tower Event Planner | Medium | Very High | Premium |
| 2 | Crucible Counter Tool | Medium | Very High | Premium/Freemium |
| 3 | Resource Calculator | Low-Med | High | Free (engagement) |
| 4 | Event Calendar + Alerts | Low | High | Free (retention) |
| 5 | Chapter Boost Reminder | Very Low | Medium | Free (daily opens) |
| 6 | War Counter + Room Planner | Medium | High | Premium |
| 7 | Legendary Readiness | Low | Medium | Free |
| 8 | Orb Explorer | Low | Medium | Free |
| 9 | Diamond/Awakened Tracker | Low | Medium | Free |
| 10 | Alliance Hub | High | Very High | Premium |
