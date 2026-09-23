import { defineConfig } from "prisma/config";
import { validateTestEnvironment } from "./tests/executive/test-database";

// Intentionally never imports dotenv or the application's Prisma configuration.
// Even validate/generate require the explicit disposable-target acknowledgement.
const target = validateTestEnvironment(process.env);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: target.migrationUrl },
});
