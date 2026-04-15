import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopelyId } from "@/lib/scopely-id";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopelyId = await getScopelyId(false);
  if (!scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });
  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  const notifications = await prisma.commanderNotification.findMany({
    where: { commanderId: commander.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      linkUrl: true,
      read: true,
      createdAt: true,
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}
