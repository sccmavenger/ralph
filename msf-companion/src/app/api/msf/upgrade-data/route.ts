import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { getSubscriptionTier, isPremium } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  const tier = await getSubscriptionTier();
  if (!isPremium(tier)) {
    return NextResponse.json(
      {
        error: "Premium subscription required",
        code: "PREMIUM_REQUIRED",
        retryable: false,
      },
      { status: 403 }
    );
  }

  try {
    const data = await msfApiFetch({
      path: "/game/v1/upgradeData",
      accessToken: token,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("MSF upgrade data fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load upgrade data",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
