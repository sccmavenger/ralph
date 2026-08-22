import { escapeEmailHtml } from "@/lib/email-content";
import type {
  DigestNotification,
  DigestOfficialUpdate,
  DigestRosterSummary,
} from "@/lib/weekly-digest";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://themsftoolkit.com";

function shell(title: string, body: string, ctaLabel: string, ctaPath: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e7eb"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="text-align:center;padding:20px 0;border-bottom:1px solid #333"><div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:9px 14px;border-radius:7px;font-size:12px">MSF</div><h1 style="color:#4f9cf7;font-size:24px;margin:14px 0 0">${escapeEmailHtml(title)}</h1></div>${body}<div style="text-align:center;padding:24px 0"><a href="${BASE_URL}${ctaPath}" style="display:inline-block;background:#4f9cf7;color:#fff;padding:12px 26px;border-radius:9999px;text-decoration:none;font-weight:700;font-size:14px">${escapeEmailHtml(ctaLabel)} →</a></div></div></body></html>`;
}

export interface WeeklyDigestContent {
  displayName: string;
  roster: DigestRosterSummary | null;
  officialUpdates: DigestOfficialUpdate[];
  notifications: DigestNotification[];
  advisorQuestions: number;
}

export function buildWeeklyDigestHtml(content: WeeklyDigestContent): string {
  const roster = content.roster
    ? buildRosterSection(content.roster)
    : "";
  const officialUpdates = content.officialUpdates.length
    ? `<div style="padding:4px 0 20px"><h2 style="color:#f59e0b;font-size:16px">Fresh from official MSF</h2>${content.officialUpdates.map((update) => `<div style="background:#1a1a2e;border-radius:8px;padding:12px;margin:8px 0"><a href="${escapeEmailHtml(update.url)}" style="color:#60a5fa;text-decoration:none;font-size:14px;font-weight:700">${escapeEmailHtml(update.title)}</a><p style="margin:5px 0 0;font-size:12px;color:#9ca3af">Published ${formatEmailDate(update.publishedAt)}</p></div>`).join("")}</div>`
    : "";
  const advisorActivity = content.advisorQuestions > 0
    ? `<div style="background:#1a1a2e;border-radius:8px;padding:14px;margin:0 0 20px"><p style="margin:0;font-size:14px"><strong style="color:#a78bfa">Advisor activity:</strong> You asked ${content.advisorQuestions} ${content.advisorQuestions === 1 ? "question" : "questions"} this week.</p></div>`
    : "";
  const notifications = content.notifications.length
    ? `<div style="padding:4px 0 20px"><h2 style="color:#ef4444;font-size:16px">Recent unread alerts</h2>${content.notifications.map((notification) => `<div style="background:#1a1a2e;border-radius:8px;padding:12px;margin:8px 0"><p style="margin:0;font-size:14px"><strong>${escapeEmailHtml(notification.title)}</strong></p><p style="margin:5px 0 0;font-size:13px;color:#cbd5e1">${escapeEmailHtml(notification.message)}</p></div>`).join("")}</div>`
    : "";
  const body = `<p style="font-size:15px;line-height:1.7;padding-top:18px">Hey ${escapeEmailHtml(content.displayName || "Commander")}, here is your roster progress and the latest verified MSF information from this week.</p>${roster}${advisorActivity}${officialUpdates}${notifications}`;
  return shell("Your weekly MSF progress report", body, "Open your dashboard", "/dashboard");
}

function buildRosterSection(roster: DigestRosterSummary): string {
  const changeParts = [
    roster.powerChange === null ? "" : `${formatSignedNumber(roster.powerChange)} collection power`,
    roster.rosterChange === null ? "" : `${formatSignedNumber(roster.rosterChange)} characters`,
  ].filter(Boolean);
  const change = changeParts.length
    ? `<p style="margin:10px 0 0;font-size:12px;color:#9ca3af">Since your previous snapshot: ${changeParts.join(" · ")}</p>`
    : "";
  const topCharacters = roster.topCharacters.length
    ? `<p style="margin:10px 0 0;font-size:12px;color:#cbd5e1">Top characters: ${roster.topCharacters.map((character) => `${escapeEmailHtml(character.name)} (${formatCompactNumber(character.power)})`).join(" · ")}</p>`
    : "";
  const freshness = roster.isStale
    ? `<p style="margin:10px 0 0;font-size:12px;color:#f59e0b">This roster snapshot is more than seven days old. Refresh it before making investment decisions.</p>`
    : `<p style="margin:10px 0 0;font-size:12px;color:#9ca3af">Roster snapshot: ${formatEmailDate(roster.snapshotAt)}</p>`;
  return `<div style="padding:4px 0 20px"><h2 style="color:#22c55e;font-size:16px">Your roster at a glance</h2><div style="background:#1a1a2e;border-radius:8px;padding:14px"><table role="presentation" style="width:100%;text-align:center"><tr><td style="padding:6px"><strong style="display:block;color:#22c55e;font-size:18px">${formatCompactNumber(roster.totalPower)}</strong><span style="font-size:11px;color:#9ca3af">Collection power</span></td><td style="padding:6px"><strong style="display:block;color:#60a5fa;font-size:18px">${roster.rosterSize}</strong><span style="font-size:11px;color:#9ca3af">Characters</span></td></tr><tr><td style="padding:6px"><strong style="display:block;color:#f59e0b;font-size:18px">${formatCompactNumber(roster.averagePower)}</strong><span style="font-size:11px;color:#9ca3af">Average power</span></td><td style="padding:6px"><strong style="display:block;color:#f472b6;font-size:18px">${roster.sevenStarCharacters}</strong><span style="font-size:11px;color:#9ca3af">At 7 stars</span></td></tr></table>${change}${topCharacters}${freshness}</div></div>`;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatSignedNumber(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCompactNumber(value)}`;
}

function formatEmailDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "date unavailable"
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
