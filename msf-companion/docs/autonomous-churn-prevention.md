# Autonomous Churn Prevention System

> **Goal:** Fully automated, zero-human-in-the-loop churn prevention pipeline that detects at-risk premium subscribers and intervenes before they churn.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Azure Function: churnPrevention (daily CRON @ 8 AM UTC)│
│                                                         │
│  1. Scan all PREMIUM commanders                         │
│  2. Score each for churn risk (behavioral signals)      │
│  3. Assign intervention tier                            │
│  4. Execute automated action (email / notification)     │
│  5. Log intervention to avoid duplicate sends           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Stripe Webhook Enhancements                            │
│                                                         │
│  invoice.payment_failed → dunning email + notification  │
│  customer.subscription.deleted → schedule win-back      │
└─────────────────────────────────────────────────────────┘
```

---

## Risk Scoring Model

Each premium commander gets a daily **churn risk score** (0–100). Higher = more likely to churn.

| Signal | Weight | Logic |
|--------|--------|-------|
| Days since last login | 30 pts | 0 if ≤2d, 10 if 3–4d, 20 if 5–6d, 30 if 7+d |
| Login frequency drop | 20 pts | Compare last-7-day logins to prior-7-day average. 0 if stable, 10 if 50% drop, 20 if 75%+ drop |
| Feature usage decline | 20 pts | Compare last-7-day UsageEvents to prior average. 0 if stable, 10 if 50% drop, 20 if 75%+ drop |
| Subscription expiry proximity | 20 pts | 0 if 14+d away, 10 if 7–13d, 20 if ≤7d |
| Past payment failures | 10 pts | 0 if none, 5 if 1, 10 if 2+ (from Stripe `invoice.payment_failed`) |

**Risk tiers:**
- **Low (0–29):** No action needed
- **Medium (30–49):** Tier 1 — Soft nudge
- **High (50–69):** Tier 2 — Active re-engagement
- **Critical (70–100):** Tier 3 — Last-chance retention

---

## Intervention Tiers

### Tier 1 — Soft Nudge (Medium Risk, score 30–49)

**Trigger:** Premium user showing early engagement decline (3–4 days inactive or moderate usage drop)

**Actions (automated):**
1. **In-app notification** via `commanderNotification`:
   - Title: "New insights available"
   - Message: Personalized based on their most-used feature (e.g., "Your DD planner has updated recommendations for Dark Dimension 10")
   - Link: Deep link to their most-used premium feature

**Cooldown:** Max 1 nudge per 7 days per commander

---

### Tier 2 — Active Re-engagement (High Risk, score 50–69)

**Trigger:** Premium user with 5–6 days inactive or significant usage drop + subscription expiring within 14 days

**Actions (automated):**
1. **Personalized email** via Resend (`sendEmail`):
   - Subject: "Commander {name}, your roster has updates waiting"
   - Body: Highlights what they're missing (recent game meta changes, new advisor tips, roster progress)
   - CTA: Deep link back to dashboard
2. **In-app notification**:
   - Title: "Don't miss your latest intel"
   - Message: Feature-specific hook based on their usage pattern

**Cooldown:** Max 1 re-engagement email per 14 days per commander

---

### Tier 3 — Last-Chance Retention (Critical Risk, score 70–100)

**Trigger:** Premium user with 7+ days inactive OR subscription expiring within 3 days with declining engagement

**Actions (automated):**
1. **Retention email** via Resend:
   - Subject: "We've saved your progress, Commander"
   - Body: Value summary — what they've used, what they'd lose (DD Planner progress, AI Advisor history, team builds)
   - Emphasize data preservation: "Your saved teams, planner progress, and advisor history are waiting"
   - CTA: One-click return to dashboard
2. **In-app notification**:
   - Title: "Your premium features are waiting"
   - Message: Brief value reminder

**Cooldown:** Max 1 retention email per 30 days per commander

---

## Payment Recovery (Involuntary Churn)

### Enhancement to `invoice.payment_failed` Webhook

Currently: Just logs a warning.
**Upgrade to:**

1. Look up commander by `stripeCustomerId`
2. **Send dunning email:**
   - Subject: "Action needed: update your payment method"
   - Body: "Your MSF Companion Premium renewal couldn't be processed. Update your card to keep your features."
   - CTA: Link to `/subscribe` (Stripe portal)
3. **Create in-app notification:**
   - Title: "Payment issue detected"
   - Message: "Please update your payment method to continue your premium subscription."
   - Link: `/subscribe`

### Stripe Smart Retries

Already enabled by default in Stripe — retries failed payments with optimal timing. No code needed.

---

## Win-Back Flow (Post-Churn)

### Enhancement to `customer.subscription.deleted` Webhook

Currently: Downgrades to FREE, clears subscription ID.
**Add:**

1. **Create in-app notification** (immediate):
   - Title: "We're sorry to see you go"
   - Message: "Your premium features are now paused. You can resubscribe anytime to pick up where you left off."
   - Link: `/subscribe`
2. **Schedule win-back email** (3 days after cancellation):
   - Store a `churnIntervention` record with `type: "win-back"`, `scheduledAt: now + 3d`
   - The daily CRON picks up scheduled win-backs and sends:
     - Subject: "Commander {name}, your intel is still here"
     - Body: Summary of what they built during premium (teams saved, DD progress, advisor conversations)
     - CTA: Resubscribe link

---

## Database Changes

### New table: `ChurnIntervention`

```prisma
model ChurnIntervention {
  id            String   @id @default(cuid())
  commanderId   String
  commander     Commander @relation(fields: [commanderId], references: [id])
  type          String   // "nudge" | "re-engage" | "retention" | "dunning" | "win-back"
  channel       String   // "email" | "notification" | "both"
  riskScore     Int?
  sentAt        DateTime @default(now())
  scheduledAt   DateTime? // For deferred sends (e.g., win-back 3 days later)
  delivered     Boolean  @default(false)
  
  @@index([commanderId, type, sentAt])
  @@index([scheduledAt, delivered])
}
```

This table:
- Tracks every automated intervention for audit/analytics
- Enforces cooldown periods (query last intervention of each type per commander)
- Supports deferred/scheduled sends
- Feeds the admin monetization dashboard with intervention effectiveness metrics

---

## New Azure Function: `churnPrevention`

**Schedule:** Daily at 8:00 AM UTC (`0 0 8 * * *`)

**Location:** `functions/src/functions/churnPrevention.ts`

**Logic:**
```
1. Query all PREMIUM commanders with lastLoginAt, UsageEvent counts, subscription expiry
2. For each commander:
   a. Calculate risk score using the scoring model
   b. Check ChurnIntervention for cooldown compliance
   c. If eligible, execute the appropriate tier action
   d. Log the intervention to ChurnIntervention table
3. Pick up any scheduled win-back emails (scheduledAt <= now, delivered = false)
   a. Send win-back emails
   b. Mark as delivered
4. Log summary: { scanned, nudged, reEngaged, retained, winBacks }
```

**Dependencies (injectable for testing):**
- `fetchPremiumCommanders()` → Commander data with login/usage stats
- `calculateRiskScore(commander)` → number 0–100
- `getLastIntervention(commanderId, type)` → ChurnIntervention | null
- `sendEmail(to, subject, html)` → void
- `createNotification(commanderId, title, message, linkUrl)` → void
- `logIntervention(commanderId, type, channel, riskScore)` → void

---

## Admin Dashboard Integration

### New Metrics for Monetization Page

Add to the existing `/api/admin/monetization` response:

```typescript
churnPrevention: {
  interventionsLast30d: number;      // Total automated interventions
  byType: { nudge: number; reEngage: number; retention: number; dunning: number; winBack: number };
  recoveredRevenue: number;          // Commanders who received intervention and are still active
  interventionSuccessRate: number;   // % of intervened users who stayed subscribed
}
```

This feeds a new "Autonomous Intervention Activity" card in the monetization dashboard showing:
- How many interventions ran
- Breakdown by type
- Estimated revenue saved

---

## Email Templates Needed

| Template | Trigger | Key Content |
|----------|---------|-------------|
| `nudge-email` | Tier 2 re-engage | Personalized feature highlights, roster updates |
| `retention-email` | Tier 3 last-chance | Value summary, what they'd lose, data preservation |
| `dunning-email` | Payment failed | Card update CTA, urgency framing |
| `win-back-email` | 3 days post-churn | What they built, resubscribe CTA |

All templates should follow the same style as the existing `buildWelcomeEmailHtml` in `src/lib/welcome-email.ts`.

---

## Implementation Phases

### Phase 1 — Foundation (Estimated: 1 story)
- [ ] Add `ChurnIntervention` Prisma model + migration
- [ ] Create `churnPrevention` Azure Function scaffold with risk scoring logic
- [ ] Add cooldown checking utility

### Phase 2 — Behavioral Interventions (Estimated: 1 story)
- [ ] Implement Tier 1 nudge (in-app notification only)
- [ ] Implement Tier 2 re-engage (email + notification)
- [ ] Implement Tier 3 retention (email + notification)
- [ ] Build email templates (nudge, retention)

### Phase 3 — Payment Recovery (Estimated: 1 story)
- [ ] Enhance `invoice.payment_failed` webhook with dunning email + notification
- [ ] Build dunning email template
- [ ] Add scheduled win-back to `customer.subscription.deleted` webhook
- [ ] Add win-back pickup to daily CRON

### Phase 4 — Dashboard Integration (Estimated: 1 story)
- [ ] Add intervention metrics to `/api/admin/monetization`
- [ ] Add "Autonomous Intervention Activity" card to MonetizationClient
- [ ] Replace static Churn Prevention Playbook with live intervention data

---

## Safeguards

- **Rate limits:** Hard-coded cooldowns prevent notification fatigue
- **Unsubscribe respect:** If commander has `disabled: true`, skip all interventions
- **Graceful degradation:** If Resend API is down, log warning and skip email (notification still sent)
- **Audit trail:** Every intervention logged to `ChurnIntervention` with timestamp and risk score
- **No PII in logs:** Only commander IDs logged, not emails or names
- **Kill switch:** Feature flag `churn_prevention` in admin panel — toggle off to pause all automated interventions

---

## Existing Infrastructure Leveraged

| Component | Location | Usage |
|-----------|----------|-------|
| Email (Resend) | `src/lib/email.ts` | Send all automated emails |
| In-app notifications | `CommanderNotification` model | Nudge/re-engage/retention alerts |
| Push subscriptions | `PushSubscription` model | Future: push notifications |
| Stripe webhooks | `src/app/api/stripe/webhook/route.ts` | Payment failure + cancellation hooks |
| Azure Functions | `functions/src/functions/` | Daily CRON job |
| Weekly digest | `functions/src/functions/weeklyEmailDigest.ts` | Pattern reference for timer functions |
| Welcome email | `src/lib/welcome-email.ts` | Template style reference |
| Commander model | Prisma schema | `lastLoginAt`, `subscriptionTier`, `stripeCurrentPeriodEnd` |
| UsageEvent model | Prisma schema | Feature usage tracking for decline detection |
