import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
  return null;
}
