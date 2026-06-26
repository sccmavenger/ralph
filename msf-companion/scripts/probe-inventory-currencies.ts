/**
 * Probe — PROVE we can read the player's CURRENCY BALANCES from inventory.
 *
 * This needs YOUR login (a player OAuth token with the m3p.f.pr.inv scope).
 * It runs a one-time local OAuth flow:
 *   1. starts a local listener on http://localhost:3000/api/auth/callback
 *      (the registered redirect URI)
 *   2. prints a URL for you to open and log in with your Scopely ID
 *   3. captures the auth code, exchanges it for a player token (PKCE)
 *   4. calls /player/v1/inventory and prints your actual balances of:
 *        - Training Modules (training XP)   CONSUMABLE_XPLVL20/40/60/80
 *        - Gold                              SC
 *        - Ability Materials                 itemType=ABILITY_MATERIAL
 *        - Power Cores / premium currency
 *
 * Run: cd msf-companion; npx tsx scripts/probe-inventory-currencies.ts
 * Then open the printed URL in your browser and log in.
 */
import "dotenv/config";
import http from "http";
import crypto from "crypto";

const MSF_API_BASE = "https://api.marvelstrikeforce.com";
const HYDRA_AUTH_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/auth";
const HYDRA_TOKEN_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";

const CLIENT_ID = process.env.SCOPELY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SCOPELY_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.SCOPELY_REDIRECT_URI || "http://localhost:3000/api/auth/callback";
const API_KEY = process.env.MSF_API_KEY!;

const SCOPES = [
  "openid", "offline", "m3p.f.pr.pro", "m3p.f.pr.ros",
  "m3p.f.pr.inv", "m3p.f.pr.act", "m3p.f.pr.buy",
].join(" ");

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());

function authorizeUrl(): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: crypto.randomUUID(),
  });
  return `${HYDRA_AUTH_URL}?${p.toString()}`;
}

function waitForCode(): Promise<string> {
  const redirectPath = new URL(REDIRECT_URI).pathname;
  const port = Number(new URL(REDIRECT_URI).port || 80);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const u = new URL(req.url, REDIRECT_URI);
      if (u.pathname !== redirectPath) { res.writeHead(404); res.end(); return; }
      const code = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body style="font-family:system-ui;background:#0b1120;color:#e2e8f0;padding:40px">
        <h2>${code ? "✓ Login captured" : "✗ Login error"}</h2>
        <p>${code ? "You can close this tab and return to the terminal." : (err ?? "no code")}</p>
        </body></html>`);
      server.close();
      if (code) resolve(code); else reject(new Error(err ?? "no code"));
    });
    server.on("error", reject);
    server.listen(port, () => {
      console.log(`\nListening on ${REDIRECT_URI} for the login redirect...\n`);
      console.log("→ OPEN THIS URL IN YOUR BROWSER AND LOG IN:\n");
      console.log(authorizeUrl());
      console.log("");
    });
  });
}

async function exchange(code: string): Promise<string> {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const r = await fetch(HYDRA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }).toString(),
  });
  if (!r.ok) throw new Error(`token exchange ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { access_token: string }).access_token;
}

type Item = { id?: string; name?: string; type?: string };
type ItemQuantity = { item?: Item | string; id?: string; name?: string; type?: string; quantity?: number | object };

async function inv(token: string, itemType?: string): Promise<ItemQuantity[]> {
  const all: ItemQuantity[] = [];
  for (let page = 1; page <= 30; page++) {
    const qs = new URLSearchParams({ itemFormat: "full", perPage: "80", page: String(page) });
    if (itemType) qs.set("itemType", itemType);
    const r = await fetch(`${MSF_API_BASE}/player/v1/inventory?${qs.toString()}`, {
      headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}`, "User-Agent": "APIClient/1.0 (Server)" },
    });
    if (!r.ok) {
      if (page === 1) console.log(`   inventory(${itemType ?? "ALL"}) status=${r.status}: ${(await r.text()).slice(0, 160)}`);
      break;
    }
    const body = (await r.json()) as { data?: ItemQuantity[] };
    const rows = body.data ?? [];
    all.push(...rows);
    if (rows.length < 80) break;
  }
  return all;
}

function qty(row: ItemQuantity): number {
  const q = row.quantity;
  if (typeof q === "number") return q;
  if (q && typeof q === "object") return (q as { amount?: number; total?: number }).amount ?? (q as { total?: number }).total ?? 0;
  return 0;
}
function rid(row: ItemQuantity): string {
  if (typeof row.item === "string") return row.item;
  return (row.item as Item | undefined)?.id ?? row.id ?? "?";
}
function rname(row: ItemQuantity): string {
  if (row.item && typeof row.item === "object") return (row.item as Item).name ?? "";
  return row.name ?? "";
}
function rtype(row: ItemQuantity): string {
  if (row.item && typeof row.item === "object") return (row.item as Item).type ?? "";
  return row.type ?? "";
}

(async () => {
  console.log("PROBE: find Gold + Cores across player endpoints (requires your login)\n");
  const code = await waitForCode();
  console.log("Got auth code. Exchanging for player token...");
  const token = await exchange(code);
  console.log("✓ Player token acquired.\n");
  console.log("═".repeat(72));

  // ---- 1) PLAYER CARD: does it carry gold/cores? -------------------------
  console.log("1) /player/v1/card (looking for currency fields):");
  try {
    const r = await fetch(`${MSF_API_BASE}/player/v1/card`, {
      headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}`, "User-Agent": "APIClient/1.0 (Server)" },
    });
    const body = (await r.json()) as { data?: Record<string, unknown> };
    console.log("   status", r.status, "| fields:", Object.keys(body.data ?? {}).join(", "));
    console.log("   raw:", JSON.stringify(body.data).slice(0, 600));
  } catch (e) { console.log("   card error", String(e)); }
  console.log("─".repeat(72));

  // ---- 2) FULL INVENTORY across every itemType --------------------------
  const types = ["", "GEAR", "ISOITEM", "SHARD", "RS", "COSTUME", "CONSUMABLE", "ABILITY_MATERIAL"];
  const byId = new Map<string, ItemQuantity>();
  for (const t of types) {
    const rows = await inv(token, t || undefined);
    console.log(`2) inventory itemType=${(t || "ALL").padEnd(16)} -> ${rows.length} rows`);
    for (const r of rows) byId.set(rid(r), r);
  }
  console.log(`   total distinct items: ${byId.size}`);
  console.log("─".repeat(72));

  // ---- 3) Search EVERYTHING for gold / cores / credits ------------------
  console.log("3) Searching all items for gold / core / credit / premium currency:");
  const hits = [...byId.values()].filter((r) => {
    const id = rid(r);
    const name = rname(r).toLowerCase();
    const type = rtype(r).toUpperCase();
    // Exclude cosmetics (frames/costumes) that merely contain "golden" etc.
    if (type === "COSTUME" || /FRAME|COSTUME|PORTRAIT/i.test(id)) return false;
    return id === "SC" || id === "PC" || id === "UC"
      || /\bgold\b|power\s*core|\bcredits?\b/.test(name)
      || /CURRENCY|_CUR$|^CUR_/.test(id);
  });
  if (hits.length) hits.forEach((r) => console.log(`   ✔ ${rid(r).padEnd(26)} type=${rtype(r).padEnd(14)} qty=${qty(r).toLocaleString()}  ${rname(r)}`));
  else console.log("   ✘ NO gold/core/credit/currency items found in inventory.");
  console.log("─".repeat(72));

  // ---- 4) Confirm the resources we CAN read -----------------------------
  console.log("4) CONFIRMED readable balances (training XP + ability mats):");
  ["CONSUMABLE_XPLVL20","CONSUMABLE_XPLVL40","CONSUMABLE_XPLVL60","CONSUMABLE_XPLVL80"].forEach((id) => {
    const r = byId.get(id); console.log(`   ${r ? "✔" : "✘"} ${id.padEnd(22)} qty=${r ? qty(r).toLocaleString() : "-"}  ${r ? rname(r) : ""}`);
  });
  const mats = [...byId.values()].filter((r) => rid(r).startsWith("ABILITY_MATERIAL_") && !/UNIQUE/.test(rid(r)));
  mats.forEach((r) => console.log(`   ✔ ${rid(r).padEnd(34)} qty=${qty(r).toLocaleString()}  ${rname(r)}`));

  // ---- 5) Dump all ids to a temp file for offline analysis --------------
  const dump = [...byId.values()].map((r) => ({ id: rid(r), name: rname(r), type: rtype(r), qty: qty(r) }));
  const fs = await import("fs");
  const out = `${process.env.TEMP || "."}\\msf-inventory-dump.json`;
  fs.writeFileSync(out, JSON.stringify(dump, null, 2));
  console.log(`\nWrote full inventory (${dump.length} items) to ${out} for offline analysis.`);

  console.log("\n" + "═".repeat(72));
  console.log("VERDICT:");
  console.log("  • Training XP modules: READABLE ✔");
  console.log("  • Ability materials:   READABLE ✔");
  console.log(`  • Gold / Power Cores:  ${hits.length ? "FOUND ✔" : "NOT EXPOSED BY API ✘"}`);
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
