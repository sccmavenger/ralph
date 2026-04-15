import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
  },
});
