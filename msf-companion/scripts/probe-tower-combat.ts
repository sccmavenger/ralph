/**
 * Probe 2: resolve a tower room's `combatId` to actual enemy data.
 *
 * Tries a series of candidate endpoints + query params to discover where Scopely
 * exposes the enemy waves/units (with stats.power) for survival tower rooms.
 *
 * Run:
 *   cd msf-companion
 *   npx tsx scripts/probe-tower-combat.ts [towerId] [roomId]
 *
 * Defaults: survivaltower_war_02 / A1 (active War Tower the user is playing).
 */
import "dotenv/config";

const MSF_API_BASE = "https://api.marvelstrikeforce.com";
const HYDRA_TOKEN_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";

async function getToken(): Promise<string> {
  const id = process.env.SCOPELY_CLIENT_ID!;
  const secret = process.env.SCOPELY_CLIENT_SECRET!;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch(HYDRA_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  return ((await r.json()) as { access_token: string }).access_token;
}

async function tryPath(path: string, token: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(`${MSF_API_BASE}${path}`, {
    headers: {
      "x-api-key": process.env.MSF_API_KEY!,
      Authorization: `Bearer ${token}`,
      "User-Agent": "APIClient/1.0 (Server)",
    },
  });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { ok: r.ok, status: r.status, body: parsed };
}

function summarize(body: unknown): string {
  if (body === null || body === undefined) return "(null)";
  if (typeof body === "string") return body.slice(0, 400);
  const json = JSON.stringify(body, null, 2);
  return json.length > 1200 ? json.slice(0, 1200) + "\n...(truncated)" : json;
}

function hasCombatWaves(body: unknown): boolean {
  if (body === null || typeof body !== "object") return false;
  const stack: unknown[] = [body];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === null || typeof cur !== "object") continue;
    const obj = cur as Record<string, unknown>;
    if (obj.waves && Array.isArray(obj.waves)) return true;
    if (obj.combat && typeof obj.combat === "object") return true;
    if (obj.left && typeof obj.left === "object" && (obj.left as { waves?: unknown }).waves) return true;
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return false;
}

(async () => {
  const token = await getToken();
  const towerId = process.argv[2] ?? "survivaltower_war_02";
  const roomId = process.argv[3] ?? "A1";

  // 0) Fetch the room first to get combatId
  console.log(`[probe2] Fetching ${towerId}/${roomId} ...`);
  const room = await tryPath(
    `/game/v1/survivalTowers/${towerId}/${roomId}?nodeReqs=full&pieceInfo=full&traitFormat=id`,
    token,
  );
  console.log(`[probe2] room status=${room.status}`);
  console.log(`[probe2] room body:`, summarize(room.body));
  const data = (room.body as { data?: { combatId?: string } }).data;
  const combatId = data?.combatId;
  if (!combatId) {
    console.log("[probe2] No combatId on this room. Aborting.");
    return;
  }
  console.log(`[probe2] combatId = ${combatId}`);

  // 1) Re-request the room with extra query params that might fetch embedded combat
  const extraRoomVariants = [
    `?nodeReqs=full&pieceInfo=full&combatInfo=full&traitFormat=id`,
    `?nodeReqs=full&pieceInfo=full&combat=full&traitFormat=id`,
    `?nodeReqs=full&pieceInfo=full&enemyInfo=full&traitFormat=id`,
    `?nodeReqs=full&pieceInfo=full&combatInfo=full&unitInfo=full&traitFormat=id`,
  ];
  console.log(`\n[probe2] === Trying room with extra combat-related params ===`);
  for (const q of extraRoomVariants) {
    const path = `/game/v1/survivalTowers/${towerId}/${roomId}${q}`;
    const r = await tryPath(path, token);
    const has = hasCombatWaves(r.body);
    console.log(`  ${q.padEnd(70)} -> status=${r.status} hasWaves=${has}`);
    if (has) console.log(`    body: ${summarize(r.body)}`);
  }

  // 2) Try resolving combatId directly under common path shapes
  const candidatePaths = [
    `/game/v1/combat/${combatId}`,
    `/game/v1/combat/${combatId}?pieceInfo=full`,
    `/game/v1/combats/${combatId}`,
    `/game/v1/combats/${combatId}?pieceInfo=full`,
    `/game/v1/combatNodes/${combatId}`,
    `/game/v1/combatNodes/${combatId}?pieceInfo=full`,
    `/game/v1/encounter/${combatId}`,
    `/game/v1/encounters/${combatId}`,
    `/game/v1/encounters/${combatId}?pieceInfo=full`,
    `/game/v1/survivalTowers/${towerId}/combat/${combatId}`,
    `/game/v1/survivalTowers/${towerId}/combat/${combatId}?pieceInfo=full`,
    `/game/v1/survivalTowers/${towerId}/combats/${combatId}?pieceInfo=full`,
    `/game/v1/survivalTowers/${towerId}/${roomId}/combat?pieceInfo=full`,
    `/game/v1/survivalTowers/${towerId}/${roomId}/enemies?pieceInfo=full`,
    `/game/v1/survivalTowers/${towerId}/${roomId}?combatId=${combatId}&pieceInfo=full`,
  ];

  console.log(`\n[probe2] === Trying candidate combat resolution endpoints ===`);
  for (const p of candidatePaths) {
    const r = await tryPath(p, token);
    const has = hasCombatWaves(r.body);
    const marker = r.ok ? "OK " : "   ";
    console.log(`  [${marker}${r.status}] hasWaves=${has}  ${p}`);
    if (r.ok || has) {
      console.log(`    body: ${summarize(r.body)}`);
    }
  }

  // 3) Check player-side endpoint for "what enemy am I about to fight"
  console.log(`\n[probe2] === Player-side endpoints ===`);
  const playerPaths = [
    `/player/v1/survivalTowers/${towerId}`,
    `/player/v1/survivalTowers/${towerId}?pieceInfo=full`,
    `/player/v1/survivalTowers/${towerId}/${roomId}`,
    `/player/v1/survivalTowers/${towerId}/${roomId}?pieceInfo=full`,
    `/player/v1/survivalTowers/${towerId}/${roomId}?nodeReqs=full&pieceInfo=full`,
  ];
  for (const p of playerPaths) {
    const r = await tryPath(p, token);
    const has = hasCombatWaves(r.body);
    console.log(`  [${r.status}] hasWaves=${has}  ${p}`);
    if (r.ok && (has || r.status === 200)) {
      console.log(`    body: ${summarize(r.body)}`);
    }
  }
})().catch((e) => {
  console.error("[probe2] FAILED:", e);
  process.exit(1);
});
