import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { postAnnouncement } from "@/lib/discord";

/**
 * POST /api/admin/discord-announce — Post an announcement to Discord.
 * Body: { title, description, type?: "release"|"bugfix"|"feature"|"info", changes?: string[], channelId?: string }
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    type?: "release" | "bugfix" | "feature" | "info";
    changes?: string[];
    channelId?: string;
  };

  const { title, description, type, changes, channelId } = body;

  if (!title || !description) {
    return NextResponse.json(
      { error: "title and description are required" },
      { status: 400 }
    );
  }

  const result = await postAnnouncement({
    title,
    description,
    type,
    changes,
    channelId,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
