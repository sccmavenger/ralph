import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { getSubscriptionTier } from "@/lib/subscription";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  const conversation = await prisma.advisorConversation.findFirst({
    where: { id, commanderId: commander.id },
    select: {
      id: true,
      title: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          confidenceScore: true,
          sourceCitations: true,
          feedback: true,
          feedbackComment: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}
