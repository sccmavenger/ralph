import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScopelyId } from "@/lib/scopely-id";
import { prisma } from "@/lib/prisma";
import {
  commanderEmailPreferences,
  preferenceUpdateData,
  type EmailPreferences,
} from "@/lib/email-preferences";

export const dynamic = "force-dynamic";

const preferenceSelect = {
  emailWeeklyDigest: true,
  emailNewCharacters: true,
  emailAnnouncements: true,
  emailReengagement: true,
} as const;

async function authenticatedScopelyId(): Promise<string | null> {
  const session = await getSession();
  const scopelyId = await getScopelyId(true);
  return session.accessToken && scopelyId ? scopelyId : null;
}

export async function GET() {
  const scopelyId = await authenticatedScopelyId();
  if (!scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: preferenceSelect,
  });
  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  return NextResponse.json({ preferences: commanderEmailPreferences(commander) });
}

async function updatePreferences(request: NextRequest) {
  const scopelyId = await authenticatedScopelyId();
  if (!scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { preferences?: Record<string, unknown> };
  const submitted = body.preferences ?? {};
  const preferences: Partial<EmailPreferences> = {};
  for (const key of [
    "weeklyDigest",
    "newCharacters",
    "announcements",
    "reengagement",
  ] as const) {
    if (submitted[key] !== undefined) {
      if (typeof submitted[key] !== "boolean") {
        return NextResponse.json(
          { error: `${key} must be a boolean` },
          { status: 400 }
        );
      }
      preferences[key] = submitted[key] as boolean;
    }
  }

  if (!Object.keys(preferences).length) {
    return NextResponse.json({ error: "No preferences supplied" }, { status: 400 });
  }

  const commander = await prisma.commander.update({
    where: { scopelyId },
    data: preferenceUpdateData(preferences),
    select: preferenceSelect,
  });

  return NextResponse.json({ preferences: commanderEmailPreferences(commander) });
}

export async function PATCH(request: NextRequest) {
  return updatePreferences(request);
}

export async function POST(request: NextRequest) {
  return updatePreferences(request);
}
