"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectEventAlerts = detectEventAlerts;
exports.detectMetaShifts = detectMetaShifts;
const functions_1 = require("@azure/functions");
async function detectEventAlerts(deps, context) {
    const since = new Date();
    since.setDate(since.getDate() - 1); // Last 24 hours
    let eventAlerts = 0;
    let metaShiftAlerts = 0;
    // Check for new event blog posts
    const blogPosts = await deps.fetchRecentBlogPosts(since);
    const eventPosts = blogPosts.filter((p) => p.type === "event_calendar" || p.type === "patch_notes");
    if (eventPosts.length > 0) {
        const commanderIds = await deps.fetchAllCommanderIds();
        for (const post of eventPosts) {
            for (const commanderId of commanderIds) {
                await deps.createNotification(commanderId, {
                    type: "event_alert",
                    title: `📅 New Event: ${post.title}`,
                    message: post.eventDates
                        ? `${post.title} — ${post.eventDates}`
                        : `Check out the latest: ${post.title}`,
                    linkUrl: "/advisor",
                });
                eventAlerts++;
            }
        }
    }
    // Detect meta shifts (3+ creators recommending same team)
    const knowledge = await deps.fetchRecentKnowledge(since);
    const metaShifts = detectMetaShifts(knowledge);
    if (metaShifts.length > 0) {
        const commanderIds = eventPosts.length > 0
            ? [] // Already fetched above
            : await deps.fetchAllCommanderIds();
        const ids = eventPosts.length > 0
            ? await deps.fetchAllCommanderIds()
            : commanderIds;
        for (const shift of metaShifts) {
            for (const commanderId of ids) {
                await deps.createNotification(commanderId, {
                    type: "meta_shift",
                    title: `🔄 Meta Shift: ${shift.teamName}`,
                    message: `${shift.creatorCount} creators are now recommending ${shift.teamName}. Ask the AI Advisor about this team!`,
                    linkUrl: `/advisor?q=Tell me about ${encodeURIComponent(shift.teamName)}`,
                });
                metaShiftAlerts++;
            }
        }
    }
    context.log(`Event alerts: ${eventAlerts}, Meta shift alerts: ${metaShiftAlerts}`);
    return { eventAlerts, metaShiftAlerts };
}
function detectMetaShifts(knowledge) {
    // Look for team names mentioned by 3+ different creators
    const teamMentions = new Map();
    const teamPatterns = [
        /\b(eternals|new warriors|young avengers|dark hunters|undying|horsemen|gamma|web warriors|symbiotes|tangled web|uxmen|uncanny|astonishing|superior six|sinister six|bionic avengers|masters of evil|unlimited x-men|rebirth|astral|judge|cabal)/gi,
    ];
    for (const item of knowledge) {
        for (const pattern of teamPatterns) {
            const matches = item.content.match(pattern);
            if (matches) {
                for (const match of matches) {
                    const teamName = match.toLowerCase();
                    if (!teamMentions.has(teamName)) {
                        teamMentions.set(teamName, new Set());
                    }
                    teamMentions.get(teamName).add(item.sourceCreatorName);
                }
            }
        }
    }
    const shifts = [];
    for (const [teamName, creators] of teamMentions) {
        if (creators.size >= 3) {
            shifts.push({
                teamName: teamName.charAt(0).toUpperCase() + teamName.slice(1),
                creatorCount: creators.size,
                creators: Array.from(creators),
            });
        }
    }
    return shifts;
}
functions_1.app.timer("eventAlerts", {
    schedule: "0 30 8 * * *", // 08:30 UTC daily (after blog scraper at 08:00)
    handler: async (_timer, context) => {
        context.log("Starting event & meta shift alert detection");
        const deps = {
            fetchRecentBlogPosts: async () => [],
            fetchRecentKnowledge: async () => [],
            fetchAllCommanderIds: async () => [],
            createNotification: async () => { },
        };
        await detectEventAlerts(deps, context);
    },
});
//# sourceMappingURL=eventAlerts.js.map