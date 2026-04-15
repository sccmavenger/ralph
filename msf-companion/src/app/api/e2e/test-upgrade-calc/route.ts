import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh } from "@/lib/auth";
import { calculateTotalCost, calculateStarCost } from "@/lib/upgrade-calculator";

export const dynamic = "force-dynamic";

export async function GET() {
  // Only available in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = await getValidAccessTokenWithRefresh();
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 },
    );
  }

  try {
    // Test with Hulk — a well-known character
    const totalCost = await calculateTotalCost(
      "Hulk",
      {
        gearTier: 1,
        stars: 1,
        abilities: { basic: 1, special: 1, ultimate: 1, passive: 1 },
      },
      {
        gearTier: 5,
        stars: 4,
        abilities: { basic: 4, special: 4, ultimate: 4, passive: 4 },
      },
      token,
    );

    // Also test star cost edge case
    const noStarCost = await calculateStarCost(5, 3, token);

    return NextResponse.json({
      totalCost,
      noStarCost,
    });
  } catch (err) {
    console.error("Upgrade calculator test failed:", err);
    return NextResponse.json(
      { error: String(err), code: "CALC_ERROR", retryable: false },
      { status: 500 },
    );
  }
}
