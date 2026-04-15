/**
 * Cosmos DB client wrapper for Azure Functions.
 * Uses COSMOS_CONNECTION_STRING from app settings.
 */
import { Container, Database } from "@azure/cosmos";
export declare function getDatabase(): Database;
export declare function getContainer(containerName: string): Container;
/** Reset client for testing */
export declare function _resetClient(): void;
//# sourceMappingURL=cosmosClient.d.ts.map