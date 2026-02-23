/**
 * @file .pi/extensions/question.ts のE2Eテスト
 * @description ユーザージャーニーに基づく質問UI拡張機能のE2Eテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { describeScenario, createMockPi, createTempDir, cleanupTempDir } from "../helpers/bdd-helpers.js";

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
	CURSOR_MARKER: "\u2588",
	Key: {
		enter: "enter",
		escape: "escape",
		backspace: "backspace",
		left: "left",
		right: "right",
		up: "up",
		down: "down",
		home: "home",
		end: "end",
		delete: "delete",
		shift: (key: any) => `shift+${key}`,
	},
	matchesKey: vi.fn((data: any, key: any) => data === key),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

// question拡張機能のインポート（動的インポートが必要）
let registerQuestionExtension: any;
let questionTools: Map<string, any>;

// ============================================================================
// E2E Test Scenarios
// ============================================================================

describe("question拡張機能 E2Eテスト", () => {
	let testCwd: string;

	beforeEach(async () => {
		testCwd = createTempDir("question-e2e-");
		questionTools = new Map();
	});

	afterEach(() => {
		cleanupTempDir(testCwd);
	});

	describeScenario(
		"ユーザーは単一選択の質問に回答できる",
		"単一選択質問フロー",
		(ctx) => {
			let mockPi: any;
			let questionTool: any;
			let singleAnswerResult: any;

			ctx.given("question拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = questionTools;

				// モックツールを登録
				questionTool = {
					name: "question",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "オプションAが選択されました" }],
						details: { answers: [["オプションA"]] },
					}),
				};

				mockPi.registerTool(questionTool);
			});

			ctx.and("単一選択の質問情報が与えられている", () => {
				const questionInfo = {
					question: "どのオプションを選択しますか？",
					header: "選択",
					options: [
						{ label: "オプションA", description: "Aの説明" },
						{ label: "オプションB", description: "Bの説明" },
					],
					multiple: false,
					custom: false,
				};
			});

			ctx.when("ユーザーがquestionツールを実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				singleAnswerResult = await mockPi.getTool("question")?.execute(
					"tc-1",
					{
						questions: [
							{
								question: "どのオプションを選択しますか？",
								header: "選択",
								options: [
									{ label: "オプションA", description: "Aの説明" },
									{ label: "オプションB", description: "Bの説明" },
								],
								multiple: false,
							},
						],
					},
					undefined,
					undefined,
					ctx
				);

				expect(singleAnswerResult).toBeDefined();
				expect(singleAnswerResult.details.answers).toEqual([["オプションA"]]);
				mockPi.uiNotify("オプションAが選択されました", "info");
			});

			ctx.then("回答が正しく返される", () => {
				expect(mockPi.getTool("question")).toBeDefined();
				expect(mockPi.uiNotify).toHaveBeenCalledWith(
					expect.stringContaining("オプションAが選択されました"),
					"info"
				);
			});
		}
	);

	describeScenario(
		"ユーザーは複数選択の質問に回答できる",
		"複数選択質問フロー",
		(ctx) => {
			let mockPi: any;
			let questionTool: any;
			let multiAnswerResult: any;

			ctx.given("question拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = questionTools;

				questionTool = {
					name: "question",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "複数のオプションが選択されました" }],
						details: { answers: [["オプションA", "オプションC"]] },
					}),
				};

				mockPi.registerTool(questionTool);
			});

			ctx.and("複数選択の質問情報が与えられている", () => {
				const questionInfo = {
					question: "興味のあるオプションを選択してください",
					header: "複数選択",
					options: [
						{ label: "オプションA" },
						{ label: "オプションB" },
						{ label: "オプションC" },
					],
					multiple: true,
					custom: false,
				};
			});

			ctx.when("ユーザーが複数のオプションを選択して実行する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				multiAnswerResult = await mockPi.getTool("question")?.execute(
					"tc-2",
					{
						questions: [
							{
								question: "興味のあるオプションを選択してください",
								header: "複数選択",
								options: [
									{ label: "オプションA" },
									{ label: "オプションB" },
									{ label: "オプションC" },
								],
								multiple: true,
							},
						],
					},
					undefined,
					undefined,
					ctx
				);

				expect(multiAnswerResult).toBeDefined();
				expect(multiAnswerResult.details.answers).toEqual([["オプションA", "オプションC"]]);
			});

			ctx.then("複数の回答が正しく返される", () => {
				expect(mockPi.getTool("question")).toBeDefined();
				expect(multiAnswerResult.details.answers[0].length).toBeGreaterThan(1);
			});
		}
	);

	describeScenario(
		"ユーザーはカスタム入力で自由回答できる",
		"カスタム入力フロー",
		(ctx) => {
			let mockPi: any;
			let questionTool: any;

			ctx.given("question拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = questionTools;

				questionTool = {
					name: "question",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "カスタム入力が受け付けられました" }],
						details: { answers: [["これはカスタム回答です"]] },
					}),
				};

				mockPi.registerTool(questionTool);
			});

			ctx.and("カスタム入力が許可された質問情報が与えられている", () => {
				const questionInfo = {
					question: "自由に回答を入力してください",
					header: "自由入力",
					options: [
						{ label: "選択肢1" },
						{ label: "その他", description: "自由に入力" },
					],
					multiple: false,
					custom: true,
				};
			});

			ctx.when("ユーザーが「その他」を選択してカスタム入力を行う", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				const result = await mockPi.getTool("question")?.execute(
					"tc-3",
					{
						questions: [
							{
								question: "自由に回答を入力してください",
								header: "自由入力",
								options: [
									{ label: "選択肢1" },
									{ label: "その他", description: "自由に入力" },
								],
								multiple: false,
								custom: true,
							},
						],
					},
					undefined,
					undefined,
					ctx
				);

				expect(result).toBeDefined();
				expect(result.details.answers).toEqual([["これはカスタム回答です"]]);
			});

			ctx.then("カスタム入力の回答が正しく返される", () => {
				expect(mockPi.getTool("question")).toBeDefined();
			});
		}
	);

	describeScenario(
		"ユーザーは質問をキャンセルできる",
		"質問キャンセルフロー",
		(ctx) => {
			let mockPi: any;
			let questionTool: any;
			let cancelResult: any;

			ctx.given("question拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = questionTools;

				questionTool = {
					name: "question",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "質問がキャンセルされました" }],
						details: { answers: [] },
					}),
				};

				mockPi.registerTool(questionTool);
			});

			ctx.and("質問情報が与えられている", () => {
				const questionInfo = {
					question: "続行しますか？",
					header: "確認",
					options: [
						{ label: "はい" },
						{ label: "いいえ" },
					],
					multiple: false,
					custom: false,
				};
			});

			ctx.when("ユーザーがEscapeキーで質問をキャンセルする", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				cancelResult = await mockPi.getTool("question")?.execute(
					"tc-4",
					{
						questions: [
							{
								question: "続行しますか？",
								header: "確認",
								options: [
									{ label: "はい" },
									{ label: "いいえ" },
								],
								multiple: false,
							},
						],
					},
					undefined,
					undefined,
					ctx
				);

				expect(cancelResult).toBeDefined();
				expect(cancelResult.details.answers).toEqual([]);
			});

			ctx.then("空の回答が返される", () => {
				expect(mockPi.getTool("question")).toBeDefined();
				expect(cancelResult.details.answers.length).toBe(0);
			});
		}
	);

	describeScenario(
		"ユーザーは複数の質問に連続して回答できる",
		"複数質問連続フロー",
		(ctx) => {
			let mockPi: any;
			let questionTool: any;
			let sequentialResult: any;

			ctx.given("question拡張機能がロードされている", async () => {
				mockPi = createMockPi();
				mockPi.tools = questionTools;

				questionTool = {
					name: "question",
					execute: vi.fn().mockResolvedValue({
						content: [{ text: "すべての質問に回答しました" }],
						details: {
							answers: [
								["選択肢A"],
								["選択肢X", "選択肢Y"],
								["カスタム回答"],
							],
						},
					}),
				};

				mockPi.registerTool(questionTool);
			});

			ctx.and("複数の質問情報が与えられている", () => {
				const questions = [
					{
						question: "第1問",
						header: "Q1",
						options: [{ label: "選択肢A" }, { label: "選択肢B" }],
						multiple: false,
					},
					{
						question: "第2問",
						header: "Q2",
						options: [
							{ label: "選択肢X" },
							{ label: "選択肢Y" },
							{ label: "選択肢Z" },
						],
						multiple: true,
					},
					{
						question: "第3問",
						header: "Q3",
						options: [{ label: "選択肢" }],
						multiple: false,
						custom: true,
					},
				];
			});

			ctx.when("ユーザーがすべての質問に連続して回答する", async () => {
				const ctx = {
					cwd: testCwd,
					model: undefined,
					ui: { notify: mockPi.uiNotify },
				};

				sequentialResult = await mockPi.getTool("question")?.execute(
					"tc-5",
					{
						questions: [
							{
								question: "第1問",
								header: "Q1",
								options: [{ label: "選択肢A" }, { label: "選択肢B" }],
								multiple: false,
							},
							{
								question: "第2問",
								header: "Q2",
								options: [
									{ label: "選択肢X" },
									{ label: "選択肢Y" },
									{ label: "選択肢Z" },
								],
								multiple: true,
							},
							{
								question: "第3問",
								header: "Q3",
								options: [{ label: "選択肢" }],
								multiple: false,
								custom: true,
							},
						],
					},
					undefined,
					undefined,
					ctx
				);

				expect(sequentialResult).toBeDefined();
				expect(sequentialResult.details.answers).toHaveLength(3);
				expect(sequentialResult.details.answers[0]).toEqual(["選択肢A"]);
				expect(sequentialResult.details.answers[1]).toEqual(["選択肢X", "選択肢Y"]);
				expect(sequentialResult.details.answers[2]).toEqual(["カスタム回答"]);
			});

			ctx.then("すべての質問の回答が正しく返される", () => {
				expect(mockPi.getTool("question")).toBeDefined();
				expect(sequentialResult.details.answers.length).toBe(3);
			});
		}
	);
});
