import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import MonetizationClient from "./MonetizationClient";

export default async function MonetizationPage() {
  const session = await getAdminSession();
  if (!session.isAdmin) redirect("/admin");
  return <MonetizationClient />;
}
