/**
 * Sandbox Extension のテスト。
 *
 * 単体テスト（全環境）:
 *   - SBPL ポリシー生成の検証
 *   - エスケープ処理の検証
 *   - パス生成の検証
 *   - パス検証の検証
 *   - 環境変数 allowlist の検証
 *   - policy 検証の検証（workspaceRoots unsafe path を含む）
 *   - unsafe workspace root 拒否
 *   - isolated HOME 検証
 *   - maxOutputBytes combined 検証
 *   - runSandboxedShellMac API 検証
 *
 * 統合テスト（macOS + sandbox-exec 利用可能時のみ実行）:
 *   - sandbox 内でのコマンド実行（許可 / 拒否）
 *   - read_only で workspace 外を読めない
 *   - workspace_write で保護パスに書き込めない
 *   - network 制御
 *   - env secret 分離
 *   - bash startup files が読み込まれない
 *   - $HOME が isolated temp を指す
 *   - background process が timeout/abort 後に残らない
 *   - maxOutputBytes combined
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
	escapeSbplString,
	pathLiteral,
	pathSubpath,
	buildMacSeatbeltPolicy,
	runSandboxedShellMac,
	isMacSandboxAvailable,
	buildSandboxEnv,
	validatePolicy,
	resolveGitdirPaths,
} from "../macSeatbelt.js";

import {
	readOnlyPolicy,
	workspaceWritePolicy,
	yoloPolicy,
	parseSandboxMode,
	modeLabel,
	type SandboxPolicy,
} from "../permissions.js";

import { assertPathInsideRoot, resolveRealPaths, isProtectedPath } from "../pathPolicy.js";
import { shouldRequestApproval, yoloApprovalMessage } from "../permissions.js";

// ─── Platform check ──────────────────────────────────────────────

const isMac = process.platform === "darwin";

// ─── Unit tests: SBPL generation ─────────────────────────────────

describe("buildMacSeatbeltPolicy", () => {
	const tmpDir = "/tmp/sandbox-test";

	it("yolo は (allow default) のみを含む", () => {
		const policy = yoloPolicy();
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain("(allow default)");
		expect(sbpl).toContain("(version 1)");
		expect(sbpl).not.toContain("(deny default)");
	});

	it("read_only は user-selected writable roots section を含まない", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain("(deny default)");
		expect(sbpl).toContain("(allow process-exec)");
		expect(sbpl).toContain("(allow process-fork)");
		// read_only should NOT have the "; user-selected writable roots" section
		expect(sbpl).not.toContain("; user-selected writable roots");
		expect(sbpl).not.toContain("network-outbound");
		expect(sbpl).not.toContain("network-inbound");
		// 保護パス deny は含まれる
		expect(sbpl).toContain("\\.git");
	});

	it("read_only は /Users を含まない", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain('(subpath "/Users")');
	});

	it("read_only は /Library を含まない", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain('(subpath "/Library")');
	});

	it("read_only は /opt を含まない（allowHomebrewPaths=false）", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain('(subpath "/opt")');
	});

	it("read_only は広い /var を含まない", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain('(subpath "/var")');
	});

	it("allowHomebrewPaths=true は /opt/homebrew と /usr/local を含む", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		policy.allowHomebrewPaths = true;
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain('(subpath "/opt/homebrew")');
		expect(sbpl).toContain('(subpath "/usr/local")');
	});

	it("allowHomebrewPaths=false (default) は homebrew paths を含まない", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain('(subpath "/opt/homebrew")');
		expect(sbpl).not.toContain('(subpath "/usr/local")');
	});

	it("signal は same-sandbox に制限される", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain("(allow signal (target same-sandbox))");
		expect(sbpl).not.toMatch(/\(allow signal\)\s*$/m);
	});

	it("process-info* は same-sandbox に制限される", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain("(allow process-info* (target same-sandbox))");
	});

	it("workspace_write は writable rules と .git deny を含む", () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain("(deny default)");
		expect(sbpl).toContain("allow file-write*");
		// writable roots が含まれる
		expect(sbpl).toContain(`subpath "${tmpDir}"`);
		// 保護パス deny
		expect(sbpl).toContain("\\.git");
		expect(sbpl).toContain("\\.codex");
		expect(sbpl).toContain("\\.agents");
		// network なし
		expect(sbpl).not.toContain("network-outbound");
	});

	it("workspace_write + network=true は network rules を含む", () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], true);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain("network-outbound");
		expect(sbpl).toContain("network-inbound");
	});

	it("workspace_write + network=false は network rules を含まない", () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain("network-outbound");
		expect(sbpl).not.toContain("network-inbound");
	});

	it("read_only は network rules を含まない", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain("network-outbound");
	});

	it("システム読み取りパスを含む（最小セット）", () => {
		const policy = readOnlyPolicy(tmpDir);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain('(subpath "/bin")');
		expect(sbpl).toContain('(subpath "/sbin")');
		// SECURITY: /usr is NOT included as a whole — only specific subdirs
		expect(sbpl).toContain('(subpath "/usr/bin")');
		expect(sbpl).toContain('(subpath "/usr/sbin")');
		expect(sbpl).toContain('(subpath "/usr/lib")');
		expect(sbpl).toContain('(subpath "/usr/libexec")');
		expect(sbpl).toContain('(subpath "/usr/share")');
		expect(sbpl).not.toContain('(subpath "/usr")"'); // no bare /usr subpath
		expect(sbpl).toContain('(subpath "/System")');
		expect(sbpl).toContain('(literal "/etc")');
	});

	it("デバイス許可を含む", () => {
		const policy = readOnlyPolicy(tmpDir);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain('(literal "/dev/null")');
		expect(sbpl).toContain('(literal "/dev/ptmx")');
		expect(sbpl).toContain("(allow pseudo-tty)");
	});

	it("複数の workspaceRoots を全て含む", () => {
		const policy = readOnlyPolicy(tmpDir, ["/tmp/root1", "/tmp/root2"]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain('subpath "/tmp/root1"');
		expect(sbpl).toContain('subpath "/tmp/root2"');
	});

	it("workspaceRoots が空の場合は cwd を使用する", () => {
		const policy = readOnlyPolicy(tmpDir, []);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain(`subpath "${tmpDir}"`);
	});
});

// ─── Unit tests: SBPL helpers ────────────────────────────────────

describe("escapeSbplString", () => {
	it("バックスラッシュをエスケープする", () => {
		expect(escapeSbplString("a\\b")).toBe("a\\\\b");
	});

	it("ダブルクォートをエスケープする", () => {
		expect(escapeSbplString('a"b')).toBe('a\\"b');
	});

	it("バックスラッシュとダブルクォートの混在をエスケープする", () => {
		expect(escapeSbplString('a\\"b')).toBe('a\\\\\\"b');
	});

	it("エスケープ不要な文字列はそのまま返す", () => {
		expect(escapeSbplString("hello world")).toBe("hello world");
	});
});

describe("pathLiteral", () => {
	it("絶対パスを literal 形式に変換する", () => {
		const result = pathLiteral("/tmp/test");
		expect(result).toBe('(literal "/tmp/test")');
	});

	it("相対パスを resolve して literal 形式に変換する", () => {
		const result = pathLiteral("relative/path");
		expect(result).toContain('(literal "');
		expect(result).toContain(resolve("relative/path"));
	});
});

describe("pathSubpath", () => {
	it("絶対パスを subpath 形式に変換する", () => {
		const result = pathSubpath("/tmp/test");
		expect(result).toBe('(subpath "/tmp/test")');
	});

	it("相対パスを resolve して subpath 形式に変換する", () => {
		const result = pathSubpath("relative/path");
		expect(result).toContain('(subpath "');
		expect(result).toContain(resolve("relative/path"));
	});
});

// ─── Unit tests: permissions ─────────────────────────────────────

describe("parseSandboxMode", () => {
	it("有効なモードをパースする", () => {
		expect(parseSandboxMode("read_only")).toBe("read_only");
		expect(parseSandboxMode("workspace_write")).toBe("workspace_write");
		expect(parseSandboxMode("yolo")).toBe("yolo");
	});

	it("無効なモードは undefined を返す", () => {
		expect(parseSandboxMode("invalid")).toBeUndefined();
		expect(parseSandboxMode("")).toBeUndefined();
		expect(parseSandboxMode("READ_ONLY")).toBeUndefined();
	});
});

describe("modeLabel", () => {
	it("各モードのラベルを返す", () => {
		expect(modeLabel("read_only")).toBe("読み取り専用");
		expect(modeLabel("workspace_write")).toBe("ワークスペース書き込み可能");
		expect(modeLabel("yolo")).toBe("yolo");
	});
});

describe("policy builders", () => {
	it("readOnlyPolicy は read_only を返す", () => {
		const policy = readOnlyPolicy("/tmp");
		expect(policy.mode).toBe("read_only");
		expect(policy.writableRoots).toEqual([]);
		expect(policy.network).toBe(false);
	});

	it("workspaceWritePolicy は workspace_write を返す", () => {
		const policy = workspaceWritePolicy("/tmp", [], ["/tmp"], false);
		expect(policy.mode).toBe("workspace_write");
		expect(policy.writableRoots).toEqual(["/tmp"]);
		expect(policy.network).toBe(false);
	});

	it("yoloPolicy は yolo を返す", () => {
		const policy = yoloPolicy();
		expect(policy.mode).toBe("yolo");
		expect(policy.network).toBe(true);
	});
});

// ─── Unit tests: environment allowlist ───────────────────────────

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

// ─── Unit tests: policy validation ───────────────────────────────

describe("validatePolicy", () => {
	const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-validate-test-"));

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("yolo は常に有効", async () => {
		const policy = yoloPolicy();
		await expect(validatePolicy(policy)).resolves.toBeUndefined();
	});

	it("read_only は writableRoots が空なら有効", async () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		await expect(validatePolicy(policy)).resolves.toBeUndefined();
	});

	it("workspace_write で writableRoots が workspaceRoots 内なら有効", async () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false);
		await expect(validatePolicy(policy)).resolves.toBeUndefined();
	});

	it("workspace_write で writableRoots が workspaceRoots の外なら無効", async () => {
		const outsideDir = mkdtempSync(join(tmpdir(), "sandbox-outside-"));
		try {
			const policy = workspaceWritePolicy(tmpDir, [tmpDir], [outsideDir], false);
			await expect(validatePolicy(policy)).rejects.toThrow("writable root");
		} finally {
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});

	it("workspace_write で / は writableRoots にできない", async () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], ["/"], false);
		await expect(validatePolicy(policy)).rejects.toThrow();
	});

	it("workspace_write で $HOME 全体は writableRoots にできない", async () => {
		const home = process.env.HOME ?? "/Users/test";
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [home], false);
		await expect(validatePolicy(policy)).rejects.toThrow();
	});

	// ── FIX 1: validatePolicy also validates workspaceRoots for unsafe paths ──

	it("validatePolicy は workspaceRoots に / を拒否する (read_only)", async () => {
		const policy = readOnlyPolicy(tmpDir, ["/"]);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /");
	});

	it("validatePolicy は workspaceRoots に / を拒否する (workspace_write)", async () => {
		const policy = workspaceWritePolicy(tmpDir, ["/"], ["/"], false);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /");
	});

	it("validatePolicy は workspaceRoots に $HOME を拒否する", async () => {
		const home = process.env.HOME ?? "/Users/test";
		const policy = readOnlyPolicy(tmpDir, [home]);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be $HOME");
	});

	it("validatePolicy は workspaceRoots に /Users を拒否する", async () => {
		const policy = readOnlyPolicy(tmpDir, ["/Users"]);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /Users");
	});

	it("validatePolicy は workspaceRoots に /Users/<user> を拒否する", async () => {
		const policy = readOnlyPolicy(tmpDir, ["/Users/testuser"]);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /Users");
	});

	it("validatePolicy は cwd が unsafe でも拒否する (workspaceRoots 空)", async () => {
		const policy = readOnlyPolicy("/", []);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /");
	});

	it("validatePolicy は cwd が $HOME でも拒否する (workspaceRoots 空)", async () => {
		const home = process.env.HOME ?? "/Users/test";
		const policy = readOnlyPolicy(home, []);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be $HOME");
	});

	// FIX 1: validatePolicy validates implicit cwd writable root in workspace_write

	it("workspace_write で writableRoots 空 + cwd unsafe は拒否する", async () => {
		const home = process.env.HOME ?? "/Users/test";
		// cwd = $HOME, workspaceRoots empty, writableRoots empty
		// effectiveWritableRoots will be [cwd] = [$HOME] which is unsafe
		const policy = workspaceWritePolicy(home, [], [], false);
		await expect(validatePolicy(policy)).rejects.toThrow();
	});

	it("workspace_write で writableRoots 空 + cwd=/ は拒否する", async () => {
		const policy = workspaceWritePolicy("/", [], [], false);
		await expect(validatePolicy(policy)).rejects.toThrow();
	});

	it("workspace_write で cwd != workspaceRoots + writableRoots 空は検証する", async () => {
		// cwd = /tmp/outside, workspaceRoots = [/tmp/project], writableRoots = []
		// effectiveWritableRoots = [cwd] = [/tmp/outside]
		// This should fail because cwd (/tmp/outside) is outside workspaceRoots
		const projectDir = mkdtempSync(join(tmpdir(), "sandbox-project-"));
		const outsideDir = mkdtempSync(join(tmpdir(), "sandbox-outside3-"));
		try {
			const policy = workspaceWritePolicy(outsideDir, [projectDir], [], false);
			await expect(validatePolicy(policy)).rejects.toThrow("outside workspace roots");
		} finally {
			rmSync(projectDir, { recursive: true, force: true });
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});
});

// ─── Unit tests: pathPolicy ──────────────────────────────────────

describe("isProtectedPath", () => {
	it(".git 配下を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.git/hooks/pre-commit")).toBe(true);
		expect(isProtectedPath("/tmp/project/.git")).toBe(true);
	});

	it(".codex 配下を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.codex/config")).toBe(true);
	});

	it(".agents 配下を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.agents/state")).toBe(true);
	});

	it("通常のパスは保護対象ではない", () => {
		expect(isProtectedPath("/tmp/project/src/index.ts")).toBe(false);
		expect(isProtectedPath("/tmp/project/.github/workflows")).toBe(false);
	});
});

describe("assertPathInsideRoot", () => {
	const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-path-test-"));

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("ルート配下のパスはパスする", async () => {
		const filePath = join(tmpDir, "file.txt");
		writeFileSync(filePath, "test");
		await expect(assertPathInsideRoot(filePath, tmpDir)).resolves.toBeUndefined();
	});

	it("ルート配下のネストしたパスはパスする", async () => {
		const subDir = join(tmpDir, "sub", "dir");
		mkdirSync(subDir, { recursive: true });
		await expect(assertPathInsideRoot(subDir, tmpDir)).resolves.toBeUndefined();
	});

	it("ルート外のパスはエラーを投げる", async () => {
		await expect(assertPathInsideRoot("/etc/hosts", tmpDir)).rejects.toThrow(
			"path escapes sandbox root",
		);
	});

	it("ルート自身はパスする", async () => {
		await expect(assertPathInsideRoot(tmpDir, tmpDir)).resolves.toBeUndefined();
	});
});

describe("resolveRealPaths", () => {
	it("絶対パスを realpath で解決する", async () => {
		const paths = await resolveRealPaths(["/tmp"]);
		expect(paths).toHaveLength(1);
		expect(paths[0]).toMatch(/^\/private\/tmp$|^\/tmp$/);
	});
});

// ─── Unit tests: approvals ───────────────────────────────────────

describe("shouldRequestApproval", () => {
	it("yolo で yoloApproved=true なら承認不要", () => {
		expect(
			shouldRequestApproval("yolo", "rm -rf /", { yoloApproved: true }).needsApproval,
		).toBe(false);
	});

	it("yolo で yoloApproved=false なら承認が必要", () => {
		const result = shouldRequestApproval("yolo", "ls", { yoloApproved: false });
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("明示的な承認");
	});

	it("yolo で yoloApproved 未指定なら承認が必要", () => {
		const result = shouldRequestApproval("yolo", "ls");
		expect(result.needsApproval).toBe(true);
	});

	it("workspace_write で通常コマンドは承認不要", () => {
		expect(shouldRequestApproval("workspace_write", "ls -la").needsApproval).toBe(false);
	});

	it("workspace_write で rm -rf は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "rm -rf ./node_modules");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("再帰的強制削除");
	});

	it("workspace_write で sudo は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "sudo apt install build-essential");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("権限昇格");
	});

	it("workspace_write で安全なコマンドは承認不要", () => {
		expect(shouldRequestApproval("workspace_write", "cat README.md").needsApproval).toBe(false);
		expect(shouldRequestApproval("workspace_write", "git status").needsApproval).toBe(false);
		expect(shouldRequestApproval("workspace_write", "npm test").needsApproval).toBe(false);
	});
});

describe("yoloApprovalMessage", () => {
	it("承認メッセージを返す", () => {
		const msg = yoloApprovalMessage();
		expect(msg).toContain("サンドボックスを完全に無効化");
		expect(msg).toContain("制限なし");
	});
});

// ─── Unit tests: /usr subpath restrictions ────────────────────────

describe("buildMacSeatbeltPolicy: /usr subpath restrictions", () => {
	const tmpDir = "/tmp/sandbox-test";

	it("allowHomebrewPaths=false では /usr/local を含まない", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain('(subpath "/usr/local")');
	});

	it("allowHomebrewPaths=false では /opt/homebrew を含まない", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).not.toContain('(subpath "/opt/homebrew")');
	});

	it("allowHomebrewPaths=true では /usr/local を含む", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		policy.allowHomebrewPaths = true;
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain('(subpath "/usr/local")');
	});

	it("allowHomebrewPaths=true では /opt/homebrew を含む", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		policy.allowHomebrewPaths = true;
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain('(subpath "/opt/homebrew")');
	});

	it("(subpath \"/usr\") は含まない（細分化されている）", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		const sbpl = buildMacSeatbeltPolicy(policy);

		// Should NOT have a bare (subpath "/usr") — only subdirs
		const hasBareUsr = /^\s*\(subpath "\/usr"\)\s*$/m.test(sbpl);
		expect(hasBareUsr).toBe(false);
	});
});

// ─── Unit tests: PATH restrictions ─────────────────────────────────

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
});

// ─── Unit tests: .git pointer resolution ──────────────────────────

describe("resolveGitdirPaths", () => {
	const testGitDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-test-"));

	afterAll(() => {
		rmSync(testGitDir, { recursive: true, force: true });
	});

	it(".git directory はそのパスを返す", async () => {
		const gitDir = join(testGitDir, ".git");
		mkdirSync(gitDir, { recursive: true });

		const paths = await resolveGitdirPaths(testGitDir);
		expect(paths).toHaveLength(1);
		expect(paths[0]).toContain(".git");
	});

	it(".git pointer file は gitdir を解決する", async () => {
		const subDir = join(testGitDir, "pointer-test");
		mkdirSync(subDir, { recursive: true });
		const externalGitdir = join(testGitDir, "external-git");
		mkdirSync(externalGitdir, { recursive: true });

		writeFileSync(join(subDir, ".git"), `gitdir: ${externalGitdir}\n`);

		const paths = await resolveGitdirPaths(subDir);
		expect(paths).toHaveLength(2); // gitdir + pointer file itself
		expect(paths.some((p) => p.includes("external-git"))).toBe(true);
	});

	it(".git が存在しない場合は空配列", async () => {
		const emptyDir = join(testGitDir, "no-git");
		mkdirSync(emptyDir, { recursive: true });

		const paths = await resolveGitdirPaths(emptyDir);
		expect(paths).toHaveLength(0);
	});

	it(".git pointer file with relative gitdir is resolved against workspace root", async () => {
		const subDir = join(testGitDir, "relative-pointer-test");
		mkdirSync(subDir, { recursive: true });
		const externalGitdir = join(testGitDir, "relative-gitdir");
		mkdirSync(externalGitdir, { recursive: true });

		// Use a relative path instead of absolute
		writeFileSync(join(subDir, ".git"), "gitdir: ../relative-gitdir\n");

		const paths = await resolveGitdirPaths(subDir);
		expect(paths).toHaveLength(2);
		expect(paths.some((p) => p.includes("relative-gitdir"))).toBe(true);
	});
});

// ─── Unit tests: workspace root validation ─────────────────────────

describe("validateWorkspaceRoot", () => {
	it("正常な project directory は pass する", async () => {
		const projectDir = mkdtempSync(join(tmpdir(), "sandbox-project-"));
		try {
			const { validateWorkspaceRoot } = await import("../pathPolicy.js");
			await expect(validateWorkspaceRoot(projectDir)).resolves.toBeUndefined();
		} finally {
			rmSync(projectDir, { recursive: true, force: true });
		}
	});

	it("workspace root に / は不可", async () => {
		const { validateWorkspaceRoot } = await import("../pathPolicy.js");
		await expect(validateWorkspaceRoot("/")).rejects.toThrow("cannot be /");
	});

	it("workspace root に $HOME は不可", async () => {
		const { validateWorkspaceRoot } = await import("../pathPolicy.js");
		const home = process.env.HOME ?? "/Users/test";
		await expect(validateWorkspaceRoot(home)).rejects.toThrow("cannot be $HOME");
	});

	it("workspace root に /Users は不可", async () => {
		const { validateWorkspaceRoot } = await import("../pathPolicy.js");
		await expect(validateWorkspaceRoot("/Users")).rejects.toThrow("cannot be /Users");
	});

	it("workspace root に /Users/<user> は不可", async () => {
		const { validateWorkspaceRoot } = await import("../pathPolicy.js");
		await expect(validateWorkspaceRoot("/Users/testuser")).rejects.toThrow("cannot be /Users");
	});
});

// ─── Unit tests: dependency validation ──────────────────────────────

describe("package.json dependencies", () => {
	it("peerDependencies に @earendil-works/pi-coding-agent が含まれる", async () => {
		const pkg = await import("../package.json", { assert: { type: "json" } });
		expect(pkg.default.peerDependencies).toBeDefined();
		expect(pkg.default.peerDependencies["@earendil-works/pi-coding-agent"]).toBeDefined();
	});

	it("devDependencies に typescript が含まれる", async () => {
		const pkg = await import("../package.json", { assert: { type: "json" } });
		expect(pkg.default.devDependencies.typescript).toBeDefined();
	});

	it("devDependencies に @types/node が含まれる", async () => {
		const pkg = await import("../package.json", { assert: { type: "json" } });
		expect(pkg.default.devDependencies["@types/node"]).toBeDefined();
	});
});

// ─── Integration test helpers ───────────────────────────────────────

/**
 * Verify a process no longer exists, with retries for CI stability.
 * Unix zombies / scheduling delays can cause false positives in
 * process.kill(pid, 0) checks. Retry with backoff to avoid flaky tests.
 */
async function expectProcessGone(pid: number, retries = 10): Promise<void> {
	for (let i = 0; i < retries; i++) {
		try {
			process.kill(pid, 0);
			// Process still exists, wait and retry
			await new Promise<void>((r) => setTimeout(r, 100));
		} catch {
			return; // process is gone — success
		}
	}
	throw new Error(`process ${pid} still exists after ${retries} retries`);
}

// ─── Integration tests (macOS + sandbox-exec only) ───────────────

const describeMac = isMac ? describe : describe.skip;

describeMac("runSandboxedShellMac (integration)", () => {
	let testDir: string;
	let sandboxReady = false;

	beforeAll(async () => {
		sandboxReady = await isMacSandboxAvailable();
		testDir = mkdtempSync(join(tmpdir(), "sandbox-integ-test-"));
	});

	afterAll(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	// sandbox-exec が利用可能かを実行時にチェックするヘルパー
	const requireMacSandboxTests = process.env.RUN_MAC_SANDBOX_TESTS === "1";

	function itSandbox(
		name: string,
		fn: () => Promise<void>,
		timeout?: number,
	) {
		it(
			name,
			async () => {
				if (sandboxReady) {
					await fn();
					return;
				}

				// sandbox-exec not available
				if (requireMacSandboxTests) {
					throw new Error(
						"macOS sandbox tests were required (RUN_MAC_SANDBOX_TESTS=1) " +
						"but sandbox-exec is unavailable",
					);
				}

				// Not required — skip silently
			},
			timeout,
		);
	}

	// ── read_only: 許可されるべき操作 ──────────────────────────────

	itSandbox("read_only: workspace 内ファイルを読み取れる", async () => {
		const filePath = join(testDir, "package.json");
		writeFileSync(filePath, '{"name": "test"}');

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(`cat "${filePath}"`, policy);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("test");
	});

	itSandbox("read_only: ls でディレクトリを一覧できる", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(`ls "${testDir}"`, policy);

		expect(result.code).toBe(0);
	});

	itSandbox("read_only: pwd が動作する", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac("pwd", policy);

		expect(result.code).toBe(0);
	});

	// ── read_only: 拒否されるべき操作 ──────────────────────────────

	itSandbox("read_only: ファイル書き込みは拒否される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			`echo test > "${join(testDir, "blocked.txt")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("read_only: ファイル作成は拒否される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			`touch "${join(testDir, "new.txt")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("read_only: ディレクトリ作成は拒否される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			`mkdir "${join(testDir, "newdir")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("read_only: ~/.ssh/config は読めない", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"cat ~/.ssh/config 2>/dev/null; test $? -eq 0 && echo ACCESS_GRANTED || echo ACCESS_DENIED",
			policy,
		);

		expect(result.stdout).toContain("ACCESS_DENIED");
	});

	itSandbox("read_only: /Users 全体は list できない", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"ls /Users 2>&1; test $? -eq 0 && echo ACCESS_GRANTED || echo ACCESS_DENIED",
			policy,
		);

		expect(result.stdout).toContain("ACCESS_DENIED");
	});

	// ── workspace_write: 許可されるべき操作 ────────────────────────

	itSandbox("workspace_write: ファイル書き込みができる", async () => {
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`echo "write test" > "${join(testDir, "allowed.txt")}"`,
			policy,
		);

		expect(result.code).toBe(0);
	});

	itSandbox("workspace_write: ディレクトリ作成ができる", async () => {
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`mkdir -p "${join(testDir, "subdir")}"`,
			policy,
		);

		expect(result.code).toBe(0);
	});

	itSandbox("workspace_write: 既存ファイルの読み取りができる", async () => {
		const filePath = join(testDir, "readable.txt");
		writeFileSync(filePath, "read me");

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(`cat "${filePath}"`, policy);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("read me");
	});

	// ── workspace_write: 拒否されるべき操作 ────────────────────────

	itSandbox("workspace_write: .git 内の書き込みは拒否される", async () => {
		const gitDir = join(testDir, ".git", "hooks");
		mkdirSync(gitDir, { recursive: true });

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`echo x > "${join(gitDir, "pre-commit")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("workspace_write: .codex 内の書き込みは拒否される", async () => {
		const codexDir = join(testDir, ".codex");
		mkdirSync(codexDir, { recursive: true });

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`echo x > "${join(codexDir, "config")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("workspace_write: .agents 内の書き込みは拒否される", async () => {
		const agentsDir = join(testDir, ".agents");
		mkdirSync(agentsDir, { recursive: true });

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`echo x > "${join(agentsDir, "state")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("workspace_write: symlink 経由で workspace 外に書き込めない", async () => {
		const outsideDir = mkdtempSync("/tmp/sandbox-outside-");
		const linkPath = join(testDir, "escape_link");
		try {
			if (!existsSync(linkPath)) {
				symlinkSync(outsideDir, linkPath);
			}

			const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
			const result = await runSandboxedShellMac(
				`echo x > "${join(linkPath, "escaped.txt")}"`,
				policy,
			);

			expect(result.code).not.toBe(0);
		} finally {
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});

	itSandbox("workspace_write: symlink 経由で .git に書き込めない", async () => {
		const gitDir = join(testDir, ".git");
		mkdirSync(gitDir, { recursive: true });
		const linkPath = join(testDir, "git_link");
		try {
			if (!existsSync(linkPath)) {
				symlinkSync(gitDir, linkPath);
			}

			const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
			const result = await runSandboxedShellMac(
				`echo x > "${join(linkPath, "config")}"`,
				policy,
			);

			expect(result.code).not.toBe(0);
		} finally {
			// cleanup
		}
	});

	// ── network ────────────────────────────────────────────────────

	itSandbox("network=false で curl は拒否される", async () => {
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			"curl --connect-timeout 2 https://example.com",
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	// ── environment isolation ──────────────────────────────────────

	itSandbox("env: OPENAI_API_KEY が子プロセスに渡らない", async () => {
		const origKey = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "sk-test-secret-key-integration";
		try {
			const policy = readOnlyPolicy(testDir, [testDir]);
			const result = await runSandboxedShellMac(
				"echo \"OPENAI_KEY=$OPENAI_API_KEY\"",
				policy,
			);

			expect(result.code).toBe(0);
			expect(result.stdout).not.toContain("sk-test-secret-key-integration");
		} finally {
			if (origKey) process.env.OPENAI_API_KEY = origKey;
			else delete process.env.OPENAI_API_KEY;
		}
	});

	itSandbox("env: GITHUB_TOKEN が子プロセスに渡らない", async () => {
		const origToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = "ghp-integration-test-secret";
		try {
			const policy = readOnlyPolicy(testDir, [testDir]);
			const result = await runSandboxedShellMac(
				"echo \"GITHUB=$GITHUB_TOKEN\"",
				policy,
			);

			expect(result.code).toBe(0);
			expect(result.stdout).not.toContain("ghp-integration-test-secret");
		} finally {
			if (origToken) process.env.GITHUB_TOKEN = origToken;
			else delete process.env.GITHUB_TOKEN;
		}
	});

	// ── timeout / output cap ───────────────────────────────────────

	itSandbox("timeout が発火するとプロセスが kill される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"sleep 30",
			policy,
			{ timeoutMs: 1000 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("timed out");
	});

	itSandbox("maxOutputBytes を超えるとエラーになる (combined)", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"cat /dev/urandom | head -c 10000000 | base64",
			policy,
			{ maxOutputBytes: 1024 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("output limit");
	});

	// ── process group kill ───────────────────────────────────────────

	itSandbox("background process が timeout 後に kill される (stdout PID verification)", async () => {
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		// Start a background sleep, echo its PID to stdout so we can capture it
		// Using workspace_write so the command can write to $TMPDIR if needed
		const result = await runSandboxedShellMac(
			"sleep 1000 & BG_PID=$!; echo BG_PID=$BG_PID; wait",
			policy,
			{ timeoutMs: 1500 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("timed out");

		// Extract PID from stdout and verify the process no longer exists
		// Use Node parent process side verification with retry for CI stability
		const pidMatch = result.stdout.match(/BG_PID=(\d+)/);
		if (pidMatch?.[1]) {
			const pid = parseInt(pidMatch[1], 10);
			if (pid > 0) {
				await expectProcessGone(pid);
			}
		}
	}, 15000);

	itSandbox("background process が abort 後に kill される (stdout PID verification)", async () => {
		const controller = new AbortController();
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);

		// Abort after a short delay
		setTimeout(() => controller.abort(), 500);

		const result = await runSandboxedShellMac(
			"sleep 1000 & BG_PID=$!; echo BG_PID=$BG_PID; wait",
			policy,
			{ signal: controller.signal, timeoutMs: 60000 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("aborted");

		// Extract PID from stdout and verify the process is dead
		const pidMatch = result.stdout.match(/BG_PID=(\d+)/);
		if (pidMatch?.[1]) {
			const pid = parseInt(pidMatch[1], 10);
			if (pid > 0) {
				await expectProcessGone(pid);
			}
		}
	}, 15000);

	// ── per-run temp directory ───────────────────────────────────────

	itSandbox("read_only: per-run temp dir への write ができる", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"echo test > $TMPDIR/write-test && cat $TMPDIR/write-test; echo TMPDIR=$TMPDIR",
			policy,
		);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("test");
		// Verify TMPDIR is a per-run isolated dir
		expect(result.stdout).toContain("sandbox-run-");
	});

	// ── .git pointer file ────────────────────────────────────────────

	itSandbox("workspace_write: resolved gitdir への write が失敗する", async () => {
		const worktreeDir = join(testDir, "worktree-test");
		mkdirSync(worktreeDir, { recursive: true });
		const externalGitdir = join("/tmp", "external-gitdir-" + Date.now());
		mkdirSync(externalGitdir, { recursive: true });
		writeFileSync(join(worktreeDir, ".git"), `gitdir: ${externalGitdir}\n`);

		try {
			const policy = workspaceWritePolicy(worktreeDir, [worktreeDir], [worktreeDir], false);
			const result = await runSandboxedShellMac(
				`echo x > "${join(externalGitdir, "config")}"`,
				policy,
			);

			expect(result.code).not.toBe(0);
		} finally {
			rmSync(externalGitdir, { recursive: true, force: true });
			rmSync(worktreeDir, { recursive: true, force: true });
		}
	});

	// ── AbortSignal propagation ───────────────────────────────────────

	itSandbox("AbortSignal が cancel を伝播する", async () => {
		const controller = new AbortController();
		const policy = readOnlyPolicy(testDir, [testDir]);

		// Abort after a short delay
		setTimeout(() => controller.abort(), 500);

		const result = await runSandboxedShellMac(
			"sleep 30",
			policy,
			{ signal: controller.signal, timeoutMs: 60000 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("aborted");
	}, 10000);

	// ── FIX 2: Isolated HOME and no startup files ────────────────────

	itSandbox("$HOME は isolated temp home を指す (workspace ではない)", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac("echo HOME=$HOME", policy);

		expect(result.code).toBe(0);
		// HOME should contain "sandbox-run-" and "/home"
		expect(result.stdout).toContain("sandbox-run-");
		expect(result.stdout).toContain("/home");
		// HOME should NOT be the workspace
		expect(result.stdout).not.toContain(`HOME=${testDir}`);
	});

	itSandbox(".bash_profile が workspace にあっても実行されない", async () => {
		// Create .bash_profile that writes a marker file
		writeFileSync(join(testDir, ".bash_profile"), `echo BASH_PROFILE_LOADED > "${join(testDir, "bash-profile-marker.txt")}"\n`);
		writeFileSync(join(testDir, ".profile"), `echo PROFILE_LOADED > "${join(testDir, "profile-marker.txt")}"\n`);

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		// Just run a simple command; startup files should NOT be loaded
		const result = await runSandboxedShellMac("echo done", policy);

		expect(result.code).toBe(0);
		// The marker files should NOT exist because startup files were not loaded
		expect(existsSync(join(testDir, "bash-profile-marker.txt"))).toBe(false);
		expect(existsSync(join(testDir, "profile-marker.txt"))).toBe(false);
	});

	itSandbox(".profile が workspace にあっても実行されない", async () => {
		writeFileSync(join(testDir, ".profile"), `export PROFILE_MARKER=1\n`);

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac("echo PROFILE=$PROFILE_MARKER", policy);

		expect(result.code).toBe(0);
		// PROFILE_MARKER should not be set because .profile was not loaded
		expect(result.stdout).not.toContain("PROFILE=1");
	});

	// ── FIX 6: maxOutputBytes combined stdout+stderr ─────────────────

	itSandbox("maxOutputBytes は stdout + stderr の合計で制限される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		// Write to both stdout and stderr, totaling over the limit
		const result = await runSandboxedShellMac(
			"echo stdout_data; echo stderr_data >&2; cat /dev/urandom | head -c 100000 | base64",
			policy,
			{ maxOutputBytes: 512 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("output limit");
	});
});

// ─── Unit tests: truncateForLlm ──────────────────────────────────────

import { truncateForLlm, DEFAULT_LLM_OUTPUT_MAX_BYTES, DEFAULT_LLM_OUTPUT_MAX_LINES } from "../index.js";

describe("truncateForLlm", () => {
	it("短いテキストはそのまま返す", () => {
		const result = truncateForLlm("hello");
		expect(result.text).toBe("hello");
		expect(result.truncated).toBe(false);
		expect(result.originalBytes).toBe(5);
		expect(result.originalLines).toBe(1);
	});

	it("\r\n を含むテキストの行数も正確にカウントされる", () => {
		const result = truncateForLlm("line1\r\nline2\r\nline3");
		expect(result.originalLines).toBe(3);
		expect(result.truncated).toBe(false);
	});

	it("単一行の長いテキストがバイト制限のみで切り詰められる", () => {
		const text = "x".repeat(60 * 1024); // 60KB
		const result = truncateForLlm(text, { maxBytes: 10 * 1024, maxLines: 100 });
		expect(result.truncated).toBe(true);
		expect(result.originalBytes).toBe(60 * 1024);
		expect(result.originalLines).toBe(1);
	});

	it("空文字列はそのまま返す", () => {
		const result = truncateForLlm("");
		expect(result.text).toBe("");
		expect(result.truncated).toBe(false);
		expect(result.originalBytes).toBe(0);
		expect(result.originalLines).toBe(0);
	});

	it("100KB 以上の stdout は 50KB 程度に短縮される", () => {
		// 100KB of 'a' repeated
		const largeText = "a".repeat(100 * 1024);
		const result = truncateForLlm(largeText);
		expect(result.truncated).toBe(true);
		expect(result.originalBytes).toBe(100 * 1024);
		expect(result.originalLines).toBe(1);
		// The output should be at most ~50KB + truncation notice
		expect(Buffer.byteLength(result.text, "utf8")).toBeLessThan(60 * 1024);
		expect(result.text).toContain("切り詰められました");
	});

	it("3000 行の stdout は 2000 行程度に短縮される", () => {
		const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
		const text = lines.join("\n");
		const result = truncateForLlm(text);
		expect(result.truncated).toBe(true);
		expect(result.originalLines).toBe(3000);
		// The result should have at most 2000 lines + truncation notice
		const resultLines = result.text.split("\n").length;
		expect(resultLines).toBeLessThanOrEqual(2010); // some slack for the notice
		expect(result.text).toContain("切り詰められました");
	});

	it("非 ASCII 文字でも正確にバイト制限される", () => {
		// 'あ' is 3 bytes in UTF-8
		const text = "あ".repeat(20000); // 60000 bytes
		const result = truncateForLlm(text, { maxBytes: 5000, maxLines: 50000 });
		expect(result.truncated).toBe(true);
		expect(result.originalBytes).toBe(60000);
		// Should not end with a replacement character
		expect(result.text.endsWith("\uFFFD")).toBe(false);
	});

	it("custom opts を渡せる", () => {
		const text = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
		const result = truncateForLlm(text, { maxBytes: 100000, maxLines: 10 });
		expect(result.truncated).toBe(true);
		expect(result.text).toContain("切り詰められました");
	});

	it("truncation notice に元のサイズ情報が含まれる", () => {
		const largeText = "x".repeat(60 * 1024);
		const result = truncateForLlm(largeText);
		expect(result.text).toContain(`元の ${60 * 1024} バイト`);
		expect(result.text).toContain("1 行");
		expect(result.text).toContain(`${DEFAULT_LLM_OUTPUT_MAX_BYTES} バイト`);
		expect(result.text).toContain(`${DEFAULT_LLM_OUTPUT_MAX_LINES} 行`);
	});
});

// ─── Unit tests: resolveSafeRealPath ─────────────────────────────────

describe("resolveSafeRealPath", () => {
	it("存在するパスは realpath を返す", async () => {
		const { resolveSafeRealPath } = await import("../pathPolicy.js");
		const result = await resolveSafeRealPath("/tmp");
		expect(result).toMatch(/^\/private\/tmp$|^\/tmp$/);
	});

	it("存在しないパスは resolve の結果を返す", async () => {
		const { resolveSafeRealPath } = await import("../pathPolicy.js");
		const result = await resolveSafeRealPath("/nonexistent/path/to/file");
		expect(result).toBe("/nonexistent/path/to/file");
	});
});

// ─── Unit tests: buildMacSeatbeltPolicy edge cases ───────────────────

describe("buildMacSeatbeltPolicy: resolved gitdir deny rules", () => {
	it("_resolvedGitdirs がある場合、deny rules を含む", () => {
		const policy = workspaceWritePolicy("/tmp/workspace", ["/tmp/workspace"], ["/tmp/workspace"], false);
		policy._resolvedGitdirs = ["/tmp/workspace/.git", "/tmp/external-git"];
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toContain("Resolved .git directories");
		expect(sbpl).toContain('subpath "/tmp/workspace/.git"');
		expect(sbpl).toContain('subpath "/tmp/external-git"');
	});

	it("_resolvedGitdirs が空の場合、deny rules セクションを含まない", () => {
		const policy = workspaceWritePolicy("/tmp/workspace", ["/tmp/workspace"], ["/tmp/workspace"], false);
		policy._resolvedGitdirs = [];
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).not.toContain("Resolved .git directories");
	});
});

describe("buildMacSeatbeltPolicy: isolated temp dir section", () => {
	it("_isolatedTempDir がある場合、temp dir rules を含む", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		policy._isolatedTempDir = "/tmp/sandbox-run-abc123";
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toContain("Per-run isolated temp directory");
		expect(sbpl).toContain('subpath "/tmp/sandbox-run-abc123"');
	});

	it("_isolatedTempDir がない場合、temp dir セクションを含まない", () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).not.toContain("Per-run isolated temp directory");
	});
});

describe("buildMacSeatbeltPolicy: read_only explicit deny section", () => {
	it("read_only は workspace root への write deny を含む", () => {
		const policy = readOnlyPolicy("/tmp/project", ["/tmp/project"]);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toContain("read_only mode — explicitly deny writes to workspace roots");
		expect(sbpl).toContain('deny file-write*');
	});

	it("workspace_write は read_only deny セクションを含まない", () => {
		const policy = workspaceWritePolicy("/tmp/project", ["/tmp/project"], ["/tmp/project"], false);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).not.toContain("read_only mode — explicitly deny writes");
	});
});

// ─── Unit tests: buildSandboxEnv additional cases ──────────────────────

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

// ─── Unit tests: runSandboxedShellMac error handling ──────────────────

describe("runSandboxedShellMac: empty command rejection", () => {
	it("空文字列コマンドは例外を投げる", async () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		await expect(runSandboxedShellMac("", policy)).rejects.toThrow("empty command");
	});

	it("空白のみのコマンドは例外を投げる", async () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		await expect(runSandboxedShellMac("   ", policy)).rejects.toThrow("empty command");
	});
});

// ─── Unit tests: validatePolicy read_only with writableRoots ──────────

describe("validatePolicy: read_only mode constraints", () => {
	it("read_only で writableRoots がある場合はエラー", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-readonly-writable-test-"));
		try {
			const policy: SandboxPolicy = {
				mode: "read_only",
				cwd: tmpDir,
				workspaceRoots: [tmpDir],
				writableRoots: [tmpDir], // should not be allowed
				network: false,
			};
			await expect(validatePolicy(policy)).rejects.toThrow("read_only mode must not have writableRoots");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});

// ─── Unit tests: validatePolicy symlink escape detection ──────────────

describe("validatePolicy: symlink-based writable root escape", () => {
	it("symlink で workspace 外を指す writableRoot を検出する", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-symlink-test-"));
		const outsideDir = mkdtempSync(join(tmpdir(), "sandbox-symlink-outside-"));
		const linkPath = join(tmpDir, "escape_link");
		try {
			symlinkSync(outsideDir, linkPath);
			const policy = workspaceWritePolicy(tmpDir, [tmpDir], [linkPath], false);
			await expect(validatePolicy(policy)).rejects.toThrow("outside workspace roots");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});
});
