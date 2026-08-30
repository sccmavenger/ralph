import { prisma } from "@/lib/prisma";
import { cancellationFeedbackEmailMode } from "@/lib/email-automation";

const COMPLETED = new Set(["sent", "delivered", "opened", "clicked"]);
const DELIVERED = new Set(["delivered", "opened", "clicked"]);

export async function getCancellationFeedbackAdminData() {
  const cases = await prisma.cancellationFeedbackCase.findMany({
    include: {
      commander: {
        select: { displayName: true, email: true, scopelyId: true },
      },
      responses: { orderBy: { receivedAt: "desc" } },
    },
    orderBy: [{ firstRespondedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 250,
  });

  const deliveryKeys = cases.map(
    (item) => `cancellation-feedback:v1:${item.cancellationKey}`
  );
  const deliveries = deliveryKeys.length
    ? await prisma.emailDelivery.findMany({
        where: { idempotencyKey: { in: deliveryKeys } },
        select: {
          idempotencyKey: true,
          status: true,
          lastError: true,
          sentAt: true,
          deliveredAt: true,
        },
      })
    : [];
  const deliveryByKey = new Map(
    deliveries.map((delivery) => [delivery.idempotencyKey, delivery])
  );

  const invitationsSent = cases.filter((item) => {
    const delivery = deliveryByKey.get(
      `cancellation-feedback:v1:${item.cancellationKey}`
    );
    return item.outreachStatus === "sent" || Boolean(delivery && COMPLETED.has(delivery.status));
  }).length;
  const invitationsDelivered = cases.filter((item) => {
    const delivery = deliveryByKey.get(
      `cancellation-feedback:v1:${item.cancellationKey}`
    );
    return Boolean(delivery && DELIVERED.has(delivery.status));
  }).length;
  const responses = cases.filter((item) => item.firstRespondedAt).length;

  return {
    generatedAt: new Date().toISOString(),
    automationMode: cancellationFeedbackEmailMode(),
    metrics: {
      queued: cases.filter((item) => item.outreachStatus === "queued").length,
      failed: cases.filter((item) => item.outreachStatus === "failed").length,
      invitationsSent,
      invitationsDelivered,
      responses,
      responseRate: invitationsSent
        ? Math.round((responses / invitationsSent) * 1000) / 10
        : 0,
      unreviewed: cases.filter((item) => item.reviewStatus === "new").length,
      planned: cases.filter((item) => item.reviewStatus === "planned").length,
      actioned: cases.filter((item) => item.reviewStatus === "actioned").length,
    },
    cases: cases.map((item) => {
      const delivery = deliveryByKey.get(
        `cancellation-feedback:v1:${item.cancellationKey}`
      );
      return {
        id: item.id,
        commanderName: item.commander?.displayName ?? "Deleted commander",
        commanderEmail: item.commander?.email ?? null,
        scopelyId: item.commander?.scopelyId ?? null,
        stripeSubscriptionId: item.stripeSubscriptionId,
        cancellationRequestedAt: item.cancellationRequestedAt.toISOString(),
        cancellationEffectiveAt: item.cancellationEffectiveAt?.toISOString() ?? null,
        cancellationReversedAt: item.cancellationReversedAt?.toISOString() ?? null,
        scheduledAt: item.scheduledAt.toISOString(),
        outreachStatus: item.outreachStatus,
        suppressionReason: item.suppressionReason,
        deliveryStatus: delivery?.status ?? null,
        deliveryLastError: delivery?.lastError ?? null,
        sentAt: delivery?.sentAt?.toISOString() ?? null,
        deliveredAt: delivery?.deliveredAt?.toISOString() ?? null,
        reviewStatus: item.reviewStatus,
        primaryReason: item.primaryReason,
        theme: item.theme,
        assignedTo: item.assignedTo,
        adminNotes: item.adminNotes,
        actionSummary: item.actionSummary,
        actionUrl: item.actionUrl,
        firstRespondedAt: item.firstRespondedAt?.toISOString() ?? null,
        actionedAt: item.actionedAt?.toISOString() ?? null,
        closedAt: item.closedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
        responses: item.responses.map((response) => ({
          id: response.id,
          source: response.source,
          reason: response.reason,
          body: response.body,
          receivedAt: response.receivedAt.toISOString(),
        })),
      };
    }),
  };
}

export type CancellationFeedbackAdminData = Awaited<
  ReturnType<typeof getCancellationFeedbackAdminData>
>;
