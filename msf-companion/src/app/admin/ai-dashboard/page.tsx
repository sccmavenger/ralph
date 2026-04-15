import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import AIDashboardClient from "./AIDashboardClient";

export default async function AdminAIDashboardPage() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    redirect("/admin");
  }

  return <AIDashboardClient />;
}
