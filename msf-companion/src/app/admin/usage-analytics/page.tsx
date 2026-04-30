import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import UsageAnalyticsClient from "./UsageAnalyticsClient";

export default async function AdminUsageAnalyticsPage() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    redirect("/admin");
  }

  return <UsageAnalyticsClient />;
}
