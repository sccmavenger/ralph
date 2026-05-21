import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@/lib/feature-flags";
import UpgradeTokensClient from "./UpgradeTokensClient";

export default async function UpgradeTokensPage() {
  const enabled = await isFeatureEnabled("upgrade_tokens");
  if (!enabled) redirect("/analyze");
  return <UpgradeTokensClient />;
}
