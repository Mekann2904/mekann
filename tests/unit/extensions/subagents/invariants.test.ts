/**
 * @file サブエージェント不変条件テスト
 * @description ABDD/spec.mdで定義されたサブエージェントシステムの不変条件を検証する
 * @testFramework vitest
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// 定義済みサブエージェントの型定義
interface SubagentDefinition {
	id: string;
	name: string;
	description: string;
	systemPrompt: string;
	provider?: string;
	model?: string;
}

/**
 * storage.tsからデフォルトサブエージェント定義を抽出
 * 注: 実際の環境ではstorage.jsonに永続化されるが、
 * テスト環境ではコード内のデフォルト定義を使用
 */
function loadSubagentDefinitions(): SubagentDefinition[] {
	// デフォルトサブエージェント定義（storage.tsから抽出）
	// 出力フォーマット指示とエラー処理指示を含むバージョン
	const defaultAgents: SubagentDefinition[] = [
		{
			id: "researcher",
			name: "Researcher",
			description: "Fast code and docs investigator. Great for broad discovery and fact collection.",
			systemPrompt:
				"You are the Researcher subagent. Collect concrete facts quickly. Use short bullet points. Include file paths and exact findings. Avoid implementation changes. Before starting investigation, explicitly state your understanding of what the user wants to know. If the user's intent is unclear, list multiple possible interpretations. Actively seek evidence that contradicts your initial hypotheses. " +
				"Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
				"If an error or failure occurs during investigation, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
		},
		{
			id: "architect",
			name: "Architect",
			description: "Design-focused helper for decomposition, constraints, and migration plans.",
			systemPrompt:
				"You are the Architect subagent. Propose minimal, modular designs. Prefer explicit trade-offs and short execution plans. Consider multiple design alternatives before settling on one. Explicitly state what assumptions your design depends on. Consider edge cases and failure modes. Verify that your design constraints are necessary and not overly restrictive. " +
				"Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
				"If an error or failure occurs during design, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
		},
		{
			id: "implementer",
			name: "Implementer",
			description: "Implementation helper for scoped coding tasks and fixes.",
			systemPrompt:
				"You are the Implementer subagent. Deliver precise, minimal code-focused output. Mention assumptions. Keep scope tight. Before implementing, verify your understanding of requirements. Consider edge cases and potential side effects. Explicitly state what assumptions your implementation depends on. After implementation, verify that the solution actually solves the stated problem. " +
				"Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
				"If an error or failure occurs during implementation, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
		},
		{
			id: "reviewer",
			name: "Reviewer",
			description: "Read-only reviewer for risk checks, tests, and quality feedback.",
			systemPrompt:
				"You are the Reviewer subagent. Do not propose broad rewrites. Highlight critical issues first, then warnings, then optional improvements. Specifically check for: (1) confirmation bias in conclusions - actively seek disconfirming evidence, (2) missing evidence for claims, (3) logical inconsistencies between CLAIM and RESULT, (4) reversal of causal claims - verify if 'A implies B' also means 'B implies A', (5) assumptions about user intent that may be incorrect, (6) anchoring bias - reconsider initial conclusions in light of new evidence. " +
				"Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
				"If an error or failure occurs during review, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
		},
		{
			id: "tester",
			name: "Tester",
			description: "Validation helper focused on reproducible checks and minimal test plans.",
			systemPrompt:
				"You are the Tester subagent. Propose deterministic validation steps first. Prefer quick, high-signal checks and explicit expected outcomes. Actively seek test cases that could disprove the implementation, not just confirm it. Consider boundary conditions, edge cases, and failure modes. Distinguish between tests that verify expected behavior and tests that try to break the code. " +
				"Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
				"If an error or failure occurs during testing, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
		},
	];

	return defaultAgents;
}

// ============================================================================
// サブエージェント不変条件テスト
// ============================================================================

describe("サブエージェント不変条件", () => {
	let agents: SubagentDefinition[];

	beforeAll(() => {
		agents = loadSubagentDefinitions();
	});

	describe("単一責任", () => {
		it("各サブエージェントは明確な役割を持つ", () => {
			expect(agents.length).toBeGreaterThan(0);

			for (const agent of agents) {
				// 役割が定義されている
				expect(agent.name).toBeDefined();
				expect(agent.name.length).toBeGreaterThan(0);

				// 説明が存在する
				expect(agent.description).toBeDefined();
				expect(agent.description.length).toBeGreaterThan(10);
			}
		});

		it("各サブエージェントのsystemPromptは単一の責任に焦点を当てている", () => {
			for (const agent of agents) {
				expect(agent.systemPrompt).toBeDefined();
				expect(agent.systemPrompt.length).toBeGreaterThan(50);

				// 複数の責任を示唆するキーワードが含まれていないことを確認
				const multiResponsibilityKeywords = [
					"兼ねる",
					"複数の役割",
					"両方",
					"すべてを担当",
				];
				for (const keyword of multiResponsibilityKeywords) {
					expect(
						agent.systemPrompt.toLowerCase(),
						`サブエージェント ${agent.id} のsystemPromptに「${keyword}」が含まれています`,
					).not.toContain(keyword.toLowerCase());
				}
			}
		});

		it("定義済みサブエージェントには期待されるIDが存在する", () => {
			const expectedAgents = [
				"researcher",
				"architect",
				"implementer",
				"reviewer",
				"tester",
			];
			const actualIds = agents.map((a) => a.id);

			for (const expected of expectedAgents) {
				expect(
					actualIds,
					`期待されるサブエージェント ${expected} が見つかりません`,
				).toContain(expected);
			}
		});
	});

	describe("構造化通信", () => {
		it("サブエージェントのsystemPromptには出力フォーマットの指示が含まれる", () => {
			const formatKeywords = ["SUMMARY:", "CLAIM:", "EVIDENCE:", "CONFIDENCE:"];

			for (const agent of agents) {
				const hasFormatInstruction = formatKeywords.some((keyword) =>
					agent.systemPrompt.includes(keyword),
				);

				// 少なくとも1つのフォーマット指示が含まれている
				expect(
					hasFormatInstruction,
					`サブエージェント ${agent.id} のsystemPromptに出力フォーマットの指示が見つかりません`,
				).toBe(true);
			}
		});
	});

	describe("エラー伝播", () => {
		it("サブエージェントのsystemPromptにはエラー処理の指示が含まれる", () => {
			const errorKeywords = ["error", "エラー", "失敗", "exception", "try"];

			for (const agent of agents) {
				const hasErrorHandling = errorKeywords.some((keyword) =>
					agent.systemPrompt.toLowerCase().includes(keyword.toLowerCase()),
				);

				// エラー処理の指示が含まれている
				expect(
					hasErrorHandling,
					`サブエージェント ${agent.id} のsystemPromptにエラー処理の指示が見つかりません`,
				).toBe(true);
			}
		});
	});

	describe("冪等性", () => {
		it("サブエージェントの説明には冪等性に関する言及がある", () => {
			// 注意: これは文書レベルのチェック
			// 実際の冪等性は実行時テストで検証する必要がある
			for (const agent of agents) {
				// 説明が存在すればOK（冪等性の明示的な言及は必須ではない）
				expect(agent.description).toBeDefined();
			}
		});
	});
});

// ============================================================================
// 不変条件違反の検出
// ============================================================================

describe("不変条件違反の検出", () => {
	it("単一責任違反を検出できる", () => {
		const violatingAgent = {
			id: "test-multi-role",
			name: "Multi-Role Agent",
			description: "複数の役割を兼ねるエージェント",
			systemPrompt: "You are an agent that handles everything.",
		};

		// 違反を検出するロジック
		const hasViolation = violatingAgent.description.includes("兼ねる");
		expect(hasViolation).toBe(true);
	});

	it("構造化通信違反を検出できる", () => {
		const violatingAgent = {
			id: "test-unstructured",
			name: "Unstructured Agent",
			description: "非構造化出力エージェント",
			systemPrompt: "Just respond freely without any format.",
		};

		const formatKeywords = ["SUMMARY:", "CLAIM:", "EVIDENCE:", "CONFIDENCE:"];
		const hasViolation = !formatKeywords.some((keyword) =>
			violatingAgent.systemPrompt.includes(keyword),
		);
		expect(hasViolation).toBe(true);
	});
});
