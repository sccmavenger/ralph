import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EMAIL_PREFERENCE_LABELS, preferenceUpdateData } from "@/lib/email-preferences";
import { verifyUnsubscribeToken } from "@/lib/email-token";
import { escapeEmailHtml } from "@/lib/email-content";

export const dynamic = "force-dynamic";

const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
};

function page(title: string, message: string, action?: string): string {
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeEmailHtml(title)}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f23;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><main style="text-align:center;max-width:440px;padding:40px"><h1 style="color:#4f9cf7">${escapeEmailHtml(title)}</h1><p style="line-height:1.6">${escapeEmailHtml(message)}</p>${action ?? ""}<p style="margin-top:24px;font-size:13px"><a href="/profile" style="color:#93c5fd">Manage all email preferences</a></p></main></body></html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return new NextResponse(
      page("Invalid link", "This unsubscribe link is invalid. Sign in to manage your email preferences."),
      { status: 400, headers: htmlHeaders }
    );
  }

  const label =
    payload.preference === "all"
      ? "all optional email"
      : EMAIL_PREFERENCE_LABELS[payload.preference].toLowerCase();
  const actionUrl = `/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
  const action = `<form method="post" action="${actionUrl}" style="margin-top:24px"><button type="submit" style="border:0;border-radius:9999px;background:#4f9cf7;color:#fff;padding:12px 24px;font-weight:700;cursor:pointer">Unsubscribe</button></form>`;

  return new NextResponse(
    page("Confirm unsubscribe", `Stop receiving ${label}?`, action),
    { headers: htmlHeaders }
  );
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return new NextResponse(page("Invalid link", "This unsubscribe link is invalid."), {
      status: 400,
      headers: htmlHeaders,
    });
  }

  await prisma.commander.updateMany({
    where: { id: payload.commanderId },
    data:
      payload.preference === "all"
        ? {
            emailDigestOptOut: true,
            emailWeeklyDigest: false,
            emailNewCharacters: false,
            emailAnnouncements: false,
            emailReengagement: false,
          }
        : preferenceUpdateData({ [payload.preference]: false }),
  });

  const label =
    payload.preference === "all"
      ? "all optional email"
      : EMAIL_PREFERENCE_LABELS[payload.preference].toLowerCase();
  return new NextResponse(
    page("Unsubscribed", `You will no longer receive ${label}. You can re-enable it from your profile.`),
    { headers: htmlHeaders }
  );
}
