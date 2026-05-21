import { NextResponse } from "next/server";
import { getUpgradeRecommendations } from "@/lib/tower-upgrades";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const towerId = searchParams.get("towerId");

  if (!towerId) {
    return NextResponse.json({ error: "towerId required" }, { status: 400 });
  }

  // In a real implementation, this would fetch room data and roster from the MSF API
  // and compute recommendations. For now, return empty if no data available.
  try {
    const recommendations = getUpgradeRecommendations([], []);
    return NextResponse.json(recommendations);
  } catch {
    return NextResponse.json([]);
  }
}
