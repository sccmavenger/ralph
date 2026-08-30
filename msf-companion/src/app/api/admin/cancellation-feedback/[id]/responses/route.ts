import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { isCancellationFeedbackReason } from "@/lib/cancellation-feedback";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  let body: { body?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "Reply text is required" }, { status: 400 });
  }
  const responseBody = body.body.trim();
  if (responseBody.length > 4000) {
    return NextResponse.json({ error: "Reply is too long" }, { status: 400 });
  }
  const reason = body.reason === undefined || body.reason === ""
    ? null
    : body.reason === "uncategorized" || isCancellationFeedbackReason(body.reason)
      ? body.reason
      : undefined;
  if (reason === undefined) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.cancellationFeedbackCase.findUnique({
    where: { id },
    select: { firstRespondedAt: true, primaryReason: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const now = new Date();
  const [created] = await prisma.$transaction([
    prisma.cancellationFeedbackResponse.create({
      data: {
        caseId: id,
        source: "manual",
        reason,
        body: responseBody,
        receivedAt: now,
      },
    }),
    prisma.cancellationFeedbackCase.update({
      where: { id },
      data: {
        firstRespondedAt: existing.firstRespondedAt ?? now,
        reviewStatus: "new",
        primaryReason: reason ?? existing.primaryReason,
      },
    }),
  ]);

  return NextResponse.json({
    response: {
      id: created.id,
      source: created.source,
      reason: created.reason,
      body: created.body,
      receivedAt: created.receivedAt.toISOString(),
    },
  });
}
