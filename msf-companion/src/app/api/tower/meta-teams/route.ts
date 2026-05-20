import { NextResponse } from "next/server";
import { msfApiFetch } from "@/lib/msf-api";

const HYDRA_TOKEN_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";

async function getMsfBearerToken(): Promise<string> {
  const clientId = process.env.SCOPELY_CLIENT_ID;
  const clientSecret = process.env.SCOPELY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SCOPELY_CLIENT_ID or SCOPELY_CLIENT_SECRET not configured");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(HYDRA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to obtain MSF API token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

interface TeamOrderEntry {
  squad: string[];
  total: number;
  wins?: number;
}

export async function GET() {
  try {
    const accessToken = await getMsfBearerToken();

    const data = await msfApiFetch<{ data: TeamOrderEntry[] }>({
      path: "/game/v1/analysis/teamOrder/tower",
      accessToken,
      params: { perPage: "200" },
    });

    const teams = data.data.map((entry) => ({
      squad: entry.squad,
      usageTotal: entry.total,
      winRate: entry.wins != null && entry.total > 0
        ? Math.round((entry.wins / entry.total) * 100) / 100
        : undefined,
    }));

    return NextResponse.json({ teams });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Tower meta teams API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
