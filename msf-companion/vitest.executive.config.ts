import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite must not even load .env files while resolving this configuration.
  envDir: false,
  test: {
    include: ["tests/executive/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // No application setup, wallet tests, browser credentials, or port teardown.
  },
});
