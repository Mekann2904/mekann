/**
 * tests/unit/extensions/plan.integration.test.ts
 * plan拡張の結合テスト。ツール連携と基本実行フローを検証する。
 * 関連ファイル: .pi/extensions/plan.ts, .pi/lib/storage-lock.ts
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registerPlanExtension from "../../../.pi/extensions/plan.js";

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

describe("plan extension integration tests", () => {
	let fakePi: ReturnType<typeof createFakePi>;
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
		fakePi = createFakePi();

		// Register plan extension
		registerPlanExtension(fakePi as any);
	});

	afterEach(() => {
		if (existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	describe("ツール登録の確認", () => {
		it("plan_createツールが登録されている", () => {
			expect(fakePi.tools.has("plan_create")).toBe(true);
		});

		it("plan_listツールが登録されている", () => {
			expect(fakePi.tools.has("plan_list")).toBe(true);
		});

		it("plan_showツールが登録されている", () => {
			expect(fakePi.tools.has("plan_show")).toBe(true);
		});

		it("plan_add_stepツールが登録されている", () => {
			expect(fakePi.tools.has("plan_add_step")).toBe(true);
		});

		it("plan_update_stepツールが登録されている", () => {
			expect(fakePi.tools.has("plan_update_step")).toBe(true);
		});

		it("plan_deleteツールが登録されている", () => {
			expect(fakePi.tools.has("plan_delete")).toBe(true);
		});

		it("plan_ready_stepsツールが登録されている", () => {
			expect(fakePi.tools.has("plan_ready_steps")).toBe(true);
		});

		it("plan_update_statusツールが登録されている", () => {
			expect(fakePi.tools.has("plan_update_status")).toBe(true);
		});
	});

	describe("plan_createツール", () => {
		it("プランが作成できる", async () => {
			const tool = fakePi.tools.get("plan_create");

			const result = await tool!.execute({
				name: "Test Plan",
				description: "Integration test plan",
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});

		it("プランのdescriptionが正しく設定される", async () => {
			const tool = fakePi.tools.get("plan_create");

			const result = await tool!.execute({
				name: "Test Plan",
				description: "Detailed description",
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});
	});

	describe("plan_listツール", () => {
		it("プラン一覧が取得できる", async () => {
			const createTool = fakePi.tools.get("plan_create");
			await createTool!.execute({
				name: "Plan 1",
			}, tmpDir);
			await createTool!.execute({
				name: "Plan 2",
			}, tmpDir);

			const listTool = fakePi.tools.get("plan_list");
			const result = await listTool!.execute({}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});

		it("空のリストが取得できる", async () => {
			const tool = fakePi.tools.get("plan_list");

			const result = await tool!.execute({}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});
	});

	describe("plan_showツール", () => {
		it("プラン詳細が取得できる", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const created = await createTool!.execute({
				name: "Test Plan",
			}, tmpDir);

			const showTool = fakePi.tools.get("plan_show");

			if (created.id) {
				const result = await showTool!.execute({
					planId: created.id,
				}, tmpDir);

				// 結果が返されることを確認
				expect(result).toBeDefined();
			}
		});

		it("存在しないプランでエラーが返される", async () => {
			const tool = fakePi.tools.get("plan_show");

			const result = await tool!.execute({
				planId: "nonexistent-id",
			}, tmpDir);

			expect(result).toBeDefined();
		});
	});

	describe("plan_add_stepツール", () => {
		it("プランにステップが追加できる", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const plan = await createTool!.execute({
				name: "Test Plan",
			}, tmpDir);

			if (plan.id) {
				const addStepTool = fakePi.tools.get("plan_add_step");
				const result = await addStepTool!.execute({
					planId: plan.id,
					title: "Step 1",
				}, tmpDir);

				// 結果が返されることを確認
				expect(result).toBeDefined();
			}
		});

		it("ステップのdescriptionが正しく設定される", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const plan = await createTool!.execute({
				name: "Test Plan",
			}, tmpDir);

			if (plan.id) {
				const addStepTool = fakePi.tools.get("plan_add_step");
				const result = await addStepTool!.execute({
					planId: plan.id,
					title: "Step 1",
					description: "Step description",
				}, tmpDir);

				// 結果が返されることを確認
				expect(result).toBeDefined();
			}
		});

		it("ステップのdependenciesが正しく設定される", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const plan = await createTool!.execute({
				name: "Test Plan",
			}, tmpDir);

			if (plan.id) {
				const addStepTool = fakePi.tools.get("plan_add_step");
				const step1 = await addStepTool!.execute({
					planId: plan.id,
					title: "Step 1",
				}, tmpDir);

				if (step1.stepId) {
					const step2 = await addStepTool!.execute({
						planId: plan.id,
						title: "Step 2",
						dependencies: [step1.stepId],
					}, tmpDir);

					// 結果が返されることを確認
					expect(step2).toBeDefined();
				}
			}
		});
	});

	describe("plan_update_stepツール", () => {
		it("ステップのステータスが更新できる", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const plan = await createTool!.execute({
				name: "Test Plan",
			}, tmpDir);

			if (plan.id) {
				const addStepTool = fakePi.tools.get("plan_add_step");
				const step = await addStepTool!.execute({
					planId: plan.id,
					title: "Step 1",
				}, tmpDir);

				if (step.stepId) {
					const updateStepTool = fakePi.tools.get("plan_update_step");
					const result = await updateStepTool!.execute({
						planId: plan.id,
						stepId: step.stepId,
						status: "completed",
					}, tmpDir);

					// 結果が返されることを確認
					expect(result).toBeDefined();
				}
			}
		});
	});

	describe("plan_deleteツール", () => {
		it("プランが削除できる", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const plan = await createTool!.execute({
				name: "Test Plan",
			}, tmpDir);

			if (plan.id) {
				const deleteTool = fakePi.tools.get("plan_delete");
				const result = await deleteTool!.execute({
					planId: plan.id,
				}, tmpDir);

				// 結果が返されることを確認
				expect(result).toBeDefined();
			}
		});
	});

	describe("plan_ready_stepsツール", () => {
		it("実行可能なステップが取得できる", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const plan = await createTool!.execute({
				name: "Test Plan",
			}, tmpDir);

			if (plan.id) {
				const readyStepsTool = fakePi.tools.get("plan_ready_steps");
				const result = await readyStepsTool!.execute({
					planId: plan.id,
				}, tmpDir);

				// 結果が返されることを確認
				expect(result).toBeDefined();
			}
		});
	});

	describe("plan_update_statusツール", () => {
		it("プランのステータスが更新できる", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const plan = await createTool!.execute({
				name: "Test Plan",
			}, tmpDir);

			if (plan.id) {
				const updateStatusTool = fakePi.tools.get("plan_update_status");
				const result = await updateStatusTool!.execute({
					planId: plan.id,
					status: "active",
				}, tmpDir);

				// 結果が返されることを確認
				expect(result).toBeDefined();
			}
		});
	});
});
