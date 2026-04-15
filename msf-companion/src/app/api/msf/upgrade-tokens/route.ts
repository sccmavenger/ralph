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
  activeYellow?: number;
  activeRed?: number;
  iso8?: {
    matrix?: string;
    health?: number;
    damage?: number;
    armor?: number;
    focus?: number;
  };
}

interface UpgradeToken {
  id: string;
  characterTarget: CharacterTarget;
}

interface UpgradeTokensResponse {
  data?: UpgradeToken[];
}

interface RawRosterChar {
  id: string;
  level?: number;
  gearTier?: number;
  activeYellow?: number;
  activeRed?: number;
  power?: number;
  abilities?: { basic?: number; special?: number; ultimate?: number; passive?: number };
  info?: { name?: string; portrait?: string };
}

interface RosterResponse {
  data?: RawRosterChar[];
  meta?: { page?: number; perPage?: number; total?: number };
}

async function fetchFullRoster(accessToken: string): Promise<RawRosterChar[]> {
  const allChars: RawRosterChar[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const res = await msfApiFetch<RosterResponse>({
      path: `/player/v1/roster?charInfo=full&page=${page}&perPage=${perPage}`,
      accessToken,
    });
    const chars = res.data ?? [];
    allChars.push(...chars);
    if (chars.length < perPage) break;
    page++;
  }
  return allChars;
}

function meetsTarget(char: RawRosterChar, target: CharacterTarget): boolean {
  if (target.level && (char.level ?? 0) < target.level) return false;
  if (target.gearTier && (char.gearTier ?? 0) < target.gearTier) return false;
  if (target.basic && (char.abilities?.basic ?? 0) < target.basic) return false;
  if (target.special && (char.abilities?.special ?? 0) < target.special) return false;
  if (target.ultimate && (char.abilities?.ultimate ?? 0) < target.ultimate) return false;
  if (target.passive && (char.abilities?.passive ?? 0) < target.passive) return false;
  if (target.activeYellow && (char.activeYellow ?? 0) < target.activeYellow) return false;
  return true;
}

export async function GET() {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const [tokensRes, roster] = await Promise.all([
      msfApiFetch<UpgradeTokensResponse>({
        path: "/game/v1/upgradeTokens",
        accessToken,
      }),
      fetchFullRoster(accessToken),
    ]);

    const tokens = tokensRes.data ?? [];

    const result = tokens.map((token) => {
      const meets = roster.filter((c) => meetsTarget(c, token.characterTarget));
      const doesNotMeet = roster.filter((c) => !meetsTarget(c, token.characterTarget));

      return {
        id: token.id,
        characterTarget: token.characterTarget,
        rosterComparison: {
          totalCharacters: roster.length,
          meetsBenchmark: meets.length,
          doesNotMeet: doesNotMeet.map((c) => ({
            characterId: c.id,
            characterName: c.info?.name ?? c.id,
            portrait: c.info?.portrait ?? "",
            current: {
              level: c.level ?? 0,
              gearTier: c.gearTier ?? 0,
              basic: c.abilities?.basic ?? 0,
              special: c.abilities?.special ?? 0,
              ultimate: c.abilities?.ultimate ?? 0,
              passive: c.abilities?.passive ?? 0,
            },
            deficits: getDeficits(c, token.characterTarget),
          })),
        },
      };
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch upgrade tokens: ${message}` },
      { status: 500 }
    );
  }
}

function getDeficits(
  char: RawRosterChar,
  target: CharacterTarget
): string[] {
  const deficits: string[] = [];
  if (target.level && (char.level ?? 0) < target.level) {
    deficits.push(`Level: ${char.level ?? 0} / ${target.level}`);
  }
  if (target.gearTier && (char.gearTier ?? 0) < target.gearTier) {
    deficits.push(`Gear: ${char.gearTier ?? 0} / ${target.gearTier}`);
  }
  if (target.basic && (char.abilities?.basic ?? 0) < target.basic) {
    deficits.push(`Basic: ${char.abilities?.basic ?? 0} / ${target.basic}`);
  }
  if (target.special && (char.abilities?.special ?? 0) < target.special) {
    deficits.push(`Special: ${char.abilities?.special ?? 0} / ${target.special}`);
  }
  if (target.ultimate && (char.abilities?.ultimate ?? 0) < target.ultimate) {
    deficits.push(`Ultimate: ${char.abilities?.ultimate ?? 0} / ${target.ultimate}`);
  }
  if (target.passive && (char.abilities?.passive ?? 0) < target.passive) {
    deficits.push(`Passive: ${char.abilities?.passive ?? 0} / ${target.passive}`);
  }
  return deficits;
}
