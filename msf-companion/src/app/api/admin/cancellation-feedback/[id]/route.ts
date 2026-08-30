import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { isCancellationFeedbackReason } from "@/lib/cancellation-feedback";

const REVIEW_STATUSES = new Set([
  "awaiting_response",
  "new",
  "reviewing",
  "planned",
  "actioned",
  "closed",
]);

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid text value");
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error("Text value is too long");
  return trimmed || null;
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const reviewStatus = body.reviewStatus;
  if (typeof reviewStatus !== "string" || !REVIEW_STATUSES.has(reviewStatus)) {
    return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
  }

  const primaryReason = body.primaryReason === null || body.primaryReason === ""
    ? null
    : body.primaryReason === "uncategorized" || isCancellationFeedbackReason(body.primaryReason)
      ? body.primaryReason
      : undefined;
  if (primaryReason === undefined) {
    return NextResponse.json({ error: "Invalid primary reason" }, { status: 400 });
  }

  try {
    const theme = optionalText(body.theme, 120);
    const assignedTo = optionalText(body.assignedTo, 120);
    const adminNotes = optionalText(body.adminNotes, 8000);
    const actionSummary = optionalText(body.actionSummary, 4000);
    const actionUrl = optionalText(body.actionUrl, 1000);
    if (
      actionUrl &&
      !actionUrl.startsWith("/") &&
      !/^https?:\/\//i.test(actionUrl)
    ) {
      return NextResponse.json({ error: "Action link must be an http(s) URL or app path" }, { status: 400 });
    }

    const { id } = await params;
    const now = new Date();
    const updated = await prisma.cancellationFeedbackCase.update({
      where: { id },
      data: {
        reviewStatus,
        primaryReason,
        theme,
        assignedTo,
        adminNotes,
        actionSummary,
        actionUrl,
        ...(reviewStatus === "actioned" ? { actionedAt: now } : {}),
        ...(reviewStatus === "closed" ? { closedAt: now } : {}),
      },
      select: {
        reviewStatus: true,
        primaryReason: true,
        theme: true,
        assignedTo: true,
        adminNotes: true,
        actionSummary: true,
        actionUrl: true,
        actionedAt: true,
        closedAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({
      case: {
        ...updated,
        actionedAt: updated.actionedAt?.toISOString() ?? null,
        closedAt: updated.closedAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save case";
    return NextResponse.json({ error: message }, { status: message.includes("too long") || message.includes("Invalid") ? 400 : 404 });
  }
}
