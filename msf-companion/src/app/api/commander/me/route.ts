import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import { msfApiFetch } from "@/lib/msf-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const scopelyId = await getScopelyId(true);

  if (!session.accessToken || !scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
  });

  // Fetch player card data from MSF API
  let cardData: Record<string, unknown> | null = null;
  try {
    cardData = await msfApiFetch<Record<string, unknown>>({
      path: "/player/v1/card",
      accessToken: session.accessToken,
    });
  } catch (err) {
    console.warn("Failed to fetch player card:", err);
  }

  return NextResponse.json({
    commander: commander
      ? {
          id: commander.id,
          scopelyId: commander.scopelyId,
          displayName: commander.displayName,
          email: commander.email,
          emailPromptSkippedAt: commander.emailPromptSkippedAt,
          hasCompletedOnboarding: commander.hasCompletedOnboarding,
          subscriptionTier: commander.subscriptionTier,
        }
      : null,
    card: cardData,
  });
}
