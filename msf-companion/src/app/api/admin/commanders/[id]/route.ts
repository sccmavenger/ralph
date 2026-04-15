import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function DELETE(
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
      displayName: true,
      stripeSubscriptionId: true,
    },
  });

  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  // Cancel Stripe subscription (best-effort — log warning on failure, do not block deletion)
  if (commander.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(commander.stripeSubscriptionId);
    } catch (e) {
      console.warn(
        `Failed to cancel Stripe subscription ${commander.stripeSubscriptionId} for deleted commander ${commander.id}:`,
        e
      );
    }
  }

  // Hard-delete — cascades to RosterSnapshot and InventorySnapshot via Prisma schema
  await prisma.commander.delete({
    where: { id },
  });

  return NextResponse.json({ id: commander.id, deleted: true });
}
