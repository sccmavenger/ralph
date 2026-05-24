/**
 * Probe: do MSF survivalTowers room-detail responses include enemy `combat` data
 * (waves -> units -> stats.power), the way Dark Dimensions node-detail responses do?
 *
 * Run with:
 *   cd msf-companion
 *   npx tsx scripts/probe-tower-enemy-data.ts [towerId]
 *
 * If towerId is omitted, the probe picks the first tower from /game/v1/survivalTowers.
 */
import "dotenv/config";

const MSF_API_BASE = "https://api.marvelstrikeforce.com";
const HYDRA_TOKEN_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";

async function getToken(): Promise<string> {
  const id = process.env.SCOPELY_CLIENT_ID;
  const secret = process.env.SCOPELY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing SCOPELY_CLIENT_ID/SECRET in .env");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch(HYDRA_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`token fetch failed: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { access_token: string }).access_token;
}

async function api<T>(path: string, token: string): Promise<T> {
  const r = await fetch(`${MSF_API_BASE}${path}`, {
    headers: {
      "x-api-key": process.env.MSF_API_KEY!,
      Authorization: `Bearer ${token}`,
      "User-Agent": "APIClient/1.0 (Server)",
    },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

function topKeys(obj: unknown, depth = 0, maxDepth = 3): string[] {
  if (depth >= maxDepth || obj === null || typeof obj !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const t = Array.isArray(v) ? `array(${v.length})` : typeof v;
    out.push(`${"  ".repeat(depth)}${k}: ${t}`);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out.push(...topKeys(v, depth + 1, maxDepth));
    } else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
      out.push(`${"  ".repeat(depth + 1)}[0]:`);
      out.push(...topKeys(v[0], depth + 2, maxDepth));
    }
  }
  return out;
}

(async () => {
  const token = await getToken();
  const argTowerId = process.argv[2];

  // 1) Pick a tower
  let towerId = argTowerId;
  if (!towerId) {
    const list = await api<{ data?: Array<{ id: string; name?: string }> }>(
      "/game/v1/survivalTowers?raidInfo=full&perPage=20",
      token,
    );
    if (!list.data?.length) throw new Error("No towers returned from /game/v1/survivalTowers");
    towerId = list.data[0].id;
    console.log(`[probe] Auto-picked tower: ${towerId} (${list.data[0].name ?? "?"})`);
    console.log(`[probe] Available towers:`);
    for (const t of list.data) console.log(`        - ${t.id} (${t.name ?? "?"})`);
  }

  // 2) Get layout to find a room id
  const layout = await api<{ data?: { rays?: string[][] } }>(
    `/game/v1/survivalTowers/${towerId}`,
    token,
  );
  const rays = layout.data?.rays ?? [];
  const firstRoomId = rays.flat().find((id) => id && id.trim() !== "");
  if (!firstRoomId) throw new Error("No rooms in tower layout");
  console.log(`\n[probe] Tower ${towerId} has ${rays.length} rays, first room: ${firstRoomId}`);

  // 3) Fetch room detail with full piece info (same query our app already uses)
  const path = `/game/v1/survivalTowers/${towerId}/${firstRoomId}?nodeReqs=full&pieceInfo=full&traitFormat=id`;
  console.log(`\n[probe] GET ${path}`);
  const detail = await api<{ data?: Record<string, unknown> }>(path, token);
  const d = detail.data ?? {};

  console.log("\n========= Top-level keys (data) =========");
  console.log(topKeys(d, 0, 2).join("\n"));

  // 4) Key question: is there a `combat` field with waves/units/stats?
  const combat = (d as { combat?: unknown }).combat;
  console.log("\n========= Has `combat`? =========");
  console.log(combat ? "YES" : "NO");

  if (combat && typeof combat === "object") {
    console.log("\n========= combat structure =========");
    console.log(topKeys(combat, 0, 4).join("\n"));

    // Specifically: look for waves[].units[].stats.power
    const sides = ["left", "right"] as const;
    for (const side of sides) {
      const s = (combat as Record<string, unknown>)[side] as
        | { waves?: Array<{ units?: Array<Record<string, unknown>> }> }
        | undefined;
      const waves = s?.waves ?? [];
      for (let wi = 0; wi < waves.length; wi++) {
        const units = waves[wi].units ?? [];
        for (let ui = 0; ui < units.length; ui++) {
          const u = units[ui];
          const stats = (u.stats as Record<string, number> | undefined) ?? {};
          console.log(
            `  ${side}.wave[${wi}].unit[${ui}]: id=${u.id} lvl=${u.level} gt=${u.gearTier} stars=${u.activeYellow} power=${stats.power ?? "(no stats.power)"}`,
          );
        }
      }
    }
  } else {
    console.log("\n[probe] No `combat` field on tower room. Checking for related fields...");
    console.log("        combatId:", (d as { combatId?: string }).combatId ?? "(none)");
    // Dump full data for inspection
    console.log("\n========= FULL data dump (truncated to 4000 chars) =========");
    const json = JSON.stringify(d, null, 2);
    console.log(json.length > 4000 ? json.slice(0, 4000) + "\n...(truncated)" : json);
  }

  // 5) Also test: does the tower-LIST endpoint expose `teams` we could derive opponent power from?
  console.log("\n========= Tower list `teams` field =========");
  const list = await api<{ data?: Array<{ id: string; teams?: unknown }> }>(
    `/game/v1/survivalTowers?raidInfo=full&perPage=20`,
    token,
  );
  const me = list.data?.find((t) => t.id === towerId);
  console.log("teams =", JSON.stringify(me?.teams, null, 2)?.slice(0, 600) ?? "(none)");
})().catch((e) => {
  console.error("[probe] FAILED:", e);
  process.exit(1);
});
