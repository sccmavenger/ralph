import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/feature-flags";
import OffersFullPageClient from "./OffersFullPageClient";

export default async function OffersPage() {
  const offersEnabled = await isFeatureEnabled("active_offers");
  if (!offersEnabled) {
    redirect("/dashboard");
  }
  return <OffersFullPageClient />;
}
