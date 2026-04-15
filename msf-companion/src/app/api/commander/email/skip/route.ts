import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  const scopelyId = await getScopelyId(true);

  if (!session.accessToken || !scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.commander.upsert({
    where: { scopelyId },
    create: { scopelyId, emailPromptSkippedAt: new Date() },
    update: { emailPromptSkippedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
