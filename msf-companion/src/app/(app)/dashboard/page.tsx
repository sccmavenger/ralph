import { getValidAccessToken } from "@/lib/auth";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import { msfApiFetch } from "@/lib/msf-api";
import { isFeatureEnabled } from "@/lib/feature-flags";
import DashboardOverview from "./DashboardOverview";

export default async function DashboardPage() {
  const token = await getValidAccessToken();
  const scopelyId = await getScopelyId(false); // Server Component
  const offersEnabled = await isFeatureEnabled("active_offers");

  let displayName = "Commander";
  let portrait: string | null = null;

  if (scopelyId) {
    const commander = await prisma.commander.findUnique({
      where: { scopelyId },
      select: { displayName: true },
    });
    if (commander?.displayName) displayName = commander.displayName;

    try {
      const card = await msfApiFetch<{ data?: { name?: string; icon?: string } }>({
        path: "/player/v1/card",
        accessToken: token!,
      });
      if (card.data?.icon) portrait = card.data.icon;
      if (card.data?.name) {
        displayName = card.data.name;
        // Persist to DB so it's cached for future loads
        await prisma.commander.upsert({
          where: { scopelyId },
          create: { scopelyId, displayName: card.data.name },
          update: { displayName: card.data.name },
        }).catch(() => {});
      }
    } catch {
      // Non-critical
    }
  }

  return <DashboardOverview displayName={displayName} portrait={portrait} offersEnabled={offersEnabled} />;
}
