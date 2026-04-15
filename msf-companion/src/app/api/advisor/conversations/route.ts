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

  const conversations = await prisma.advisorConversation.findMany({
    where: { commanderId: commander.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
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

  const body = (await request.json()) as { title?: string };
  const title = body.title || "New Conversation";

  const conversation = await prisma.advisorConversation.create({
    data: {
      commanderId: commander.id,
      title,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
