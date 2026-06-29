/**
 * SandboxMode とポリシービルダーのテスト。
 *
 * parseSandboxMode / modeLabel / readOnlyPolicy・workspaceWritePolicy・yoloPolicy
 * ビルダーの基本挙動を検証する。
 */

import { describe, it, expect } from "vitest";

import {
	readOnlyPolicy,
	workspaceWritePolicy,
	yoloPolicy,
	parseSandboxMode,
	modeLabel,
} from "../permissions.js";

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

