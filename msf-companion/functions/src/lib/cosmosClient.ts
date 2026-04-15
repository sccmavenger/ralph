/**
 * Cosmos DB client wrapper for Azure Functions.
 * Uses COSMOS_CONNECTION_STRING from app settings.
 */

import { CosmosClient, Container, Database } from "@azure/cosmos";

let client: CosmosClient | null = null;
let database: Database | null = null;

function getClient(): CosmosClient {
  if (!client) {
    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error("COSMOS_CONNECTION_STRING is not configured");
    }
    client = new CosmosClient(connectionString);
  }
  return client;
}

export function getDatabase(): Database {
  if (!database) {
    const dbName = process.env.COSMOS_DATABASE_NAME || "msf-knowledge";
    database = getClient().database(dbName);
  }
  return database;
}

export function getContainer(containerName: string): Container {
  return getDatabase().container(containerName);
}

/** Reset client for testing */
export function _resetClient(): void {
  client = null;
  database = null;
}
