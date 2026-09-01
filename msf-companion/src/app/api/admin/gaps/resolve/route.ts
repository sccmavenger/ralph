import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { gapId?: string };
  if (!body.gapId) {
    return NextResponse.json({ error: "gapId is required" }, { status: 400 });
  }

  const gap = await prisma.knowledgeGap.findUnique({
    where: { id: body.gapId },
  });

  if (!gap) {
    return NextResponse.json({ error: "Gap not found" }, { status: 404 });
  }

  if (gap.status === "resolved") {
    return NextResponse.json({ error: "Gap already resolved" }, { status: 400 });
  }

  // Keep the knowledge record and its operational action in sync.
  const resolvedAt = new Date();
  const [updated, completedActions] = await prisma.$transaction([
    prisma.knowledgeGap.update({
      where: { id: body.gapId },
      data: {
        status: "resolved",
        autoResolveAction: "Manually resolved by admin",
        resolvedAt,
      },
    }),
    prisma.aiActionItem.updateMany({
      where: {
        sourceType: "knowledge_gap",
        sourceId: body.gapId,
        status: { in: ["open", "investigating", "planned"] },
      },
      data: { status: "completed", completedAt: resolvedAt },
    }),
  ]);

  return NextResponse.json({
    success: true,
    gap: updated,
    completedActionCount: completedActions.count,
  });
}
