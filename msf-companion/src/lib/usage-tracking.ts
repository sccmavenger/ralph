import { prisma } from "@/lib/prisma";

/**
 * Fire-and-forget usage event tracking.
 * Looks up the commander by scopelyId, captures their current tier,
 * and inserts a UsageEvent record. Failures are silently swallowed
 * so tracking never blocks the calling code.
 */
export async function trackUsageEvent(
  scopelyId: string,
  eventType: string,
  eventName: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const commander = await prisma.commander.findUnique({
      where: { scopelyId },
      select: { id: true, subscriptionTier: true },
    });

    if (!commander) return;

    await prisma.usageEvent.create({
      data: {
        commanderId: commander.id,
        eventType,
        eventName,
        metadata: metadata as Parameters<typeof prisma.usageEvent.create>[0]["data"]["metadata"],
        tier: commander.subscriptionTier,
      },
    });
  } catch {
    // Fire-and-forget: never throw from tracking
  }
}
