/**
 * コマンド承認判定のテスト。
 *
 * shouldRequestApproval / yoloApprovalMessage を検証する。
 */

import { describe, it, expect } from "vitest";

import { shouldRequestApproval, yoloApprovalMessage } from "../permissions.js";

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

