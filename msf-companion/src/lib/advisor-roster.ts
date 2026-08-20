import { msfApiFetch } from "@/lib/msf-api";

export interface AdvisorRosterCharacter {
  name?: string;
  power?: number;
  gearTier?: number;
  yellowStars?: number;
  redStars?: number;
}

interface RawRosterCharacter {
  power?: number;
  gearTier?: number;
  activeYellow?: number;
  activeRed?: number;
  info?: { name?: string };
}

export function normalizeAdvisorRosterSnapshot(raw: unknown): AdvisorRosterCharacter[] {
  if (Array.isArray(raw)) {
    return raw.filter(isNamedCharacter) as AdvisorRosterCharacter[];
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "data" in raw &&
    Array.isArray((raw as { data?: unknown }).data)
  ) {
    return (raw as { data: RawRosterCharacter[] }).data
      .map(normalizeRawCharacter)
      .filter(isNamedCharacter);
  }

  return [];
}

/** Fetches every roster page at the MSF API's safe detailed-roster page size. */
export async function fetchAdvisorRoster(
  accessToken: string
): Promise<AdvisorRosterCharacter[]> {
  const perPage = 25;
  const page1 = await msfApiFetch<{
    data?: RawRosterCharacter[];
    meta?: { perTotal?: number };
  }>({
    path: `/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=${perPage}`,
    accessToken,
  });

  const rawCharacters = [...(page1.data ?? [])];
  const total = page1.meta?.perTotal ?? rawCharacters.length;
  const pageCount = Math.ceil(total / perPage);

  // Keep requests sequential to avoid upstream throttling and transient 502s.
  for (let page = 2; page <= pageCount; page++) {
    const nextPage = await msfApiFetch<{ data?: RawRosterCharacter[] }>({
      path: `/player/v1/roster?charInfo=full&traitFormat=id&page=${page}&perPage=${perPage}`,
      accessToken,
    });
    rawCharacters.push(...(nextPage.data ?? []));
  }

  return rawCharacters.map(normalizeRawCharacter).filter(isNamedCharacter);
}

function normalizeRawCharacter(character: RawRosterCharacter): AdvisorRosterCharacter {
  return {
    name: character.info?.name,
    power: character.power,
    gearTier: character.gearTier,
    yellowStars: character.activeYellow,
    redStars: character.activeRed,
  };
}

function isNamedCharacter(
  character: AdvisorRosterCharacter
): character is AdvisorRosterCharacter & { name: string } {
  return typeof character?.name === "string" && character.name.trim().length > 0;
}
