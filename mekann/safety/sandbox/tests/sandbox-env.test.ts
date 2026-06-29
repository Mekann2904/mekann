/**
 * サンドボックス実行環境変数 (buildSandboxEnv) のテスト。
 *
 * PATH 固定値、HOME isolation、シークレット除外 allowlist、TMPDIR、
 * LC_ALL、TERM/LANG デフォルト等を検証する。
 */

import { describe, it, expect } from "vitest";

import { buildSandboxEnv } from "../macSeatbelt.js";

import { readOnlyPolicy, workspaceWritePolicy } from "../permissions.js";

describe("buildSandboxEnv", () => {
	const isolatedHome = "/tmp/sandbox-run-abc123/home";

	it("PATH は固定値（process.env.PATH をそのまま渡さない）", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		const env = buildSandboxEnv(policy, isolatedHome);
		// SECURITY: PATH is a fixed value, not inherited from process.env
		expect(env.PATH).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
		expect(env.PATH).not.toBe(process.env.PATH);
	});

	it("SHELL は /bin/bash 固定", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.SHELL).toBe("/bin/bash");
	});

	it("HOME は isolated temp home に設定される（workspace/cwd ではない）", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.HOME).toBe(isolatedHome);
		// SECURITY: HOME is NOT the workspace/cwd
		expect(env.HOME).not.toBe("/tmp/workspace");
	});

	it("HOME は isolated home に 'home' subpath が含まれる", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.HOME).toContain("/home");
		expect(env.HOME).toContain("sandbox-run-");
	});

	it("GIT_TERMINAL_PROMPT は 0", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.GIT_TERMINAL_PROMPT).toBe("0");
	});

	it("OPENAI_API_KEY を含まない", () => {
		const origKey = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "sk-test-secret-key-12345";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.OPENAI_API_KEY).toBeUndefined();
		} finally {
			if (origKey) process.env.OPENAI_API_KEY = origKey;
			else delete process.env.OPENAI_API_KEY;
		}
	});

	it("GITHUB_TOKEN を含まない", () => {
		const origToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = "ghp_test-secret-token";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.GITHUB_TOKEN).toBeUndefined();
		} finally {
			if (origToken) process.env.GITHUB_TOKEN = origToken;
			else delete process.env.GITHUB_TOKEN;
		}
	});

	it("AWS_SECRET_ACCESS_KEY を含まない", () => {
		const origKey = process.env.AWS_SECRET_ACCESS_KEY;
		process.env.AWS_SECRET_ACCESS_KEY = "aws-secret-key";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
		} finally {
			if (origKey) process.env.AWS_SECRET_ACCESS_KEY = origKey;
			else delete process.env.AWS_SECRET_ACCESS_KEY;
		}
	});

	it("ANTHROPIC_API_KEY を含まない", () => {
		const origKey = process.env.ANTHROPIC_API_KEY;
		process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.ANTHROPIC_API_KEY).toBeUndefined();
		} finally {
			if (origKey) process.env.ANTHROPIC_API_KEY = origKey;
			else delete process.env.ANTHROPIC_API_KEY;
		}
	});

	it("NPM_TOKEN を含まない", () => {
		const origToken = process.env.NPM_TOKEN;
		process.env.NPM_TOKEN = "npm-test-token";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.NPM_TOKEN).toBeUndefined();
		} finally {
			if (origToken) process.env.NPM_TOKEN = origToken;
			else delete process.env.NPM_TOKEN;
		}
	});

	it("許可リスト: LANG を含む", () => {
		const origLang = process.env.LANG;
		process.env.LANG = "en_US.UTF-8";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.LANG).toBe("en_US.UTF-8");
		} finally {
			if (origLang) process.env.LANG = origLang;
			else delete process.env.LANG;
		}
	});

	it("許可リスト: TERM を含む", () => {
		const origTerm = process.env.TERM;
		process.env.TERM = "xterm-256color";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.TERM).toBe("xterm-256color");
		} finally {
			if (origTerm) process.env.TERM = origTerm;
			else delete process.env.TERM;
		}
	});
});

describe("buildSandboxEnv: PATH restrictions", () => {
	const isolatedHome = "/tmp/sandbox-run-test/home";

	it("allowHomebrewPaths=false では Homebrew path を含まない", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.PATH).not.toContain("homebrew");
		expect(env.PATH).not.toContain("/usr/local/bin");
	});

	it("allowHomebrewPaths=true では /opt/homebrew/bin を含む", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		policy.allowHomebrewPaths = true;
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.PATH).toContain("/opt/homebrew/bin");
		expect(env.PATH).toContain("/usr/local/bin");
	});

	it("TMPDIR は _isolatedTempDir があればそちらを使う", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		policy._isolatedTempDir = "/tmp/sandbox-isolated-run";
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.TMPDIR).toBe("/tmp/sandbox-isolated-run");
	});

	it("SSH_AUTH_SOCK を含まない", () => {
		const orig = process.env.SSH_AUTH_SOCK;
		process.env.SSH_AUTH_SOCK = "/tmp/ssh-auth-sock-test";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.SSH_AUTH_SOCK).toBeUndefined();
		} finally {
			if (orig) process.env.SSH_AUTH_SOCK = orig;
			else delete process.env.SSH_AUTH_SOCK;
		}
	});

	it("NODE_AUTH_TOKEN を含まない", () => {
		const orig = process.env.NODE_AUTH_TOKEN;
		process.env.NODE_AUTH_TOKEN = "npm-secret-token";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.NODE_AUTH_TOKEN).toBeUndefined();
		} finally {
			if (orig) process.env.NODE_AUTH_TOKEN = orig;
			else delete process.env.NODE_AUTH_TOKEN;
		}
	});

	// Tests that use policy builder functions (readOnlyPolicy/workspaceWritePolicy) with allowHomebrewPaths param
	it("readOnlyPolicy(cwd, roots, true) PATH に /opt/homebrew/bin を含む", () => {
		const policy = readOnlyPolicy("/tmp/workspace", ["/tmp/workspace"], true);
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.PATH).toContain("/opt/homebrew/bin");
		expect(env.PATH).toContain("/usr/local/bin");
	});

	it("readOnlyPolicy(cwd, roots, false) PATH に homebrew を含まない", () => {
		const policy = readOnlyPolicy("/tmp/workspace", ["/tmp/workspace"], false);
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.PATH).not.toContain("homebrew");
		expect(env.PATH).not.toContain("/usr/local/bin");
	});

	it("workspaceWritePolicy(cwd, roots, wRoots, net, true) PATH に /opt/homebrew/bin を含む", () => {
		const policy = workspaceWritePolicy("/tmp/workspace", ["/tmp/workspace"], ["/tmp/workspace"], false, true);
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.PATH).toContain("/opt/homebrew/bin");
		expect(env.PATH).toContain("/usr/local/bin");
	});

	it("workspaceWritePolicy(cwd, roots, wRoots, net, false) PATH に homebrew を含まない", () => {
		const policy = workspaceWritePolicy("/tmp/workspace", ["/tmp/workspace"], ["/tmp/workspace"], false, false);
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.PATH).not.toContain("homebrew");
		expect(env.PATH).not.toContain("/usr/local/bin");
	});
});

describe("buildSandboxEnv: LC_ALL passthrough", () => {
	it("LC_ALL が設定されている場合、含まれる", () => {
		const origLc = process.env.LC_ALL;
		process.env.LC_ALL = "en_US.UTF-8";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, "/tmp/sandbox-run-test/home");
			expect(env.LC_ALL).toBe("en_US.UTF-8");
		} finally {
			if (origLc) process.env.LC_ALL = origLc;
			else delete process.env.LC_ALL;
		}
	});

	it("LC_ALL が未設定の場合、含まれない", () => {
		const origLc = process.env.LC_ALL;
		delete process.env.LC_ALL;
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, "/tmp/sandbox-run-test/home");
			expect(env.LC_ALL).toBeUndefined();
		} finally {
			if (origLc) process.env.LC_ALL = origLc;
			else delete process.env.LC_ALL;
		}
	});
});

describe("buildSandboxEnv: TMPDIR when _isolatedTempDir is not set", () => {
	it("_isolatedTempDir が未設定の場合、TMPDIR は含まれない", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		// _isolatedTempDir is undefined by default
		expect(policy._isolatedTempDir).toBeUndefined();
		const env = buildSandboxEnv(policy, "/tmp/sandbox-run-test/home");
		expect(env.TMPDIR).toBeUndefined();
	});
});

describe("buildSandboxEnv: LC_ALL branch", () => {
	const isolatedHome = "/tmp/sandbox-run-lctest/home";

	it("LC_ALL が設定されている場合、env に含まれる", () => {
		const orig = process.env.LC_ALL;
		process.env.LC_ALL = "en_US.UTF-8";
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.LC_ALL).toBe("en_US.UTF-8");
		} finally {
			if (orig) process.env.LC_ALL = orig;
			else delete process.env.LC_ALL;
		}
	});

	it("LC_ALL が未設定の場合、env に含まれない", () => {
		const orig = process.env.LC_ALL;
		delete process.env.LC_ALL;
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.LC_ALL).toBeUndefined();
		} finally {
			if (orig) process.env.LC_ALL = orig;
			else delete process.env.LC_ALL;
		}
	});

	it("_isolatedTempDir なしの場合、TMPDIR は設定されない", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		// Don't set _isolatedTempDir
		const env = buildSandboxEnv(policy, isolatedHome);
		expect(env.TMPDIR).toBeUndefined();
	});
});

describe("buildSandboxEnv: default TERM and LANG", () => {
	const isolatedHome = "/tmp/sandbox-run-defaults/home";

	it("TERM が未設定の場合、xterm-256color がデフォルト", () => {
		const origTerm = process.env.TERM;
		delete process.env.TERM;
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.TERM).toBe("xterm-256color");
		} finally {
			if (origTerm) process.env.TERM = origTerm;
		}
	});

	it("LANG が未設定の場合、C.UTF-8 がデフォルト", () => {
		const origLang = process.env.LANG;
		delete process.env.LANG;
		try {
			const policy = readOnlyPolicy("/tmp/workspace");
			const env = buildSandboxEnv(policy, isolatedHome);
			expect(env.LANG).toBe("C.UTF-8");
		} finally {
			if (origLang) process.env.LANG = origLang;
		}
	});
});

