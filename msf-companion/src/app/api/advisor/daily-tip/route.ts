import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopelyId } from "@/lib/scopely-id";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopelyId = await getScopelyId(false);
  if (!scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });
  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  // Get today's tip (not dismissed)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const tip = await prisma.dailyTip.findFirst({
    where: {
      commanderId: commander.id,
      generatedAt: { gte: today },
      dismissedAt: null,
    },
    orderBy: { generatedAt: "desc" },
    select: {
      id: true,
      content: true,
      sourceCreatorName: true,
      sourceUrl: true,
      generatedAt: true,
    },
  });

  return NextResponse.json({ tip });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { tipId: string };
  if (!body.tipId) {
    return NextResponse.json({ error: "tipId required" }, { status: 400 });
  }

  await prisma.dailyTip.update({
    where: { id: body.tipId },
    data: { dismissedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
