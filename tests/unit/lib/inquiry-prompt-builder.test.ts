/**
 * @abdd.meta
 * @path tests/unit/lib/inquiry-prompt-builder.test.ts
 * @role 問い駆動型プロンプトビルダーのテスト
 * @why システムが正しく動作することを保証する
 * @related lib/inquiry-prompt-builder.ts
 * @public_api なし（テストファイル）
 */

import { describe, it, expect } from "vitest";
import {
	buildInquiryPrompt,
	buildAporiaPrompt,
	buildPreCompletionCheckPrompt,
	buildDeepeningPrompt,
} from "../../../.pi/lib/inquiry-prompt-builder";

describe("inquiry-prompt-builder", () => {
	describe("buildInquiryPrompt", () => {
		it("基本的なプロンプトを生成できる", () => {
			const prompt = buildInquiryPrompt({
				taskDescription: "エラーを修正する",
			});

			expect(prompt).toContain("問い駆動型探求モード");
			expect(prompt).toContain("探求の5段階");
			expect(prompt).toContain("完了の判定基準");
		});

		it("推奨カテゴリを指定できる", () => {
			const prompt = buildInquiryPrompt({
				taskDescription: "テスト",
				recommendedCategories: ["deconstruction"],
			});

			expect(prompt).toContain("推奨される問いのパターン");
		});

		it("最小サイクル数をカスタマイズできる", () => {
			const prompt = buildInquiryPrompt({
				taskDescription: "テスト",
				minCycles: 5,
			});

			expect(prompt).toContain("最小5サイクル");
		});

		it("完了判定の深度をカスタマイズできる", () => {
			const prompt = buildInquiryPrompt({
				taskDescription: "テスト",
				requiredDepth: "aporic",
			});

			expect(prompt).toContain("aporic");
		});

		it("追加の指示を含められる", () => {
			const prompt = buildInquiryPrompt({
				taskDescription: "テスト",
				additionalInstructions: "これは追加の指示です。",
			});

			expect(prompt).toContain("追加の指示");
			expect(prompt).toContain("これは追加の指示です。");
		});

		it("プロンプトに「完了」を強制しない内容が含まれる", () => {
			const prompt = buildInquiryPrompt({
				taskDescription: "テスト",
			});

			// 「完了」に関する記述が「条件」として提示されている
			expect(prompt).toContain("完了の判定基準");
			// アポリアの認識が条件に含まれている
			expect(prompt).toContain("アポリア");
		});

		it("規範の自覚を促す内容が含まれる", () => {
			const prompt = buildInquiryPrompt({
				taskDescription: "テスト",
			});

			// 「このモード自体の規範性」について言及している
			expect(prompt).toContain("規範");
			// 「脱出の許可」について言及している
			expect(prompt).toContain("やめる");
			// 「メタ問い」について言及している
			expect(prompt).toContain("なぜ私は");
		});

		it("停止条件が含まれる", () => {
			const prompt = buildInquiryPrompt({
				taskDescription: "テスト",
			});

			expect(prompt).toContain("停止条件");
			expect(prompt).toContain("限界的効用");
			expect(prompt).toContain("強迫");
		});
	});

	describe("buildAporiaPrompt", () => {
		it("アポリア認識のプロンプトを生成できる", () => {
			const prompt = buildAporiaPrompt(["完全性", "速度"]);

			expect(prompt).toContain("アポリアの認識");
			expect(prompt).toContain("完全性");
			expect(prompt).toContain("速度");
		});

		it("アポリア対処の原則が含まれる", () => {
			const prompt = buildAporiaPrompt(["A", "B"]);

			expect(prompt).toContain("認識");
			expect(prompt).toContain("非解決");
			expect(prompt).toContain("両極維持");
		});

		it("「バランス」表現を避けるよう促す", () => {
			const prompt = buildAporiaPrompt(["A", "B"]);

			expect(prompt).toContain("バランス");
			expect(prompt).toContain("避けてください");
		});
	});

	describe("buildPreCompletionCheckPrompt", () => {
		it("完了前の自己点検プロンプトを生成できる", () => {
			const prompt = buildPreCompletionCheckPrompt();

			expect(prompt).toContain("完了前の自己点検");
			expect(prompt).toContain("除外されたもの");
			expect(prompt).toContain("文脈依存性");
			expect(prompt).toContain("新たな問い");
		});

		it("完了の条件が含まれる", () => {
			const prompt = buildPreCompletionCheckPrompt();

			expect(prompt).toContain("完了の条件");
			expect(prompt).toContain("アポリア");
			expect(prompt).toContain("否定する証拠");
		});
	});

	describe("buildDeepeningPrompt", () => {
		it("surface深度のプロンプトを生成できる", () => {
			const prompt = buildDeepeningPrompt("surface");

			expect(prompt).toContain("表面的な問い");
			expect(prompt).toContain("structural");
		});

		it("structural深度のプロンプトを生成できる", () => {
			const prompt = buildDeepeningPrompt("structural");

			expect(prompt).toContain("構造的な問い");
			expect(prompt).toContain("foundational");
		});

		it("foundational深度のプロンプトを生成できる", () => {
			const prompt = buildDeepeningPrompt("foundational");

			expect(prompt).toContain("基礎的な問い");
			expect(prompt).toContain("aporic");
		});

		it("aporic深度のプロンプトを生成できる", () => {
			const prompt = buildDeepeningPrompt("aporic");

			expect(prompt).toContain("アポリア的問い");
			// aporicは最も深いので次の深度もaporic
			expect(prompt).toContain("aporic");
		});

		it("各深度に適切な問いの例が含まれる", () => {
			const surfacePrompt = buildDeepeningPrompt("surface");
			expect(surfacePrompt).toContain("なぜ");

			const foundationalPrompt = buildDeepeningPrompt("foundational");
			expect(foundationalPrompt).toContain("前提");
		});
	});
});
