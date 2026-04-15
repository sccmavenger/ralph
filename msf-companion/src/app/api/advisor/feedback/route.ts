import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import { processNegativeFeedback } from "@/lib/gap-resolver";

export async function PATCH(request: NextRequest) {
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as { messageId?: string; rating?: string; comment?: string };
  const { messageId, rating, comment } = body;

  if (!messageId || !rating || !["positive", "negative"].includes(rating)) {
    return NextResponse.json({ error: "Invalid request. Provide messageId and rating (positive|negative)." }, { status: 400 });
  }

  // Verify the message belongs to a conversation owned by this commander
  const message = await prisma.advisorMessage.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { commanderId: true } } },
  });

  if (!message || message.conversation.commanderId !== commander.id) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.role !== "assistant") {
    return NextResponse.json({ error: "Can only rate assistant messages" }, { status: 400 });
  }

  const updated = await prisma.advisorMessage.update({
    where: { id: messageId },
    data: {
      feedback: rating,
      ...(comment !== undefined ? { feedbackComment: comment } : {}),
    },
  });

  // If negative feedback, trigger autonomous gap resolution
  if (rating === "negative") {
    // Find the user's question that preceded this assistant message
    const precedingMessages = await prisma.advisorMessage.findMany({
      where: {
        conversationId: message.conversationId,
        role: "user",
        createdAt: { lt: message.createdAt },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { content: true },
    });
    const userQuestion = precedingMessages[0]?.content || "";
    if (userQuestion) {
      processNegativeFeedback(userQuestion, "general").catch(() => {});
    }
  }

  return NextResponse.json({
    messageId: updated.id,
    feedback: updated.feedback,
    feedbackComment: updated.feedbackComment,
  });
}
