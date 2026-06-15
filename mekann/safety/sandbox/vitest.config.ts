import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			reportsDirectory: "./coverage",
			reporter: ["text", "json-summary", "text", "json"],
			// Test helpers are test infrastructure, not production code — exclude
			// from coverage so they don't dilute the package threshold. See #34.
			exclude: ["tests/extension-test-utils.ts"],
		},
	},
});
