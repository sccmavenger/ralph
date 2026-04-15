"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@azure/functions");
functions_1.app.http("health", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "health",
    handler: async (_request, _context) => {
        return {
            status: 200,
            jsonBody: {
                status: "healthy",
                timestamp: new Date().toISOString(),
                version: "1.0.0",
            },
        };
    },
});
//# sourceMappingURL=health.js.map