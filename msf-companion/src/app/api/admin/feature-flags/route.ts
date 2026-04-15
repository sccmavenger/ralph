import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Known flags that should always appear in the admin UI
const KNOWN_FLAGS = ["active_offers", "meta_hash_caching"];

export async function GET() {
  const authError = await requireAdminSession();
  if (authError) return authError;

  // Ensure known flags exist (default disabled)
  for (const key of KNOWN_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled: false },
      update: {},
    });
  }

  const flags = await prisma.featureFlag.findMany({
    orderBy: { key: "asc" },
  });
  return NextResponse.json({ flags });
}

export async function PATCH(request: Request) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const { key, enabled } = (await request.json()) as {
    key: string;
    enabled: boolean;
  };

  if (!key || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "key and enabled are required" },
      { status: 400 }
    );
  }

  const flag = await prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled },
    update: { enabled },
  });

  return NextResponse.json({ flag });
}
