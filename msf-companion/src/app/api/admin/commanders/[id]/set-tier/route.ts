import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const { id } = await params;

  let body: { tier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tier } = body;
  if (tier !== "PREMIUM" && tier !== "FREE") {
    return NextResponse.json(
      { error: "Invalid tier. Must be 'PREMIUM' or 'FREE'." },
      { status: 400 }
    );
  }

  const commander = await prisma.commander.findUnique({
    where: { id },
    select: { id: true, subscriptionTier: true },
  });

  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  const updated = await prisma.commander.update({
    where: { id },
    data: { subscriptionTier: tier },
    select: {
      id: true,
      subscriptionTier: true,
    },
  });

  return NextResponse.json({
    id: updated.id,
    subscriptionTier: updated.subscriptionTier,
  });
}
