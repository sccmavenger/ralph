import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";
import { getCached, setCache } from "@/lib/planner-cache";

export const dynamic = "force-dynamic";

const CACHE_KEY = "team-builder:meta";

const GAME_MODES = ["roster", "blitz", "tower", "raids", "arena", "war", "crucible"] as const;
type GameMode = (typeof GAME_MODES)[number];

interface RawTeamOrder {
  squad?: string[];
  total?: number;
}

interface TeamOrderResponse {
  data?: Record<string, RawTeamOrder[]>;
}

interface NormalizedMetaMode {
  mode: string;
  teams: { squad: string[]; total: number }[];
}

export async function GET() {
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  // Check cache first
  const cached = getCached<NormalizedMetaMode[]>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ data: cached });
  }

  try {
    const raw = await msfApiFetch<TeamOrderResponse>({
      path: "/game/v1/analysis/teamOrder",
      accessToken: token,
    });

    const data: NormalizedMetaMode[] = GAME_MODES.map((mode: GameMode) => {
      const modeData = raw.data?.[mode];
      const teams = Array.isArray(modeData)
        ? modeData
            .filter((t): t is Required<RawTeamOrder> => Array.isArray(t.squad) && typeof t.total === "number")
            .map((t) => ({ squad: t.squad, total: t.total }))
        : [];
      return { mode, teams };
    });

    setCache(CACHE_KEY, data);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("MSF team-builder meta fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load meta team data",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
