/**
 * command.test.ts — autoresearch コマンドハンドラ (on/off/clear/status/loop) と followUp メッセージのテスト
 *
 * autoresearch/index.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパーは ./index-test-utils.ts を参照。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	autoresearchTestSetup,
	createMockPi,
	createMockCtx,
	createGitTestDir,
	type MockCtx,
} from "./index-test-utils.js";

describe("autoresearchExtension", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: MockCtx;

	beforeEach(() => {
		({ pi, ctx } = autoresearchTestSetup());
	});

	describe("/autoresearch on", () => {
		it("sends a followUp message", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("on テストを高速化したい", ctx);
			expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
			expect(pi.sentMessages[0].opts).toEqual({ deliverAs: "followUp" });
		});

		it("shows widget", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("on", ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", expect.any(Function));
		});

		it("sends autoresearch.md resume message when file exists", async () => {
			vi.doMock("node:fs", () => ({
				existsSync: (p: string) => p.endsWith("autoresearch.md"),
				appendFileSync: vi.fn(),
				unlinkSync: vi.fn(),
				readFileSync: vi.fn(),
			}));
			// Re-import with mock
			const { default: ext2 } = await import("./index.js?t=" + Date.now());
			const pi2 = createMockPi();
			ext2(pi2 as unknown as any);
			const handler = pi2.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("on", ctx);
			expect(pi2.sentMessages[0].msg).toContain("autoresearch.md");
			vi.doUnmock("node:fs");
		});
	});

	describe("/autoresearch off", () => {
		it("clears the widget and notifies", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			// First activate
			await handler("on", ctx);
			ctx.ui.setWidget.mockClear();
			// Then deactivate
			await handler("off", ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("無効"),
				"info",
			);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("自動再開しません"),
				"info",
			);
		});
	});

	describe("/autoresearch clear", () => {
		it("clears widget and notifies", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			// clear calls fs.existsSync + fs.unlinkSync — both are safe to call on /tmp
			await handler("clear", ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("クリア"),
				"info",
			);
		});
	});

	describe("/autoresearch status", () => {
		it("shows status notification", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("status", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("autoresearch"),
				"info",
			);
		});

		it("is default when no subcommand", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("", ctx);
			// Empty arg → goes to status (sub is "status" when parts[0] is empty)
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("autoresearch"),
				"info",
			);
		});
	});

	describe("/autoresearch <目的文>", () => {
		it("activates mode and sends followUp with purpose", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("テストを高速化したい", ctx);

			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", expect.any(Function));
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("有効"),
				"info",
			);
			expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
			expect(pi.sentMessages[0].msg).toContain("テストを高速化したい");
			expect(pi.sentMessages[0].opts).toEqual({ deliverAs: "followUp" });
		});

		it("activates even without purpose text", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			// 'optimize' is not on/off/status/clear → treated as purpose
			await handler("optimize", ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", expect.any(Function));
		});
	});

	describe("followUp includes skill guidance", () => {
		it("/autoresearch on followUp mentions skill", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			await handler("on", createMockCtx());
			expect(pi.sentMessages[0].msg).toContain("/skill:autoresearch-create");
		});

		it("/autoresearch <目的> followUp mentions skill", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			await handler("高速化", createMockCtx());
			const msg = pi.sentMessages.find((m) => m.msg.includes("/skill:autoresearch-create"));
			expect(msg).toBeTruthy();
		});
	});

	describe("/autoresearch on with existing autoresearch.md", () => {
		it("sends new-task message when only autoresearch.md exists (no state)", async () => {
			const testDir = createGitTestDir("test-ar-md");
			fs.writeFileSync(path.join(testDir, "autoresearch.md"), "# Test");
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("on", ctx);
			expect(pi.sentMessages[pi.sentMessages.length - 1].msg).not.toContain("再開");
			expect(pi.sentMessages[pi.sentMessages.length - 1].msg).toContain("autoresearch モードを有効化しました");
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("sends resume message when both autoresearch.md and state.json exist", async () => {
			const testDir = createGitTestDir("test-ar-md-resume");
			fs.writeFileSync(path.join(testDir, "autoresearch.md"), "# Test");
			fs.mkdirSync(path.join(testDir, ".autoresearch"), { recursive: true });
			fs.writeFileSync(path.join(testDir, ".autoresearch", "state.json"), JSON.stringify({ version: 2, currentPlanId: "plan-test" }));
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("on", ctx);
			expect(pi.sentMessages[pi.sentMessages.length - 1].msg).toContain("autoresearch.md");
			expect(pi.sentMessages[pi.sentMessages.length - 1].msg).toContain("再開");
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("sends resume message in default case with md and state and extra context", async () => {
			const testDir = createGitTestDir("test-ar-md-ctx");
			fs.writeFileSync(path.join(testDir, "autoresearch.md"), "# Test");
			fs.mkdirSync(path.join(testDir, ".autoresearch"), { recursive: true });
			fs.writeFileSync(path.join(testDir, ".autoresearch", "state.json"), JSON.stringify({ version: 2, currentPlanId: "plan-test" }));
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("高速化したい", ctx);
			const msg = pi.sentMessages[pi.sentMessages.length - 1].msg;
			expect(msg).toContain("autoresearch.md");
			expect(msg).toContain("追加コンテキスト: 高速化したい");
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("sends new-task message with purpose when md exists but no state", async () => {
			const testDir = createGitTestDir("test-ar-md-nostate");
			fs.writeFileSync(path.join(testDir, "autoresearch.md"), "# Test");
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("高速化したい", ctx);
			const msg = pi.sentMessages[pi.sentMessages.length - 1].msg;
			expect(msg).not.toContain("再開");
			expect(msg).toContain("目的: 高速化したい");
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("/autoresearch clear with existing JSONL", () => {
		it("deletes the JSONL file", async () => {
			const testDir = createGitTestDir("test-ar-clear");
			const jp = path.join(testDir, "autoresearch.jsonl");
			fs.writeFileSync(jp, JSON.stringify({ type: "config", name: "x", metricName: "m" }) + "\n");
			expect(fs.existsSync(jp)).toBe(true);
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("clear", ctx);
			expect(fs.existsSync(jp)).toBe(false);
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("/autoresearch <purpose> without autoresearch.md", () => {
		it("sends create message without md file", async () => {
			const testDir = createGitTestDir("test-ar-nomd");

			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("高速化したい", ctx);

			const msg = pi.sentMessages[pi.sentMessages.length - 1].msg;
			expect(msg).toContain("autoresearch モードを有効化しました");
			expect(msg).toContain("autoresearch.md");
			expect(msg).toContain("目的: 高速化したい");
			expect(msg).not.toContain("再開");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("sends create message with purpose text in default case", async () => {
			const testDir = createGitTestDir("test-ar-nomd2");

			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("optimize", ctx);

			const msg = pi.sentMessages[pi.sentMessages.length - 1].msg;
			expect(msg).toContain("autoresearch モードを有効化しました");
			expect(msg).toContain("目的: optimize");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("/autoresearch loop subcommands", () => {
		it("loop on enables auto loop", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			// Turn off first, then turn on via loop on
			await pi.commands.get("autoresearch")!.handler("loop off", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop on", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("有効"),
				"info",
			);
		});

		it("loop off disables auto loop", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop off", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("無効"),
				"info",
			);
		});

		it("loop max none sets unlimited", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop max none", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("\u221e"),  // ∞
				"info",
			);
		});

		it("loop max infinite sets unlimited", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop max infinite", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("\u221e"),
				"info",
			);
		});

		it("loop max with invalid value shows usage", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop max abc", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("正の整数"),
				"warning",
			);
		});

		it("loop status shows current state", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("loop"),
				"info",
			);
		});

		it("hasCompleteMarker detects marker in nested content", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			await pi.eventHandlers.get("agent_start")!({}, ctx);
			pi.sentMessages.length = 0;

			// Test with nested content structure
			await pi.eventHandlers.get("agent_end")!(
				{ messages: [{ role: "assistant", content: [{ type: "text", text: "<autoresearch>COMPLETE</autoresearch>" }] }] },
				ctx,
			);

			expect(pi.sentMessages).toHaveLength(0);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("完了マーカー"),
				"info",
			);
		});
	});
});
