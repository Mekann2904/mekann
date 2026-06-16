/**
 * Tests for the skill-surface prompt provider, focused on the Issue Work Pi
 * allowlist (ADR-0023 context optimization).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registeredProviders: Array<{ id: string; getFragments: (ctx: { cwd: string }) => Array<{ content: string }> }> = [];

vi.mock("../core/prompt-core/index.js", () => ({
	registerPromptProvider: (provider: (typeof registeredProviders)[number]) => {
		registeredProviders.push(provider);
	},
}));

// featureBooleanValue reads settings files; in the test environment the settings
// store returns empty config, so it falls back to the supplied default (defaultSurface).
// No mock needed — we assert against the real skill discovery from mekann/skills/.

const originalIssuePi = process.env.MEKANN_ISSUE_PI;

function resetEnv(): void {
	if (originalIssuePi === undefined) delete process.env.MEKANN_ISSUE_PI;
	else process.env.MEKANN_ISSUE_PI = originalIssuePi;
}

beforeEach(() => {
	registeredProviders.length = 0;
	delete process.env.MEKANN_ISSUE_PI;
});

afterEach(() => {
	resetEnv();
});

describe("skill-surface Issue Work Pi allowlist", () => {
	it("exposes only the implementation-core skills (diagnose, tdd, zoom-out) in an Issue Work Pi", async () => {
		process.env.MEKANN_ISSUE_PI = "1";
		const { default: skillSurface } = await import("./index.js");
		skillSurface();

		expect(registeredProviders).toHaveLength(1);
		const fragments = registeredProviders[0].getFragments({ cwd: process.cwd() });
		expect(fragments).toHaveLength(1);
		const content = fragments[0].content;

		for (const name of ["diagnose", "tdd", "zoom-out"]) {
			expect(content).toContain(`- ${name}:`);
		}
		// Issue-creation / planning / exploratory-review / meta skills are hidden.
		for (const name of [
			"to-issues",
			"to-prd",
			"triage",
			"improve-codebase-architecture",
			"setup-matt-pocock-skills",
			"prototype",
			"grill-with-docs",
			"thermo-nuclear-code-quality-review", // force-load fallback only
		]) {
			expect(content).not.toContain(`- ${name}:`);
		}
	});

	it("does not apply the allowlist outside an Issue Work Pi (normal surface restored)", async () => {
		// No MEKANN_ISSUE_PI marker. thermo-nuclear defaults to "on", so it must
		// reappear — proving the allowlist is Issue-Work-Pi-scoped, not global.
		const { default: skillSurface } = await import("./index.js");
		skillSurface();

		const fragments = registeredProviders[0].getFragments({ cwd: process.cwd() });
		const content = fragments[0].content;
		expect(content).toContain("- thermo-nuclear-code-quality-review:");
		expect(content).toContain("- tdd:");
	});
});
