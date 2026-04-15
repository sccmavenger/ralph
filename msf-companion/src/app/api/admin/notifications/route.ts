import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/notifications — Send a notification to commanders.
 * Body: { type, title, message, linkUrl?, target: "all" | "premium" | commanderId }
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const body = await request.json() as {
    type?: string;
    title?: string;
    message?: string;
    linkUrl?: string;
    target?: string;
  };

  const { type, title, message, linkUrl, target } = body;

  if (!type || !title || !message || !target) {
    return NextResponse.json(
      { error: "type, title, message, and target are required" },
      { status: 400 }
    );
  }

  if (target === "all" || target === "premium") {
    const where: { disabled: boolean; subscriptionTier?: string } = { disabled: false };
    if (target === "premium") {
      where.subscriptionTier = "PREMIUM";
    }

    const commanders = await prisma.commander.findMany({
      where,
      select: { id: true },
    });

    if (commanders.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    await prisma.commanderNotification.createMany({
      data: commanders.map((c) => ({
        commanderId: c.id,
        type,
        title,
        message,
        linkUrl: linkUrl || null,
      })),
    });

    return NextResponse.json({ sent: commanders.length });
  }

  // Single commander target
  const commander = await prisma.commander.findUnique({
    where: { id: target },
    select: { id: true },
  });

  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  await prisma.commanderNotification.create({
    data: {
      commanderId: target,
      type,
      title,
      message,
      linkUrl: linkUrl || null,
    },
  });

  return NextResponse.json({ sent: 1 });
}
