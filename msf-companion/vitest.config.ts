import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["e2e/**", "node_modules/**", "functions/node_modules/**"],
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
  },
});
