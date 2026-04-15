import { getSubscriptionTier } from "@/lib/subscription";
import AdvisorPageClient from "./AdvisorPageClient";

export default async function AdvisorPage() {
  const tier = await getSubscriptionTier();
  const isPremium = tier === "PREMIUM";

  return (
    <div className="h-[calc(100vh-3.5rem-5rem)]">
      <AdvisorPageClient isPremium={isPremium} />
    </div>
  );
}
