import { InvocationContext } from "@azure/functions";
/**
 * Daily function to generate static fallback meta data.
 * Runs at 05:00 UTC. Stores data in Cosmos DB for use when AI is unavailable.
 */
export declare function staticFallbackHandler(_timer: unknown, context: InvocationContext): Promise<void>;
//# sourceMappingURL=staticFallback.d.ts.map