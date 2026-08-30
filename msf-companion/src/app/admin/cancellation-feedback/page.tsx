import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { getCancellationFeedbackAdminData } from "@/lib/cancellation-feedback-admin";
import CancellationFeedbackAdminClient from "./CancellationFeedbackAdminClient";

export const dynamic = "force-dynamic";

export default async function CancellationFeedbackAdminPage() {
  const session = await getAdminSession();
  if (!session.isAdmin) redirect("/admin");

  return (
    <CancellationFeedbackAdminClient
      initialData={await getCancellationFeedbackAdminData()}
    />
  );
}
