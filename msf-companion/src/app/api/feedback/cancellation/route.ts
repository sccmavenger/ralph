import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isCancellationFeedbackReason,
  verifyCancellationFeedbackToken,
} from "@/lib/cancellation-feedback";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { token?: unknown; reason?: unknown; comment?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const payload = verifyCancellationFeedbackToken(token);
  if (!payload) {
    return NextResponse.json({ error: "This feedback link is invalid or has expired" }, { status: 400 });
  }

  const reason = body.reason === undefined || body.reason === ""
    ? null
    : isCancellationFeedbackReason(body.reason)
      ? body.reason
      : undefined;
  if (reason === undefined) {
    return NextResponse.json({ error: "Invalid feedback reason" }, { status: 400 });
  }

  if (body.comment !== undefined && typeof body.comment !== "string") {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (comment.length > 4000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }
  if (!reason && !comment) {
    return NextResponse.json({ error: "Choose a reason or add a comment" }, { status: 400 });
  }

  const feedbackCase = await prisma.cancellationFeedbackCase.findUnique({
    where: { id: payload.caseId },
    select: {
      id: true,
      commanderId: true,
      firstRespondedAt: true,
      primaryReason: true,
    },
  });
  if (!feedbackCase || feedbackCase.commanderId !== payload.commanderId) {
    return NextResponse.json({ error: "This feedback link is no longer available" }, { status: 404 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.cancellationFeedbackResponse.upsert({
      where: { dedupeKey: `form:${feedbackCase.id}` },
      create: {
        caseId: feedbackCase.id,
        source: "form",
        reason,
        body: comment || null,
        dedupeKey: `form:${feedbackCase.id}`,
        receivedAt: now,
      },
      update: {
        reason,
        body: comment || null,
        receivedAt: now,
      },
    }),
    prisma.cancellationFeedbackCase.update({
      where: { id: feedbackCase.id },
      data: {
        firstRespondedAt: feedbackCase.firstRespondedAt ?? now,
        reviewStatus: "new",
        primaryReason: reason ?? feedbackCase.primaryReason,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
