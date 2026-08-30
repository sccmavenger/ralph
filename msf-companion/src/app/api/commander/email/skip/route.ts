import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const scopelyId = await getScopelyId(true);
  // Read the session after getScopelyId, which can recover and persist an ID
  // for opaque access tokens. This prevents a later save from overwriting it.
  const session = await getSession();

  if (!session.accessToken || !scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.commander.upsert({
    where: { scopelyId },
    create: { scopelyId, emailPromptSkippedAt: new Date() },
    update: { emailPromptSkippedAt: new Date() },
  });

  session.emailPromptRequired = false;
  await session.save();

  return NextResponse.json({ success: true });
}
