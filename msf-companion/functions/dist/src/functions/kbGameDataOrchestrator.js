"use strict";
/**
 * Timer-triggered Azure Function: Game Data KB Orchestrator
 * Runs all game data KB syncs in sequence daily at 05:00 UTC.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrateGameDataSync = orchestrateGameDataSync;
const functions_1 = require("@azure/functions");
const kbCharacterSync_js_1 = require("./kbCharacterSync.js");
const kbMetaSync_js_1 = require("./kbMetaSync.js");
const kbDDSync_js_1 = require("./kbDDSync.js");
const kbISO8Sync_js_1 = require("./kbISO8Sync.js");
const kbGearSync_js_1 = require("./kbGearSync.js");
const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";
async function orchestrateGameDataSync(deps, context) {
    const results = [];
    let totalDocs = 0;
    const syncs = [
        { name: "characters", fn: async () => (await deps.syncCharacters()).uploaded },
        { name: "meta", fn: async () => (await deps.syncMeta()).totalDocs },
        { name: "dd", fn: async () => (await deps.syncDD()).uploaded },
        { name: "iso8", fn: async () => (await deps.syncISO8()).indexed },
        { name: "gear", fn: async () => (await deps.syncGear()).uploaded },
    ];
    for (const sync of syncs) {
        try {
            const docs = await sync.fn();
            results.push({ name: sync.name, success: true, docsUploaded: docs });
            totalDocs += docs;
            context.log(`✅ ${sync.name}: ${docs} documents uploaded`);
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            results.push({ name: sync.name, success: false, docsUploaded: 0, error: errorMsg });
            context.warn(`❌ ${sync.name} failed: ${errorMsg}`);
        }
    }
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    context.log(`Orchestrator complete: ${succeeded} succeeded, ${failed} failed, ${totalDocs} total documents`);
    return { results, totalDocs };
}
functions_1.app.timer("kbGameDataOrchestrator", {
    schedule: "0 0 5 * * *", // 05:00 UTC daily
    handler: async (_timer, context) => {
        context.log("Starting game data KB orchestrator");
        if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
            context.error("Azure AI Search not configured (AZURE_AI_SEARCH_ENDPOINT or AZURE_AI_SEARCH_KEY missing) — exiting");
            return;
        }
        const uploadToSearch = async (docs) => {
            if (docs.length === 0)
                return { succeeded: 0, failed: 0 };
            const batchSize = 100;
            let succeeded = 0;
            let failed = 0;
            for (let i = 0; i < docs.length; i += batchSize) {
                const batch = docs.slice(i, i + batchSize);
                const response = await fetch(`${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/index?api-version=2024-07-01`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
                    body: JSON.stringify({
                        value: batch.map((doc) => ({ "@search.action": "mergeOrUpload", ...doc })),
                    }),
                });
                if (response.ok)
                    succeeded += batch.length;
                else
                    failed += batch.length;
            }
            return { succeeded, failed };
        };
        const fetchCharactersFromAPI = async () => {
            const characters = [];
            let page = 1;
            while (true) {
                const response = await fetch(`${MSF_API_BASE}/game/v1/characters?lang=en&page=${page}&perPage=200`, { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } });
                if (!response.ok)
                    break;
                const data = (await response.json());
                for (const c of data.data || []) {
                    characters.push({
                        id: c.id,
                        name: c.name || c.id,
                        traits: c.traits || [],
                        abilities: (c.abilities || []).map((a) => ({ name: a.name || "", description: a.description || "" })),
                        teams: c.teams || [],
                    });
                }
                const totalPages = data.meta?.pagination?.totalPages || 1;
                if (page >= totalPages)
                    break;
                page++;
            }
            return characters;
        };
        const fetchCharacterNamesFromAPI = async () => {
            const names = new Map();
            const response = await fetch(`${MSF_API_BASE}/game/v1/characters?lang=en&page=1&perPage=500`, { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } });
            if (!response.ok)
                return names;
            const data = (await response.json());
            for (const c of data.data || []) {
                if (c.name)
                    names.set(c.id, c.name);
            }
            return names;
        };
        const fetchMetaTeamsFromAPI = async (_mode, endpoint) => {
            const response = await fetch(`${MSF_API_BASE}${endpoint}?page=1&perPage=50`, { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } });
            if (!response.ok)
                return [];
            const data = (await response.json());
            return (data.data || []).map((t, i) => ({
                characters: t.characters || [],
                total: t.total || t.defends || 0,
                wins: t.wins || t.defeats || 0,
                rank: i + 1,
            }));
        };
        const fetchDDDataFromAPI = async () => {
            const response = await fetch(`${MSF_API_BASE}/game/v1/dds?raidInfo=full&raidMap=full&lang=en`, { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } });
            if (!response.ok)
                return [];
            const data = (await response.json());
            return (data.data || []).map((dd) => ({
                dd: { id: dd.id, name: dd.name || dd.id },
                nodes: (dd.nodes || []).map((n) => ({
                    id: n.id,
                    nodeNumber: n.nodeNumber || 0,
                    section: n.section || "Unknown",
                    requiredTraits: n.requiredTraits || [],
                    enemies: (n.enemies || []).map((e) => ({ name: e.name || "Unknown", power: e.power })),
                })),
            }));
        };
        const fetchISO8DataFromAPI = async () => {
            const charResponse = await fetch(`${MSF_API_BASE}/game/v1/characters?lang=en&page=1&perPage=500`, { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } });
            const charNames = new Map();
            if (charResponse.ok) {
                const charData = (await charResponse.json());
                for (const c of charData.data || []) {
                    if (c.name)
                        charNames.set(c.id, c.name);
                }
            }
            const isoResponse = await fetch(`${MSF_API_BASE}/game/v1/iso8Abilities`, { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } });
            if (!isoResponse.ok)
                return [];
            const isoData = (await isoResponse.json());
            return (isoData.data || []).map((entry) => {
                const sorted = (entry.classes || []).sort((a, b) => b.percent - a.percent);
                const top = sorted[0];
                return {
                    characterId: entry.characterId,
                    characterName: charNames.get(entry.characterId) || entry.characterId,
                    isoData: {
                        topClass: top?.name || "Unknown",
                        topClassPercent: top?.percent || 0,
                        runnerUps: sorted.slice(1, 3).map((c) => ({ className: c.name, percent: c.percent })),
                    },
                };
            });
        };
        const fetchGearDataFromAPI = async () => {
            const response = await fetch(`${MSF_API_BASE}/game/v1/upgradeData?pieceInfo=full&pieceFlatCost=full&pieceDirectCost=full`, { headers: { "x-api-key": MSF_API_KEY, "Accept": "application/json" } });
            if (!response.ok)
                return [];
            const data = (await response.json());
            return (data.data || [])
                .filter((d) => (d.tier || 0) >= 16 && (d.tier || 0) <= 20)
                .map((d) => ({
                tier: d.tier || 0,
                origin: d.origin || "General",
                items: (d.pieces || []).map((p) => ({
                    name: p.name || "Unknown",
                    quantity: p.quantity || 1,
                    farmable: p.farmable ?? false,
                })),
            }));
        };
        const deps = {
            syncCharacters: async () => {
                const charDeps = {
                    fetchCharacters: fetchCharactersFromAPI,
                    uploadDocuments: uploadToSearch,
                };
                const result = await (0, kbCharacterSync_js_1.syncCharacterKits)(charDeps, context);
                return { uploaded: result.uploaded };
            },
            syncMeta: async () => {
                const metaDeps = {
                    fetchCharacterNames: fetchCharacterNamesFromAPI,
                    fetchMetaTeams: fetchMetaTeamsFromAPI,
                    uploadDocuments: uploadToSearch,
                };
                const result = await (0, kbMetaSync_js_1.syncMeta)(metaDeps, context);
                return { totalDocs: result.totalDocs };
            },
            syncDD: async () => {
                const ddDeps = {
                    fetchDDData: fetchDDDataFromAPI,
                    uploadDocuments: uploadToSearch,
                };
                const result = await (0, kbDDSync_js_1.syncDDNodes)(ddDeps, context);
                return { uploaded: result.uploaded };
            },
            syncISO8: async () => {
                const isoDeps = {
                    fetchISO8Data: fetchISO8DataFromAPI,
                    uploadDocuments: uploadToSearch,
                };
                const result = await (0, kbISO8Sync_js_1.syncISO8)(isoDeps, context);
                return { indexed: result.indexed };
            },
            syncGear: async () => {
                const gearDeps = {
                    fetchGearData: fetchGearDataFromAPI,
                    uploadDocuments: uploadToSearch,
                };
                const result = await (0, kbGearSync_js_1.syncGear)(gearDeps, context);
                return { uploaded: result.uploaded };
            },
        };
        await orchestrateGameDataSync(deps, context);
    },
});
//# sourceMappingURL=kbGameDataOrchestrator.js.map