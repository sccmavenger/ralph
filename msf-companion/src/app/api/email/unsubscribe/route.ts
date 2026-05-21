import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Token-based unsubscribe (from email link)
  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    // Token is the commander's email — simple but effective
    const commander = await prisma.commander.findFirst({
      where: { email: token },
    });
    if (commander) {
      await prisma.commander.update({
        where: { id: commander.id },
        data: { emailDigestOptOut: true },
      });
      return new NextResponse(
        `<html><body style="font-family:sans-serif;background:#0f0f23;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
          <div style="text-align:center;max-width:400px;padding:40px;">
            <h1 style="color:#4f9cf7;">Unsubscribed</h1>
            <p>You've been unsubscribed from the weekly digest. You can re-enable it from your profile settings.</p>
          </div>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }
  }

  // Session-based unsubscribe (logged-in user)
  const session = await getSession();
  const scopelyId = await getScopelyId(true);

  if (!session.accessToken || !scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.commander.update({
    where: { scopelyId },
    data: { emailDigestOptOut: true },
  });

  return NextResponse.json({ success: true, message: "Unsubscribed from weekly digest" });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const scopelyId = await getScopelyId(true);

  if (!session.accessToken || !scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { optOut?: boolean };
  const optOut = body.optOut !== false; // Default to opting out

  await prisma.commander.update({
    where: { scopelyId },
    data: { emailDigestOptOut: optOut },
  });

  return NextResponse.json({ success: true, optedOut: optOut });
}
