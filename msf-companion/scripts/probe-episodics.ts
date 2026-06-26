/**
 * Probe — PROVE the encounter→team→requirement data exists for unlock events.
 *
 * Uses a client_credentials (game-data) token, NO player login needed.
 *
 *  1. Lists episodic events from /game/v1/events (the structure behind
 *     character-unlock events like Annihilus / Nihilist sagas).
 *  2. For each episodic, fetches /game/v1/episodics/{type}/{id}?nodeReqs=full
 *     and walks chapters → tiers → nodes, printing the PER-NODE (per-encounter)
 *     requirements: traits, gearTier, level, activeYellow, specific characters.
 *  3. Reports whether each encounter exposes its own distinct team gate
 *     (the thing we need for an outcome-first "Unlock Planner").
 *
 * Optional: pass a name filter to focus on one event, e.g.
 *   npx tsx scripts/probe-episodics.ts annihilus
 *
 * Run: cd msf-companion; npx tsx scripts/probe-episodics.ts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const MSF_API_BASE = "https://api.marvelstrikeforce.com";
const HYDRA_TOKEN_URL = "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";

let cachedToken: string | null = null;
async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const id = process.env.SCOPELY_CLIENT_ID!;
  const secret = process.env.SCOPELY_CLIENT_SECRET!;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch(HYDRA_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  cachedToken = ((await r.json()) as { access_token: string }).access_token;
  return cachedToken;
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

function line() { console.log("─".repeat(74)); }

// ---- requirement extraction (mirrors planner-events.ts shapes) ----
type TraitRef = string | { id?: string };
interface CharFilter {
  allTraits?: TraitRef[];
  anyTraits?: TraitRef[];
  anyCharacters?: string[];
  gearTier?: number;
  activeYellow?: number;
  level?: number;
}
interface RawReqs {
  anyCharacterFilters?: CharFilter[];
  specificCharacters?: string[];
}
interface Node {
  id?: string;
  name?: string;
  requirements?: RawReqs;
  rewards?: unknown;
}
interface Tier { id?: string; name?: string; requirements?: RawReqs; nodes?: Record<string, Node> }
interface Chapter { id?: string; name?: string; tiers?: Record<string, Tier>; nodes?: Record<string, Node> }
interface EpisodicDetail {
  data?: {
    name?: string;
    rewards?: unknown;
    requirements?: RawReqs;
    nodes?: Record<string, Node>;
    chapters?: Record<string, Chapter>;
  };
}

function trait(t: TraitRef): string { return typeof t === "string" ? t : t.id ?? "?"; }

function summarizeReqs(reqs?: RawReqs): string {
  if (!reqs) return "(none)";
  const parts: string[] = [];
  for (const f of reqs.anyCharacterFilters ?? []) {
    const tr = [...(f.allTraits ?? []), ...(f.anyTraits ?? [])].map(trait);
    const gates: string[] = [];
    if (tr.length) gates.push(`traits:[${tr.join(",")}]`);
    if (f.anyCharacters?.length) gates.push(`chars:[${f.anyCharacters.join(",")}]`);
    if (f.gearTier != null) gates.push(`G${f.gearTier}`);
    if (f.activeYellow != null) gates.push(`${f.activeYellow}★`);
    if (f.level != null) gates.push(`L${f.level}`);
    if (gates.length) parts.push(gates.join(" "));
  }
  if (reqs.specificCharacters?.length) parts.push(`specific:[${reqs.specificCharacters.join(",")}]`);
  return parts.length ? parts.join("  |  ") : "(empty)";
}

function hasGates(reqs?: RawReqs): boolean {
  if (!reqs) return false;
  if (reqs.specificCharacters?.length) return true;
  return (reqs.anyCharacterFilters ?? []).some(
    (f) => (f.allTraits?.length || f.anyTraits?.length || f.anyCharacters?.length || f.gearTier != null || f.activeYellow != null || f.level != null),
  );
}

interface RawEvent {
  id: string;
  name?: string;
  type?: string;
  endTime?: number | string;
  episodic?: { type?: string; ids?: string[]; id?: string };
}

(async () => {
  const filter = (process.argv[2] ?? "").toLowerCase();
  console.log("PROBE: episodic encounter → team requirements  (client_credentials, no login)\n");
  if (filter) console.log(`Filtering events whose name contains: "${filter}"\n`);

  // 1) list events --------------------------------------------------------
  const evRes = await api<{ data?: RawEvent[] }>("/game/v1/events?perPage=50&eventInfo=full");
  if (evRes.status !== 200 || typeof evRes.body === "string") {
    console.log(`✘ events endpoint status=${evRes.status}:`, String(evRes.body).slice(0, 300));
    process.exit(1);
  }
  const all = evRes.body.data ?? [];
  const episodics = all.filter((e) => e.type === "episodic" && e.episodic);
  console.log(`Total events: ${all.length} · episodic events: ${episodics.length}`);
  console.log("All event types present:", [...new Set(all.map((e) => e.type))].join(", "));
  line();
  console.log("Episodic events found:");
  episodics.forEach((e) => console.log(`  • ${e.name ?? e.id}  [type=${e.episodic?.type}  ids=${(e.episodic?.ids ?? [e.episodic?.id]).join(",")}]`));
  line();

  const targets = filter
    ? episodics.filter((e) => (e.name ?? e.id).toLowerCase().includes(filter))
    : episodics;

  if (targets.length === 0) {
    console.log(filter ? `No episodic event matched "${filter}". Re-run without a filter to dump all.` : "No episodic events live right now.");
    console.log("\nNOTE: character-unlock sagas (e.g. Annihilus) may not be currently active.");
    console.log("If none are live, we'll need a live one — or to inspect the /game/v1/episodics catalog directly.");
    process.exit(0);
  }

  const dump: Record<string, unknown> = {};

  // 2) walk each episodic --------------------------------------------------
  for (const ev of targets) {
    const epType = ev.episodic?.type;
    const epIds = ev.episodic?.ids ?? (ev.episodic?.id ? [ev.episodic.id] : []);
    for (const epId of epIds) {
      console.log(`\n══ ${ev.name ?? ev.id}  →  /game/v1/episodics/${epType}/${epId}`);
      const detRes = await api<EpisodicDetail>(`/game/v1/episodics/${epType}/${epId}?nodeReqs=full&traitFormat=id&rewardInfo=full`);
      if (detRes.status !== 200 || typeof detRes.body === "string") {
        console.log(`   ✘ status=${detRes.status}:`, String(detRes.body).slice(0, 200));
        continue;
      }
      const d = (detRes.body as EpisodicDetail).data ?? (detRes.body as EpisodicDetail);
      dump[`${epType}/${epId}`] = d;

      let nodeCount = 0;
      let nodesWithGates = 0;
      const distinctGateSets = new Set<string>();

      const visitNode = (where: string, node: Node) => {
        nodeCount++;
        const gated = hasGates(node.requirements);
        if (gated) { nodesWithGates++; distinctGateSets.add(summarizeReqs(node.requirements)); }
        console.log(`   ${where}${node.name ? ` "${node.name}"` : ""}: ${summarizeReqs(node.requirements)}`);
      };

      const dd = d as EpisodicDetail["data"];
      if (dd?.requirements && hasGates(dd.requirements)) {
        console.log(`   [event-level] ${summarizeReqs(dd.requirements)}`);
      }
      if (dd?.nodes) {
        Object.entries(dd.nodes).forEach(([k, n]) => visitNode(`node[${k}]`, n));
      }
      if (dd?.chapters) {
        for (const [ck, ch] of Object.entries(dd.chapters)) {
          if (ch.tiers) {
            for (const [tk, ti] of Object.entries(ch.tiers)) {
              if (ti.requirements && hasGates(ti.requirements)) console.log(`   ch[${ck}] tier[${tk}] (tier-level): ${summarizeReqs(ti.requirements)}`);
              if (ti.nodes) Object.entries(ti.nodes).forEach(([k, n]) => visitNode(`ch[${ck}] tier[${tk}] node[${k}]`, n));
            }
          }
          if (ch.nodes) Object.entries(ch.nodes).forEach(([k, n]) => visitNode(`ch[${ck}] node[${k}]`, n));
        }
      }

      console.log(`   ── nodes: ${nodeCount} · with team gates: ${nodesWithGates} · DISTINCT gate-sets: ${distinctGateSets.size}`);
      if (distinctGateSets.size > 1) {
        console.log(`   ✔ PER-ENCOUNTER team requirements ARE distinct → outcome-first team rollup is BUILDABLE.`);
      } else if (nodesWithGates > 0) {
        console.log(`   ⚠ All gated nodes share ONE requirement set → only a single aggregate gate is exposed.`);
      } else {
        console.log(`   ✘ No per-node team gates found in this episodic.`);
      }
    }
  }

  const out = join(tmpdir(), "msf-episodics-dump.json");
  writeFileSync(out, JSON.stringify(dump, null, 2));
  line();
  console.log(`Full raw episodic structure written to ${out} for offline analysis.`);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
