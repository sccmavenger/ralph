import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";

export const dynamic = "force-dynamic";

interface RawStats {
  health?: number;
  damage?: number;
  armor?: number;
  focus?: number;
  resist?: number;
  speed?: number;
  critChance?: number;
  critDamageBonus?: number;
  dodgeChance?: number;
  blockChance?: number;
  blockAmount?: number;
  accuracy?: number;
}

interface RawRosterChar {
  id: string;
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  power?: number;
  passive?: number; // current passive ability level (integer)
  info?: {
    name?: string;
    portrait?: string;
    traits?: (string | { id: string })[];
    status?: string;
  };
  stats?: RawStats;
}

// Types for game/v1/characters (ability kit data)
interface GameAbilityLevel {
  description?: string;
}

interface GameAbility {
  name?: string;
  levels?: Record<string, GameAbilityLevel>;
}

interface GameAbilityKit {
  basic?: GameAbility;
  special?: GameAbility;
  ultimate?: GameAbility;
  passive?: GameAbility;
}

interface GameCharacter {
  id: string;
  abilityKit?: GameAbilityKit;
}

interface GameCharactersPage {
  data?: GameCharacter[];
  meta?: { perTotal?: number };
}

interface RosterPage {
  data?: RawRosterChar[];
  meta?: { perTotal?: number };
}

function normalizeTraits(traits: (string | { id: string })[] | undefined): string[] {
  return (traits ?? []).map((t: unknown) =>
    typeof t === "string" ? t : (t as { id: string }).id
  );
}

function normalizeAbilityKit(passiveLevel: number | undefined, passiveDesc: string | undefined) {
  return {
    basic: null,
    special: null,
    ultimate: null,
    passive: passiveLevel
      ? { level: passiveLevel, description: passiveDesc }
      : null,
  };
}

function normalizeStats(stats: RawStats | undefined) {
  return {
    health: stats?.health ?? 0,
    damage: stats?.damage ?? 0,
    armor: stats?.armor ?? 0,
    focus: stats?.focus ?? 0,
    resist: stats?.resist ?? 0,
    speed: stats?.speed ?? 0,
    critChance: stats?.critChance ?? 0,
    critDamageBonus: stats?.critDamageBonus ?? 0,
    dodgeChance: stats?.dodgeChance ?? 0,
    blockChance: stats?.blockChance ?? 0,
    blockAmount: stats?.blockAmount ?? 0,
    accuracy: stats?.accuracy ?? 0,
  };
}

/**
 * Fetch all game character ability kits via paginated requests to avoid 472 RESPONSE_TOO_LARGE.
 * The full abilityKits=full response is ~7.6MB which exceeds the API's 472KB limit.
 */
async function fetchGameCharAbilityKits(accessToken: string): Promise<Map<string, GameAbilityKit>> {
  const GAME_PER_PAGE = 15; // ~25KB per char with ability kits; 15 * 25KB ≈ 375KB < 472KB limit
  const map = new Map<string, GameAbilityKit>();

  const page1 = await msfApiFetch<GameCharactersPage>({
    path: `/game/v1/characters?abilityKits=full&page=1&perPage=${GAME_PER_PAGE}`,
    accessToken,
  });

  for (const gc of page1.data ?? []) {
    if (gc.abilityKit) map.set(gc.id, gc.abilityKit);
  }

  const total = page1.meta?.perTotal ?? (page1.data?.length ?? 0);
  if (total > GAME_PER_PAGE) {
    const pageCount = Math.ceil(total / GAME_PER_PAGE);
    const extraPages = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, i) =>
        msfApiFetch<GameCharactersPage>({
          path: `/game/v1/characters?abilityKits=full&page=${i + 2}&perPage=${GAME_PER_PAGE}`,
          accessToken,
        })
      )
    );
    for (const p of extraPages) {
      for (const gc of p.data ?? []) {
        if (gc.abilityKit) map.set(gc.id, gc.abilityKit);
      }
    }
  }

  return map;
}

/** Strip MSF color markup tags like <color=#86e619>text</color> from description text */
function stripColorTags(text: string): string {
  return text
    .replace(/<color=#[0-9a-fA-F]{6,8}>/g, "")  // opening <color=#hex>
    .replace(/<\/color>/g, "")                     // closing </color>
    .trim();
}

function resolvePassiveDescription(
  gameKit: GameAbilityKit | undefined,
  passiveLevel: number | undefined
): string | undefined {
  if (!gameKit?.passive?.levels || !passiveLevel) return undefined;
  const raw = gameKit.passive.levels[String(passiveLevel)]?.description;
  if (raw) return stripColorTags(raw);
  // Fallback: highest available level
  const levelKeys = Object.keys(gameKit.passive.levels).sort((a, b) => Number(b) - Number(a));
  for (const k of levelKeys) {
    const d = gameKit.passive.levels[k]?.description;
    if (d) return stripColorTags(d);
  }
  return undefined;
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
    const PER_PAGE = 200;

    // Fetch roster and game character ability kits in parallel
    const [rosterPage1, passiveDescMap] = await Promise.all([
      msfApiFetch<RosterPage>({
        path: `/player/v1/roster?charInfo=full&traitFormat=id&statsFormat=object&page=1&perPage=${PER_PAGE}`,
        accessToken: token,
      }),
      fetchGameCharAbilityKits(token),
    ]);

    const allRaw: RawRosterChar[] = [...(rosterPage1.data ?? [])];
    const total = rosterPage1.meta?.perTotal ?? allRaw.length;

    if (total > PER_PAGE) {
      const pageCount = Math.ceil(total / PER_PAGE);
      const extraPages = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, i) =>
          msfApiFetch<RosterPage>({
            path: `/player/v1/roster?charInfo=full&traitFormat=id&statsFormat=object&page=${i + 2}&perPage=${PER_PAGE}`,
            accessToken: token,
          })
        )
      );
      for (const p of extraPages) allRaw.push(...(p.data ?? []));
    }

    // Filter to playable characters only
    const playable = allRaw.filter(
      (c) => !c.info?.status || c.info.status === "playable"
    );

    const data = playable.map((c) => {
      const passiveDesc = resolvePassiveDescription(passiveDescMap.get(c.id), c.passive);
      return {
        id: c.id,
        name: c.info?.name ?? c.id,
        portrait: c.info?.portrait ?? null,
        power: c.power ?? 0,
        level: c.level ?? 1,
        gearTier: c.gearTier ?? 0,
        yellowStars: c.activeYellow ?? 0,
        redStars: c.activeRed ?? 0,
        traits: normalizeTraits(c.info?.traits),
        abilityKit: normalizeAbilityKit(c.passive, passiveDesc),
        stats: normalizeStats(c.stats),
      };
    });

    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Handle 472 RESPONSE_TOO_LARGE for roster by retrying with smaller page size
    if (message.includes("472")) {
      try {
        const SMALL_PAGE = 100;

        const passiveDescMap2 = await fetchGameCharAbilityKits(token);

        const page1 = await msfApiFetch<RosterPage>({
          path: `/player/v1/roster?charInfo=full&traitFormat=id&statsFormat=object&page=1&perPage=${SMALL_PAGE}`,
          accessToken: token,
        });

        const allRaw: RawRosterChar[] = [...(page1.data ?? [])];
        const total = page1.meta?.perTotal ?? allRaw.length;

        if (total > SMALL_PAGE) {
          const pageCount = Math.ceil(total / SMALL_PAGE);
          const extraPages = await Promise.all(
            Array.from({ length: pageCount - 1 }, (_, i) =>
              msfApiFetch<RosterPage>({
                path: `/player/v1/roster?charInfo=full&traitFormat=id&statsFormat=object&page=${i + 2}&perPage=${SMALL_PAGE}`,
                accessToken: token,
              })
            )
          );
          for (const p of extraPages) allRaw.push(...(p.data ?? []));
        }

        const playable = allRaw.filter(
          (c) => !c.info?.status || c.info.status === "playable"
        );

        const data = playable.map((c) => {
          const passiveDesc = resolvePassiveDescription(passiveDescMap2.get(c.id), c.passive);
          return {
            id: c.id,
            name: c.info?.name ?? c.id,
            portrait: c.info?.portrait ?? null,
            power: c.power ?? 0,
            level: c.level ?? 1,
            gearTier: c.gearTier ?? 0,
            yellowStars: c.activeYellow ?? 0,
            redStars: c.activeRed ?? 0,
            traits: normalizeTraits(c.info?.traits),
            abilityKit: normalizeAbilityKit(c.passive, passiveDesc),
            stats: normalizeStats(c.stats),
          };
        });

        return NextResponse.json({ data });
      } catch (retryErr) {
        console.error("MSF team-builder roster retry failed:", retryErr);
      }
    }

    console.error("MSF team-builder roster fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load roster data for team builder",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
