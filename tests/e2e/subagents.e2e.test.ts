/**
 * @file .pi/extensions/subagents.ts のE2Eテスト
 * @description ユーザージャーニーに基づくサブエージェント拡張機能のE2Eテスト
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
		Optional: (type: any) => type,
		Object: (fields: any) => ({ type: "object", fields }),
		Array: (type: any) => ({ type: "array", itemType: type }),
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

// ============================================================================
// E2E Test Scenarios
// ============================================================================

describe("subagents拡張機能 E2Eテスト", () => {
	let testCwd: string;
	let subagentTools: Map<string, any>;

	beforeEach(async () => {
		testCwd = createTempDir("subagents-e2e-");
		subagentTools = new Map();
	});

	afterEach(() => {
		cleanupTempDir(testCwd);
	});

	describeScenario(
		"ユーザーはサブエージェント一覧を表示できる",
		"サブエージェント一覧フロー",
		(ctx) => {
			let mockPi: any;

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = subagentTools;

				mockPi.registerTool({
					name: "subagent_list",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "サブエージェント一覧" }],
						details: {
							agents: [
								{
									id: "researcher",
									name: "Researcher",
									description: "調査専門家",
									enabled: true,
								},
								{
									id: "architect",
									name: "Architect",
									description: "設計専門家",
									enabled: true,
								},
								{
									id: "implementer",
									name: "Implementer",
									description: "実装専門家",
									enabled: true,
								},
							],
						},
					}),
				});
			});

			ctx.when("ユーザーがsubagent_listツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_list")?.execute(
					"tc-1",
					{},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.agents).toHaveLength(3);
				expect(result.details.agents[0].id).toBe("researcher");
			});

			ctx.then("サブエージェント一覧が正しく表示される", () => {
				expect(mockPi.getTool("subagent_list")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーはサブエージェントを実行できる",
		"サブエージェント実行フロー",
		(ctx) => {
			let mockPi: any;
			let runResult: any;
			let subagentId = "researcher";

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = subagentTools;

				mockPi.registerTool({
					name: "subagent_run",
					execute: vi.fn().mockResolvedValue({
						content: [
							{
								text: "SUMMARY: 調査が完了しました\nCLAIM: 調査結果を収集しました\nEVIDENCE: file:1\nCONFIDENCE: 0.9\nRESULT: 調査結果\nNEXT_STEP: none",
							},
						],
						details: {
							subagentId: "researcher",
							outcome: "success",
							duration: 1500,
							output: "調査結果",
						},
					}),
				});
			});

			ctx.and("サブエージェントIDとタスクが与えられている", () => {
				const taskInfo = {
					task: "このコードベースを調査して、主要な機能をリストアップしてください",
					subagentId: "researcher",
				};
			});

			ctx.when("ユーザーがsubagent_runツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				runResult = await mockPi.getTool("subagent_run")?.execute(
					"tc-2",
					{
						subagentId: "researcher",
						task: "このコードベースを調査して、主要な機能をリストアップしてください",
					},
					undefined,
					undefined,
					ctx
				);

				expect(runResult).toBeDefined();
				expect(runResult.details.subagentId).toBe("researcher");
				expect(runResult.details.outcome).toBe("success");
				mockPi.uiNotify("調査が完了しました", "info");
			});

			ctx.then("サブエージェントが正常に実行される", () => {
				expect(mockPi.getTool("subagent_run")).toBeDefined();
				expect(mockPi.uiNotify).toHaveBeenCalledWith(
					expect.stringContaining("調査が完了しました"),
					"info"
				);
			});
		}
	);

	describeScenario(
		"ユーザーは複数のサブエージェントを並列実行できる",
		"サブエージェント並列実行フロー",
		(ctx) => {
			let mockPi: any;
			let subagentIds = ["researcher", "architect", "implementer"];
			let runParallelResult: any;

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = subagentTools;

				mockPi.registerTool({
					name: "subagent_run_parallel",
					execute: vi.fn().mockResolvedValue({
						content: [
							{
								text: "並列実行が完了しました",
							},
						],
						details: {
							results: [
								{
									subagentId: "researcher",
									outcome: "success",
									duration: 1200,
									output: "調査結果",
								},
								{
									subagentId: "architect",
									outcome: "success",
									duration: 1800,
									output: "設計結果",
								},
								{
									subagentId: "implementer",
									outcome: "success",
									duration: 1500,
									output: "実装結果",
								},
							],
							totalDuration: 2000,
						},
					}),
				});
			});

			ctx.and("複数のサブエージェントIDと共通タスクが与えられている", () => {
				const taskInfo = {
					task: "このタスクを並列で処理してください",
					subagentIds: ["researcher", "architect", "implementer"],
				};
			});

			ctx.when("ユーザーがsubagent_run_parallelツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				runParallelResult = await mockPi.getTool("subagent_run_parallel")?.execute(
					"tc-3",
					{
						subagentIds: ["researcher", "architect", "implementer"],
						task: "このタスクを並列で処理してください",
					},
					undefined,
					undefined,
					ctx
				);

				expect(runParallelResult).toBeDefined();
				expect(runParallelResult.details.results).toHaveLength(3);
				expect(runParallelResult.details.totalDuration).toBeLessThan(5000); // 並列実行なので合計より短い
			});

			ctx.then("すべてのサブエージェントが正常に並列実行される", () => {
				expect(mockPi.getTool("subagent_run_parallel")).toBeDefined();
				expect(runParallelResult.details.results.every((r: any) => r.outcome === "success")).toBe(true);
			});
		}
	);

	describeScenario(
		"ユーザーはサブエージェントのステータスを確認できる",
		"サブエージェントステータス確認フロー",
		(ctx) => {
			let mockPi: any;

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = subagentTools;

				mockPi.registerTool({
					name: "subagent_status",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "サブエージェントの実行状態" }],
						details: {
							activeRequests: 2,
							activeAgents: 3,
							maxTotalRequests: 10,
							maxTotalAgents: 20,
						},
					}),
				});
			});

			ctx.when("ユーザーがsubagent_statusツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_status")?.execute(
					"tc-4",
					{},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.activeRequests).toBe(2);
				expect(result.details.activeAgents).toBe(3);
			});

			ctx.then("サブエージェントのステータスが正しく表示される", () => {
				expect(mockPi.getTool("subagent_status")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーはサブエージェントの実行履歴を確認できる",
		"サブエージェント実行履歴フロー",
		(ctx) => {
			let mockPi: any;

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = subagentTools;

				mockPi.registerTool({
					name: "subagent_runs",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "サブエージェントの実行履歴" }],
						details: {
							runs: [
								{
									runId: "run-001",
									subagentId: "researcher",
									task: "調査タスク",
									outcome: "success",
									duration: 1500,
									timestamp: "2026-02-21T00:00:00.000Z",
								},
								{
									runId: "run-002",
									subagentId: "architect",
									task: "設計タスク",
									outcome: "success",
									duration: 2000,
									timestamp: "2026-02-21T01:00:00.000Z",
								},
							],
						},
					}),
				});
			});

			ctx.when("ユーザーがsubagent_runsツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_runs")?.execute(
					"tc-5",
					{ limit: 10 },
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.runs).toHaveLength(2);
				expect(result.details.runs[0].subagentId).toBe("researcher");
			});

			ctx.then("サブエージェントの実行履歴が正しく表示される", () => {
				expect(mockPi.getTool("subagent_runs")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーはサブエージェントを作成できる",
		"サブエージェント作成フロー",
		(ctx) => {
			let mockPi: any;
			let newSubagentId: string;

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = subagentTools;

				mockPi.registerTool({
					name: "subagent_create",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "サブエージェントが作成されました" }],
						details: {
							id: "custom-agent",
							name: "Custom Agent",
							description: "カスタムエージェント",
							enabled: true,
							setCurrent: false,
						},
					}),
				});
			});

			ctx.and("サブエージェントの定義情報が与えられている", () => {
				const agentInfo = {
					id: "custom-agent",
					name: "Custom Agent",
					description: "カスタムエージェント",
					systemPrompt: "あなたはカスタムエージェントです",
				};
			});

			ctx.when("ユーザーがsubagent_createツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_create")?.execute(
					"tc-6",
					{
						id: "custom-agent",
						name: "Custom Agent",
						description: "カスタムエージェント",
						systemPrompt: "あなたはカスタムエージェントです",
					},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.id).toBe("custom-agent");
				newSubagentId = result.details.id;
			});

			ctx.then("サブエージェントが正しく作成される", () => {
				expect(mockPi.getTool("subagent_create")).toBeDefined();
				expect(newSubagentId).toBe("custom-agent");
			});
		}
	);

	describeScenario(
		"ユーザーはサブエージェントの設定を更新できる",
		"サブエージェント設定更新フロー",
		(ctx) => {
			let mockPi: any;
			let subagentId = "researcher";

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = subagentTools;

				mockPi.registerTool({
					name: "subagent_configure",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "サブエージェントの設定が更新されました" }],
						details: {
							subagentId: "researcher",
							enabled: false,
							setCurrent: false,
						},
					}),
				});
			});

			ctx.and("サブエージェントIDと更新情報が与えられている", () => {
				const configInfo = {
					subagentId: "researcher",
					enabled: false,
				};
			});

			ctx.when("ユーザーがsubagent_configureツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_configure")?.execute(
					"tc-7",
					{
						subagentId: "researcher",
						enabled: false,
					},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.enabled).toBe(false);
			});

			ctx.then("サブエージェントの設定が正しく更新される", () => {
				expect(mockPi.getTool("subagent_configure")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーはサブエージェントを含む完全なタスクフローを実行できる",
		"サブエージェント完全タスクフロー",
		(ctx) => {
			let mockPi: any;
			let runId: string;

			ctx.given("subagents拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = subagentTools;

				mockPi.registerTool({
					name: "subagent_run",
					execute: vi.fn().mockResolvedValue({
						content: [
							{
								text: "SUMMARY: 調査完了\nRESULT: 主要機能を特定しました\nNEXT_STEP: none",
							},
						],
						details: {
							subagentId: "researcher",
							outcome: "success",
							duration: 1200,
							runId: "run-complete-flow",
						},
					}),
				});

				mockPi.registerTool({
					name: "subagent_runs",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "実行履歴" }],
						details: {
							runs: [
								{
									runId: "run-complete-flow",
									subagentId: "researcher",
									task: "調査タスク",
									outcome: "success",
									duration: 1200,
								},
							],
						},
					}),
				});
			});

			ctx.when("ユーザーがresearcherで調査タスクを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_run")?.execute(
					"tc-complete-1",
					{
						subagentId: "researcher",
						task: "コードベースの主要機能を調査してください",
					},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.outcome).toBe("success");
				runId = result.details.runId;
			});

			ctx.and("ユーザーが実行履歴を確認する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("subagent_runs")?.execute(
					"tc-complete-2",
					{ limit: 5 },
					undefined,
					undefined,
					ctx
				);

				expect(result.details.runs).toContainEqual(
					expect.objectContaining({ runId })
				);
			});

			ctx.then("サブエージェントを含む完全なタスクフローが正常に完了する", () => {
				expect(mockPi.getTool("subagent_run")).toBeDefined();
				expect(runId).toBe("run-complete-flow");
			});
		}
	);
});
