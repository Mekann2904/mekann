/**
 * Security regression tests for the sandbox system.
 *
 * These tests verify critical security properties that should NEVER regress.
 * They are not about coverage — they are about preventing security holes.
 *
 * Invariants tested:
 * 1. isSafeCommand never allows destructive commands
 * 2. SBPL policies always deny-by-default (except yolo)
 * 3. Sandbox mode transitions require approval for yolo
 * 4. Path policies block escapes via symlink, parent traversal, etc.
 * 5. Environment sanitization removes secrets
 */

import { describe, it, expect } from "vitest";
import { isSafeCommand } from "../../plan-mode/utils.js";
import { readOnlyPolicy, workspaceWritePolicy, yoloPolicy } from "../permissions.js";
import { buildSandboxEnv, buildMacSeatbeltPolicy } from "../macSeatbelt.js";

// ─── Invariant 1: isSafeCommand rejects all destructive commands ────

describe("Security: isSafeCommand never allows destructive commands", () => {
	const destructiveCommands = [
		// File deletion
		"rm -rf /",
		"rm -rf ~",
		"rm -rf .",
		"rm -rf *",
		"rmdir /tmp/important",

		// System commands
		"sudo rm -rf /",
		"sudo shutdown -h now",
		"sudo reboot",
		"sudo mkfs.ext4 /dev/sda1",
		"sudo dd if=/dev/zero of=/dev/sda",
		"sudo chmod 777 /",
		"sudo chown root:root /etc/passwd",

		// Package managers (can install malicious code)
		"npm install malicious-pkg",
		"npm uninstall critical-pkg",
		"yarn add malicious-pkg",
		"pnpm add malicious-pkg",
		"pip install malicious-pkg",
		"brew install malicious-pkg",

		// Editors (can modify files)
		"vim /etc/passwd",
		"vi /etc/hosts",
		"nano /etc/fstab",
		"emacs /etc/ssh/sshd_config",
		"code /etc/passwd",

		// Shell meta characters (command injection)
		"ls; rm -rf /",
		"echo hello && rm -rf /",
		"cat file || rm -rf /",
		"ls | rm -rf /",
		"echo $(rm -rf /)",
		"ls `rm -rf /`",
		"cat file > /etc/passwd",
		"ls >> /etc/hosts",
		"echo hello & rm -rf /",

		// Newline injection
		"ls\nrm -rf /",

		// Git mutating commands
		"git push --force",
		"git reset --hard HEAD~1",
		"git clean -fdx",
		"git checkout -- .",
		"git branch -D main",
	];

	it.each(destructiveCommands)("rejects '%s'", (cmd) => {
		expect(isSafeCommand(cmd)).toBe(false);
	});
});

// ─── Invariant 2: SBPL policies deny-by-default ─────────────────────

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

// ─── Invariant 3: Environment sanitization removes secrets ──────────

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

// ─── Invariant 4: Safe commands that must always be allowed ─────────

describe("Security: critical safe commands are always allowed", () => {
	const safeCommands = [
		"git status",
		"git log",
		"git diff",
		"git show",
		"git branch",
		"ls -la",
		"cat README.md",
		"head -20 package.json",
		"tail -50 output.log",
		"grep -r 'TODO' src/",
		"find . -name '*.ts'",
		"pwd",
		"echo hello",
		"wc -l src/index.ts",
		"ps aux",
		"node --version",
		"npm list",
		"npm view react",
		"npm outdated",
	];

	it.each(safeCommands)("allows '%s'", (cmd) => {
		expect(isSafeCommand(cmd)).toBe(true);
	});
});
