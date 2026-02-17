import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // Test file patterns
    include: ["tests/**/*.test.ts"],

    // Exclude patterns
    exclude: ["node_modules", ".pi/lib/verification-workflow.test.ts"],

    // Environment
    environment: "node",

    // Global test APIs (describe, it, expect, etc.)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [".pi/lib/**/*.ts"],
      exclude: [".pi/lib/**/*.test.ts"],
    },

    // Timeout settings
    testTimeout: 10000,
    hookTimeout: 10000,

    // Parallel execution
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
  resolve: {
    alias: {
      "@lib": resolve(__dirname, ".pi/lib"),
    },
  },
});
