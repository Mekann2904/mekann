/**
 * Security regression tests for the sandbox system.
 *
 * These tests verify critical security properties that should NEVER regress.
 * They are not about coverage — they are about preventing security holes.
 *
 * Invariants tested:
 * 1. SBPL policies always deny-by-default (except yolo)
 * 2. Environment sanitization removes secrets
 * 3. Sandbox mode enforcement (read_only, workspace_write, yolo)
 *
 * Note: Command intent classification (isSafeCommand / classifyCommandIntent)
 * was moved to policy-core/ and is tested in modes tests.
 * It is a UX filter, not a security boundary.
 */

import { describe, it, expect } from "vitest";
import { readOnlyPolicy, workspaceWritePolicy, yoloPolicy } from "../permissions.js";
import { buildSandboxEnv, buildMacSeatbeltPolicy } from "../macSeatbelt.js";

// ─── Invariant 1: SBPL policies deny-by-default ─────────────────────

describe("Security: SBPL policies deny-by-default", () => {
	it("read_only policy contains (deny default)", () => {
		const policy = readOnlyPolicy("/tmp/project", ["/tmp/project"]);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toContain("(deny default)");
	});

	it("workspace_write policy contains (deny default)", () => {
		const policy = workspaceWritePolicy("/tmp/project", ["/tmp/project"], ["/tmp/project"], false);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toContain("(deny default)");
	});

	it("yolo policy contains (allow default)", () => {
		const policy = yoloPolicy();
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toContain("(allow default)");
		expect(sbpl).not.toContain("(deny default)");
	});

	it("read_only policy does NOT allow writing to workspace", () => {
		const policy = readOnlyPolicy("/tmp/project", ["/tmp/project"]);
		const sbpl = buildMacSeatbeltPolicy(policy);
		// read_only should deny writes to the workspace subpath
		expect(sbpl).toContain("(deny file-write*");
	});
});

// ─── Invariant 2: Environment sanitization removes secrets ──────────

describe("Security: buildSandboxEnv removes secrets", () => {
	const secretEnvVars = [
		"OPENAI_API_KEY",
		"GITHUB_TOKEN",
		"ANTHROPIC_API_KEY",
		"AWS_SECRET_ACCESS_KEY",
		"AWS_ACCESS_KEY_ID",
		"NPM_TOKEN",
		"HEROKU_API_KEY",
		"STRIPE_SECRET_KEY",
		"SENDGRID_API_KEY",
		"TWILIO_AUTH_TOKEN",
	];

	it.each(secretEnvVars)("does not pass %s to sandbox", (varName) => {
		const original = process.env[varName];
		process.env[varName] = "secret-test-value-12345";
		try {
			const env = buildSandboxEnv(readOnlyPolicy("/tmp/project"), "/tmp/home");
			expect(env[varName]).toBeUndefined();
		} finally {
			if (original) process.env[varName] = original;
			else delete process.env[varName];
		}
	});

	it("HOME is NOT user's real home directory", () => {
		const env = buildSandboxEnv(readOnlyPolicy("/tmp/project"), "/tmp/sandbox-home");
		expect(env.HOME).toBe("/tmp/sandbox-home");
		expect(env.HOME).not.toBe(process.env.HOME);
	});

	it("PATH is not inherited from environment", () => {
		const env = buildSandboxEnv(readOnlyPolicy("/tmp/project"), "/tmp/home");
		expect(env.PATH).not.toBe(process.env.PATH);
		// Should be a fixed minimal PATH
		expect(env.PATH).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
	});

	it("GIT_TERMINAL_PROMPT is 0 (prevents interactive prompts)", () => {
		const env = buildSandboxEnv(readOnlyPolicy("/tmp/project"), "/tmp/home");
		expect(env.GIT_TERMINAL_PROMPT).toBe("0");
	});
});
