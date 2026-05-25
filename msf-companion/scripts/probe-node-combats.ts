/**
 * Probe 3 — try the documented /game/v1/nodeCombats/{combatId} endpoint.
 * Discovered in msf-api/msf-api.json (we missed it in probe 2).
 *
 * Run: cd msf-companion; npx tsx scripts/probe-node-combats.ts
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

async function api<T>(path: string, token: string): Promise<{ status: number; body: T | string }> {
  const r = await fetch(`${MSF_API_BASE}${path}`, {
    headers: {
      "x-api-key": process.env.MSF_API_KEY!,
      Authorization: `Bearer ${token}`,
      "User-Agent": "APIClient/1.0 (Server)",
    },
  });
  const text = await r.text();
  try { return { status: r.status, body: JSON.parse(text) as T }; }
  catch { return { status: r.status, body: text }; }
}

function unitSummary(u: Record<string, unknown>): string {
  const stats = (u.stats as Record<string, number> | undefined) ?? {};
  const info = (u.info as Record<string, unknown> | undefined) ?? {};
  return `id=${u.id} name="${info.name ?? "?"}" lvl=${u.level} gt=${u.gearTier} stars=${u.activeYellow} red=${u.activeRed} power=${stats.power ?? "?"} hp=${stats.health ?? "?"} dmg=${stats.damage ?? "?"}`;
}

function dumpSide(label: string, side: { waves?: Array<{ units?: Array<Record<string, unknown>> }> } | undefined) {
  if (!side?.waves) { console.log(`  ${label}: (no waves)`); return; }
  console.log(`  ${label}: ${side.waves.length} wave(s)`);
  side.waves.forEach((w, wi) => {
    const units = w.units ?? [];
    console.log(`    wave[${wi}] (${units.length} units):`);
    units.forEach((u, ui) => console.log(`      [${ui}] ${unitSummary(u)}`));
  });
}

(async () => {
  const token = await getToken();
  const tower = process.argv[2] ?? "survivaltower_war_02";
  const room = process.argv[3] ?? "A1";

  // 1) Get the combatId from the room
  const roomDetail = await api<{ data?: { combatId?: string; name?: string } }>(
    `/game/v1/survivalTowers/${tower}/${room}?nodeReqs=full&pieceInfo=full&traitFormat=id`,
    token,
  );
  const data = (roomDetail.body as { data?: { combatId?: string; name?: string } }).data;
  const combatId = data?.combatId;
  console.log(`[probe3] Tower ${tower} Room ${room} ("${data?.name}") combatId=${combatId}`);
  if (!combatId) return;

  // 2) Try the documented endpoint with no difficulty group
  const variants = [
    `/game/v1/nodeCombats/${combatId}`,
    `/game/v1/nodeCombats/${combatId}?charInfo=full`,
    `/game/v1/nodeCombats/${combatId}?charInfo=full&traitFormat=id`,
    `/game/v1/nodeCombats/${combatId}?charInfo=full&difficultyGroup=${tower}`,
    `/game/v1/nodeCombats/${combatId}?charInfo=full&difficultyGroup=${tower}&difficulty=0`,
    `/game/v1/nodeCombats/${combatId}?charInfo=full&difficultyGroup=${tower}&difficulty=1`,
    `/game/v1/nodeCombats/${combatId}?charInfo=full&difficultyGroup=${tower}&difficulty=2`,
  ];

  for (const path of variants) {
    console.log(`\n[probe3] GET ${path}`);
    const r = await api<{ data?: { left?: unknown; right?: unknown; map?: unknown }; meta?: unknown }>(path, token);
    console.log(`  status=${r.status}`);
    if (r.status !== 200) {
      console.log(`  body: ${typeof r.body === "string" ? r.body.slice(0, 400) : JSON.stringify(r.body).slice(0, 400)}`);
      continue;
    }
    const nc = (r.body as { data?: { left?: unknown; right?: unknown; map?: unknown } }).data;
    if (!nc) { console.log("  (no data)"); continue; }
    console.log(`  top-level keys on data: ${Object.keys(nc).join(", ")}`);
    dumpSide("left", nc.left as { waves?: Array<{ units?: Array<Record<string, unknown>> }> } | undefined);
    dumpSide("right", nc.right as { waves?: Array<{ units?: Array<Record<string, unknown>> }> } | undefined);
  }

  // 3) Probe a few more cells in the same tower to see how scaling differs
  console.log(`\n[probe3] === Comparing power across multiple cells of ${tower} ===`);
  const cells = ["A1", "A2", "A3", "B1", "C1", "G1"];
  const totals: Array<{ room: string; combatId?: string; totalPower: number; unitCount: number }> = [];
  for (const cell of cells) {
    const rd = await api<{ data?: { combatId?: string } }>(
      `/game/v1/survivalTowers/${tower}/${cell}?nodeReqs=full&pieceInfo=full&traitFormat=id`,
      token,
    );
    const cid = (rd.body as { data?: { combatId?: string } }).data?.combatId;
    if (!cid) { totals.push({ room: cell, totalPower: 0, unitCount: 0 }); continue; }
    const nc = await api<{ data?: { left?: { waves?: Array<{ units?: Array<{ stats?: { power?: number } }> }> } } }>(
      `/game/v1/nodeCombats/${cid}?charInfo=full&difficultyGroup=${tower}`,
      token,
    );
    if (nc.status !== 200) { totals.push({ room: cell, combatId: cid, totalPower: 0, unitCount: 0 }); continue; }
    let total = 0, count = 0;
    const waves = (nc.body as { data?: { left?: { waves?: Array<{ units?: Array<{ stats?: { power?: number } }> }> } } }).data?.left?.waves ?? [];
    for (const w of waves) for (const u of (w.units ?? [])) {
      total += (u.stats?.power ?? 0);
      count++;
    }
    totals.push({ room: cell, combatId: cid, totalPower: total, unitCount: count });
  }
  console.table(totals);
})().catch(e => { console.error("[probe3] FAILED:", e); process.exit(1); });
