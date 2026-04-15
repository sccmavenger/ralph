import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MSF_API_BASE = "https://api.marvelstrikeforce.com";
const MSF_API_KEY = process.env.MSF_API_KEY!;

async function testEndpoint(path: string, accessToken: string) {
  const url = `${MSF_API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": MSF_API_KEY,
        "User-Agent": "APIClient/1.0 (Server)",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text.substring(0, 500); }
    return {
      status: res.status,
      ok: res.ok,
      bodyPreview: JSON.stringify(parsed).substring(0, 600),
    };
  } catch (e) {
    return { status: -1, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const token = await getValidAccessTokenWithRefresh();
  if (!token) {
    return NextResponse.json({ error: "No token - user must be logged in via browser first" }, { status: 401 });
  }

  const endpoints = [
    "/game/v1/analysis/war/offense?page=1&perPage=100",
    "/game/v1/analysis/war/offense?page=2&perPage=100",
    "/game/v1/analysis/war/offense",
  ];

  const results: Record<string, unknown> = {};
  for (const ep of endpoints) {
    results[ep] = await testEndpoint(ep, token);
  }

  return NextResponse.json(results, { status: 200 });
}
