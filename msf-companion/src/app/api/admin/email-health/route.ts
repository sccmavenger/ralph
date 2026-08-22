import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getEmailHealth } from "@/lib/email-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const authError = await requireAdminSession();
  if (authError) return authError;
  return NextResponse.json(await getEmailHealth());
}
