/**
 * SBPL Policy Snapshot Tests。
 *
 * ポリシー全体の内容をスナップショットとして記録し、
 * コード変更時に意図しない regression を検出する。
 *
 * メンテナンスコスト削減: SBPL の変更はセキュリティに直結するため、
 * スナップショットで全体を保護することで、レビュー時の負担を軽減する。
 */

import { describe, it, expect } from "vitest";
import {
	buildMacSeatbeltPolicy,
} from "../macSeatbelt.js";
import {
	readOnlyPolicy,
	workspaceWritePolicy,
	yoloPolicy,
} from "../permissions.js";

// ─── Snapshots: 全ポリシーパターンの回帰テスト ──────────────────

describe("SBPL policy snapshots", () => {
	const CWD = "/Users/dev/project";
	const ROOTS = [CWD];

	it("read_only (基本)", () => {
		const policy = readOnlyPolicy(CWD, ROOTS);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("read_only + homebrew", () => {
		const policy = readOnlyPolicy(CWD, ROOTS);
		policy.allowHomebrewPaths = true;
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("read_only + isolated temp dir", () => {
		const policy = readOnlyPolicy(CWD, ROOTS);
		policy._isolatedTempDir = "/tmp/sandbox-run-xyz789";
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("read_only + resolved gitdirs", () => {
		const policy = readOnlyPolicy(CWD, ROOTS);
		policy._isolatedTempDir = "/tmp/sandbox-run-abc";
		policy._resolvedGitdirs = ["/Users/dev/project/.git", "/tmp/external-gitdir"];
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("workspace_write (基本)", () => {
		const policy = workspaceWritePolicy(CWD, ROOTS, ROOTS, false);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("workspace_write + network", () => {
		const policy = workspaceWritePolicy(CWD, ROOTS, ROOTS, true);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("workspace_write + homebrew", () => {
		const policy = workspaceWritePolicy(CWD, ROOTS, ROOTS, false);
		policy.allowHomebrewPaths = true;
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("workspace_write + isolated temp + gitdirs", () => {
		const policy = workspaceWritePolicy(CWD, ROOTS, ROOTS, false);
		policy._isolatedTempDir = "/tmp/sandbox-run-abc";
		policy._resolvedGitdirs = ["/Users/dev/project/.git"];
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("yolo", () => {
		const policy = yoloPolicy();
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("workspaceRoots 空 (cwd 使用)", () => {
		const policy = readOnlyPolicy(CWD, []);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("複数 workspaceRoots", () => {
		const policy = readOnlyPolicy(CWD, [CWD, "/tmp/other-root"]);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});

	it("writableRoots ≠ workspaceRoots", () => {
		const policy = workspaceWritePolicy(
			CWD,
			[CWD, "/tmp/other-root"],
			[`${CWD}/src`],
			false,
		);
		const sbpl = buildMacSeatbeltPolicy(policy);
		expect(sbpl).toMatchSnapshot();
	});
});

// ─── isSafeCommand regression ────────────────────────────────────
//
// These security boundary tests live in plan-mode/plan-mode.test.ts.
// Cross-module security regression is covered by the isSafeCommand
// exhaustive tests there (safe commands, dangerous commands, edge cases).

// ─── Policy structure invariants ──────────────────────────────────

describe("SBPL policy structure invariants", () => {
	it("read_only は常に (deny default) で始まる", () => {
		const policies = [
			readOnlyPolicy("/tmp/a", ["/tmp/a"]),
			readOnlyPolicy("/tmp/b", ["/tmp/b"], ),
		];
		for (const p of policies) {
			const sbpl = buildMacSeatbeltPolicy(p);
			expect(sbpl).toContain("(deny default)");
			expect(sbpl).not.toContain("(allow default)");
		}
	});

	it("workspace_write は常に (deny default) で始まる", () => {
		const policies = [
			workspaceWritePolicy("/tmp/a", ["/tmp/a"], ["/tmp/a"], false),
			workspaceWritePolicy("/tmp/a", ["/tmp/a"], ["/tmp/a"], true),
		];
		for (const p of policies) {
			const sbpl = buildMacSeatbeltPolicy(p);
			expect(sbpl).toContain("(deny default)");
			expect(sbpl).not.toContain("(allow default)");
		}
	});

	it("yolo は常に (allow default) のみ", () => {
		const sbpl = buildMacSeatbeltPolicy(yoloPolicy());
		expect(sbpl).toContain("(allow default)");
		expect(sbpl).not.toContain("(deny default)");
	});

	it("全ポリシーは (version 1) を含む", () => {
		const policies = [
			readOnlyPolicy("/tmp/a", ["/tmp/a"]),
			workspaceWritePolicy("/tmp/a", ["/tmp/a"], ["/tmp/a"], false),
			yoloPolicy(),
		];
		for (const p of policies) {
			expect(buildMacSeatbeltPolicy(p)).toContain("(version 1)");
		}
	});

	it("非 yolo ポリシーは process-exec, process-fork を許可する", () => {
		const policies = [
			readOnlyPolicy("/tmp/a", ["/tmp/a"]),
			workspaceWritePolicy("/tmp/a", ["/tmp/a"], ["/tmp/a"], false),
		];
		for (const p of policies) {
			const sbpl = buildMacSeatbeltPolicy(p);
			expect(sbpl).toContain("(allow process-exec)");
			expect(sbpl).toContain("(allow process-fork)");
		}
	});

	it("非 yolo ポリシーは保護パス deny を含む", () => {
		const policies = [
			readOnlyPolicy("/tmp/a", ["/tmp/a"]),
			workspaceWritePolicy("/tmp/a", ["/tmp/a"], ["/tmp/a"], false),
		];
		for (const p of policies) {
			const sbpl = buildMacSeatbeltPolicy(p);
			expect(sbpl).toMatch(/\.git/);
			expect(sbpl).toMatch(/\.codex/);
			expect(sbpl).toMatch(/\.agents/);
		}
	});

	it("signal と process-info は same-sandbox 制限付き", () => {
		const policies = [
			readOnlyPolicy("/tmp/a", ["/tmp/a"]),
			workspaceWritePolicy("/tmp/a", ["/tmp/a"], ["/tmp/a"], false),
		];
		for (const p of policies) {
			const sbpl = buildMacSeatbeltPolicy(p);
			expect(sbpl).toContain("(allow signal (target same-sandbox))");
			expect(sbpl).toContain("(allow process-info* (target same-sandbox))");
		}
	});

	it("yolo は process-exec/fork/signal 制限を含まない", () => {
		const sbpl = buildMacSeatbeltPolicy(yoloPolicy());
		expect(sbpl).not.toContain("same-sandbox");
	});
});
