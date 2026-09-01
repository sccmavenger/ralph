import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  AiActionValidationError,
  aiActionSelect,
  parseUpdateAiAction,
  serializeAiAction,
} from "../action-validation";

function isRecordNotFound(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2025"
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const { id: rawId } = await params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id || id.length > 255) {
    return NextResponse.json({ error: "Invalid action id" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let input: ReturnType<typeof parseUpdateAiAction>;
  try {
    input = parseUpdateAiAction(rawBody);
  } catch (error) {
    if (error instanceof AiActionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const existing = await prisma.aiActionItem.findUnique({
      where: { id },
      select: { status: true, completedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "AI action not found" },
        { status: 404 },
      );
    }

    const completedAt =
      input.status === undefined
        ? undefined
        : input.status === "completed"
          ? existing.status === "completed" && existing.completedAt
            ? existing.completedAt
            : new Date()
          : null;

    const action = await prisma.aiActionItem.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.owner !== undefined ? { owner: input.owner } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.actionUrl !== undefined
          ? { actionUrl: input.actionUrl }
          : {}),
        ...(input.successMeasure !== undefined
          ? { successMeasure: input.successMeasure }
          : {}),
        ...(input.baselineValue !== undefined
          ? { baselineValue: input.baselineValue }
          : {}),
        ...(input.targetValue !== undefined
          ? { targetValue: input.targetValue }
          : {}),
        ...(input.resultValue !== undefined
          ? { resultValue: input.resultValue }
          : {}),
        ...(input.metricUnit !== undefined
          ? { metricUnit: input.metricUnit }
          : {}),
        ...(input.reviewAt !== undefined ? { reviewAt: input.reviewAt } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
      },
      select: aiActionSelect,
    });

    return NextResponse.json({ action: serializeAiAction(action) });
  } catch (error) {
    if (isRecordNotFound(error)) {
      return NextResponse.json(
        { error: "AI action not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Could not update AI action" },
      { status: 500 },
    );
  }
}
