import { NextRequest, NextResponse } from "next/server";
import { fetchTowerRooms } from "@/lib/tower-fetcher";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const towerId = searchParams.get("towerId");

  if (!towerId) {
    return NextResponse.json({ error: "towerId query parameter required" }, { status: 400 });
  }

  try {
    const rooms = await fetchTowerRooms(towerId);
    return NextResponse.json(rooms);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("404")) {
      return NextResponse.json({ error: "Tower not found" }, { status: 404 });
    }
    console.error("Tower rooms API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
