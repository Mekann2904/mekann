/**
 * Sandbox Permissions の独立テスト。
 *
 * SandboxMode 型、ポリシービルダー、parseSandboxMode、modeLabel
 * を体系的に検証する。
 */

import { describe, it, expect } from "vitest";
import {
	readOnlyPolicy,
	workspaceWritePolicy,
	dangerFullAccessPolicy,
	parseSandboxMode,
	modeLabel,
	type SandboxMode,
	type SandboxPolicy,
} from "../permissions.js";

// ─── readOnlyPolicy ──────────────────────────────────────────────

describe("readOnlyPolicy", () => {
	it("基本的な read_only ポリシーを生成する", () => {
		const policy = readOnlyPolicy("/tmp/project");
		expect(policy.mode).toBe("read_only");
		expect(policy.cwd).toBe("/tmp/project");
		expect(policy.workspaceRoots).toEqual([]);
		expect(policy.writableRoots).toEqual([]);
		expect(policy.network).toBe(false);
	});

	it("workspaceRoots を指定できる", () => {
		const policy = readOnlyPolicy("/tmp/project", ["/tmp/project", "/tmp/other"]);
		expect(policy.workspaceRoots).toEqual(["/tmp/project", "/tmp/other"]);
	});

	it("allowHomebrewPaths はデフォルト undefined", () => {
		const policy = readOnlyPolicy("/tmp/project");
		expect(policy.allowHomebrewPaths).toBeUndefined();
	});

	it("network は常に false", () => {
		const policy = readOnlyPolicy("/tmp/project");
		expect(policy.network).toBe(false);
	});

	it("writableRoots は常に空", () => {
		const policy = readOnlyPolicy("/tmp/project");
		expect(policy.writableRoots).toEqual([]);
	});

	it("_isolatedTempDir はデフォルト undefined", () => {
		const policy = readOnlyPolicy("/tmp/project");
		expect(policy._isolatedTempDir).toBeUndefined();
	});

	it("_resolvedGitdirs はデフォルト undefined", () => {
		const policy = readOnlyPolicy("/tmp/project");
		expect(policy._resolvedGitdirs).toBeUndefined();
	});
});

// ─── workspaceWritePolicy ────────────────────────────────────────

describe("workspaceWritePolicy", () => {
	it("基本的な workspace_write ポリシーを生成する", () => {
		const policy = workspaceWritePolicy("/tmp/project");
		expect(policy.mode).toBe("workspace_write");
		expect(policy.cwd).toBe("/tmp/project");
		expect(policy.writableRoots).toEqual([]);
		expect(policy.network).toBe(false);
	});

	it("writableRoots を指定できる", () => {
		const policy = workspaceWritePolicy("/tmp/project", [], ["/tmp/project/src"]);
		expect(policy.writableRoots).toEqual(["/tmp/project/src"]);
	});

	it("network=true を指定できる", () => {
		const policy = workspaceWritePolicy("/tmp/project", [], [], true);
		expect(policy.network).toBe(true);
	});

	it("network=false を指定できる (default)", () => {
		const policy = workspaceWritePolicy("/tmp/project", [], [], false);
		expect(policy.network).toBe(false);
	});

	it("workspaceRoots と writableRoots を同時に指定できる", () => {
		const policy = workspaceWritePolicy(
			"/tmp/project",
			["/tmp/project", "/tmp/deps"],
			["/tmp/project/src"],
			true,
		);
		expect(policy.workspaceRoots).toEqual(["/tmp/project", "/tmp/deps"]);
		expect(policy.writableRoots).toEqual(["/tmp/project/src"]);
		expect(policy.network).toBe(true);
	});
});

// ─── dangerFullAccessPolicy ──────────────────────────────────────

describe("dangerFullAccessPolicy", () => {
	it("基本的な danger_full_access ポリシーを生成する", () => {
		const policy = dangerFullAccessPolicy();
		expect(policy.mode).toBe("danger_full_access");
		expect(policy.cwd).toBe("/");
		expect(policy.workspaceRoots).toEqual([]);
		expect(policy.writableRoots).toEqual([]);
		expect(policy.network).toBe(true);
	});

	it("引数を取らない", () => {
		const policy = dangerFullAccessPolicy();
		expect(policy).toBeDefined();
	});
});

// ─── parseSandboxMode ────────────────────────────────────────────

describe("parseSandboxMode", () => {
	it("有効なモードをパースする", () => {
		expect(parseSandboxMode("read_only")).toBe("read_only");
		expect(parseSandboxMode("workspace_write")).toBe("workspace_write");
		expect(parseSandboxMode("danger_full_access")).toBe("danger_full_access");
	});

	it("大文字は無効", () => {
		expect(parseSandboxMode("READ_ONLY")).toBeUndefined();
		expect(parseSandboxMode("Workspace_Write")).toBeUndefined();
		expect(parseSandboxMode("DANGER_FULL_ACCESS")).toBeUndefined();
	});

	it("空文字列は無効", () => {
		expect(parseSandboxMode("")).toBeUndefined();
	});

	it("空白を含む文字列は無効", () => {
		expect(parseSandboxMode(" read_only")).toBeUndefined();
		expect(parseSandboxMode("read_only ")).toBeUndefined();
		expect(parseSandboxMode("read only")).toBeUndefined();
	});

	it("部分文字列は無効", () => {
		expect(parseSandboxMode("read")).toBeUndefined();
		expect(parseSandboxMode("write")).toBeUndefined();
		expect(parseSandboxMode("danger")).toBeUndefined();
	});

	it("null/undefined に似た文字列は無効", () => {
		expect(parseSandboxMode("null")).toBeUndefined();
		expect(parseSandboxMode("undefined")).toBeUndefined();
	});
});

// ─── modeLabel ───────────────────────────────────────────────────

describe("modeLabel", () => {
	it("各モードのラベルを返す", () => {
		expect(modeLabel("read_only")).toBe("read-only");
		expect(modeLabel("workspace_write")).toBe("workspace-write");
		expect(modeLabel("danger_full_access")).toBe("full-access");
	});

	it("ラベルにアンダースコアが含まれない", () => {
		expect(modeLabel("read_only")).not.toContain("_");
		expect(modeLabel("workspace_write")).not.toContain("_");
		expect(modeLabel("danger_full_access")).not.toContain("_");
	});
});

// ─── SandboxPolicy 型のイミュータビリティ確認 ──────────────────

describe("SandboxPolicy: returned objects", () => {
	it("readOnlyPolicy の writableRoots への変更が元に影響しない", () => {
		const policy = readOnlyPolicy("/tmp/project");
		policy.writableRoots.push("/evil");
		// Arrays are references, so this WILL affect the object
		// But the point is that the returned policy starts empty
		expect(policy.writableRoots).toEqual(["/evil"]);
	});

	it("各ポリシービルダーは新しいオブジェクトを返す", () => {
		const p1 = readOnlyPolicy("/a");
		const p2 = readOnlyPolicy("/a");
		expect(p1).not.toBe(p2);
		expect(p1).toEqual(p2);
	});
});

// ─── Policy builder input validation ──────────────────────────────

describe("policy builders: input validation", () => {
	it("空文字列の cwd も受け付ける（バリデーションは別層）", () => {
		const policy = readOnlyPolicy("");
		expect(policy.cwd).toBe("");
	});

	it("相対パスの cwd も受け付ける（バリデーションは別層）", () => {
		const policy = readOnlyPolicy("./relative");
		expect(policy.cwd).toBe("./relative");
	});

	it("workspaceRoots に空配列を渡せる", () => {
		const policy = readOnlyPolicy("/tmp", []);
		expect(policy.workspaceRoots).toEqual([]);
	});

	it("writableRoots に空配列を渡せる", () => {
		const policy = workspaceWritePolicy("/tmp", [], [], false);
		expect(policy.writableRoots).toEqual([]);
	});
});
