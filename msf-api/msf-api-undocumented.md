# MSF API — Undocumented Endpoints & Community Intelligence

> Supplementary reference for endpoints, scopes, fields, and behaviors **not covered** in the official OpenAPI spec (`msf-api.yaml`).  
> Sources: Discord conversations with MSF API developer **Rainmelt**, live endpoint probing, and community research.

---

## Table of Contents

1. [Undocumented Scopes](#undocumented-scopes)
2. [Undocumented Endpoints](#undocumented-endpoints)
3. [Undocumented Fields on Documented Endpoints](#undocumented-fields-on-documented-endpoints)
4. [Breaking Changes & Deprecations](#breaking-changes--deprecations)
5. [Pagination & Performance Notes](#pagination--performance-notes)
6. [Probe Results Summary](#probe-results-summary)

---

## Undocumented Scopes

| Scope | Purpose | Notes |
|-------|---------|-------|
| `m3p.f.pr.buy` | Access player offers (`/player/v1/offers`) | Read-only despite the name. Triggers an additional consent screen for the user. Per Rainmelt: "just add it to your scopes request" |
| `m3p.f.ar.ros` | Access alliance member rosters (`/player/v1/roster/member/:memberId`) | Enables viewing other alliance members' rosters by member ID |

### Known Documented Scopes (for reference)

| Scope | Purpose |
|-------|---------|
| `openid` | OpenID Connect |
| `offline` | Refresh tokens |
| `m3p.f.pr.pro` | Player profile |
| `m3p.f.pr.ros` | Player roster |
| `m3p.f.pr.inv` | Player inventory |
| `m3p.f.pr.act` | Player activity |
| `m3p.f.ar.pro` | Alliance profile |

---

## Undocumented Endpoints

### 1. Player Offers

```
GET /player/v1/offers
```

- **Scope required:** `m3p.f.pr.buy`
- **Probe result:** ✅ 200 OK (after adding scope and re-auth)
- **Verified response shape:**
  ```json
  {
    "data": [
      {
        "id": "69bb53dfcda28678d58ce5a1",
        "name": "Path to Speedball Orb Offer",
        "description": "Bring the team together with this limited time orb special...",
        "locations": ["web_standard"],
        "expiration": 1776286800,
        "remainingPurchases": 20,
        "choices": [
          {
            "id": 1,
            "art": "https://assets.marvelstrikeforce.com/key_art/...",
            "rewards": {
              "allOf": [
                {
                  "item": { "id": "GACHA_CRATE_...", "name": "...", "description": "...", "icon": "..." },
                  "quantity": 20000
                }
              ]
            },
            "webRewards": { "allOf": [...] },
            "webRealCostRewards": {
              "allOf": [
                {
                  "item": { "id": "BFYB-CUR", "name": "Strike Points", "icon": "..." },
                  "quantity": 500
                }
              ]
            },
            "itemCost": {
              "item": { "id": "UC", "name": "Ultra Cores", ... },
              ...
            }
          }
        ]
      }
    ]
  }
  ```
- **Notes:** Previously considered DOA. Per Rainmelt, adding the `m3p.f.pr.buy` scope to the OAuth authorization request enables access. Users see a consent screen granting "buy" permission (read-only for our purposes — we just read offers, never purchase). Rich response with offer names, descriptions, art, rewards (item + quantity), cost (in-game currency), expiration timestamps, and remaining purchase count.

### 2. War Analysis

```
GET /game/v1/analysis/war/offense?page={page}&perPage={perPage}
GET /game/v1/analysis/war/defense?page={page}&perPage={perPage}
```

- **Scope required:** None (game data endpoint, no auth needed beyond basic token)
- **Probe result:** 200 OK
- **Response shape:**
  ```json
  {
    "data": [
      {
        "squad": ["CharId1", "CharId2", "CharId3", "CharId4", "CharId5"],
        "total": 175302,
        "wins": 157969
      }
    ],
    "meta": { "version": 1, "hashes": {...}, "page": ... }
  }
  ```
- **Notes:** `total` = total times the squad was used, `wins` = number of wins. Offense tracks attack wins; defense tracks defense holds. These are the endpoints our War Meta feature uses. Supports standard `page`/`perPage` pagination.

### 3. Crucible Analysis

```
GET /game/v1/analysis/crucible/defense?page={page}&perPage={perPage}
```

- **Scope required:** None (game data endpoint)
- **Probe result:** 200 OK
- **Response shape:**
  ```json
  {
    "data": [
      {
        "squad": ["CharId1", "CharId2", "CharId3", "CharId4", "CharId5"],
        "defends": 3330,
        "defeats": 1450
      }
    ],
    "meta": { "version": 1, "hashes": {...} }
  }
  ```
- **Notes:** Uses `defends`/`defeats` instead of `total`/`wins` (different field names from war analysis). No known crucible offense endpoint — crucible analysis appears defense-only.

### 4. Time Heists

```
GET /game/v1/timeHeists
GET /game/v1/timeHeists/{itemId}
```

- **Scope required:** None (game data)
- **Probe result:** 200 OK
- **Response shape (list):**
  ```json
  {
    "data": [
      {
        "id": "TIMEHEIST_LEVEL_45",
        "characterTarget": {
          "level": 45,
          "gearTier": 8,
          "basic": 5,
          "special": 4,
          "ultimate": 4,
          "passive": 3,
          "activeRed": 4,
          "activeYellow": 4,
          "starkBoost": { "health": 25, "damage": 25, "armor": 25, "focus": 25, "resist": 25 }
        },
        "minLevel": 30,
        "playerTargetLevel": 45,
        "featureUnlocks": ["Alliance Donations", "Red Stars", "Alliance War"],
        "completionsGranted": [
          { "id": "HEROES_CAMPAIGN", "chapter": 5, "type": "campaign" },
          { "id": "HEIST", "tier": 5, "type": "challenge" }
        ]
      }
    ]
  }
  ```

**Verified detail endpoint (`/game/v1/timeHeists/TIMEHEIST_LEVEL_45`):** ✅ 200 OK. Returns same shape as list item plus `squadsUpgraded` array:
  ```json
  {
    "squadsUpgraded": [
      { "name": "Insidious Six", "description": "Essential Raid Team", "squad": ["SuperiorSpiderMan", ...] },
      { "name": "Fantastic Four (MCU)", "description": "Strong in Arena", "squad": ["MrFantasticMCU", ...] }
    ]
  }
  ```

**Player-specific Time Heist data:**
```
GET /player/v1/timeHeists/{itemId}/tcp
```
- **Scope required:** `m3p.f.pr.pro`
- **Probe result:** ✅ 200 OK
- **Response:** `{ "data": 165596135 }` — returns the player's total TCP at the time heist level benchmark

### 5. Upgrade Tokens

```
GET /game/v1/upgradeTokens
GET /game/v1/upgradeTokens/{templateId}
```

- **Scope required:** None (game data)
- **Probe result:** 200 OK
- **Response shape (list):**
  ```json
  {
    "data": [
      {
        "id": "UT20",
        "characterTarget": {
          "level": 20,
          "gearTier": 4,
          "basic": 2,
          "special": 2,
          "ultimate": 2,
          "passive": 1,
          "activeYellow": 3
        }
      },
      {
        "id": "UT55",
        "characterTarget": {
          "level": 55,
          "gearTier": 10,
          "basic": 6,
          "special": 5,
          "ultimate": 4,
          "passive": 2,
          "activeYellow": 3,
          "iso8": { "matrix": "green", "health": 3, "damage": 3, "armor": 3, "focus": 3 }
        }
      }
    ]
  }
  ```
- **Notes:** Defines build target benchmarks per upgrade token level. Useful for "what should I build my characters to" guidance.

### 6. Battleworld

```
GET /game/v1/battleworld
GET /game/v1/battleworld/{continentId}
```

- **Scope required:** None (game data)
- **Probe result:** 200 OK
- **Response shape (list):**
  ```json
  {
    "data": [
      { "id": "bw_continent02_sentry" }
    ],
    "meta": { "version": 1, "hashes": {...}, "perTotal": 1 }
  }
  ```
- **Notes:** Returns continent IDs.

**Verified detail endpoint (`/game/v1/battleworld/bw_continent02_sentry`):** ✅ 200 OK
- **Response shape:**
  ```json
  {
    "data": {
      "id": "bw_continent02_sentry",
      "name": "Sentry City",
      "details": "Sentry City Description",
      "icon": "https://assets.marvelstrikeforce.com/key_art/BW_BossPortrait_Sentry_...",
      "continentRewards": {
        "tiers": [
          {
            "goal": 25000,
            "reachRewards": {
              "allOf": [
                { "item": { "id": "CHAPTER_CUR4", "name": "Fractals", "icon": "..." }, "quantity": 9000 },
                { "item": { "id": "ISO8-TIER-2-ITEM-CREDITS-CURRENCY", "name": "T3 Iso-8 Credits" }, "quantity": 4000 }
              ]
            }
          },
          { "goal": 50000, "reachRewards": { ... } }
        ]
      }
    }
  }
  ```
- Returns continent name, boss icon, and tiered rewards (goal thresholds with item rewards at each tier).

### 7. Calendar Rewards

```
GET /game/v1/calendarRewards/{itemId}
```

- **Probe result:** 404 `NOT_FOUND` with `"field": "itemId"` — even with an event ID
- **Notes:** The itemId is NOT an event ID. Tried event ID `63dadc68f46dde24ed7a05f4` and got 404. The valid itemId format is unknown. This endpoint may require a specific calendar/login-streak ID that isn't obtainable from other endpoints. **Currently unusable until valid IDs are discovered.**

### 8. Alliance Applicants (New Style)

```
GET /player/v1/applicant/applicants?page={page}&perPage={perPage}
```

- **Scope required:** Alliance-related scope (likely `m3p.f.ar.pro`)
- **Probe result:** 200 OK
- **Response shape:**
  ```json
  {
    "data": [
      {
        "name": "Twitchy",
        "icon": "https://assets.marvelstrikeforce.com/imgs/Portrait_ShadowKing_f2c0a430.png",
        "frame": "https://assets.marvelstrikeforce.com/imgs/ICON_FRAME_THUNDERSTRIKE_04_b94a0be6.png",
        "level": { "completedTier": 110, "goalTier": 110, "points": 1737000, "goal": 1737000 },
        "tcp": 420331682,
        "stp": 17707460,
        "warMvp": 5,
        "charactersCollected": 360,
        "charactersAtMaxStarRank": 338,
        "latestArena": 3,
        "latestBlitz": 23746,
        "blitzWins": 81827,
        "socialState": false,
        "rosterShare": "public",
        "ad": { "id": "uuid", "exp": 1776269382 },
        "qualifications": { "lang": ["en"], "style": "casual" }
      }
    ]
  }
  ```
- **Notes:** This may replace or supplement `/player/v1/recruiting/recruits`. Returns rich applicant profiles including TCP, STP, collections stats, arena/blitz ranks, war MVP count, and qualification preferences.

### 9. Alliance Recruiting Applications

```
GET /player/v1/alliance/recruiting/applications
```

- **Scope required:** `m3p.f.ar.pro` (likely needs alliance leader/captain rank)
- **Probe result:** 464 `NO_ACCESS` with `"field": "rank"`
- **Notes:** Rank-restricted — only alliance leaders or captains can view applications. Returns the alliance's incoming applications (requests to join).

### 10. Alliance Member Rosters

```
GET /player/v1/roster/member/{memberId}?page={page}&perPage={perPage}
GET /player/v1/squads/member/{memberId}
```

- **Scope required:** `m3p.f.ar.ros`
- **Probe result:** ✅ Both return 200 OK
- **Member ID format:** Compound ID from `/player/v1/alliance/members`, e.g. `"20000472947:f00866bb-df29-4510-9b8a-f6b6052e51f8:0"`
- **Roster response:** Same shape as own roster — array of characters with `id`, `level`, `activeYellow`, `activeRed`, `gearTier`, `gearSlots`, ability levels, `iso8`, `starkBoost`, `stats`, `sheetStats`, `power`, `overpower`. Supports pagination.
- **Squads response shape:**
  ```json
  {
    "data": {
      "tabs": {
        "roster": [
          ["SilverSable", "HitMonkey", "Punisher", "Elektra", "DaredevilModern"],
          ["FranklinRichards", "InvisibleWomanMCU", "HumanTorch", "Thing", "MrFantasticMCU"],
          ...
        ]
      }
    }
  }
  ```
- **Notes:** Roster access depends on the member's `rosterShare` setting (from alliance members response). If `rosterShare: true` or `"public"`, the roster is accessible. If `false`, expect a 464 or empty response.
- **Alliance members response includes:** `id`, `rank` ("leader"/"captain"/"member"), `card` with `name`, `icon`, `frame`, `level`, `tcp`, `stp`, `warMvp`, `charactersCollected`, `rosterShare`, `daysInAlliance`. `perTotal` gives alliance size (e.g., 23).

### 11. Applicant/Requester Roster Access

```
GET /player/v1/roster/applicant/{applicantId}
GET /player/v1/squads/applicant/{applicantId}
GET /player/v1/roster/requester/{requesterId}
GET /player/v1/squads/requester/{requesterId}
```

- **Scope required:** `m3p.f.ar.ros` (for requester endpoints)
- **Probe result:** `/player/v1/roster/requester/self` returned 500 `"uncaught error"` — endpoint exists but "self" is not a valid requesterId. Needs a real requester ID.
- **Notes:** Allow viewing rosters/squads of alliance applicants and requesters. The `applicantId` comes from the applicants endpoint. Need to test with actual applicant/requester IDs.

---

## Undocumented Fields on Documented Endpoints

### Player Roster (`/player/v1/roster`)

| Field | Type | Description |
|-------|------|-------------|
| `activeRed` | `integer` | Red star rank (0-7). Values 8-10 represent **Diamond stars** (new tier). **VERIFIED:** roster returns `activeRed: 10` and `activeRed: 8` on live data. |
| `starkBoost` | `object` | `{ health, damage, armor, focus, resist }` — Stark Tech boost percentages. **VERIFIED.** |
| `iso8` | `object` | `{ matrix, health, damage, armor, focus, resist, active, [role]: level }` — ISO-8 config. Matrix values: "blue", "green". Role values: "healer", "raider", "striker", "skirmisher". **VERIFIED.** |
| `stats` | `object` | Full computed stats: health, damage, armor, focus, resist, critDamageBonus, critChance, speed, dodgeChance, blockAmount, accuracy, extraHeal. **VERIFIED.** |
| `sheetStats` | `object` | Same shape as `stats` — appears to be the "on-paper" stats (may differ from `stats` due to buffs/context). **VERIFIED.** |
| `overpower` | `integer` | Overpower level. **VERIFIED** — present on high-level characters. |

**Diamond Stars (activeRed 8-10):** **CONFIRMED** in live roster data. S.H.I.E.L.D. Medic has `activeRed: 10` (Diamond 3), Spider-Man has `activeRed: 8` (Diamond 1). The UI should render these distinctly (e.g., diamond icon instead of red star).

### Player Card (`/player/v1/card`)

| Field | Type | Description |
|-------|------|-------------|
| `strikePass` | `object` | STRIKE Pass (battle pass) data including tier, premium status |
| `battlePass` | `object` | Legacy battle pass data |

### Alliance Card (`/player/v1/alliance/card`)

| Field | Type | Description |
|-------|------|-------------|
| `frame` | `string` | Alliance frame URL — **BREAKING CHANGE INCOMING** (see below) |

### Character Instances (`/game/v1/characterInstances`)

| Field | Type | Description |
|-------|------|-------------|
| `starkBoost` | `object` | Stark Tech boost stats for character instance |
| `iso8` | `object` | ISO-8 matrix configuration: `{ matrix, health, damage, armor, focus, resist }` |

---

## Breaking Changes & Deprecations

### Alliance Frame Split (Upcoming)

Per Rainmelt, the `icon` and `frame` fields on alliance cards have been separate for a while on the game client side, though the API currently returns the combined format. Any code that depends on parsing alliance frames/icons should be prepared for them to be separate fields:

- **Current:** Single `frame` field contains the frame image URL
- **Future:** May split into separate `icon` (portrait) and `frame` (border) fields

**Action:** Ensure alliance display code handles both the current combined format and a potential split format gracefully.

### Recruiting Endpoint Changes

The `/player/v1/recruiting/recruits` endpoint may be supplemented or replaced by:
- `/player/v1/applicant/applicants` — Richer profile data, new response shape
- `/player/v1/alliance/recruiting/applications` — Alliance-side view of applications

---

## Pagination & Performance Notes

### 472 RESPONSE_TOO_LARGE Error

The MSF API enforces response size limits. If a response exceeds approximately 472KB, the API returns:

```json
{
  "error": {
    "code": 472,
    "subcode": "RESPONSE_TOO_LARGE",
    "message": "Response too large"
  }
}
```

**Mitigation:**
- Use `page` and `perPage` query parameters to paginate large datasets
- For roster data, use `perPage=25` and paginate through all pages
- For analysis data, use `perPage=50` and paginate as needed
- For characters data, use `perPage=50` and paginate

### Rate Limiting

- No documented rate limits, but sequential fetching with small delays is recommended
- Use retry logic with exponential backoff for transient failures
- Avoid parallel requests to multiple API endpoints simultaneously (can trigger 502s)

### Meta Hashes

All responses include a `meta.hashes` object:
```json
{
  "events": "7afe794e...",
  "drops": "2f625838...",
  "locs": "ebb2897f...",
  "nodes": "6ea80cb3...",
  "chars": "a7a35a7e...",
  "other": "e4376cac...",
  "all": "6d07009e..."
}
```

These can be used for cache invalidation — if the hash hasn't changed since your last request, the underlying data hasn't changed.

---

## Probe Results Summary

Tested on: Live API via authenticated session  
Date: April 2026 (updated — includes second probe with `m3p.f.pr.buy` and `m3p.f.ar.ros` scopes)

| Endpoint | Status | Accessible | Notes |
|----------|--------|-----------|-------|
| `/player/v1/offers` | 200 | ✅ Yes | Requires `m3p.f.pr.buy` scope |
| `/player/v1/alliance/members` | 200 | ✅ Yes | Returns member IDs, ranks, cards |
| `/player/v1/roster/member/{id}` | 200 | ✅ Yes | Requires `m3p.f.ar.ros` scope, paginated |
| `/player/v1/squads/member/{id}` | 200 | ✅ Yes | Returns squad compositions |
| `/game/v1/analysis/war/offense` | 200 | ✅ Yes | |
| `/game/v1/analysis/war/defense` | 200 | ✅ Yes | |
| `/game/v1/analysis/crucible/defense` | 200 | ✅ Yes | |
| `/game/v1/timeHeists` | 200 | ✅ Yes | List + detail both work |
| `/game/v1/timeHeists/{id}` | 200 | ✅ Yes | Includes `squadsUpgraded` |
| `/player/v1/timeHeists/{id}/tcp` | 200 | ✅ Yes | Returns player TCP number |
| `/game/v1/upgradeTokens` | 200 | ✅ Yes | List + detail both work |
| `/game/v1/upgradeTokens/{id}` | 200 | ✅ Yes | |
| `/game/v1/characterInstanceCaps` | 200 | ✅ Yes | |
| `/game/v1/battleworld` | 200 | ✅ Yes | List + detail both work |
| `/game/v1/battleworld/{id}` | 200 | ✅ Yes | Returns name, icon, tiered rewards |
| `/player/v1/applicant/applicants` | 200 | ✅ Yes | Rich applicant profiles |
| `/player/v1/alliance/recruiting/applications` | 464 | ⚠️ Rank-restricted | Leader/Captain only |
| `/player/v1/roster` | 200 | ✅ Yes | Includes `activeRed` 8-10 (diamonds), `iso8`, `starkBoost`, `overpower` |
| `/game/v1/calendarRewards/{id}` | 404 | ❌ No | Valid itemId format unknown |
| `/player/v1/roster/requester/self` | 500 | ❌ No | Server error — needs real ID |
| `/player/v1/itemWishlist` | 200 | ✅ Yes | |
| `/game/v1/survivalTowers` | 200 | ✅ Yes | |
| `/player/v1/events` | 200 | ✅ Yes | |
