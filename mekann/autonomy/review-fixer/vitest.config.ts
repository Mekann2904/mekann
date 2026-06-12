import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["*.test.ts"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["json-summary", "text"],
      reportsDirectory: "./coverage",
    },
  },
});
