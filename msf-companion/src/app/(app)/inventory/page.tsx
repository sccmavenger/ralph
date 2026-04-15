import { getSubscriptionTier, isPremium } from "@/lib/subscription";
import InventoryView from "../../components/InventoryView";
import PremiumGate from "../../components/PremiumGate";

export default async function InventoryPage() {
  const tier = await getSubscriptionTier();

  return (
    <PremiumGate isPremium={isPremium(tier)} featureName="Full Inventory">
      <InventoryView />
    </PremiumGate>
  );
}
