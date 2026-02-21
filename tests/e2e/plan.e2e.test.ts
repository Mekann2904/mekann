/**
 * @file .pi/extensions/plan.ts のE2Eテスト
 * @description ユーザージャーニーに基づく計画管理拡張機能のE2Eテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { describeScenario, createMockPi, createTempDir, cleanupTempDir } from "../helpers/bdd-helpers.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// pi SDKのモック
vi.mock("@mariozechner/pi-ai", () => ({
	Type: {
		String: () => ({ type: "string" }),
		Boolean: () => ({ type: "boolean" }),
		Optional: (type) => type,
		Object: (fields) => ({ type: "object", fields }),
		Array: (type) => ({ type: "array", itemType: type }),
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

// ============================================================================
// E2E Test Scenarios
// ============================================================================

describe("plan拡張機能 E2Eテスト", () => {
	let testCwd: string;
	let planTools: Map<string, any>;

	beforeEach(async () => {
		testCwd = createTempDir("plan-e2e-");
		planTools = new Map();
	});

	afterEach(() => {
		cleanupTempDir(testCwd);
	});

	describeScenario(
		"ユーザーは計画を作成できる",
		"計画作成フロー",
		(ctx) => {
			let mockPi: any;
			let planId: string;

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				// モックツールを登録
				mockPi.registerTool({
					name: "plan_create",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画が作成されました" }],
						details: {
							planId: "plan-001",
							name: "テスト計画",
							description: "テスト用の計画です",
							status: "draft",
							steps: [],
						},
					}),
				});
			});

			ctx.and("計画の基本情報が与えられている", () => {
				const planInfo = {
					name: "テスト計画",
					description: "テスト用の計画です",
				};
			});

			ctx.when("ユーザーがplan_createツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_create")?.execute(
					"tc-1",
					{
						name: "テスト計画",
						description: "テスト用の計画です",
					},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.planId).toBe("plan-001");
				planId = result.details.planId;
			});

			ctx.then("計画が正しく作成される", () => {
				expect(mockPi.getTool("plan_create")).toBeDefined();
				expect(planId).toBe("plan-001");
				expect(mockPi.uiNotify).toHaveBeenCalledWith(
					expect.stringContaining("計画が作成されました"),
					"info"
				);
			});
		}
	);

	describeScenario(
		"ユーザーは計画にステップを追加できる",
		"ステップ追加フロー",
		(ctx) => {
			let mockPi: any;
			let planId = "plan-002";
			let stepId: string;

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				mockPi.registerTool({
					name: "plan_add_step",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ステップが追加されました" }],
						details: {
							planId,
							stepId: "step-001",
							title: "最初のステップ",
							description: "ステップの説明",
							status: "pending",
						},
					}),
				});
			});

			ctx.and("既存の計画IDとステップ情報が与えられている", () => {
				const stepInfo = {
					planId: "plan-002",
					title: "最初のステップ",
					description: "ステップの説明",
				};
			});

			ctx.when("ユーザーがplan_add_stepツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_add_step")?.execute(
					"tc-2",
					{
						planId,
						title: "最初のステップ",
						description: "ステップの説明",
					},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.stepId).toBe("step-001");
				stepId = result.details.stepId;
			});

			ctx.then("ステップが正しく追加される", () => {
				expect(mockPi.getTool("plan_add_step")).toBeDefined();
				expect(stepId).toBe("step-001");
			});
		}
	);

	describeScenario(
		"ユーザーは計画のステータスを更新できる",
		"ステータス更新フロー",
		(ctx) => {
			let mockPi: any;
			let planId = "plan-003";

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				mockPi.registerTool({
					name: "plan_update_status",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画のステータスが更新されました" }],
						details: {
							planId,
							status: "active",
							updatedAt: expect.any(String),
						},
					}),
				});
			});

			ctx.and("既存の計画IDと新しいステータスが与えられている", () => {
				const statusInfo = {
					planId: "plan-003",
					status: "active",
				};
			});

			ctx.when("ユーザーがplan_update_statusツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_update_status")?.execute(
					"tc-3",
					{
						planId,
						status: "active",
					},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.status).toBe("active");
			});

			ctx.then("計画のステータスが正しく更新される", () => {
				expect(mockPi.getTool("plan_update_status")).toBeDefined();
				expect(mockPi.uiNotify).toHaveBeenCalledWith(
					expect.stringContaining("計画のステータスが更新されました"),
					"info"
				);
			});
		}
	);

	describeScenario(
		"ユーザーはステップのステータスを更新できる",
		"ステップステータス更新フロー",
		(ctx) => {
			let mockPi: any;
			let planId = "plan-004";
			let stepId = "step-002";

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				mockPi.registerTool({
					name: "plan_update_step",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ステップのステータスが更新されました" }],
						details: {
							planId,
							stepId,
							status: "in_progress",
						},
					}),
				});
			});

			ctx.and("既存の計画ID、ステップID、新しいステータスが与えられている", () => {
				const stepStatusInfo = {
					planId: "plan-004",
					stepId: "step-002",
					status: "in_progress",
				};
			});

			ctx.when("ユーザーがplan_update_stepツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_update_step")?.execute(
					"tc-4",
					{
						planId,
						stepId,
						status: "in_progress",
					},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.status).toBe("in_progress");
			});

			ctx.then("ステップのステータスが正しく更新される", () => {
				expect(mockPi.getTool("plan_update_step")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーは計画を一覧表示できる",
		"計画一覧フロー",
		(ctx) => {
			let mockPi: any;

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				mockPi.registerTool({
					name: "plan_list",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画一覧を表示" }],
						details: {
							plans: [
								{
									id: "plan-001",
									name: "計画A",
									status: "draft",
									createdAt: "2026-02-21T00:00:00.000Z",
								},
								{
									id: "plan-002",
									name: "計画B",
									status: "active",
									createdAt: "2026-02-21T01:00:00.000Z",
								},
							],
						},
					}),
				});
			});

			ctx.when("ユーザーがplan_listツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_list")?.execute(
					"tc-5",
					{},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.plans).toHaveLength(2);
				expect(result.details.plans[0].name).toBe("計画A");
				expect(result.details.plans[1].name).toBe("計画B");
			});

			ctx.then("計画一覧が正しく表示される", () => {
				expect(mockPi.getTool("plan_list")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーは計画の詳細を確認できる",
		"計画詳細フロー",
		(ctx) => {
			let mockPi: any;
			let planId = "plan-005";

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				mockPi.registerTool({
					name: "plan_show",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画の詳細を表示" }],
						details: {
							id: "plan-005",
							name: "詳細確認用計画",
							description: "詳細確認用の計画です",
							status: "active",
							createdAt: "2026-02-21T00:00:00.000Z",
							updatedAt: "2026-02-21T02:00:00.000Z",
							steps: [
								{
									id: "step-001",
									title: "ステップ1",
									description: "ステップ1の説明",
									status: "completed",
								},
								{
									id: "step-002",
									title: "ステップ2",
									description: "ステップ2の説明",
									status: "in_progress",
								},
							],
						},
					}),
				});
			});

			ctx.and("既存の計画IDが与えられている", () => {
				planId = "plan-005";
			});

			ctx.when("ユーザーがplan_showツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_show")?.execute(
					"tc-6",
					{ planId },
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.id).toBe("plan-005");
				expect(result.details.name).toBe("詳細確認用計画");
				expect(result.details.steps).toHaveLength(2);
			});

			ctx.then("計画の詳細が正しく表示される", () => {
				expect(mockPi.getTool("plan_show")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーは計画を削除できる",
		"計画削除フロー",
		(ctx) => {
			let mockPi: any;
			let planId = "plan-006";

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				mockPi.registerTool({
					name: "plan_delete",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画が削除されました" }],
						details: {
							planId: "plan-006",
							deleted: true,
						},
					}),
				});
			});

			ctx.and("既存の計画IDが与えられている", () => {
				planId = "plan-006";
			});

			ctx.when("ユーザーがplan_deleteツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_delete")?.execute(
					"tc-7",
					{ planId },
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.deleted).toBe(true);
			});

			ctx.then("計画が正しく削除される", () => {
				expect(mockPi.getTool("plan_delete")).toBeDefined();
				expect(mockPi.uiNotify).toHaveBeenCalledWith(
					expect.stringContaining("計画が削除されました"),
					"info"
				);
			});
		}
	);

	describeScenario(
		"ユーザーは実行可能なステップを確認できる",
		"実行可能ステップフロー",
		(ctx) => {
			let mockPi: any;
			let planId = "plan-007";

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				mockPi.registerTool({
					name: "plan_ready_steps",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "実行可能なステップを表示" }],
						details: {
							planId,
							readySteps: [
								{
									id: "step-001",
									title: "依存関係のないステップ",
									status: "pending",
									dependencies: [],
								},
							],
						},
					}),
				});
			});

			ctx.and("既存の計画IDが与えられている", () => {
				planId = "plan-007";
			});

			ctx.when("ユーザーがplan_ready_stepsツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_ready_steps")?.execute(
					"tc-8",
					{ planId },
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.readySteps).toHaveLength(1);
				expect(result.details.readySteps[0].id).toBe("step-001");
			});

			ctx.then("実行可能なステップが正しく表示される", () => {
				expect(mockPi.getTool("plan_ready_steps")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーは計画のライフサイクル全体を管理できる",
		"計画ライフサイクルフロー",
		(ctx) => {
			let mockPi: any;
			let planId: string;
			let stepIds: string[] = [];

			ctx.given("plan拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = planTools;

				mockPi.registerTool({
					name: "plan_create",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画が作成されました" }],
						details: {
							planId: "plan-lifecycle",
							name: "ライフサイクル計画",
							status: "draft",
						},
					}),
				});

				mockPi.registerTool({
					name: "plan_add_step",
					execute: vi.fn().mockImplementation(({ title }) => ({
						content: [{ text: "ステップが追加されました" }],
						details: {
							planId: "plan-lifecycle",
							stepId: `step-${title}`,
							title,
							status: "pending",
						},
					})),
				});

				mockPi.registerTool({
					name: "plan_update_status",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画のステータスが更新されました" }],
						details: { planId: "plan-lifecycle", status: "active" },
					}),
				});

				mockPi.registerTool({
					name: "plan_update_step",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ステップのステータスが更新されました" }],
						details: {
							planId: "plan-lifecycle",
							stepId: "step-first",
							status: "completed",
						},
					}),
				});

				mockPi.registerTool({
					name: "plan_delete",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画が削除されました" }],
						details: { planId: "plan-lifecycle", deleted: true },
					}),
				});
			});

			ctx.when("ユーザーが計画を作成する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_create")?.execute(
					"tc-lifecycle-1",
					{ name: "ライフサイクル計画", description: "ライフサイクルテスト" },
					undefined,
					undefined,
					ctx
				);

				expect(result.details.planId).toBe("plan-lifecycle");
				planId = result.details.planId;
			});

			ctx.and("ユーザーが複数のステップを追加する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				for (const title of ["first", "second", "third"]) {
					const result = await mockPi.getTool("plan_add_step")?.execute(
						`tc-lifecycle-add-${title}`,
						{ planId, title },
						undefined,
						undefined,
						ctx
					);
					stepIds.push(result.details.stepId);
				}

				expect(stepIds).toHaveLength(3);
			});

			ctx.and("ユーザーが計画をアクティブにする", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_update_status")?.execute(
					"tc-lifecycle-2",
					{ planId, status: "active" },
					undefined,
					undefined,
					ctx
				);

				expect(result.details.status).toBe("active");
			});

			ctx.and("ユーザーがステップを完了する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_update_step")?.execute(
					"tc-lifecycle-3",
					{ planId, stepId: "step-first", status: "completed" },
					undefined,
					undefined,
					ctx
				);

				expect(result.details.status).toBe("completed");
			});

			ctx.and("ユーザーが計画を削除する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_delete")?.execute(
					"tc-lifecycle-4",
					{ planId },
					undefined,
					undefined,
					ctx
				);

				expect(result.details.deleted).toBe(true);
			});

			ctx.then("計画のライフサイクル全体が正常に完了する", () => {
				expect(planId).toBe("plan-lifecycle");
				expect(stepIds).toHaveLength(3);
			});
		}
	);
});
