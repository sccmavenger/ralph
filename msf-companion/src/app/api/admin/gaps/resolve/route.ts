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

  // Mark the gap as manually resolved
  const updated = await prisma.knowledgeGap.update({
    where: { id: body.gapId },
    data: {
      status: "resolved",
      autoResolveAction: "Manually resolved by admin",
      resolvedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, gap: updated });
}
