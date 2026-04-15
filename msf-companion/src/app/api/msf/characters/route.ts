import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  try {
    const data = await msfApiFetch({
      path: "/game/v1/characters?traitFormat=id",
      accessToken: token,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("MSF game characters fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load game characters",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
