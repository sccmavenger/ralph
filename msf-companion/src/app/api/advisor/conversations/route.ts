import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopelyId } from "@/lib/scopely-id";
import { getSession } from "@/lib/session";
import { getSubscriptionTier } from "@/lib/subscription";

const MAX_TITLE_LENGTH = 80;

export async function GET() {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopelyId = await getScopelyId(false);
  if (!scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if ((await getSubscriptionTier()) !== "PREMIUM") {
    return NextResponse.json(
      { error: "Conversation memory requires Premium", code: "PREMIUM_REQUIRED" },
      { status: 403 }
    );
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

  if ((await getSubscriptionTier()) !== "PREMIUM") {
    return NextResponse.json(
      { error: "Conversation memory requires Premium", code: "PREMIUM_REQUIRED" },
      { status: 403 }
    );
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });
  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  let body: { title?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: "JSON body must be an object" }, { status: 400 });
    }
    body = parsed as { title?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.title !== undefined && typeof body.title !== "string") {
    return NextResponse.json({ error: "Title must be a string" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, MAX_TITLE_LENGTH)
      : "New Conversation";

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
