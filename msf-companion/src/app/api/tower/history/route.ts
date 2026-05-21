import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    const scopelyId = await getScopelyId(true);

    if (!session.accessToken || !scopelyId) {
      return NextResponse.json([]);
    }

    const commander = await prisma.commander.findUnique({
      where: { scopelyId },
      select: { id: true },
    });

    if (!commander) {
      return NextResponse.json([]);
    }

    const results = await prisma.towerResult.findMany({
      where: { commanderId: commander.id },
      orderBy: { completedAt: "desc" },
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("Tower history GET error:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  const body = await request.json();
  const { towerEventId, towerName, roomsCleared, totalRooms, week1Cleared, week2Cleared } = body;

  if (!towerEventId || !towerName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await prisma.towerResult.upsert({
    where: {
      commanderId_towerEventId: {
        commanderId: commander.id,
        towerEventId,
      },
    },
    update: {
      towerName,
      roomsCleared: roomsCleared ?? 0,
      totalRooms: totalRooms ?? 0,
      week1Cleared: week1Cleared ?? 0,
      week2Cleared: week2Cleared ?? 0,
      completedAt: new Date(),
    },
    create: {
      commanderId: commander.id,
      towerEventId,
      towerName,
      roomsCleared: roomsCleared ?? 0,
      totalRooms: totalRooms ?? 0,
      week1Cleared: week1Cleared ?? 0,
      week2Cleared: week2Cleared ?? 0,
      completedAt: new Date(),
    },
  });

  return NextResponse.json(result, { status: 201 });
}
