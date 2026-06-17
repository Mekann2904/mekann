import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// autoresearch tests spawn real `git` and child processes (run, log, keep,
		// contract checks). Under monorepo-wide parallel load these regularly exceed
		// the 5s default; raise the per-test timeout to match the sibling autonomy
		// packages (goal, subagent, review-fixer), all of which use 10s.
		testTimeout: 10_000,
		// Injects test git identity via env vars (no `git config` writes). See issue #39.
		setupFiles: ["./vitest.setup.ts"],
		coverage: {
			provider: "v8",
			reportsDirectory: "./coverage",
			reporter: ["text", "json-summary", "json"],
			// Test helpers are test infrastructure, not production code — exclude
			// from coverage so they don't dilute the package threshold. See #34.
			exclude: ["index-test-utils.ts"],
		},
	},
});
