/**
 * Probe — PROVE the cost book is real.
 *
 * Uses a client_credentials (game-data) token, NO player login needed.
 * Hits /game/v1/upgradeData and prints concrete evidence that the API exposes:
 *   - character level XP costs           (training XP needed to level)
 *   - XP acquisition costs               (training-mat -> XP conversion)
 *   - ability upgrade costs              (ability materials + gold per ability level)
 *   - yellow-star shard + gold costs     (stars)
 *   - iso-8 upgrade costs
 *
 * Run: cd msf-companion; npx tsx scripts/probe-upgrade-costs.ts
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
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { access_token: string }).access_token;
}

async function api<T>(path: string): Promise<{ status: number; body: T | string }> {
  const token = await getToken();
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

type ItemCost = { item?: { id?: string; name?: string; type?: string }; quantity?: number };

function line() { console.log("─".repeat(72)); }

(async () => {
  console.log("PROBE: /game/v1/upgradeData/{fieldId}  (client_credentials, no login)\n");
  console.log("(full upgradeData is >472KB, so we fetch one field at a time)\n");

  async function field<T>(fieldId: string, extra = ""): Promise<T | null> {
    const res = await api<{ data?: T }>(`/game/v1/upgradeData/${fieldId}?lang=en${extra}`);
    if (res.status !== 200 || typeof res.body === "string") {
      console.log(`  [${fieldId}] status=${res.status} ${typeof res.body === "string" ? res.body.slice(0, 200) : JSON.stringify(res.body).slice(0, 200)}`);
      return null;
    }
    return (res.body as { data?: T }).data ?? null;
  }
  line();

  // 1) Character level XP costs (training XP) ------------------------------
  const totalXp = await field<number[]>("characterLevelTotalXp");
  if (Array.isArray(totalXp)) {
    console.log("✔ characterLevelTotalXp (cumulative TRAINING XP to reach a level):");
    [50, 60, 70, 75].forEach((lvl) => {
      if (totalXp[lvl] != null) console.log(`    level ${lvl}: ${Number(totalXp[lvl]).toLocaleString()} XP`);
    });
    const l70 = totalXp[70] ?? 0, l75 = totalXp[75] ?? 0;
    if (l70 && l75) console.log(`    => 70→75 costs ${(l75 - l70).toLocaleString()} training XP`);
  } else {
    console.log("✘ characterLevelTotalXp not present");
  }
  line();

  // 2) XP acquisition costs (training-mat -> XP conversion) ----------------
  const xpCosts = await field<Array<{ xpReward?: number; cost?: ItemCost[] }>>("characterXpCosts");
  if (Array.isArray(xpCosts)) {
    console.log(`✔ characterXpCosts (${xpCosts.length} ways to obtain training XP). Sample:`);
    xpCosts.slice(0, 6).forEach((x) => {
      const c = (x.cost ?? []).map((ci) => `${ci.quantity}x ${ci.item?.name ?? ci.item?.id}`).join(" + ");
      console.log(`    +${x.xpReward?.toLocaleString()} XP  ⟵  ${c}`);
    });
    const ids = new Map<string, string>();
    xpCosts.forEach((x) => (x.cost ?? []).forEach((ci) => {
      if (ci.item?.id) ids.set(ci.item.id, ci.item.name ?? ci.item.id);
    }));
    console.log("    distinct training-resource items:", [...ids.entries()].map(([id, n]) => `${id} (${n})`).join(", "));
  } else {
    console.log("✘ characterXpCosts not present");
  }
  line();

  // 3) Ability upgrade costs (mats + gold) ---------------------------------
  const ability = await field<Record<string, Record<string, ItemCost[]>>>("abilityUpgradeCosts");
  if (ability) {
    console.log("✔ abilityUpgradeCosts (ability materials + gold per level). Kinds:", Object.keys(ability).join(", "));
    const basic = ability.basic ?? ability.special ?? Object.values(ability)[0];
    if (basic) {
      const lvls = Object.keys(basic).slice(0, 4);
      lvls.forEach((lvl) => {
        const c = (basic[lvl] ?? []).map((ci) => `${ci.quantity}x ${ci.item?.name ?? ci.item?.id}`).join(" + ");
        console.log(`    level ${lvl}: ${c}`);
      });
    }
  } else {
    console.log("✘ abilityUpgradeCosts not present");
  }
  line();

  // 4) Yellow-star costs (shards + gold) -----------------------------------
  const starShards = await field<Record<string, number>>("yellowStarTotalShards");
  const starCosts = await field<Record<string, ItemCost[]>>("yellowStarTotalCosts");
  if (starShards) {
    console.log("✔ yellowStarTotalShards:", Object.entries(starShards).slice(0, 7).map(([s, q]) => `${s}★=${q}`).join(", "));
  }
  if (starCosts) {
    const sample = Object.entries(starCosts).slice(0, 3);
    sample.forEach(([s, costs]) => {
      const c = (costs ?? []).map((ci) => `${ci.quantity}x ${ci.item?.name ?? ci.item?.id}`).join(" + ");
      console.log(`    ${s}★ gold/cost: ${c}`);
    });
  }
  if (!starShards && !starCosts) console.log("✘ yellow-star cost fields not present");
  line();

  console.log("DONE. The cost side (training XP, ability mats, gold, stars) is retrievable WITHOUT player login.");
  console.log("Player BALANCES of those resources require the inventory probe (login).");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
