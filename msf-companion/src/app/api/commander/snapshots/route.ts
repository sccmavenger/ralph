import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const scopelyId = await getScopelyId(true);

  if (!session.accessToken || !scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });

  if (!commander) {
    return NextResponse.json({ rosterCount: 0, inventoryCount: 0 });
  }

  const [rosterCount, inventoryCount] = await Promise.all([
    prisma.rosterSnapshot.count({ where: { commanderId: commander.id } }),
    prisma.inventorySnapshot.count({ where: { commanderId: commander.id } }),
  ]);

  return NextResponse.json({ rosterCount, inventoryCount });
}

export async function DELETE() {
  const session = await getSession();
  const scopelyId = await getScopelyId(true);

  if (!session.accessToken || !scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });

  if (!commander) {
    return NextResponse.json({ deleted: 0 });
  }

  const [rosterResult, inventoryResult] = await Promise.all([
    prisma.rosterSnapshot.deleteMany({ where: { commanderId: commander.id } }),
    prisma.inventorySnapshot.deleteMany({ where: { commanderId: commander.id } }),
  ]);

  return NextResponse.json({
    deleted: rosterResult.count + inventoryResult.count,
  });
}
