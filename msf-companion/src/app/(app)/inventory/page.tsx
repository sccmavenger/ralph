import { getSubscriptionTier, isPremium } from "@/lib/subscription";
import InventoryView from "../../components/InventoryView";
import PremiumGate from "../../components/PremiumGate";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Inventory — MSF Companion", description: "Explore your resources and plan your next upgrade." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default async function InventoryPage() {
  const tier = await getSubscriptionTier();

  return (
    <PremiumGate isPremium={isPremium(tier)} featureName="Full Inventory">
      <InventoryView />
    </PremiumGate>
  );
}
