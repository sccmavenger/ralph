import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    redirect("/admin");
  }

  const [commanders, cancellationQueued, cancellationResponses, cancellationUnreviewed] = await Promise.all([
    prisma.commander.findMany({
      select: {
        id: true,
        displayName: true,
        scopelyId: true,
        email: true,
        subscriptionTier: true,
        lastLoginAt: true,
        disabled: true,
      },
      orderBy: [
        { lastLoginAt: { sort: "desc", nulls: "last" } },
      ],
    }),
    prisma.cancellationFeedbackCase.count({ where: { outreachStatus: "queued" } }),
    prisma.cancellationFeedbackCase.count({ where: { firstRespondedAt: { not: null } } }),
    prisma.cancellationFeedbackCase.count({ where: { reviewStatus: "new" } }),
  ]);

  const serialized = commanders.map((c) => ({
    ...c,
    lastLoginAt: c.lastLoginAt ? c.lastLoginAt.toISOString() : null,
  }));

  return (
    <AdminDashboardClient
      commanders={serialized}
      cancellationSummary={{
        queued: cancellationQueued,
        responses: cancellationResponses,
        unreviewed: cancellationUnreviewed,
      }}
    />
  );
}
