import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const { id } = await params;

  const commander = await prisma.commander.findUnique({
    where: { id },
    select: { id: true, disabled: true },
  });

  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  if (!commander.disabled) {
    return NextResponse.json({ error: "Commander is not disabled" }, { status: 400 });
  }

  const updated = await prisma.commander.update({
    where: { id },
    data: { disabled: false },
    select: {
      id: true,
      disabled: true,
    },
  });

  return NextResponse.json({
    id: updated.id,
    disabled: updated.disabled,
  });
}
