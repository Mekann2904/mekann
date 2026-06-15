import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Injects test git identity via env vars (no `git config` writes). See issue #39.
		setupFiles: ["./vitest.setup.ts"],
		coverage: {
			provider: "v8",
			reportsDirectory: "./coverage",
			reporter: ["text", "json-summary", "json"],
		},
	},
});
