import { prisma } from "@/lib/prisma";
import { msfApiFetch } from "@/lib/msf-api";

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

/**
 * Fetches the full roster from the MSF API with character info (paginated).
 * Returns a normalized array of characters.
 */
async function fetchFullRoster(accessToken: string): Promise<object[]> {
  const PER_PAGE = 200;
  const page1 = await msfApiFetch<{ data?: RawRosterChar[]; meta?: { perTotal?: number } }>({
    path: `/player/v1/roster?charInfo=full&traitFormat=id&page=1&perPage=${PER_PAGE}`,
    accessToken,
  });

  const allRaw: RawRosterChar[] = [...(page1.data ?? [])];
  const total = page1.meta?.perTotal ?? allRaw.length;

  if (total > PER_PAGE) {
    const pageCount = Math.ceil(total / PER_PAGE);
    const extra = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, i) =>
        msfApiFetch<{ data?: RawRosterChar[] }>({
          path: `/player/v1/roster?charInfo=full&traitFormat=id&page=${i + 2}&perPage=${PER_PAGE}`,
          accessToken,
        }),
      ),
    );
    for (const p of extra) allRaw.push(...(p.data ?? []));
  }

  // Normalize to a consistent format with top-level name, yellowStars, etc.
  return allRaw.map((c) => ({
    id: c.id,
    name: c.info?.name,
    portrait: c.info?.portrait,
    traits: (c.info?.traits ?? []).map((t: unknown) =>
      typeof t === "string" ? t : (t as { id: string }).id
    ),
    playable: true,
    level: c.level,
    yellowStars: c.activeYellow,
    redStars: c.activeRed,
    gearTier: c.gearTier,
    power: c.power,
  }));
}

/**
 * Fetches roster and inventory from the MSF API and stores snapshots.
 * Roster data is stored in normalized format with charInfo included.
 * If the MSF API is unreachable, logs a warning and returns without error.
 */
export async function createSnapshots(
  commanderId: string,
  accessToken: string
): Promise<void> {
  let rosterData: object[] | null = null;
  let inventoryData: unknown = null;

  try {
    rosterData = await fetchFullRoster(accessToken);
  } catch (err) {
    console.warn("Failed to fetch roster for snapshot:", err);
  }

  try {
    inventoryData = await msfApiFetch({
      path: "/player/v1/inventory",
      accessToken,
    });
  } catch (err) {
    console.warn("Failed to fetch inventory for snapshot:", err);
  }

  if (rosterData && rosterData.length > 0) {
    await prisma.rosterSnapshot.create({
      data: {
        commanderId,
        snapshotData: rosterData,
      },
    });
  }

  if (inventoryData) {
    await prisma.inventorySnapshot.create({
      data: {
        commanderId,
        snapshotData: inventoryData as object,
      },
    });
  }
}

/**
 * Find or create a Commander record from OAuth data, then snapshot.
 * Called on every successful login.
 */
export async function handleLoginSnapshot(
  scopelyId: string,
  accessToken: string,
  displayName?: string
): Promise<string> {
  const commander = await prisma.commander.upsert({
    where: { scopelyId },
    create: {
      scopelyId,
      displayName: displayName ?? null,
      lastLoginAt: new Date(),
    },
    update: {
      updatedAt: new Date(),
      lastLoginAt: new Date(),
      ...(displayName ? { displayName } : {}),
    },
  });

  // Snapshot runs async — don't block login on API failures
  try {
    await createSnapshots(commander.id, accessToken);
  } catch (err) {
    console.warn("Snapshot creation failed, login continues:", err);
  }

  return commander.id;
}
