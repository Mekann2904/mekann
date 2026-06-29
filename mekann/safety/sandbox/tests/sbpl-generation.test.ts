/**
 * SBPL (Seatbelt Profile Language) ポリシー生成のテスト。
 *
 * buildMacSeatbeltPolicy が各 SandboxPolicy から出力する SBPL 文字列の
 * 内容（許可/拒否ルール、保護パス、network、homebrew パス等）を検証する。
 */

import { describe, it, expect } from "vitest";

import { buildMacSeatbeltPolicy } from "../macSeatbelt.js";

import { readOnlyPolicy, workspaceWritePolicy, yoloPolicy } from "../permissions.js";

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

	it("workspace_write は writable rules と保護ディレクトリ deny (.git/.pi/.codex/.agents) を含む", () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false);
		const sbpl = buildMacSeatbeltPolicy(policy);

		expect(sbpl).toContain("(deny default)");
		expect(sbpl).toContain("allow file-write*");
		// writable roots が含まれる
		expect(sbpl).toContain(`subpath "${tmpDir}"`);
		// 保護パス deny — PROTECTED_DIRS 単一ソース (issue #80 C-005: .pi 追加で subagent と一致)
		expect(sbpl).toContain("\\.git");
		expect(sbpl).toContain("\\.pi");
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

	// Tests that use policy builder functions (readOnlyPolicy/workspaceWritePolicy) with allowHomebrewPaths param
	it("readOnlyPolicy(cwd, roots, true) produces SBPL with /opt/homebrew", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir], true);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toContain('(subpath "/opt/homebrew")');
		expect(sbpl).toContain('(subpath "/usr/local")');
	});

	it("readOnlyPolicy(cwd, roots, false) produces SBPL without homebrew paths", () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir], false);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).not.toContain('(subpath "/opt/homebrew")');
		expect(sbpl).not.toContain('(subpath "/usr/local")');
	});

	it("workspaceWritePolicy(cwd, roots, wRoots, net, true) produces SBPL with /opt/homebrew", () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false, true);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toContain('(subpath "/opt/homebrew")');
		expect(sbpl).toContain('(subpath "/usr/local")');
	});

	it("workspaceWritePolicy(cwd, roots, wRoots, net, false) produces SBPL without homebrew paths", () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false, false);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).not.toContain('(subpath "/opt/homebrew")');
		expect(sbpl).not.toContain('(subpath "/usr/local")');
	});
});

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

