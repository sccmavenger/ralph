import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import UsageInsightsClient from "./UsageInsightsClient";

export default async function AdminUsageAnalyticsPage() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    redirect("/admin");
  }

  return <UsageInsightsClient />;
}
