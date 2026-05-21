import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildEmailSignupWelcomeHtml(displayName: string): string {
  const name = displayName || "Commander";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding:24px 0 20px;">
      <div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:10px 16px;border-radius:8px;font-size:14px;">MSF</div>
      <h1 style="color:#4f9cf7;margin:16px 0 0;font-size:24px;">Welcome, ${name}! 👋</h1>
    </div>
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Thanks for joining MSF Companion! You're now set up to receive updates about your roster, game events, and strategy tips from top MSF creators.
      </p>
      <p style="color:#e0e0e0;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Here's what you can expect:
      </p>
      <ul style="color:#ccc;font-size:14px;line-height:2;margin:0;padding-left:20px;">
        <li>📬 Weekly digest with top tips and alerts</li>
        <li>🆕 New character detection notifications</li>
        <li>🤖 3 free AI Advisor questions per day</li>
        <li>📊 Roster tracking and farming priorities</li>
      </ul>
    </div>
    <div style="text-align:center;padding:8px 0 24px;">
      <a href="https://themsftoolkit.com/dashboard" style="display:inline-block;background:#4f9cf7;color:#fff;padding:12px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;">Open Your Dashboard →</a>
    </div>
    <div style="text-align:center;padding:20px 0;border-top:1px solid #333;font-size:12px;color:#666;">
      <p style="margin:0;">MSF Companion — Your Marvel Strike Force Assistant</p>
    </div>
  </div>
</body></html>`;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const scopelyId = await getScopelyId(true);

  if (!session.accessToken || !scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim();

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400 }
    );
  }

  // Check if this is the first time they're providing an email
  const existing = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { email: true, displayName: true },
  });
  const isFirstEmail = !existing?.email;

  await prisma.commander.upsert({
    where: { scopelyId },
    create: { scopelyId, email },
    update: { email },
  });

  // Send welcome email on first email registration
  if (isFirstEmail) {
    try {
      await sendEmail(
        email,
        "Welcome to MSF Companion! 👋",
        buildEmailSignupWelcomeHtml(existing?.displayName ?? "")
      );
    } catch (err) {
      console.warn(`[Email] Welcome email failed for ${email}: ${err}`);
    }
  }

  return NextResponse.json({ success: true });
}
