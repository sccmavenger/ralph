import { NextResponse } from "next/server";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const scopelyId = await getScopelyId(true);
  if (!scopelyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await prisma.commander.upsert({
    where: { scopelyId },
    create: { scopelyId, hasCompletedOnboarding: true, onboardingLastShownAt: new Date() },
    update: { hasCompletedOnboarding: true, onboardingLastShownAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
