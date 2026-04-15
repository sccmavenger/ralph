import { getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { getSubscriptionTier, isPremium } from "@/lib/subscription";
import RosterDashboard from "./RosterDashboard";

interface TraitObj {
  id: string;
  name?: string;
  alwaysInvisible?: boolean;
  isEvent?: boolean;
}

interface TraitData {
  data?: (TraitObj | string)[];
}

export default async function RosterPage() {
  let teams: string[] = [];
  const tier = await getSubscriptionTier();

  try {
    const token = await getValidAccessToken();
    if (token) {
      const data = await msfApiFetch<TraitData>({
        path: "/game/v1/traits",
        accessToken: token,
      });
      teams = (data.data ?? [])
        .map((t) => (typeof t === "string" ? { id: t } : t))
        .filter((t) => !t.alwaysInvisible && !t.isEvent)
        .map((t) => t.id)
        .sort();
    }
  } catch {
    // Traits are non-critical — filters will work without them
  }

  return <RosterDashboard teams={teams} isPremium={isPremium(tier)} />;
}
