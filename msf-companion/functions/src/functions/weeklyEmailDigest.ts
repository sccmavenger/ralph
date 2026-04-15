import { app, InvocationContext, Timer } from "@azure/functions";

export interface EmailDigestDeps {
  fetchEligibleCommanders: () => Promise<
    Array<{ id: string; email: string; displayName: string }>
  >;
  fetchWeeklyTips: (commanderId: string) => Promise<
    Array<{ content: string; sourceCreatorName?: string }>
  >;
  fetchUnreadNotifications: (commanderId: string) => Promise<
    Array<{ type: string; title: string; message: string }>
  >;
  sendEmail: (to: string, subject: string, html: string) => Promise<void>;
}

export interface DigestData {
  displayName: string;
  tips: Array<{ content: string; sourceCreatorName?: string }>;
  notifications: Array<{ type: string; title: string; message: string }>;
}

export async function sendWeeklyDigests(
  deps: EmailDigestDeps,
  context: InvocationContext
): Promise<{ sent: number; skipped: number }> {
  const commanders = await deps.fetchEligibleCommanders();
  let sent = 0;
  let skipped = 0;

  for (const commander of commanders) {
    const tips = await deps.fetchWeeklyTips(commander.id);
    const notifications = await deps.fetchUnreadNotifications(commander.id);

    if (tips.length === 0 && notifications.length === 0) {
      skipped++;
      continue;
    }

    const html = formatDigestEmail({
      displayName: commander.displayName,
      tips: tips.slice(0, 3),
      notifications,
    });

    try {
      await deps.sendEmail(
        commander.email,
        "Your Weekly MSF Companion Digest",
        html
      );
      sent++;
    } catch (err) {
      context.warn(`Failed to send digest to ${commander.email}: ${err}`);
      skipped++;
    }
  }

  context.log(`Weekly digest: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}

export function formatDigestEmail(data: DigestData): string {
  let html = `<html><body style="font-family: -apple-system, sans-serif; background: #0f0f23; color: #e0e0e0; padding: 0; margin: 0;">`;
  html += `<div style="max-width: 600px; margin: 0 auto; padding: 20px;">`;

  // Header
  html += `<div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #333;">`;
  html += `<div style="display: inline-block; background: #dc2626; color: white; font-weight: bold; padding: 8px 12px; border-radius: 6px; font-size: 12px;">MSF</div>`;
  html += `<h1 style="color: #4f9cf7; margin: 10px 0 5px;">Weekly Digest</h1>`;
  html += `<p style="color: #888; font-size: 14px;">Hey ${data.displayName}, here's your weekly update</p>`;
  html += `</div>`;

  // Tips section
  if (data.tips.length > 0) {
    html += `<div style="padding: 20px 0;">`;
    html += `<h2 style="color: #f59e0b; font-size: 16px;">💡 Top Tips This Week</h2>`;
    for (const tip of data.tips) {
      html += `<div style="background: #1a1a2e; border-radius: 8px; padding: 12px; margin: 8px 0;">`;
      html += `<p style="margin: 0; font-size: 14px; line-height: 1.5;">${tip.content}</p>`;
      if (tip.sourceCreatorName) {
        html += `<p style="margin: 4px 0 0; font-size: 12px; color: #888;">— ${tip.sourceCreatorName}</p>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Notifications section
  if (data.notifications.length > 0) {
    html += `<div style="padding: 20px 0;">`;
    html += `<h2 style="color: #ef4444; font-size: 16px;">🔔 Unread Alerts</h2>`;
    for (const notif of data.notifications) {
      const icon = notif.type === "event_alert" ? "📅" : notif.type === "meta_shift" ? "🔄" : "✅";
      html += `<div style="background: #1a1a2e; border-radius: 8px; padding: 12px; margin: 8px 0;">`;
      html += `<p style="margin: 0; font-size: 14px;">${icon} <strong>${notif.title}</strong></p>`;
      html += `<p style="margin: 4px 0 0; font-size: 13px; color: #aaa;">${notif.message}</p>`;
      html += `</div>`;
    }
    html += `</div>`;
  }

  // CTA
  html += `<div style="text-align: center; padding: 20px 0;">`;
  html += `<a href="https://msf-companion.example.com/advisor" style="display: inline-block; background: #4f9cf7; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">Talk to your AI Advisor →</a>`;
  html += `</div>`;

  // Footer with unsubscribe
  html += `<div style="text-align: center; padding: 20px 0; border-top: 1px solid #333; font-size: 12px; color: #666;">`;
  html += `<p>MSF Companion — Your Marvel Strike Force Assistant</p>`;
  html += `<a href="https://msf-companion.example.com/api/email/unsubscribe" style="color: #888; text-decoration: underline;">Unsubscribe from weekly digest</a>`;
  html += `</div>`;

  html += `</div></body></html>`;
  return html;
}

app.timer("weeklyEmailDigest", {
  schedule: "0 0 9 * * 1", // Every Monday at 9 AM UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    context.log("Starting weekly email digest");

    const deps: EmailDigestDeps = {
      fetchEligibleCommanders: async () => [],
      fetchWeeklyTips: async () => [],
      fetchUnreadNotifications: async () => [],
      sendEmail: async () => {},
    };

    await sendWeeklyDigests(deps, context);
  },
});
