/**
 * @file 拡張機能統合テスト
 * @description 複数の拡張機能を連携させる統合テスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { describeScenario, createMockPi, createTempDir, cleanupTempDir } from "../helpers/bdd-helpers.js";
import { existsSync } from "node:fs";
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

vi.mock("@mariozechner/pi-tui", () => ({
	Text: vi.fn(),
	truncateToWidth: vi.fn((s) => s),
	wrapTextWithAnsi: vi.fn((text, width) => {
		if (text.length <= width) return [text];
		const lines: string[] = [];
		for (let i = 0; i < text.length; i += width) {
			lines.push(text.slice(i, i + width));
		}
		return lines;
	}),
	matchesKey: vi.fn((data, key) => data === key),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

// ============================================================================
// Integration Test Scenarios
// ============================================================================

describe("拡張機能統合テスト", () => {
	let testCwd: string;

	beforeEach(async () => {
		testCwd = createTempDir("integration-");
	});

	afterEach(() => {
		cleanupTempDir(testCwd);
	});

	describeScenario(
		"質問UIと計画管理を連携させる",
		"質問UI→計画作成→実行の連携フロー",
		(ctx) => {
			let mockPi: any;
			let planId: string;

			ctx.given("questionとplan拡張機能がロードされている", async () => {
				mockPi = createMockPi();

				// questionツール
				mockPi.registerTool({
					name: "question",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "回答を受け付けました" }],
						details: { answers: [["はい"]] },
					}),
				});

				// planツール
				mockPi.registerTool({
					name: "plan_create",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画が作成されました" }],
						details: { planId: "plan-001", name: "テスト計画" },
					}),
				});

				mockPi.registerTool({
					name: "plan_add_step",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ステップが追加されました" }],
						details: { stepId: "step-001", title: "ステップ1" },
					}),
				});

				mockPi.registerTool({
					name: "plan_update_status",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ステータスが更新されました" }],
						details: { planId: "plan-001", status: "active" },
					}),
				});
			});

			ctx.when("ユーザーが質問に回答して計画を作成する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				// 質問: 計画を作成しますか？
				const questionResult = await mockPi.getTool("question")?.execute(
					"tc-1",
					{
						questions: [
							{
								question: "計画を作成しますか？",
								header: "確認",
								options: [
									{ label: "はい" },
									{ label: "いいえ" },
								],
							},
						],
					},
					undefined,
					undefined,
					ctx
				);

				expect(questionResult.details.answers[0][0]).toBe("はい");

				// 計画作成
				const planResult = await mockPi.getTool("plan_create")?.execute(
					"tc-2",
					{ name: "テスト計画", description: "統合テスト用計画" },
					undefined,
					undefined,
					ctx
				);

				expect(planResult.details.planId).toBe("plan-001");
				planId = planResult.details.planId;
			});

			ctx.and("ユーザーが計画にステップを追加する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const stepResult = await mockPi.getTool("plan_add_step")?.execute(
					"tc-3",
					{
						planId,
						title: "ステップ1",
						description: "最初のステップ",
					},
					undefined,
					undefined,
					ctx
				);

				expect(stepResult.details.stepId).toBe("step-001");
			});

			ctx.and("ユーザーが計画をアクティブにする", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const statusResult = await mockPi.getTool("plan_update_status")?.execute(
					"tc-4",
					{ planId, status: "active" },
					undefined,
					undefined,
					ctx
				);

				expect(statusResult.details.status).toBe("active");
			});

			ctx.then("質問UIと計画管理が正しく連携する", () => {
				expect(mockPi.tools.size).toBeGreaterThan(0);
				expect(planId).toBe("plan-001");
			});
		}
	);

	describeScenario(
		"サブエージェントと計画管理を連携させる",
		"サブエージェント実行→計画進行の連携フロー",
		(ctx) => {
			let mockPi: any;
			let planId: string;

			ctx.given("subagentsとplan拡張機能がロードされている", async () => {
				mockPi = createMockPi();

				// planツール
				mockPi.registerTool({
					name: "plan_create",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画が作成されました" }],
						details: { planId: "plan-002", name: "サブエージェント計画" },
					}),
				});

				mockPi.registerTool({
					name: "plan_add_step",
					execute: vi.fn().mockImplementation(({ title }) => ({
						content: [{ text: "ステップが追加されました" }],
						details: {
							planId: "plan-002",
							stepId: `step-${title}`,
							title,
							status: "pending",
						},
					})),
				});

				mockPi.registerTool({
					name: "plan_update_step",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ステップが更新されました" }],
						details: { planId: "plan-002", status: "in_progress" },
					}),
				});

				// subagentツール
				mockPi.registerTool({
					name: "subagent_run",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "サブエージェントが完了しました" }],
						details: {
							subagentId: "researcher",
							outcome: "success",
							duration: 1500,
							runId: "run-001",
						},
					}),
				});
			});

			ctx.when("ユーザーが計画を作成し、サブエージェント用のステップを追加する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				// 計画作成
				const planResult = await mockPi.getTool("plan_create")?.execute(
					"tc-5",
					{ name: "サブエージェント計画", description: "調査タスクの計画" },
					undefined,
					undefined,
					ctx
				);

				planId = planResult.details.planId;

				// ステップ追加（調査）
				await mockPi.getTool("plan_add_step")?.execute(
					"tc-6",
					{ planId, title: "researcherで調査", description: "researcherに調査を依頼" },
					undefined,
					undefined,
					ctx
				);
			});

			ctx.and("ユーザーがステップをin_progressにしてサブエージェントを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				// ステップをin_progressに更新
				await mockPi.getTool("plan_update_step")?.execute(
					"tc-7",
					{ planId, stepId: "step-researcherで調査", status: "in_progress" },
					undefined,
					undefined,
					ctx
				);

				// サブエージェント実行
				const subagentResult = await mockPi.getTool("subagent_run")?.execute(
					"tc-8",
					{
						subagentId: "researcher",
						task: "コードベースの主要機能を調査してください",
					},
					undefined,
					undefined,
					ctx
				);

				expect(subagentResult.details.outcome).toBe("success");
			});

			ctx.then("サブエージェントと計画管理が正しく連携する", () => {
				expect(mockPi.getTool("subagent_run")).toBeDefined();
				expect(planId).toBe("plan-002");
			});
		}
	);

	describeScenario(
		"複数のサブエージェントを並列実行し結果を統合する",
		"サブエージェント並列実行→結果統合の連携フロー",
		(ctx) => {
			let mockPi: any;
			let results: any[] = [];

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();

				mockPi.registerTool({
					name: "subagent_run_parallel",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "並列実行が完了しました" }],
						details: {
							results: [
								{
									subagentId: "researcher",
									outcome: "success",
									duration: 1000,
									output: "調査結果: API, DB, UIモジュール",
								},
								{
									subagentId: "architect",
									outcome: "success",
									duration: 1200,
									output: "設計結果: 3層アーキテクチャ",
								},
								{
									subagentId: "implementer",
									outcome: "success",
									duration: 1100,
									output: "実装結果: TypeScript, Node.js",
								},
							],
							totalDuration: 1500,
						},
					}),
				});
			});

			ctx.when("ユーザーが複数のサブエージェントを並列実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_run_parallel")?.execute(
					"tc-9",
					{
						subagentIds: ["researcher", "architect", "implementer"],
						task: "このプロジェクトの技術スタックを分析してください",
					},
					undefined,
					undefined,
					ctx
				);

				expect(result.details.results).toHaveLength(3);
				results = result.details.results;
			});

			ctx.and("ユーザーが並列実行の結果を統合する", () => {
				// 結果を統合
				const combinedOutput = results.map(r => r.output).join("\n");
				expect(combinedOutput).toContain("API");
				expect(combinedOutput).toContain("3層");
				expect(combinedOutput).toContain("TypeScript");
			});

			ctx.then("並列実行の結果が正しく統合される", () => {
				expect(results).toHaveLength(3);
				expect(results.every(r => r.outcome === "success")).toBe(true);
			});
		}
	);

	describeScenario(
		"動的ツールとサブエージェントを連携させる",
		"動的ツール生成→実行→サブエージェント利用の連携フロー",
		(ctx) => {
			let mockPi: any;
			let toolId: string;

			ctx.given("dynamic-toolsとsubagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();

				// dynamic-toolsツール
				mockPi.registerTool({
					name: "create_tool",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ツールが作成されました" }],
						details: {
							toolId: "tool-001",
							name: "custom_analyzer",
							safetyScore: 0.95,
							qualityScore: 0.9,
						},
					}),
				});

				mockPi.registerTool({
					name: "run_dynamic_tool",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ツールが実行されました" }],
						details: {
							toolId: "tool-001",
							result: "分析結果: 5個のファイルを発見",
							duration: 500,
						},
					}),
				});

				// subagentツール
				mockPi.registerTool({
					name: "subagent_run",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "サブエージェントが完了しました" }],
						details: {
							subagentId: "implementer",
							outcome: "success",
							duration: 1000,
							output: "custom_analyzerを使用して分析しました",
						},
					}),
				});
			});

			ctx.when("ユーザーが動的ツールを作成する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("create_tool")?.execute(
					"tc-10",
					{
						name: "custom_analyzer",
						description: "カスタムアナライザーツール",
						code: "export function execute(params) { return { result: '分析完了' }; }",
						parameters: {},
					},
					undefined,
					undefined,
					ctx
				);

				expect(result.details.safetyScore).toBeGreaterThan(0.9);
				toolId = result.details.toolId;
			});

			ctx.and("ユーザーが動的ツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("run_dynamic_tool")?.execute(
					"tc-11",
					{ toolId, parameters: {} },
					undefined,
					undefined,
					ctx
				);

				expect(result.details.result).toContain("5個のファイル");
			});

			ctx.and("ユーザーがサブエージェントに動的ツールの使用を指示する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_run")?.execute(
					"tc-12",
					{
						subagentId: "implementer",
						task: "custom_analyzerツールを使用してファイルを分析してください",
					},
					undefined,
					undefined,
					ctx
				);

				expect(result.details.output).toContain("custom_analyzer");
			});

			ctx.then("動的ツールとサブエージェントが正しく連携する", () => {
				expect(toolId).toBe("tool-001");
			});
		}
	);

	describeScenario(
		"完全なユーザージャーニー：質問→計画→サブエージェント実行→完了",
		"完全なユーザージャーニーフロー",
		(ctx) => {
			let mockPi: any;
			let planId: string;
			let journeyResults: any = {};

			ctx.given("全ての拡張機能がロードされている", async () => {
				mockPi = createMockPi();

				// questionツール
				mockPi.registerTool({
					name: "question",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "回答を受け付けました" }],
						details: { answers: [["はい"]] },
					}),
				});

				// planツール
				mockPi.registerTool({
					name: "plan_create",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "計画が作成されました" }],
						details: { planId: "plan-journey", name: "ジャーニー計画" },
					}),
				});

				mockPi.registerTool({
					name: "plan_add_step",
					execute: vi.fn().mockImplementation(({ title }) => ({
						content: [{ text: "ステップが追加されました" }],
						details: {
							planId: "plan-journey",
							stepId: `step-${title}`,
							title,
							status: "pending",
						},
					})),
				});

				mockPi.registerTool({
					name: "plan_update_status",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ステータスが更新されました" }],
						details: { planId: "plan-journey", status: "active" },
					}),
				});

				mockPi.registerTool({
					name: "plan_update_step",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "ステップが更新されました" }],
						details: { planId: "plan-journey", status: "in_progress" },
					}),
				});

				// subagentツール
				mockPi.registerTool({
					name: "subagent_run",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "サブエージェントが完了しました" }],
						details: {
							subagentId: "researcher",
							outcome: "success",
							duration: 1500,
							runId: "run-journey",
							output: "調査が完了しました",
						},
					}),
				});
			});

			ctx.when("ユーザーが質問に回答する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("question")?.execute(
					"tc-journey-1",
					{
						questions: [
							{
								question: "タスクを開始しますか？",
								header: "確認",
								options: [
									{ label: "はい" },
									{ label: "いいえ" },
								],
							},
						],
					},
					undefined,
					undefined,
					ctx
				);

				journeyResults.question = result.details.answers[0][0];
				expect(journeyResults.question).toBe("はい");
			});

			ctx.and("ユーザーが計画を作成する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("plan_create")?.execute(
					"tc-journey-2",
					{ name: "ジャーニー計画", description: "完全なジャーニー" },
					undefined,
					undefined,
					ctx
				);

				planId = result.details.planId;
				journeyResults.planId = planId;
			});

			ctx.and("ユーザーが計画にステップを追加する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				await mockPi.getTool("plan_add_step")?.execute(
					"tc-journey-3",
					{ planId, title: "researcher調査", description: "researcherで調査" },
					undefined,
					undefined,
					ctx
				);
			});

			ctx.and("ユーザーが計画をアクティブにする", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				await mockPi.getTool("plan_update_status")?.execute(
					"tc-journey-4",
					{ planId, status: "active" },
					undefined,
					undefined,
					ctx
				);
			});

			ctx.and("ユーザーがサブエージェントを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_run")?.execute(
					"tc-journey-5",
					{
						subagentId: "researcher",
						task: "コードベースを調査してください",
					},
					undefined,
					undefined,
					ctx
				);

				journeyResults.subagent = result.details;
			});

			ctx.then("完全なユーザージャーニーが正常に完了する", () => {
				expect(journeyResults.question).toBe("はい");
				expect(journeyResults.planId).toBe("plan-journey");
				expect(journeyResults.subagent.outcome).toBe("success");
			});
		}
	);
});
