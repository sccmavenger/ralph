import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";

export const dynamic = "force-dynamic";

interface CharacterTarget {
  level?: number;
  gearTier?: number;
  basic?: number;
  special?: number;
  ultimate?: number;
  passive?: number;
  activeRed?: number;
  activeYellow?: number;
  starkBoost?: Record<string, number>;
}

interface CompletionGranted {
  id: string;
  chapter?: number;
  tier?: number;
  type: string;
}

interface SquadUpgraded {
  name: string;
  description?: string;
  squad: string[];
}

interface TimeHeist {
  id: string;
  characterTarget: CharacterTarget;
  minLevel?: number;
  playerTargetLevel?: number;
  featureUnlocks?: string[];
  completionsGranted?: CompletionGranted[];
  squadsUpgraded?: SquadUpgraded[];
}

interface TimeHeistsResponse {
  data?: TimeHeist[];
}

interface TimeHeistDetailResponse extends TimeHeist {}

interface TcpResponse {
  data?: number;
}

export async function GET() {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Fetch list of time heists
    const listRes = await msfApiFetch<TimeHeistsResponse>({
      path: "/game/v1/timeHeists",
      accessToken,
    });

    const heists = listRes.data ?? [];

    // Fetch detail (for squadsUpgraded) and player TCP for each heist
    const enriched = await Promise.all(
      heists.map(async (heist) => {
        let squadsUpgraded: SquadUpgraded[] = [];
        let playerTcp: number | null = null;

        try {
          const detail = await msfApiFetch<TimeHeistDetailResponse>({
            path: `/game/v1/timeHeists/${heist.id}`,
            accessToken,
          });
          squadsUpgraded = detail.squadsUpgraded ?? [];
        } catch {
          // Detail fetch failed — continue without squadsUpgraded
        }

        try {
          const tcpRes = await msfApiFetch<TcpResponse>({
            path: `/player/v1/timeHeists/${heist.id}/tcp`,
            accessToken,
          });
          playerTcp = tcpRes.data ?? null;
        } catch {
          // TCP fetch failed — not critical
        }

        return {
          id: heist.id,
          characterTarget: heist.characterTarget,
          minLevel: heist.minLevel ?? null,
          playerTargetLevel: heist.playerTargetLevel ?? null,
          featureUnlocks: heist.featureUnlocks ?? [],
          completionsGranted: heist.completionsGranted ?? [],
          squadsUpgraded,
          playerTcp,
        };
      })
    );

    return NextResponse.json({ data: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch time heists: ${message}` },
      { status: 500 }
    );
  }
}
