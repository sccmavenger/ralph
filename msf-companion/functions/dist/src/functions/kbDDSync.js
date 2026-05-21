"use strict";
/**
 * Timer-triggered Azure Function: Dark Dimension Node Requirements KB Sync
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncDDNodes = syncDDNodes;
const functions_1 = require("@azure/functions");
const kbGameData_js_1 = require("../lib/kbGameData.js");
const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
const MSF_API_KEY = process.env.MSF_API_KEY || "";
const MSF_API_BASE = "https://api.marvelstrikeforce.com";
async function syncDDNodes(deps, context) {
    const ddList = await deps.fetchDDData();
    context.log(`Fetched ${ddList.length} Dark Dimensions`);
    const docs = [];
    let skipped = 0;
    for (const { dd, nodes } of ddList) {
        for (const node of nodes) {
            try {
                if (!node.id || node.enemies.length === 0) {
                    skipped++;
                    continue;
                }
                docs.push((0, kbGameData_js_1.generateDDNodeDoc)(dd, node));
            }
            catch {
                skipped++;
            }
        }
    }
    const result = await deps.uploadDocuments(docs);
    context.log(`DD sync complete: ${result.succeeded} uploaded, ${skipped} skipped`);
    return {
        dds: ddList.length,
        nodes: docs.length,
        skipped,
        uploaded: result.succeeded,
    };
}
async function fetchDDDataFromAPI() {
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
}
async function uploadToSearch(docs) {
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
}
functions_1.app.timer("kbDDSync", {
    schedule: "0 30 5 * * *", // 05:30 UTC daily
    handler: async (_timer, context) => {
        context.log("Starting Dark Dimension KB sync");
        if (!SEARCH_ENDPOINT || !SEARCH_KEY) {
            context.error("Azure AI Search not configured — skipping DD sync");
            return;
        }
        const deps = {
            fetchDDData: fetchDDDataFromAPI,
            uploadDocuments: uploadToSearch,
        };
        await syncDDNodes(deps, context);
    },
});
//# sourceMappingURL=kbDDSync.js.map