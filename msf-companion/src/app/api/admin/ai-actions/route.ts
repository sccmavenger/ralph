import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  AiActionValidationError,
  aiActionSelect,
  parseCreateAiAction,
  serializeAiAction,
} from "./action-validation";

export async function POST(request: Request) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let input: ReturnType<typeof parseCreateAiAction>;
  try {
    input = parseCreateAiAction(rawBody);
  } catch (error) {
    if (error instanceof AiActionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const where = {
      sourceType_sourceId: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    };
    const existing = await prisma.aiActionItem.findUnique({
      where,
      select: { status: true, completedAt: true },
    });
    const now = new Date();
    const status = input.status ?? "open";

    const action = await prisma.aiActionItem.upsert({
      where,
      create: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "medium",
        status,
        owner: input.owner ?? null,
        notes: input.notes ?? null,
        actionUrl: input.actionUrl ?? null,
        successMeasure: input.successMeasure ?? null,
        baselineValue: input.baselineValue ?? null,
        targetValue: input.targetValue ?? null,
        resultValue: input.resultValue ?? null,
        metricUnit: input.metricUnit ?? null,
        reviewAt: input.reviewAt ?? null,
        completedAt: status === "completed" ? now : null,
      },
      update: {
        title: input.title,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              completedAt:
                input.status === "completed"
                  ? existing?.status === "completed" && existing.completedAt
                    ? existing.completedAt
                    : now
                  : null,
            }
          : {}),
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
      },
      select: aiActionSelect,
    });

    return NextResponse.json(
      { action: serializeAiAction(action) },
      { status: existing ? 200 : 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not save AI action" },
      { status: 500 },
    );
  }
}
