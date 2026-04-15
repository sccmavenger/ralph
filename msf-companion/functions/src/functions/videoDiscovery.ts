/**
 * Timer-triggered Azure Function: YouTube Video Discovery
 * Runs daily to discover new MSF-related YouTube videos from monitored channels.
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import { getContainer } from "../lib/cosmosClient.js";
import { createProductionDeps, discoverVideos } from "../lib/videoDiscovery.js";

app.timer("videoDiscovery", {
  // Daily at 06:00 UTC
  schedule: "0 0 6 * * *",
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    context.log("Video Discovery function started");

    try {
      const videosContainer = getContainer("videos");
      const deps = createProductionDeps(videosContainer);
      const results = await discoverVideos(deps, context);

      const totalNew = results.reduce((sum, r) => sum + r.newVideos, 0);
      const totalErrors = results.filter((r) => r.error).length;

      context.log(
        `Video Discovery complete: ${totalNew} new videos discovered across ${results.length} channels. ${totalErrors} channels had errors.`
      );
    } catch (err) {
      context.error(`Video Discovery function failed: ${err}`);
      throw err;
    }
  },
});
