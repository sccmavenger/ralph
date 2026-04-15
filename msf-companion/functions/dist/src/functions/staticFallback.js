"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.staticFallbackHandler = staticFallbackHandler;
const functions_1 = require("@azure/functions");
const cosmosClient_1 = require("../lib/cosmosClient");
/**
 * Daily function to generate static fallback meta data.
 * Runs at 05:00 UTC. Stores data in Cosmos DB for use when AI is unavailable.
 */
async function staticFallbackHandler(_timer, context) {
    context.log("Static fallback generation started");
    const container = (0, cosmosClient_1.getContainer)("static-fallback");
    // Generate fallback data from recent knowledge
    const knowledgeContainer = (0, cosmosClient_1.getContainer)("processed-content");
    let topTeams = [];
    let farmingPriorities = [];
    let eventRecommendations = [];
    try {
        // Get recent processed content for team recommendations
        const { resources: recentContent } = await knowledgeContainer.items
            .query({
            query: "SELECT TOP 20 * FROM c WHERE c.processedAt > @since ORDER BY c.processedAt DESC",
            parameters: [
                { name: "@since", value: new Date(Date.now() - 7 * 86400000).toISOString() },
            ],
        })
            .fetchAll();
        // Extract team mentions from content
        const teamMentions = new Map();
        for (const item of recentContent) {
            const content = item.content || "";
            const teams = extractTeamMentions(content);
            for (const team of teams) {
                teamMentions.set(team, (teamMentions.get(team) || 0) + 1);
            }
        }
        topTeams = Array.from(teamMentions.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name], i) => ({
            name,
            reason: `Frequently recommended by multiple creators`,
            priority: i + 1,
        }));
        context.log(`Generated ${topTeams.length} top team recommendations`);
    }
    catch (e) {
        context.log(`Error fetching knowledge for teams: ${e}`);
    }
    // Default fallback if no data available
    if (topTeams.length === 0) {
        topTeams = [
            { name: "Eternals", reason: "Top raid team across all game modes", priority: 1 },
            { name: "Gamma Team", reason: "Essential for Gamma raids", priority: 2 },
            { name: "Darkhold", reason: "Strong in Cosmic Crucible and War", priority: 3 },
            { name: "Unlimited X-Men", reason: "Top Arena and War offense", priority: 4 },
            { name: "Bifrost", reason: "Strong in multiple game modes", priority: 5 },
        ];
    }
    if (farmingPriorities.length === 0) {
        farmingPriorities = [
            { character: "Cosmic Ghost Rider", location: "Doom Campaign 3-9", reason: "Meta team member" },
            { character: "Gladiator", location: "Nexus Campaign 8-6", reason: "Raid essential" },
            { character: "Kestrel", location: "Nexus Campaign 7-3", reason: "Versatile plug-and-play" },
        ];
    }
    if (eventRecommendations.length === 0) {
        eventRecommendations = [
            { event: "Blitz", recommendation: "Rotate your top 8 teams for maximum milestone rewards" },
            { event: "Cosmic Crucible", recommendation: "Focus defense setup before attacking" },
        ];
    }
    const fallback = {
        id: "static_fallback_latest",
        type: "static_fallback",
        topTeams,
        farmingPriorities,
        eventRecommendations,
        generatedAt: new Date().toISOString(),
        ttl: 172800, // 48 hours
    };
    try {
        await container.items.upsert(fallback);
        context.log("Static fallback data stored successfully");
    }
    catch (e) {
        context.log(`Error storing fallback data: ${e}`);
    }
}
function extractTeamMentions(content) {
    const teamNames = [
        "Eternals", "Darkhold", "Unlimited X-Men", "Gamma", "Bifrost",
        "Young Avengers", "A-Force", "Weapon X", "Tangled Web", "New Warriors",
        "Invaders", "Undying", "Pegasus", "Hive-Mind", "Superior Six",
        "Secret Defenders", "Nightstalkers", "Reavers", "Cabal",
    ];
    return teamNames.filter((team) => content.toLowerCase().includes(team.toLowerCase()));
}
functions_1.app.timer("staticFallback", {
    schedule: "0 0 5 * * *", // Daily at 05:00 UTC
    handler: staticFallbackHandler,
});
//# sourceMappingURL=staticFallback.js.map