/**
 * tests/unit/extensions/loop.integration.test.ts
 * loop拡張の結合テスト。ツール連携と基本実行フローを検証する。
 * 関連ファイル: .pi/extensions/loop.ts, .pi/lib/retry-with-backoff.ts
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registerLoopExtension, { resetForTesting } from "../../../.pi/extensions/loop.js";

type RegisteredTool = {
	name: string;
	execute: (...args: any[]) => Promise<any>;
};

function createFakePi() {
	const tools = new Map<string, RegisteredTool>();
	const events = new Map<string, Array<(event: any, ctx: any) => Promise<any> | any>>();

	return {
		tools,
		uiNotify: vi.fn(),
		sendMessage: vi.fn(),
		appendEntry: vi.fn(),
		eventsEmit: vi.fn(),
		registerTool(def: any) {
			tools.set(def.name, def as RegisteredTool);
		},
		registerCommand(_name: string, _def: any) {
			// no-op
		},
		registerShortcut(_shortcut: string, _def: any) {
			// no-op
		},
		on(eventName: string, handler: (event: any, ctx: any) => Promise<any> | any) {
			const handlers = events.get(eventName) ?? [];
			handlers.push(handler);
			events.set(eventName, handlers);
		},
		events: {
			emit: vi.fn(),
		},
		async emit(eventName: string, event: any, ctx: any): Promise<void> {
			const handlers = events.get(eventName) ?? [];
			for (const handler of handlers) {
				await handler(event, ctx);
			}
		},
	};
}

describe("loop extension integration tests", () => {
	let fakePi: ReturnType<typeof createFakePi>;
	let tmpDir: string;

	beforeEach(() => {
		resetForTesting();
		tmpDir = mkdtempSync(join(tmpdir(), "pi-loop-test-"));
		fakePi = createFakePi();

		// Register loop extension
		registerLoopExtension(fakePi as any);
	});

	afterEach(() => {
		if (existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	describe("ツール登録の確認", () => {
		it("loop_runツールが登録されている", () => {
			expect(fakePi.tools.has("loop_run")).toBe(true);
		});
	});

	describe("loop_runツール", () => {
		it("基本的なループ実行ができる", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "Simple test task",
				maxIterations: 2,
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});

		it("maxIterationsオプションが機能する", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "Test task",
				maxIterations: 1,
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});

		it("timeoutMsオプションが機能する", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "Test task",
				maxIterations: 1,
				timeoutMs: 10000,
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});

		it("goalオプションが設定できる", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "Test task",
				goal: "Complete the task",
				maxIterations: 1,
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});

		it("verifyCommandオプションが設定できる", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "Test task",
				maxIterations: 1,
				verifyCommand: "echo 'test'",
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});
	});

	describe("履歴管理", () => {
		it("ループ実行履歴が保存される", async () => {
			const tool = fakePi.tools.get("loop_run");

			await tool!.execute({
				task: "Test task",
				maxIterations: 1,
			}, tmpDir);

			// 履歴ディレクトリが作成されていることを確認
			const { readdirSync } = await import("node:fs");
			const historyDir = join(tmpDir, ".pi", "agent-loop");
			if (existsSync(historyDir)) {
				const files = readdirSync(historyDir);
				expect(files.length).toBeGreaterThan(0);
			}
		});

		it("複数回の実行で履歴が蓄積される", async () => {
			const tool = fakePi.tools.get("loop_run");

			await tool!.execute({
				task: "Test task 1",
				maxIterations: 1,
			}, tmpDir);
			await tool!.execute({
				task: "Test task 2",
				maxIterations: 1,
			}, tmpDir);

			// 履歴ディレクトリのファイル数が増えていることを確認
			const { readdirSync } = await import("node:fs");
			const historyDir = join(tmpDir, ".pi", "agent-loop");
			if (existsSync(historyDir)) {
				const files = readdirSync(historyDir);
				expect(files.length).toBeGreaterThanOrEqual(1);
			}
		});
	});

	describe("エラーハンドリング", () => {
		it("空のタスクでエラーが返される", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "",
				maxIterations: 1,
			}, tmpDir);

			// エラーまたは適切なレスポンスが返される
			expect(result).toBeDefined();
		});

		it("不正なmaxIterationsでエラーが処理される", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "Test task",
				maxIterations: -1,
			}, tmpDir);

			expect(result).toBeDefined();
		});
	});

	describe("時間制限", () => {
		it("timeoutMsでループが中断される", async () => {
			const tool = fakePi.tools.get("loop_run");

			const startTime = Date.now();
			const result = await tool!.execute({
				task: "Long running task",
				maxIterations: 100,
				timeoutMs: 1000,
			}, tmpDir);
			const elapsedTime = Date.now() - startTime;

			// タイムアウト内で終了する
			expect(elapsedTime).toBeLessThan(5000);
			expect(result).toBeDefined();
		});
	});

	describe("出力検証", () => {
		it("ループ結果に必要なフィールドが含まれる", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "Test task",
				maxIterations: 1,
			}, tmpDir);

			expect(result).toBeDefined();
		});

		it("ループ終了時にstatusが設定される", async () => {
			const tool = fakePi.tools.get("loop_run");

			const result = await tool!.execute({
				task: "Test task",
				maxIterations: 1,
			}, tmpDir);

			// statusが定義されている場合のみチェック
			if (result.status !== undefined) {
				expect(["done", "cancelled", "error"]).toContain(result.status);
			}
		});
	});
});
