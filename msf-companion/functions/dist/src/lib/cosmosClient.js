"use strict";
/**
 * Cosmos DB client wrapper for Azure Functions.
 * Uses COSMOS_CONNECTION_STRING from app settings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
exports.getContainer = getContainer;
exports._resetClient = _resetClient;
const cosmos_1 = require("@azure/cosmos");
let client = null;
let database = null;
function getClient() {
    if (!client) {
        const connectionString = process.env.COSMOS_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error("COSMOS_CONNECTION_STRING is not configured");
        }
        client = new cosmos_1.CosmosClient(connectionString);
    }
    return client;
}
function getDatabase() {
    if (!database) {
        const dbName = process.env.COSMOS_DATABASE_NAME || "msf-knowledge";
        database = getClient().database(dbName);
    }
    return database;
}
function getContainer(containerName) {
    return getDatabase().container(containerName);
}
/** Reset client for testing */
function _resetClient() {
    client = null;
    database = null;
}
//# sourceMappingURL=cosmosClient.js.map