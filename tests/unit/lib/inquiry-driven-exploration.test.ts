/**
 * @abdd.meta
 * @path tests/unit/lib/inquiry-driven-exploration.test.ts
 * @role 問い駆動型探求モードのテスト
 * @why システムが正しく動作することを保証する
 * @related lib/inquiry-driven-exploration.ts
 * @public_api なし（テストファイル）
 */

import { describe, it, expect } from "vitest";
import { InquiryDrivenExploration } from "../../../.pi/lib/inquiry-driven-exploration";

describe("InquiryDrivenExploration", () => {
	describe("初期化", () => {
		it("初期問いでインスタンスを作成できる", () => {
			const exploration = new InquiryDrivenExploration(
				"完了への渇愛はどのような構造によって再生産されているのか？",
				"自己改善システムの分析"
			);

			const state = exploration.getState();

			expect(state.currentCycle.initialInquiry.question).toBe(
				"完了への渇愛はどのような構造によって再生産されているのか？"
			);
			expect(state.currentCycle.currentPhase).toBe("initial_inquiry");
		});

		it("問いの種類が正しく分類される", () => {
			const explanatory = new InquiryDrivenExploration("なぜエラーが発生するのか？", "テスト");
			expect(explanatory.getState().currentCycle.initialInquiry.kind).toBe("explanatory");

			const normative = new InquiryDrivenExploration("どうすべきか？", "テスト");
			expect(normative.getState().currentCycle.initialInquiry.kind).toBe("normative");

			const aporic = new InquiryDrivenExploration("この矛盾をどう解決するか？", "テスト");
			expect(aporic.getState().currentCycle.initialInquiry.kind).toBe("aporic");
		});
	});

	describe("フェーズの進行", () => {
		it("段階を進めることができる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			exploration.advancePhase("exploration");
			expect(exploration.getState().currentCycle.currentPhase).toBe("exploration");

			exploration.advancePhase("counter_example");
			expect(exploration.getState().currentCycle.currentPhase).toBe("counter_example");
		});
	});

	describe("アプローチの追加", () => {
		it("アプローチを追加できる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			exploration.addApproach({
				description: "脱構築的アプローチ",
				perspective: ["deconstruction"],
				findings: "二項対立を発見した",
				limitations: "歴史的文脈が不足",
				confidence: 0.7,
			});

			const state = exploration.getState();
			expect(state.currentCycle.approaches).toHaveLength(1);
			expect(state.currentCycle.approaches[0].description).toBe("脱構築的アプローチ");
		});

		it("脱構築のアプローチは問いの深度を foundational に上げる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");
			expect(exploration.getState().currentCycle.initialInquiry.depth).toBe("surface");

			exploration.addApproach({
				description: "脱構築",
				perspective: ["deconstruction"],
				findings: "",
				limitations: "",
				confidence: 0.5,
			});

			expect(exploration.getState().currentCycle.initialInquiry.depth).toBe("foundational");
		});
	});

	describe("反例の追加", () => {
		it("反例を追加できる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			exploration.addCounterExample({
				content: "この前提に対する反例",
				challengedPremise: "テスト前提",
				strength: 0.8,
				response: "accepted",
			});

			const state = exploration.getState();
			expect(state.currentCycle.counterExamples).toHaveLength(1);
			expect(state.completionCriteria.counterExamplesSought).toBe(true);
		});
	});

	describe("アポリアの発見", () => {
		it("アポリアを発見・記録できる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			const aporia = exploration.discoverAporia(
				["完全性", "速度"],
				["品質を確保するためには時間が必要", "市場に早く届けるためには割り切りが必要"]
			);

			expect(aporia.poles).toEqual(["完全性", "速度"]);
			expect(aporia.currentStatus).toBe("active");

			const state = exploration.getState();
			expect(state.currentCycle.aporiae).toHaveLength(1);
			expect(state.trackedAporiae).toHaveLength(1);
			expect(state.completionCriteria.aporiaeAcknowledged).toBe(true);
		});
	});

	describe("統合", () => {
		it("統合された判断を設定できる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			exploration.setIntegration({
				claim: "テスト主張",
				evidence: ["証拠1", "証拠2"],
				confidence: 0.75,
				residualUncertainty: ["残留する不確実性"],
				contextualBoundary: ["この判断が成り立たない文脈"],
			});

			const state = exploration.getState();
			expect(state.currentCycle.integration?.claim).toBe("テスト主張");
			expect(state.currentCycle.currentPhase).toBe("integration");
		});
	});

	describe("学び", () => {
		it("学びを追加できる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			exploration.addLearning("重要な発見");
			exploration.addLearning("もう一つの発見");

			const state = exploration.getState();
			expect(state.currentCycle.learnings).toHaveLength(2);
			expect(state.cumulativeLearnings).toHaveLength(2);
		});
	});

	describe("次の問い", () => {
		it("次の問いを設定できる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			exploration.setNextInquiry("より深い問い", "次のコンテキスト");

			const state = exploration.getState();
			expect(state.currentCycle.nextInquiry?.question).toBe("より深い問い");
			expect(state.currentCycle.currentPhase).toBe("new_inquiry");
		});

		it("次の問いの深度は現在より深くなる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");
			expect(exploration.getState().currentCycle.initialInquiry.depth).toBe("surface");

			exploration.setNextInquiry("より深い問い", "次のコンテキスト");

			const state = exploration.getState();
			expect(state.currentCycle.nextInquiry?.depth).toBe("structural");
		});
	});

	describe("サイクルの完了", () => {
		it("次の問いがある場合、次のサイクルを開始できる", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			exploration.setNextInquiry("次の問い", "次のコンテキスト");
			const result = exploration.completeCycleAndStartNext();

			expect(result).toBe(true);
			expect(exploration.getState().cycleHistory).toHaveLength(1);
			expect(exploration.getState().currentCycle.parentCycleId).toBeDefined();
		});

		it("次の問いがない場合、falseを返す", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			const result = exploration.completeCycleAndStartNext();

			expect(result).toBe(false);
		});

		it("最大サイクル数に到達した場合、falseを返す", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト", 2);

			// 1回目
			exploration.setNextInquiry("問い1", "コンテキスト");
			exploration.completeCycleAndStartNext();

			// 2回目
			exploration.setNextInquiry("問い2", "コンテキスト");
			const result = exploration.completeCycleAndStartNext();

			expect(result).toBe(false);
		});
	});

	describe("完了の判定", () => {
		it("最小サイクル数に到達していない場合、完了しない", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			const completion = exploration.evaluateCompletion();

			expect(completion.isComplete).toBe(false);
			expect(completion.completionType).toBe("inquiry_deepened");
		});

		it("アポリアが認識されていない場合、完了しない", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			// 最小サイクル数を満たす
			for (let i = 0; i < 3; i++) {
				exploration.setNextInquiry(`問い${i}`, "コンテキスト");
				exploration.completeCycleAndStartNext();
			}

			// アポリアと反例を追加（完了条件を満たす）
			exploration.addCounterExample({
				content: "反例",
				challengedPremise: "前提",
				strength: 0.8,
				response: "accepted",
			});

			const completion = exploration.evaluateCompletion();

			expect(completion.isComplete).toBe(false);
			expect(completion.reason).toContain("アポリア");
		});

		it("すべての条件を満たした場合、完了する", () => {
			const exploration = new InquiryDrivenExploration("テスト問い", "テスト");

			// 最小サイクル数を満たす（学びを追加して限界的効用の逆転を防ぐ）
			for (let i = 0; i < 3; i++) {
				exploration.setNextInquiry(`問い${i}`, "コンテキスト");
				exploration.addLearning(`学び${i}`); // 各サイクルで学びを追加
				exploration.completeCycleAndStartNext();
			}

			// アポリアと反例を追加
			exploration.discoverAporia(["極A", "極B"], ["理由A", "理由B"]);
			exploration.addCounterExample({
				content: "反例",
				challengedPremise: "前提",
				strength: 0.8,
				response: "accepted",
			});

			// 深度を上げる（脱構築アプローチを追加）
			exploration.addApproach({
				description: "脱構築",
				perspective: ["deconstruction"],
				findings: "",
				limitations: "",
				confidence: 0.5,
			});

			const completion = exploration.evaluateCompletion();

			expect(completion.isComplete).toBe(true);
			expect(completion.completionType).toBe("sufficient_understanding");
		});
	});
});
