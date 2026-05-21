import { isFeatureEnabled } from "@/lib/feature-flags";
import AnalyzePageClient from "./AnalyzePageClient";

export default async function AnalyzePage() {
  const upgradeTokensEnabled = await isFeatureEnabled("upgrade_tokens");
  return <AnalyzePageClient upgradeTokensEnabled={upgradeTokensEnabled} />;
}
