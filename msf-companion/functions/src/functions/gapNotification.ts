import { app, InvocationContext, Timer } from "@azure/functions";
import { getPool } from "../lib/pgClient.js";

export interface GapReport {
  high: Array<{ question: string; frequency: number; gapType: string }>;
  medium: Array<{ question: string; frequency: number; gapType: string }>;
  autoResolved: Array<{ question: string; gapType: string }>;
  featureRequests: Array<{ question: string; frequency: number }>;
}

export interface NotificationDeps {
  fetchGapReport: () => Promise<GapReport>;
  sendDiscordWebhook: (report: GapReport) => Promise<void>;
  sendEmailDigest: (report: GapReport) => Promise<void>;
}

export async function sendGapNotifications(
  deps: NotificationDeps,
  context: InvocationContext
): Promise<{ sent: boolean }> {
  const report = await deps.fetchGapReport();

  const hasContent =
    report.high.length > 0 ||
    report.medium.length > 0 ||
    report.autoResolved.length > 0 ||
    report.featureRequests.length > 0;

  if (!hasContent) {
    context.log("No gaps to report — skipping notification");
    return { sent: false };
  }

  await deps.sendDiscordWebhook(report);
  await deps.sendEmailDigest(report);

  context.log("Gap notifications sent successfully");
  return { sent: true };
}

export function formatDiscordEmbed(report: GapReport): object {
  const embeds = [];

  if (report.high.length > 0) {
    embeds.push({
      title: "🔴 HIGH PRIORITY Gaps",
      color: 0xff0000,
      fields: report.high.slice(0, 10).map((g) => ({
        name: g.question,
        value: `Frequency: ${g.frequency} | Type: ${g.gapType}`,
        inline: false,
      })),
    });
  }

  if (report.medium.length > 0) {
    embeds.push({
      title: "🟡 MEDIUM Priority Gaps",
      color: 0xffaa00,
      fields: report.medium.slice(0, 10).map((g) => ({
        name: g.question,
        value: `Frequency: ${g.frequency} | Type: ${g.gapType}`,
        inline: false,
      })),
    });
  }

  if (report.autoResolved.length > 0) {
    embeds.push({
      title: "✅ Auto-Resolved (Last 24h)",
      color: 0x00ff00,
      fields: report.autoResolved.slice(0, 5).map((g) => ({
        name: g.question,
        value: `Type: ${g.gapType}`,
        inline: false,
      })),
    });
  }

  if (report.featureRequests.length > 0) {
    embeds.push({
      title: "💡 Feature Gap Requests",
      color: 0x5865f2,
      fields: report.featureRequests.slice(0, 5).map((g) => ({
        name: g.question,
        value: `Frequency: ${g.frequency}`,
        inline: false,
      })),
    });
  }

  return { embeds };
}

export function formatEmailHtml(report: GapReport): string {
  let html = `<html><body style="font-family: sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 20px;">`;
  html += `<h1 style="color: #4f9cf7;">MSF Companion — Daily Gap Report</h1>`;

  if (report.high.length > 0) {
    html += `<h2 style="color: #ff4444;">🔴 HIGH PRIORITY (asked 10+ times)</h2><table style="width:100%; border-collapse:collapse;">`;
    for (const g of report.high) {
      html += `<tr><td style="padding:8px; border-bottom:1px solid #333;">${g.question}</td><td style="padding:8px; border-bottom:1px solid #333;">×${g.frequency}</td><td style="padding:8px; border-bottom:1px solid #333;">${g.gapType}</td></tr>`;
    }
    html += `</table>`;
  }

  if (report.medium.length > 0) {
    html += `<h2 style="color: #ffaa00;">🟡 MEDIUM (3-9 times)</h2><table style="width:100%; border-collapse:collapse;">`;
    for (const g of report.medium) {
      html += `<tr><td style="padding:8px; border-bottom:1px solid #333;">${g.question}</td><td style="padding:8px; border-bottom:1px solid #333;">×${g.frequency}</td><td style="padding:8px; border-bottom:1px solid #333;">${g.gapType}</td></tr>`;
    }
    html += `</table>`;
  }

  if (report.autoResolved.length > 0) {
    html += `<h2 style="color: #00cc66;">✅ Auto-Resolved (Last 24h)</h2><ul>`;
    for (const g of report.autoResolved) {
      html += `<li>${g.question} (${g.gapType})</li>`;
    }
    html += `</ul>`;
  }

  if (report.featureRequests.length > 0) {
    html += `<h2 style="color: #5865f2;">💡 Feature Gap Requests</h2><ul>`;
    for (const g of report.featureRequests) {
      html += `<li>${g.question} (×${g.frequency})</li>`;
    }
    html += `</ul>`;
  }

  html += `</body></html>`;
  return html;
}

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

app.timer("gapNotification", {
  schedule: "0 0 4 * * *", // 04:00 UTC daily (after gap analysis at 03:00)
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting daily gap notification");

    const pool = getPool();

    const deps: NotificationDeps = {
      fetchGapReport: async () => {
        const gapsResult = await pool.query(
          `SELECT "clusteredQuestion", "gapType", frequency, status, "autoResolveAction", "resolvedAt"
           FROM "KnowledgeGap"
           WHERE status IN ('open', 'auto_resolving', 'resolved')
           ORDER BY frequency DESC`
        );

        const report: GapReport = { high: [], medium: [], autoResolved: [], featureRequests: [] };

        for (const row of gapsResult.rows) {
          const item = {
            question: row.clusteredQuestion as string,
            frequency: row.frequency as number,
            gapType: row.gapType as string,
          };

          if (row.gapType === "feature_gap") {
            report.featureRequests.push(item);
          } else if (row.status === "resolved" && row.resolvedAt &&
            new Date(row.resolvedAt as string).getTime() > Date.now() - 24 * 60 * 60 * 1000) {
            report.autoResolved.push(item);
          } else if (row.status === "open" && item.frequency >= 10) {
            report.high.push(item);
          } else if (row.status === "open" && item.frequency >= 3) {
            report.medium.push(item);
          }
        }

        return report;
      },
      sendDiscordWebhook: async (report) => {
        if (!DISCORD_WEBHOOK_URL) {
          context.log("Discord webhook URL not configured — skipping");
          return;
        }
        const payload = formatDiscordEmbed(report);
        try {
          const res = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            context.warn(`Discord webhook failed: ${res.status}`);
          }
        } catch (err) {
          context.warn(`Discord webhook error: ${err}`);
        }
      },
      sendEmailDigest: async (report) => {
        if (!ADMIN_EMAIL) {
          context.log("Admin email not configured — skipping");
          return;
        }
        const _html = formatEmailHtml(report);
        // Email sending would use Azure Communication Services or SendGrid here
        context.log(`Email digest generated for ${ADMIN_EMAIL}`);
      },
    };

    await sendGapNotifications(deps, context);
  },
});
