import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		fileParallelism: false,
		coverage: {
			provider: "v8",
			reportsDirectory: "./coverage",
			reporter: ["text", "json-summary", "text", "json"],
		},
	},
});
