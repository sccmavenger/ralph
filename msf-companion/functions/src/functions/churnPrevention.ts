import { app, InvocationContext, Timer } from "@azure/functions";
import { getPool } from "../lib/pgClient.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PremiumCommander {
  id: string;
  email: string | null;
  displayName: string | null;
  lastLoginAt: Date | null;
  stripeCurrentPeriodEnd: Date | null;
  disabled: boolean;
  recentUsageCount: number;      // UsageEvents in last 7 days
  priorUsageCount: number;       // UsageEvents in 7–14 days ago
  recentLoginDays: number;       // Distinct login days in last 7 days
  priorLoginDays: number;        // Distinct login days in 7–14 days ago
  paymentFailures: number;       // invoice.payment_failed count (approximated by past interventions)
  topFeature: string | null;     // Most-used premium feature path
}

export interface ChurnPreventionDeps {
  fetchPremiumCommanders: () => Promise<PremiumCommander[]>;
  getLastIntervention: (commanderId: string, type: string) => Promise<{ sentAt: Date } | null>;
  sendEmail: (to: string, subject: string, html: string) => Promise<void>;
  createNotification: (commanderId: string, title: string, message: string, linkUrl: string | null) => Promise<void>;
  logIntervention: (commanderId: string, type: string, channel: string, riskScore: number, scheduledAt?: Date) => Promise<void>;
  fetchScheduledWinBacks: () => Promise<Array<{ id: string; commanderId: string; email: string | null; displayName: string | null }>>;
  markDelivered: (interventionId: string) => Promise<void>;
  isFeatureEnabled: (key: string) => Promise<boolean>;
}

// ─── Risk Scoring ─────────────────────────────────────────────────────────────

export function calculateRiskScore(commander: PremiumCommander): number {
  let score = 0;
  const now = new Date();

  // 1. Days since last login (max 30 pts)
  if (commander.lastLoginAt) {
    const daysSinceLogin = Math.floor((now.getTime() - commander.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLogin >= 7) score += 30;
    else if (daysSinceLogin >= 5) score += 20;
    else if (daysSinceLogin >= 3) score += 10;
  } else {
    score += 30; // Never logged in = highest risk
  }

  // 2. Login frequency drop (max 20 pts)
  if (commander.priorLoginDays > 0) {
    const dropRatio = 1 - (commander.recentLoginDays / commander.priorLoginDays);
    if (dropRatio >= 0.75) score += 20;
    else if (dropRatio >= 0.5) score += 10;
  }

  // 3. Feature usage decline (max 20 pts)
  if (commander.priorUsageCount > 0) {
    const usageDropRatio = 1 - (commander.recentUsageCount / commander.priorUsageCount);
    if (usageDropRatio >= 0.75) score += 20;
    else if (usageDropRatio >= 0.5) score += 10;
  }

  // 4. Subscription expiry proximity (max 20 pts)
  if (commander.stripeCurrentPeriodEnd) {
    const daysUntilExpiry = Math.floor((commander.stripeCurrentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 7) score += 20;
    else if (daysUntilExpiry <= 13) score += 10;
  }

  // 5. Past payment failures (max 10 pts)
  if (commander.paymentFailures >= 2) score += 10;
  else if (commander.paymentFailures >= 1) score += 5;

  return Math.min(score, 100);
}

// ─── Cooldown Check ───────────────────────────────────────────────────────────

function isCooldownExpired(lastSentAt: Date | null, cooldownDays: number): boolean {
  if (!lastSentAt) return true;
  const elapsed = Date.now() - lastSentAt.getTime();
  return elapsed >= cooldownDays * 24 * 60 * 60 * 1000;
}

// ─── Feature-Specific Messaging ───────────────────────────────────────────────

const FEATURE_MESSAGES: Record<string, { title: string; message: string; link: string }> = {
  "/analyze/dd-planner": { title: "New DD insights available", message: "Your Dark Dimension planner has updated recommendations based on recent meta shifts.", link: "/analyze/dd-planner" },
  "/advisor": { title: "Your AI Advisor has new tips", message: "New game data has been analyzed — ask your advisor about the latest strategies.", link: "/advisor" },
  "/teams": { title: "Team meta has shifted", message: "New team compositions are trending. Check how your builds stack up.", link: "/teams" },
  "/roster": { title: "Roster milestones detected", message: "You've made progress since your last visit. Review your updated roster stats.", link: "/roster" },
  "/analyze/farming": { title: "Farming targets updated", message: "New campaign nodes and farming priorities based on recent changes.", link: "/analyze/farming" },
};

function getNudgeContent(topFeature: string | null): { title: string; message: string; link: string } {
  if (topFeature && FEATURE_MESSAGES[topFeature]) {
    return FEATURE_MESSAGES[topFeature];
  }
  return { title: "New insights available", message: "Your dashboard has fresh intel waiting. Come check it out!", link: "/dashboard" };
}

// ─── Email Templates ──────────────────────────────────────────────────────────

export function buildReEngageEmailHtml(displayName: string, topFeature: string | null): string {
  const featureName = topFeature
    ? FEATURE_MESSAGES[topFeature]?.title.replace("New ", "").replace(" available", "") ?? "your premium features"
    : "your premium features";

  return `<html><body style="font-family: -apple-system, sans-serif; background: #0f0f23; color: #e0e0e0; padding: 0; margin: 0;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #333;">
<div style="display: inline-block; background: #dc2626; color: white; font-weight: bold; padding: 8px 12px; border-radius: 6px; font-size: 12px;">MSF</div>
<h1 style="color: #4f9cf7; margin: 10px 0 5px;">We've got updates for you</h1>
</div>
<div style="padding: 20px 0;">
<p style="font-size: 15px; line-height: 1.6;">Hey ${displayName || "Commander"},</p>
<p style="font-size: 15px; line-height: 1.6;">Your roster has been evolving and there's new intel waiting — ${featureName} has fresh data since your last visit.</p>
<p style="font-size: 15px; line-height: 1.6;">Here's what you might be missing:</p>
<ul style="font-size: 14px; line-height: 1.8; color: #ccc;">
<li>Updated meta analysis and team recommendations</li>
<li>New farming priorities based on recent game changes</li>
<li>Fresh AI Advisor insights tailored to your roster</li>
</ul>
</div>
<div style="text-align: center; padding: 20px 0;">
<a href="https://themsftoolkit.com/dashboard" style="display: inline-block; background: #4f9cf7; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">Check Your Dashboard →</a>
</div>
<div style="text-align: center; padding: 20px 0; border-top: 1px solid #333; font-size: 12px; color: #666;">
<p>MSF Companion — Your Marvel Strike Force Assistant</p>
</div>
</div></body></html>`;
}

export function buildRetentionEmailHtml(displayName: string): string {
  return `<html><body style="font-family: -apple-system, sans-serif; background: #0f0f23; color: #e0e0e0; padding: 0; margin: 0;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #333;">
<div style="display: inline-block; background: #dc2626; color: white; font-weight: bold; padding: 8px 12px; border-radius: 6px; font-size: 12px;">MSF</div>
<h1 style="color: #4f9cf7; margin: 10px 0 5px;">We've saved your progress</h1>
</div>
<div style="padding: 20px 0;">
<p style="font-size: 15px; line-height: 1.6;">Hey ${displayName || "Commander"},</p>
<p style="font-size: 15px; line-height: 1.6;">We noticed you haven't been around in a while. Everything you've built is still here and waiting:</p>
<ul style="font-size: 14px; line-height: 1.8; color: #ccc;">
<li>🎯 Your Dark Dimension planner progress</li>
<li>🤖 AI Advisor conversation history</li>
<li>⚔️ Saved team builds and analysis</li>
<li>📊 Roster tracking and growth data</li>
</ul>
<p style="font-size: 15px; line-height: 1.6;">Your premium subscription gives you full access to all of this. Don't let it go to waste!</p>
</div>
<div style="text-align: center; padding: 20px 0;">
<a href="https://themsftoolkit.com/dashboard" style="display: inline-block; background: #4f9cf7; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">Return to Your Dashboard →</a>
</div>
<div style="text-align: center; padding: 20px 0; border-top: 1px solid #333; font-size: 12px; color: #666;">
<p>MSF Companion — Your Marvel Strike Force Assistant</p>
</div>
</div></body></html>`;
}

export function buildDunningEmailHtml(displayName: string): string {
  return `<html><body style="font-family: -apple-system, sans-serif; background: #0f0f23; color: #e0e0e0; padding: 0; margin: 0;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #333;">
<div style="display: inline-block; background: #dc2626; color: white; font-weight: bold; padding: 8px 12px; border-radius: 6px; font-size: 12px;">MSF</div>
<h1 style="color: #f59e0b; margin: 10px 0 5px;">Action needed</h1>
</div>
<div style="padding: 20px 0;">
<p style="font-size: 15px; line-height: 1.6;">Hey ${displayName || "Commander"},</p>
<p style="font-size: 15px; line-height: 1.6;">Your MSF Companion Premium renewal couldn't be processed. This usually happens when a card expires or has insufficient funds.</p>
<p style="font-size: 15px; line-height: 1.6;">To keep your premium features active, please update your payment method:</p>
</div>
<div style="text-align: center; padding: 20px 0;">
<a href="https://themsftoolkit.com/subscribe" style="display: inline-block; background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">Update Payment Method →</a>
</div>
<div style="padding: 10px 0;">
<p style="font-size: 13px; color: #888; text-align: center;">We'll automatically retry the payment, but updating your card ensures uninterrupted access.</p>
</div>
<div style="text-align: center; padding: 20px 0; border-top: 1px solid #333; font-size: 12px; color: #666;">
<p>MSF Companion — Your Marvel Strike Force Assistant</p>
</div>
</div></body></html>`;
}

export function buildWinBackEmailHtml(displayName: string): string {
  return `<html><body style="font-family: -apple-system, sans-serif; background: #0f0f23; color: #e0e0e0; padding: 0; margin: 0;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #333;">
<div style="display: inline-block; background: #dc2626; color: white; font-weight: bold; padding: 8px 12px; border-radius: 6px; font-size: 12px;">MSF</div>
<h1 style="color: #4f9cf7; margin: 10px 0 5px;">Your intel is still here</h1>
</div>
<div style="padding: 20px 0;">
<p style="font-size: 15px; line-height: 1.6;">Hey ${displayName || "Commander"},</p>
<p style="font-size: 15px; line-height: 1.6;">We're sorry to see you go. Your data and progress haven't been deleted — everything you built during your premium subscription is preserved:</p>
<ul style="font-size: 14px; line-height: 1.8; color: #ccc;">
<li>Your saved team builds and synergy analysis</li>
<li>Dark Dimension planner progress</li>
<li>AI Advisor conversation history</li>
<li>Roster snapshots and growth tracking</li>
</ul>
<p style="font-size: 15px; line-height: 1.6;">You can pick up exactly where you left off by resubscribing anytime.</p>
</div>
<div style="text-align: center; padding: 20px 0;">
<a href="https://themsftoolkit.com/subscribe" style="display: inline-block; background: #4f9cf7; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">Resubscribe to Premium →</a>
</div>
<div style="text-align: center; padding: 20px 0; border-top: 1px solid #333; font-size: 12px; color: #666;">
<p>MSF Companion — Your Marvel Strike Force Assistant</p>
</div>
</div></body></html>`;
}

// ─── Main Logic ───────────────────────────────────────────────────────────────

export interface ChurnPreventionResult {
  scanned: number;
  nudged: number;
  reEngaged: number;
  retained: number;
  winBacks: number;
  skipped: number;
}

export async function runChurnPrevention(
  deps: ChurnPreventionDeps,
  context: InvocationContext
): Promise<ChurnPreventionResult> {
  // Check kill switch
  const enabled = await deps.isFeatureEnabled("churn_prevention");
  if (!enabled) {
    context.log("Churn prevention feature flag is disabled — skipping");
    return { scanned: 0, nudged: 0, reEngaged: 0, retained: 0, winBacks: 0, skipped: 0 };
  }

  const commanders = await deps.fetchPremiumCommanders();
  const result: ChurnPreventionResult = { scanned: commanders.length, nudged: 0, reEngaged: 0, retained: 0, winBacks: 0, skipped: 0 };

  for (const commander of commanders) {
    if (commander.disabled) {
      result.skipped++;
      continue;
    }

    const riskScore = calculateRiskScore(commander);

    if (riskScore < 30) {
      // Low risk — no action
      continue;
    }

    try {
      if (riskScore >= 70) {
        // Tier 3 — Retention (cooldown: 30 days)
        const last = await deps.getLastIntervention(commander.id, "retention");
        if (!isCooldownExpired(last?.sentAt ?? null, 30)) {
          result.skipped++;
          continue;
        }

        // Send retention email
        if (commander.email) {
          await deps.sendEmail(
            commander.email,
            "We've saved your progress, Commander",
            buildRetentionEmailHtml(commander.displayName ?? "")
          );
        }

        // Create notification
        await deps.createNotification(
          commander.id,
          "Your premium features are waiting",
          "You've been away for a while. Your progress, saved teams, and AI Advisor history are all still here.",
          "/dashboard"
        );

        await deps.logIntervention(commander.id, "retention", commander.email ? "both" : "notification", riskScore);
        result.retained++;
      } else if (riskScore >= 50) {
        // Tier 2 — Re-engagement (cooldown: 14 days)
        const last = await deps.getLastIntervention(commander.id, "re-engage");
        if (!isCooldownExpired(last?.sentAt ?? null, 14)) {
          result.skipped++;
          continue;
        }

        const nudge = getNudgeContent(commander.topFeature);

        if (commander.email) {
          await deps.sendEmail(
            commander.email,
            `Commander ${commander.displayName || ""}, your roster has updates waiting`.trim(),
            buildReEngageEmailHtml(commander.displayName ?? "", commander.topFeature)
          );
        }

        await deps.createNotification(commander.id, nudge.title, nudge.message, nudge.link);
        await deps.logIntervention(commander.id, "re-engage", commander.email ? "both" : "notification", riskScore);
        result.reEngaged++;
      } else {
        // Tier 1 — Nudge (cooldown: 7 days)
        const last = await deps.getLastIntervention(commander.id, "nudge");
        if (!isCooldownExpired(last?.sentAt ?? null, 7)) {
          result.skipped++;
          continue;
        }

        const nudge = getNudgeContent(commander.topFeature);
        await deps.createNotification(commander.id, nudge.title, nudge.message, nudge.link);
        await deps.logIntervention(commander.id, "nudge", "notification", riskScore);
        result.nudged++;
      }
    } catch (err) {
      context.warn(`Churn prevention failed for ${commander.id}: ${err}`);
      result.skipped++;
    }
  }

  // ─── Process scheduled win-backs ───────────────────────────────────────────
  try {
    const winBacks = await deps.fetchScheduledWinBacks();
    for (const wb of winBacks) {
      try {
        if (wb.email) {
          await deps.sendEmail(
            wb.email,
            `Commander ${wb.displayName || ""}, your intel is still here`.trim(),
            buildWinBackEmailHtml(wb.displayName ?? "")
          );
        }
        await deps.markDelivered(wb.id);
        result.winBacks++;
      } catch (err) {
        context.warn(`Win-back email failed for ${wb.commanderId}: ${err}`);
      }
    }
  } catch (err) {
    context.warn(`Win-back fetch failed: ${err}`);
  }

  context.log(`Churn prevention complete: ${JSON.stringify(result)}`);
  return result;
}

// ─── Azure Function Registration ──────────────────────────────────────────────

app.timer("churnPrevention", {
  schedule: "0 0 8 * * *", // Daily at 8 AM UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting daily churn prevention scan");

    const pool = getPool();

    const deps: ChurnPreventionDeps = {
      isFeatureEnabled: async (key) => {
        const res = await pool.query(
          `SELECT enabled FROM "FeatureFlag" WHERE key = $1`,
          [key]
        );
        return res.rows[0]?.enabled ?? false;
      },

      fetchPremiumCommanders: async () => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const res = await pool.query(`
          SELECT
            c.id, c.email, c."displayName", c."lastLoginAt",
            c."stripeCurrentPeriodEnd", c.disabled,
            COALESCE(recent_usage.cnt, 0) as "recentUsageCount",
            COALESCE(prior_usage.cnt, 0) as "priorUsageCount",
            COALESCE(recent_logins.days, 0) as "recentLoginDays",
            COALESCE(prior_logins.days, 0) as "priorLoginDays",
            COALESCE(failures.cnt, 0) as "paymentFailures",
            top_feature."eventName" as "topFeature"
          FROM "Commander" c
          LEFT JOIN LATERAL (
            SELECT COUNT(*) as cnt FROM "UsageEvent" ue
            WHERE ue."commanderId" = c.id AND ue."createdAt" >= $1
          ) recent_usage ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*) as cnt FROM "UsageEvent" ue
            WHERE ue."commanderId" = c.id AND ue."createdAt" >= $2 AND ue."createdAt" < $1
          ) prior_usage ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT DATE(ue."createdAt")) as days FROM "UsageEvent" ue
            WHERE ue."commanderId" = c.id AND ue."createdAt" >= $1
          ) recent_logins ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT DATE(ue."createdAt")) as days FROM "UsageEvent" ue
            WHERE ue."commanderId" = c.id AND ue."createdAt" >= $2 AND ue."createdAt" < $1
          ) prior_logins ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*) as cnt FROM "ChurnIntervention" ci
            WHERE ci."commanderId" = c.id AND ci.type = 'dunning' AND ci."sentAt" >= $2
          ) failures ON true
          LEFT JOIN LATERAL (
            SELECT ue."eventName" FROM "UsageEvent" ue
            WHERE ue."commanderId" = c.id AND ue."createdAt" >= $2
            GROUP BY ue."eventName" ORDER BY COUNT(*) DESC LIMIT 1
          ) top_feature ON true
          WHERE c."subscriptionTier" = 'PREMIUM'
        `, [sevenDaysAgo, fourteenDaysAgo]);

        return res.rows.map((r) => ({
          id: r.id,
          email: r.email,
          displayName: r.displayName,
          lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt) : null,
          stripeCurrentPeriodEnd: r.stripeCurrentPeriodEnd ? new Date(r.stripeCurrentPeriodEnd) : null,
          disabled: r.disabled,
          recentUsageCount: parseInt(r.recentUsageCount, 10),
          priorUsageCount: parseInt(r.priorUsageCount, 10),
          recentLoginDays: parseInt(r.recentLoginDays, 10),
          priorLoginDays: parseInt(r.priorLoginDays, 10),
          paymentFailures: parseInt(r.paymentFailures, 10),
          topFeature: r.topFeature ?? null,
        }));
      },

      getLastIntervention: async (commanderId, type) => {
        const res = await pool.query(
          `SELECT "sentAt" FROM "ChurnIntervention" WHERE "commanderId" = $1 AND type = $2 ORDER BY "sentAt" DESC LIMIT 1`,
          [commanderId, type]
        );
        if (res.rows.length === 0) return null;
        return { sentAt: new Date(res.rows[0].sentAt) };
      },

      sendEmail: async (to, subject, html) => {
        // Use Resend API directly (same key as Next.js app)
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          context.log(`[Email] RESEND_API_KEY not configured — skipping send to ${to}`);
          return;
        }
        const fromAddress = process.env.EMAIL_FROM || "MSF Companion <info@themsftoolkit.com>";
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromAddress, to, subject, html }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Resend API failed (${response.status}): ${text}`);
        }
      },

      createNotification: async (commanderId, title, message, linkUrl) => {
        await pool.query(
          `INSERT INTO "CommanderNotification" (id, "commanderId", type, title, message, "linkUrl", read, "createdAt")
           VALUES (gen_random_uuid()::text, $1, 'churn_prevention', $2, $3, $4, false, NOW())`,
          [commanderId, title, message, linkUrl]
        );
      },

      logIntervention: async (commanderId, type, channel, riskScore, scheduledAt) => {
        await pool.query(
          `INSERT INTO "ChurnIntervention" (id, "commanderId", type, channel, "riskScore", "sentAt", "scheduledAt", delivered)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), $5, $6)`,
          [commanderId, type, channel, riskScore, scheduledAt ?? null, !scheduledAt]
        );
      },

      fetchScheduledWinBacks: async () => {
        const res = await pool.query(`
          SELECT ci.id, ci."commanderId", c.email, c."displayName"
          FROM "ChurnIntervention" ci
          JOIN "Commander" c ON c.id = ci."commanderId"
          WHERE ci.type = 'win-back' AND ci.delivered = false AND ci."scheduledAt" <= NOW()
        `);
        return res.rows;
      },

      markDelivered: async (interventionId) => {
        await pool.query(
          `UPDATE "ChurnIntervention" SET delivered = true, "sentAt" = NOW() WHERE id = $1`,
          [interventionId]
        );
      },
    };

    await runChurnPrevention(deps, context);
  },
});
