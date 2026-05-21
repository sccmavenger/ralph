"use strict";
/**
 * KB Deduplication utility — generates deterministic document IDs
 * and provides deduplication filtering for sync pipelines.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDocId = generateDocId;
exports.checkExistingDocs = checkExistingDocs;
exports.filterNewDocs = filterNewDocs;
const SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT || "";
const SEARCH_KEY = process.env.AZURE_AI_SEARCH_KEY || "";
/**
 * Generate a deterministic document ID from source type and identifiers.
 */
function generateDocId(sourceType, ...identifiers) {
    const slug = identifiers
        .map((id) => id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""))
        .join("-");
    return `${sourceType}-${slug}`;
}
/**
 * Check which document IDs already exist in the search index.
 */
async function checkExistingDocs(docIds) {
    if (docIds.length === 0)
        return new Set();
    const existing = new Set();
    const batchSize = 100;
    for (let i = 0; i < docIds.length; i += batchSize) {
        const batch = docIds.slice(i, i + batchSize);
        const filter = batch.map((id) => `id eq '${id}'`).join(" or ");
        try {
            const response = await fetch(`${SEARCH_ENDPOINT}/indexes/msf-knowledge/docs/search?api-version=2024-07-01`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
                body: JSON.stringify({ filter, select: "id", top: batchSize }),
            });
            if (response.ok) {
                const data = (await response.json());
                for (const doc of data.value || []) {
                    existing.add(doc.id);
                }
            }
        }
        catch {
            // If check fails, assume none exist (will result in mergeOrUpload which handles duplicates)
        }
    }
    return existing;
}
/**
 * Filter out documents that already exist in the index.
 */
function filterNewDocs(docs, existingIds) {
    return docs.filter((doc) => !existingIds.has(doc.id));
}
//# sourceMappingURL=kbDeduplication.js.map