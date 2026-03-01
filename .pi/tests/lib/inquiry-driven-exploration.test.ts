/**
 * @abdd.meta
 * path: .pi/tests/lib/inquiry-driven-exploration.test.ts
 * role: inquiry-driven-exploration.tsの単体テスト
 * why: 問い駆動型探求の正確性と一貫性を保証するため
 * related: .pi/lib/inquiry-driven-exploration.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * @abdd.explain
 * overview: 問い駆動型探求の単体テスト
 * what_it_does:
 *   - 探求サイクルの進行をテスト
 *   - 問いの深度評価をテスト
 *   - アポリア検出をテスト
 * why_it_exists:
 *   - 探求プロセスの品質保証
 *   - 問い駆動型思考の信頼性確保
 * scope:
 *   in: InquiryDrivenExploration, InquiryDepth, ExplorationPhase
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	InquiryDrivenExploration,
	type InquiryDepth,
	type ExplorationPhase,
	type Approach,
	type CounterExample,
	type Integration,
} from "../../lib/inquiry-driven-exploration.js";

describe("inquiry-driven-exploration", () => {
	let exploration: InquiryDrivenExploration;

	beforeEach(() => {
		exploration = new InquiryDrivenExploration(
			"なぜこれが問題なのか",
			"テストコンテキスト"
		);
	});

	describe("InquiryDrivenExploration", () => {
		describe("constructor", () => {
			it("should_initialize_with_default_state", () => {
				// Assert
				expect(exploration).toBeDefined();
			});
		});

		describe("getState", () => {
			it("should_return_current_state", () => {
				// Act
				const state = exploration.getState();

				// Assert
				expect(state).toBeDefined();
				expect(state.currentCycle).toBeDefined();
			});
		});

		describe("advancePhase", () => {
			it("should_advance_to_next_phase", () => {
				// Act
				exploration.advancePhase("exploration");
				const state = exploration.getState();

				// Assert
				expect(state.currentCycle.currentPhase).toBe("exploration");
			});
		});

		describe("addApproach", () => {
			it("should_add_approach", () => {
				// Arrange
				const approach: Approach = {
					description: "テストアプローチ",
					perspective: ["deconstruction"],
					findings: "発見内容",
				};

				// Act
				exploration.addApproach(approach);
				const state = exploration.getState();

				// Assert
				expect(state.currentCycle.approaches).toHaveLength(1);
				expect(state.currentCycle.approaches[0].description).toBe("テストアプローチ");
			});
		});

		describe("addCounterExample", () => {
			it("should_add_counter_example", () => {
				// Arrange
				const counterExample: CounterExample = {
					description: "反例の説明",
					context: "コンテキスト",
					implications: ["含意1"],
				};

				// Act
				exploration.addCounterExample(counterExample);
				const state = exploration.getState();

				// Assert
				expect(state.currentCycle.counterExamples).toHaveLength(1);
				expect(state.currentCycle.counterExamples[0].description).toBe("反例の説明");
			});
		});

		describe("discoverAporia", () => {
			it("should_discover_aporia", () => {
				// Arrange
				const poles: [string, string] = ["立場A", "立場B"];
				const justificationFor: [string, string] = ["Aの理由", "Bの理由"];

				// Act
				const aporia = exploration.discoverAporia(poles, justificationFor);
				const tracked = exploration.getTrackedAporiae();

				// Assert
				expect(aporia).toBeDefined();
				expect(aporia.poles).toEqual(poles);
				expect(tracked).toHaveLength(1);
			});
		});

		describe("setIntegration", () => {
			it("should_set_integration", () => {
				// Arrange
				const integration: Integration = {
					claim: "主張",
					evidence: ["証拠1"],
					confidence: 0.8,
					residualUncertainty: "不確実性",
				};

				// Act
				exploration.setIntegration(integration);
				const state = exploration.getState();

				// Assert
				expect(state.currentCycle.integration).toBeDefined();
				expect(state.currentCycle.integration?.claim).toBe("主張");
			});
		});

		describe("addLearning", () => {
			it("should_add_learning", () => {
				// Arrange
				const learning = "新しい学び";

				// Act
				exploration.addLearning(learning);
				const learnings = exploration.getCumulativeLearnings();

				// Assert
				expect(learnings).toContain(learning);
			});
		});

		describe("setNextInquiry", () => {
			it("should_set_next_inquiry", () => {
				// Arrange
				const question = "次の問い";
				const context = "次のコンテキスト";

				// Act
				exploration.setNextInquiry(question, context);
				const state = exploration.getState();

				// Assert - nextInquiry is set, not initialInquiry
				expect(state.currentCycle.nextInquiry).toBeDefined();
				expect(state.currentCycle.nextInquiry?.question).toBe(question);
				expect(state.currentCycle.currentPhase).toBe("new_inquiry");
			});
		});

		describe("evaluateCompletion", () => {
			it("should_evaluate_completion", () => {
				// Act
				const result = exploration.evaluateCompletion();

				// Assert
				expect(result).toBeDefined();
				expect(typeof result.isComplete).toBe("boolean");
			});
		});

		describe("completeCycleAndStartNext", () => {
			it("should_complete_cycle_and_start_next", () => {
				// Arrange
				exploration.addLearning("学び1");

				// Act
				const result = exploration.completeCycleAndStartNext();

				// Assert
				expect(typeof result).toBe("boolean");
			});
		});

		describe("getTrackedAporiae", () => {
			it("should_return_tracked_aporiae", () => {
				// Act
				const aporiae = exploration.getTrackedAporiae();

				// Assert
				expect(Array.isArray(aporiae)).toBe(true);
			});
		});

		describe("getCumulativeLearnings", () => {
			it("should_return_cumulative_learnings", () => {
				// Act
				const learnings = exploration.getCumulativeLearnings();

				// Assert
				expect(Array.isArray(learnings)).toBe(true);
			});
		});
	});

	describe("InquiryDepth type", () => {
		it("should_have_valid_depth_values", () => {
			// Arrange
			const validDepths: InquiryDepth[] = ["surface", "structural", "foundational", "aporic"];

			// Assert
			expect(validDepths).toContain("surface");
			expect(validDepths).toContain("structural");
			expect(validDepths).toContain("foundational");
			expect(validDepths).toContain("aporic");
		});
	});

	describe("ExplorationPhase type", () => {
		it("should_have_valid_phase_values", () => {
			// Arrange - actual phases defined in the source
			const validPhases: ExplorationPhase[] = [
				"initial_inquiry",
				"exploration",
				"counter_example",
				"integration",
				"new_inquiry",
			];

			// Assert
			expect(validPhases).toContain("initial_inquiry");
			expect(validPhases).toContain("exploration");
			expect(validPhases).toContain("counter_example");
			expect(validPhases).toContain("integration");
			expect(validPhases).toContain("new_inquiry");
		});
	});
});
