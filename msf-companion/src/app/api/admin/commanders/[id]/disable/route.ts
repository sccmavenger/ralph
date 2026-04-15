import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const { id } = await params;

  const commander = await prisma.commander.findUnique({
    where: { id },
    select: {
      id: true,
      stripeSubscriptionId: true,
      disabled: true,
    },
  });

  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  if (commander.disabled) {
    return NextResponse.json({ error: "Commander is already disabled" }, { status: 400 });
  }

  // Cancel Stripe subscription immediately if one exists
  if (commander.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(commander.stripeSubscriptionId);
    } catch (e) {
      console.warn("Failed to cancel Stripe subscription for disabled commander:", e);
      // Non-blocking — proceed with disabling
    }
  }

  const updated = await prisma.commander.update({
    where: { id },
    data: {
      disabled: true,
      subscriptionTier: "FREE",
    },
    select: {
      id: true,
      subscriptionTier: true,
      disabled: true,
    },
  });

  return NextResponse.json({
    id: updated.id,
    subscriptionTier: updated.subscriptionTier,
    disabled: updated.disabled,
  });
}
