"use strict";
/**
 * Timer-triggered Azure Function: YouTube Video Discovery
 * Runs daily to discover new MSF-related YouTube videos from monitored channels.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@azure/functions");
const cosmosClient_js_1 = require("../lib/cosmosClient.js");
const videoDiscovery_js_1 = require("../lib/videoDiscovery.js");
functions_1.app.timer("videoDiscovery", {
    // Daily at 06:00 UTC
    schedule: "0 0 6 * * *",
    handler: async (_timer, context) => {
        context.log("Video Discovery function started");
        try {
            const videosContainer = (0, cosmosClient_js_1.getContainer)("videos");
            const deps = (0, videoDiscovery_js_1.createProductionDeps)(videosContainer);
            const results = await (0, videoDiscovery_js_1.discoverVideos)(deps, context);
            const totalNew = results.reduce((sum, r) => sum + r.newVideos, 0);
            const totalErrors = results.filter((r) => r.error).length;
            context.log(`Video Discovery complete: ${totalNew} new videos discovered across ${results.length} channels. ${totalErrors} channels had errors.`);
        }
        catch (err) {
            context.error(`Video Discovery function failed: ${err}`);
            throw err;
        }
    },
});
//# sourceMappingURL=videoDiscovery.js.map