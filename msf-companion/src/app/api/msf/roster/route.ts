import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";

export const dynamic = "force-dynamic";

interface RawRosterChar {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  power?: number;
  info?: {
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
    status?: string;
  };
}

export async function GET() {
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  try {
    // Full character details can exceed the MSF API response-size limit at
    // larger page sizes. Their documented safe size for roster data is 25.
    const PER_PAGE = 25;
    const page1 = await msfApiFetch<{ data?: RawRosterChar[]; meta?: { perTotal?: number } }>({
      path: `/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=${PER_PAGE}`,
      accessToken: token,
    });

    const allRaw: RawRosterChar[] = [...(page1.data ?? [])];
    const total = page1.meta?.perTotal ?? allRaw.length;

    if (total > PER_PAGE) {
      const pageCount = Math.ceil(total / PER_PAGE);
      // Keep pages sequential to avoid upstream throttling/transient 502s.
      for (let page = 2; page <= pageCount; page++) {
        const nextPage = await msfApiFetch<{ data?: RawRosterChar[] }>({
          path: `/player/v1/roster?charInfo=full&traitFormat=id&page=${page}&perPage=${PER_PAGE}`,
          accessToken: token,
        });
        allRaw.push(...(nextPage.data ?? []));
      }
    }

    const data = allRaw.map((c) => ({
      id: c.id,
      name: c.info?.name,
      portrait: c.info?.portrait,
      traits: (c.info?.traits ?? []).map((t: unknown) =>
        typeof t === "string" ? t : (t as { id: string }).id
      ),
      playable: true, // All characters in the player's roster are playable
      level: c.level,
      yellowStars: c.activeYellow,
      redStars: c.activeRed,
      gearTier: c.gearTier,
      power: c.power,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error("MSF roster fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load roster data",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
