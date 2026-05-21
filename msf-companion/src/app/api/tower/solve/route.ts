import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { rooms, roster, metaTeams, clearedRooms } = body;

    // Import solver dynamically to keep it server-side
    const { solveTowerAllocation } = await import("@/lib/tower-solver");

    const result = solveTowerAllocation(rooms, roster, metaTeams || [], clearedRooms);

    // Convert Map to plain object for JSON serialization
    const assignments: Record<string, unknown> = {};
    result.assignments.forEach((value, key) => {
      assignments[key] = value;
    });

    return NextResponse.json({
      assignments,
      unassignableRooms: result.unassignableRooms,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Tower solve API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
