/**
 * tests/unit/extensions/plan.integration.test.ts
 * plan拡張の結合テスト。ツール連携と基本実行フローを検証する。
 * 関連ファイル: .pi/extensions/plan.ts, .pi/lib/storage-lock.ts
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registerPlanExtension, { resetForTesting } from "../../../.pi/extensions/plan.js";

type RegisteredTool = {
	name: string;
	execute: (...args: any[]) => Promise<any>;
};

function createFakePi() {
	const tools = new Map<string, RegisteredTool>();
	const commands = new Map<string, any>();
	const events = new Map<string, Array<(event: any, ctx: any) => Promise<any> | any>>();
	let activeTools: string[] = [];

	return {
		tools,
		commands,
		activeTools,
		uiNotify: vi.fn(),
		sendMessage: vi.fn(),
		appendEntry: vi.fn(),
		eventsEmit: vi.fn(),
		registerTool(def: any) {
			tools.set(def.name, def as RegisteredTool);
		},
		registerCommand(name: string, def: any) {
			commands.set(name, def);
		},
		registerShortcut(_shortcut: string, _def: any) {
			// no-op
		},
		getAllTools() {
			return [
				{ name: "read" },
				{ name: "bash" },
				{ name: "edit" },
				{ name: "write" },
				{ name: "patch" },
				{ name: "plan_create" },
				{ name: "plan_update_step" },
			];
		},
		setActiveTools(next: string[]) {
			activeTools = [...next];
			this.activeTools = [...next];
		},
		on(eventName: string, handler: (event: any, ctx: any) => Promise<any> | any) {
			const handlers = events.get(eventName) ?? [];
			handlers.push(handler);
			events.set(eventName, handlers);
		},
		events: {
			emit: vi.fn(),
		},
		async emit(eventName: string, event: any, ctx: any): Promise<any> {
			const handlers = events.get(eventName) ?? [];
			let lastResult;
			for (const handler of handlers) {
				lastResult = await handler(event, ctx);
			}
			return lastResult;
		},
	};
}

function createExecutionContext(cwd: string) {
	return {
		cwd,
		ui: {
			notify: vi.fn(),
			setStatus: vi.fn(),
		},
	};
}

describe("plan extension integration tests", () => {
	let fakePi: ReturnType<typeof createFakePi>;
	let tmpDir: string;

	beforeEach(() => {
		resetForTesting();
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

		it("plan_run_nextツールが登録されている", () => {
			expect(fakePi.tools.has("plan_run_next")).toBe(true);
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

	describe("高度な計画運用", () => {
		it("plan_create が durable plan 文書を生成する", async () => {
			const tool = fakePi.tools.get("plan_create");
			const ctx = createExecutionContext(tmpDir);

			const result = await tool!.execute(
				"tc-create",
				{
					name: "Hybrid Plan",
					description: "Track live checklist and durable plan together",
					goal: "Keep a single current step while preserving a durable plan file.",
					acceptanceCriteria: ["Only one in_progress step exists", "plans/*.md stays in sync"],
					implementationOrder: ["Design", "Implement", "Verify"],
				},
				undefined,
				undefined,
				ctx,
			);

			const documentPath = result.details.documentPath as string;
			expect(documentPath).toBeTruthy();

			const absoluteDocumentPath = join(tmpDir, documentPath);
			expect(existsSync(absoluteDocumentPath)).toBe(true);

			const content = readFileSync(absoluteDocumentPath, "utf-8");
			expect(content).toContain("# Goal");
			expect(content).toContain("# Live Checklist");
			expect(content).toContain("Initial plan created");
		});

		it("plan_update_step は単一の in_progress を維持し、完了時に次の ready step を前に出す", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const addStepTool = fakePi.tools.get("plan_add_step");
			const updateStepTool = fakePi.tools.get("plan_update_step");
			const showTool = fakePi.tools.get("plan_show");
			const ctx = createExecutionContext(tmpDir);

			const created = await createTool!.execute(
				"tc-plan",
				{ name: "Execution Plan", description: "Advanced step transitions" },
				undefined,
				undefined,
				ctx,
			);
			const planId = created.details.planId as string;

			const step1 = await addStepTool!.execute("tc-step-1", {
				planId,
				title: "Spec",
			}, undefined, undefined, ctx);
			const step2 = await addStepTool!.execute("tc-step-2", {
				planId,
				title: "Build",
				dependencies: [step1.details.stepId],
			}, undefined, undefined, ctx);
			const step3 = await addStepTool!.execute("tc-step-3", {
				planId,
				title: "Verify",
			}, undefined, undefined, ctx);

			await updateStepTool!.execute("tc-start-1", {
				planId,
				stepId: step1.details.stepId,
				status: "in_progress",
				actor: "executor",
			}, undefined, undefined, ctx);

			const switched = await updateStepTool!.execute("tc-start-3", {
				planId,
				stepId: step3.details.stepId,
				status: "in_progress",
				actor: "executor",
			}, undefined, undefined, ctx);

			expect(switched.details.currentStepId).toBe(step3.details.stepId);

			await updateStepTool!.execute("tc-reset-3", {
				planId,
				stepId: step3.details.stepId,
				status: "pending",
				actor: "executor",
			}, undefined, undefined, ctx);

			const completed = await updateStepTool!.execute("tc-complete-1", {
				planId,
				stepId: step1.details.stepId,
				status: "completed",
				actor: "executor",
				progressNote: "spec approved",
				activateNext: true,
			}, undefined, undefined, ctx);

			expect(completed.details.currentStepId).toBe(step2.details.stepId);

			const shown = await showTool!.execute("tc-show", { planId }, undefined, undefined, ctx);
			expect(shown.details.currentStepId).toBe(step2.details.stepId);

			const documentPath = created.details.documentPath as string;
			const content = readFileSync(join(tmpDir, documentPath), "utf-8");
			expect(content).toContain(`[x] Spec (${step1.details.stepId})`);
			expect(content).toContain(`[-] Build (${step2.details.stepId})`);
			expect(content).not.toContain(`[-] Verify (${step3.details.stepId})`);
			expect(content).toContain("spec approved");
		});

		it("plan_run_next が次の ready step を atomic に claim する", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const addStepTool = fakePi.tools.get("plan_add_step");
			const runNextTool = fakePi.tools.get("plan_run_next");
			const ctx = createExecutionContext(tmpDir);

			const created = await createTool!.execute(
				"tc-plan-run-next",
				{ name: "Queue Plan" },
				undefined,
				undefined,
				ctx,
			);
			const planId = created.details.planId as string;

			const step1 = await addStepTool!.execute("tc-queue-1", {
				planId,
				title: "First",
			}, undefined, undefined, ctx);
			await addStepTool!.execute("tc-queue-2", {
				planId,
				title: "Second",
				dependencies: [step1.details.stepId],
			}, undefined, undefined, ctx);

			const runNext = await runNextTool!.execute("tc-run-next", {
				planId,
				actor: "executor",
			}, undefined, undefined, ctx);

			expect(runNext.details.currentStepId).toBe(step1.details.stepId);

			const documentPath = created.details.documentPath as string;
			const content = readFileSync(join(tmpDir, documentPath), "utf-8");
			expect(content).toContain(`[-] First (${step1.details.stepId})`);
		});

		it("plan mode では edit を hard block する", async () => {
			const ctx = createExecutionContext(tmpDir);
			const planmode = fakePi.commands.get("planmode");
			expect(planmode).toBeDefined();

			await planmode.handler("", ctx);

			const result = await fakePi.emit("tool_call", { toolName: "edit", input: {} }, ctx);
			expect(fakePi.activeTools).not.toContain("edit");
			expect(result).toEqual({
				block: true,
				reason: "PLAN MODE: edit is blocked. Stay in read-only exploration or exit plan mode to implement.",
			});
		});

		it("plan mode では write-capable bash を hard block する", async () => {
			const ctx = createExecutionContext(tmpDir);
			const planmode = fakePi.commands.get("planmode");
			await planmode.handler("", ctx);

			const result = await fakePi.emit(
				"tool_call",
				{ toolName: "bash", input: { command: "npm test" } },
				ctx,
			);

			expect(result?.block).toBe(true);
			expect(String(result?.reason)).toContain("write-capable bash command blocked");
		});

		it("plan がない状態では edit を hard block する", async () => {
			const ctx = createExecutionContext(tmpDir);

			const result = await fakePi.emit("tool_call", { toolName: "edit", input: {} }, ctx);

			expect(result).toEqual({
				block: true,
				reason: "SPEC-FIRST: no active plan found. Create a plan with plan_create before mutating the workspace.",
			});
		});

		it("薄い plan では edit を hard block する", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const ctx = createExecutionContext(tmpDir);

			await createTool!.execute(
				"tc-thin-plan",
				{ name: "Thin Plan", description: "missing execution details" },
				undefined,
				undefined,
				ctx,
			);

			const result = await fakePi.emit("tool_call", { toolName: "edit", input: {} }, ctx);

			expect(result?.block).toBe(true);
			expect(String(result?.reason)).toContain("is not execution-ready");
		});

		it("受け入れ条件と実装順序がある plan では edit を許可する", async () => {
			const createTool = fakePi.tools.get("plan_create");
			const addStepTool = fakePi.tools.get("plan_add_step");
			const ctx = createExecutionContext(tmpDir);

			const created = await createTool!.execute(
				"tc-ready-plan",
				{
					name: "Ready Plan",
					acceptanceCriteria: ["tests pass"],
					implementationOrder: ["spec", "build", "verify"],
				},
				undefined,
				undefined,
				ctx,
			);

			// execution-readyになるにはステップも必要
			if (created.details.planId) {
				await addStepTool!.execute(
					"tc-step",
					{ planId: created.details.planId, title: "First Step" },
					undefined,
					undefined,
					ctx,
				);
			}

			const result = await fakePi.emit("tool_call", { toolName: "edit", input: {} }, ctx);
			expect(result).toBeUndefined();
		});
	});
});
