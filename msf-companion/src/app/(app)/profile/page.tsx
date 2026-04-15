import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getValidAccessToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { msfApiFetch } from "@/lib/msf-api";
import { stripe } from "@/lib/stripe";
import ProfileSettings from "./ProfileSettings";

interface PlayerCard {
  data?: {
    name?: string;
    icon?: string;
    level?: { completedTier?: number; goalTier?: number };
    tcp?: number;
    arena?: { rank?: number };
    alliance?: { name?: string };
  };
}

export default async function ProfilePage() {
  const token = await getValidAccessToken();
  const session = await getSession();

  if (!token || !session.scopelyId) {
    redirect("/");
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId: session.scopelyId },
  });

  let cardData: PlayerCard | null = null;
  try {
    cardData = await msfApiFetch<PlayerCard>({
      path: "/player/v1/card",
      accessToken: token,
    });
  } catch (err) {
    console.warn("Failed to fetch player card:", err);
  }

  const displayName =
    cardData?.data?.name || commander?.displayName || "Commander";
  const portrait = cardData?.data?.icon ?? null;
  const level = cardData?.data?.level?.completedTier ?? null;
  const tcp = cardData?.data?.tcp ?? null;
  const allianceName = cardData?.data?.alliance?.name ?? null;

  // Get snapshot counts and subscription data
  let rosterSnapshotCount = 0;
  let inventorySnapshotCount = 0;
  let subscriptionTier = commander?.subscriptionTier ?? "FREE";
  let cancelAtPeriodEnd = false;
  let currentPeriodEnd: string | null = null;

  if (commander) {
    [rosterSnapshotCount, inventorySnapshotCount] = await Promise.all([
      prisma.rosterSnapshot.count({ where: { commanderId: commander.id } }),
      prisma.inventorySnapshot.count({ where: { commanderId: commander.id } }),
    ]);

    if (commander.stripeCurrentPeriodEnd) {
      currentPeriodEnd = commander.stripeCurrentPeriodEnd.toISOString();
    }

    // Check if subscription is pending cancellation
    if (commander.stripeSubscriptionId && subscriptionTier === "PREMIUM") {
      try {
        const sub = await stripe.subscriptions.retrieve(
          commander.stripeSubscriptionId
        );
        cancelAtPeriodEnd = sub.cancel_at_period_end;
      } catch {
        // Non-critical — Stripe key may not be set in dev
      }
    }
  }

  return (
    <ProfileSettings
      displayName={displayName}
      portrait={portrait}
      level={level}
      tcp={tcp}
      allianceName={allianceName}
      email={commander?.email ?? null}
      rosterSnapshotCount={rosterSnapshotCount}
      inventorySnapshotCount={inventorySnapshotCount}
      subscriptionTier={subscriptionTier}
      cancelAtPeriodEnd={cancelAtPeriodEnd}
      currentPeriodEnd={currentPeriodEnd}
    />
  );
}
