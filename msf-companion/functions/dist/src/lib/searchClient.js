"use strict";
/**
 * Azure AI Search client utilities for querying and managing the MSF knowledge index.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
exports.keywordSearch = keywordSearch;
exports.vectorSearch = vectorSearch;
exports.hybridSearch = hybridSearch;
const searchIndex_js_1 = require("./searchIndex.js");
/**
 * Generate an embedding vector for a text query using Azure OpenAI.
 */
async function generateEmbedding(text, deps) {
    const response = await fetch(`${deps.openAiEndpoint}/openai/deployments/${deps.embeddingDeployment}/embeddings?api-version=2024-08-01-preview`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": deps.openAiKey,
        },
        body: JSON.stringify({ input: text }),
    });
    if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
    }
    const data = (await response.json());
    return data.data[0].embedding;
}
/**
 * Perform a keyword search against the MSF knowledge index.
 */
async function keywordSearch(query, deps, top = 10) {
    const response = await fetch(`${deps.searchEndpoint}/indexes/${searchIndex_js_1.INDEX_NAME}/docs/search?api-version=2024-07-01`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": deps.searchKey,
        },
        body: JSON.stringify({
            search: query,
            top,
            select: "id,category,content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate",
        }),
    });
    if (!response.ok) {
        throw new Error(`Search API error: ${response.status}`);
    }
    const data = (await response.json());
    return data.value.map((doc) => ({
        id: doc.id,
        category: doc.category,
        content: doc.content,
        sourceCreatorName: doc.sourceCreatorName,
        sourceVideoTitle: doc.sourceVideoTitle,
        sourceUrl: doc.sourceUrl,
        sourceDate: doc.sourceDate,
        score: doc["@search.score"],
    }));
}
/**
 * Perform a semantic/vector search against the MSF knowledge index.
 */
async function vectorSearch(query, deps, top = 10) {
    const embedding = await generateEmbedding(query, deps);
    const response = await fetch(`${deps.searchEndpoint}/indexes/${searchIndex_js_1.INDEX_NAME}/docs/search?api-version=2024-07-01`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": deps.searchKey,
        },
        body: JSON.stringify({
            vectorQueries: [
                {
                    kind: "vector",
                    vector: embedding,
                    fields: "contentVector",
                    k: top,
                },
            ],
            select: "id,category,content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate",
        }),
    });
    if (!response.ok) {
        throw new Error(`Vector search API error: ${response.status}`);
    }
    const data = (await response.json());
    return data.value.map((doc) => ({
        id: doc.id,
        category: doc.category,
        content: doc.content,
        sourceCreatorName: doc.sourceCreatorName,
        sourceVideoTitle: doc.sourceVideoTitle,
        sourceUrl: doc.sourceUrl,
        sourceDate: doc.sourceDate,
        score: doc["@search.score"],
    }));
}
/**
 * Perform a hybrid search (keyword + vector) for best results.
 */
async function hybridSearch(query, deps, top = 10) {
    const embedding = await generateEmbedding(query, deps);
    const response = await fetch(`${deps.searchEndpoint}/indexes/${searchIndex_js_1.INDEX_NAME}/docs/search?api-version=2024-07-01`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": deps.searchKey,
        },
        body: JSON.stringify({
            search: query,
            vectorQueries: [
                {
                    kind: "vector",
                    vector: embedding,
                    fields: "contentVector",
                    k: top,
                },
            ],
            top,
            select: "id,category,content,sourceCreatorName,sourceVideoTitle,sourceUrl,sourceDate",
        }),
    });
    if (!response.ok) {
        throw new Error(`Hybrid search API error: ${response.status}`);
    }
    const data = (await response.json());
    return data.value.map((doc) => ({
        id: doc.id,
        category: doc.category,
        content: doc.content,
        sourceCreatorName: doc.sourceCreatorName,
        sourceVideoTitle: doc.sourceVideoTitle,
        sourceUrl: doc.sourceUrl,
        sourceDate: doc.sourceDate,
        score: doc["@search.score"],
    }));
}
//# sourceMappingURL=searchClient.js.map