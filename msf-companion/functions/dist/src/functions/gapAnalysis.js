"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeGaps = analyzeGaps;
exports.clusterWithOpenAI = clusterWithOpenAI;
const functions_1 = require("@azure/functions");
const pgClient_js_1 = require("../lib/pgClient.js");
const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "";
const OPENAI_KEY = process.env.AZURE_OPENAI_KEY || "";
const MINI_DEPLOYMENT = process.env.AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT || "gpt-4o-mini";
async function analyzeGaps(deps, context) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const failedQuestions = await deps.fetchFailedQuestions(since);
    if (failedQuestions.length === 0) {
        context.log("No failed questions in the last 7 days");
        return { gapsCreated: 0, gapsUpdated: 0 };
    }
    const existingGaps = await deps.fetchExistingGaps();
    const clusters = await deps.clusterQuestions(failedQuestions, existingGaps);
    let gapsCreated = 0;
    let gapsUpdated = 0;
    for (const cluster of clusters) {
        const existingGap = existingGaps.find((g) => g.clusteredQuestion.toLowerCase() ===
            cluster.clusteredQuestion.toLowerCase());
        if (existingGap) {
            await deps.incrementGapFrequency(existingGap.id, cluster.questions.length);
            gapsUpdated++;
        }
        else {
            const status = cluster.gapType === "coverage_gap" ? "auto_resolving" : "open";
            const autoResolveAction = cluster.gapType === "coverage_gap"
                ? "YouTube search queued for: " + cluster.clusteredQuestion
                : undefined;
            await deps.upsertGap({
                clusteredQuestion: cluster.clusteredQuestion,
                category: cluster.category,
                gapType: cluster.gapType,
                frequency: cluster.questions.length,
                status,
                autoResolveAction,
            });
            gapsCreated++;
        }
    }
    context.log(`Gap analysis complete: ${gapsCreated} created, ${gapsUpdated} updated`);
    return { gapsCreated, gapsUpdated };
}
async function clusterWithOpenAI(questions, existingGaps) {
    if (!OPENAI_ENDPOINT || !OPENAI_KEY) {
        return clusterHeuristic(questions);
    }
    try {
        const response = await fetch(`${OPENAI_ENDPOINT}/openai/deployments/${MINI_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": OPENAI_KEY,
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: `You are a question clustering engine for Marvel Strike Force. Group semantically similar questions together and classify each cluster.

Existing gaps to match against: ${JSON.stringify(existingGaps.map((g) => g.clusteredQuestion))}

For each cluster, provide:
- clusteredQuestion: a representative question for the cluster
- category: one of team-comp, farming, dark-dimension, war, crucible, event, character-review, general
- gapType: one of source_gap (no creator has covered this), coverage_gap (creators exist but not in our index), data_gap (game data not available), feature_gap (user wants a feature we don't have)
- questions: array of original question texts in this cluster

Return JSON: {"clusters": [...]}`,
                    },
                    {
                        role: "user",
                        content: JSON.stringify(questions.map((q) => q.question)),
                    },
                ],
                max_tokens: 2000,
                temperature: 0,
                response_format: { type: "json_object" },
            }),
        });
        if (!response.ok) {
            return clusterHeuristic(questions);
        }
        const data = (await response.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content)
            return clusterHeuristic(questions);
        const parsed = JSON.parse(content);
        return parsed.clusters || clusterHeuristic(questions);
    }
    catch {
        return clusterHeuristic(questions);
    }
}
function clusterHeuristic(questions) {
    const clusters = new Map();
    for (const q of questions) {
        // Simple clustering by category
        const key = q.category;
        const existing = clusters.get(key);
        if (existing) {
            existing.questions.push(q.question);
        }
        else {
            clusters.set(key, { category: q.category, questions: [q.question] });
        }
    }
    return Array.from(clusters.entries()).map(([, value]) => ({
        clusteredQuestion: value.questions[0],
        category: value.category,
        gapType: "coverage_gap",
        questions: value.questions,
    }));
}
functions_1.app.timer("gapAnalysis", {
    schedule: "0 0 3 * * *", // 03:00 UTC daily
    handler: async (_timer, context) => {
        context.log("Starting daily gap analysis");
        const pool = (0, pgClient_js_1.getPool)();
        const deps = {
            fetchFailedQuestions: async (since) => {
                const result = await pool.query(`SELECT question, category FROM "AdvisorQuestionLog"
           WHERE "confidenceScore" < 60 AND "createdAt" >= $1`, [since]);
                return result.rows;
            },
            fetchExistingGaps: async () => {
                const result = await pool.query(`SELECT id, "clusteredQuestion", category, frequency
           FROM "KnowledgeGap" WHERE status = 'open'`);
                return result.rows.map((r) => ({
                    id: r.id,
                    clusteredQuestion: r.clusteredQuestion,
                    category: r.category,
                    frequency: r.frequency,
                }));
            },
            clusterQuestions: clusterWithOpenAI,
            upsertGap: async (gap) => {
                const id = `gap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                await pool.query(`INSERT INTO "KnowledgeGap" (id, "clusteredQuestion", category, "gapType", frequency, status, "autoResolveAction", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`, [id, gap.clusteredQuestion, gap.category, gap.gapType, gap.frequency, gap.status, gap.autoResolveAction ?? null]);
            },
            incrementGapFrequency: async (gapId, increment) => {
                await pool.query(`UPDATE "KnowledgeGap" SET frequency = frequency + $1, "updatedAt" = NOW()
           WHERE id = $2`, [increment, gapId]);
            },
        };
        await analyzeGaps(deps, context);
    },
});
//# sourceMappingURL=gapAnalysis.js.map