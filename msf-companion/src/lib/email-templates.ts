import { escapeEmailHtml } from "@/lib/email-content";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://themsftoolkit.com";

function shell(title: string, body: string, ctaLabel: string, ctaPath: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e7eb"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="text-align:center;padding:20px 0;border-bottom:1px solid #333"><div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:9px 14px;border-radius:7px;font-size:12px">MSF</div><h1 style="color:#4f9cf7;font-size:24px;margin:14px 0 0">${escapeEmailHtml(title)}</h1></div>${body}<div style="text-align:center;padding:24px 0"><a href="${BASE_URL}${ctaPath}" style="display:inline-block;background:#4f9cf7;color:#fff;padding:12px 26px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:14px">${escapeEmailHtml(ctaLabel)} →</a></div></div></body></html>`;
}

export interface WeeklyDigestContent {
  displayName: string;
  tips: Array<{ content: string; sourceCreatorName: string | null }>;
  notifications: Array<{ type: string; title: string; message: string }>;
}

export function buildWeeklyDigestHtml(content: WeeklyDigestContent): string {
  const tips = content.tips.length
    ? `<div style="padding:20px 0"><h2 style="color:#f59e0b;font-size:16px">Top tips this week</h2>${content.tips.map((tip) => `<div style="background:#1a1a2e;border-radius:8px;padding:12px;margin:8px 0"><p style="margin:0;font-size:14px;line-height:1.5">${escapeEmailHtml(tip.content)}</p>${tip.sourceCreatorName ? `<p style="margin:5px 0 0;font-size:12px;color:#9ca3af">— ${escapeEmailHtml(tip.sourceCreatorName)}</p>` : ""}</div>`).join("")}</div>`
    : "";
  const notifications = content.notifications.length
    ? `<div style="padding:4px 0 20px"><h2 style="color:#ef4444;font-size:16px">Unread alerts</h2>${content.notifications.map((notification) => `<div style="background:#1a1a2e;border-radius:8px;padding:12px;margin:8px 0"><p style="margin:0;font-size:14px"><strong>${escapeEmailHtml(notification.title)}</strong></p><p style="margin:5px 0 0;font-size:13px;color:#cbd5e1">${escapeEmailHtml(notification.message)}</p></div>`).join("")}</div>`
    : "";
  const body = `<p style="font-size:15px;line-height:1.7;padding-top:18px">Hey ${escapeEmailHtml(content.displayName || "Commander")}, here is the latest information already waiting in your MSF Companion account.</p>${tips}${notifications}`;
  return shell("Your weekly MSF Companion digest", body, "Open your Advisor", "/advisor");
}

export function buildLifecycleEmailHtml(
  kind: "re-engage" | "retention" | "inactive-free" | "win-back",
  displayName: string
): string {
  const name = escapeEmailHtml(displayName || "Commander");
  if (kind === "win-back") {
    return shell(
      "Your MSF intel is still here",
      `<div style="padding:20px 0;font-size:15px;line-height:1.7"><p>Hey ${name},</p><p>Your roster history, saved planning work, and Advisor conversations are still available. You can pick up where you left off whenever you are ready.</p></div>`,
      "Review Premium",
      "/subscribe"
    );
  }
  if (kind === "inactive-free") {
    return shell(
      "Your roster is ready for a fresh look",
      `<div style="padding:20px 0;font-size:15px;line-height:1.7"><p>Hey ${name},</p><p>It has been a while since your last visit. Sign in to refresh your roster and see current recommendations based on the game data available in MSF Companion.</p></div>`,
      "Refresh your dashboard",
      "/dashboard"
    );
  }
  if (kind === "retention") {
    return shell(
      "We saved your progress",
      `<div style="padding:20px 0;font-size:15px;line-height:1.7"><p>Hey ${name},</p><p>Your roster snapshots, Dark Dimension plans, and Advisor history are still waiting. Sign in to refresh the data before making your next investment.</p></div>`,
      "Return to your dashboard",
      "/dashboard"
    );
  }
  return shell(
    "Your roster has updates waiting",
    `<div style="padding:20px 0;font-size:15px;line-height:1.7"><p>Hey ${name},</p><p>Your saved account has fresh roster and planning tools ready to review. Sign in to refresh your roster and check the latest available recommendations.</p></div>`,
    "Check your dashboard",
    "/dashboard"
  );
}
