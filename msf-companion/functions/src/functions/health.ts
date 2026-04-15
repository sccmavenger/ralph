import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async (
    _request: HttpRequest,
    _context: InvocationContext
  ): Promise<HttpResponseInit> => {
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
