/**
 * @abdd.meta
 * @path tests/unit/lib/inquiry-library.test.ts
 * @role 問いのライブラリのテスト
 * @why システムが正しく動作することを保証する
 * @related lib/inquiry-library.ts
 * @public_api なし（テストファイル）
 */

import { describe, it, expect } from "vitest";
import { InquiryLibrary, getInquiryLibrary, type InquiryCategory } from "../../../.pi/lib/inquiry-library";

describe("InquiryLibrary", () => {
	describe("初期化", () => {
		it("カテゴリ別に問いの種を取得できる", () => {
			const library = new InquiryLibrary();

			const deconstructionSeeds = library.getSeedsByCategory("deconstruction");
			expect(deconstructionSeeds.length).toBeGreaterThan(0);
			expect(deconstructionSeeds[0].relatedPerspectives).toContain("deconstruction");
		});

		it("深度別に問いの種を取得できる", () => {
			const library = new InquiryLibrary();

			const foundationalSeeds = library.getSeedsByDepth("foundational");
			expect(foundationalSeeds.length).toBeGreaterThan(0);
			expect(foundationalSeeds[0].expectedDepth).toBe("foundational");
		});

		it("すべての問いの種を取得できる", () => {
			const library = new InquiryLibrary();

			const allSeeds = library.getAllSeeds();
			expect(allSeeds.length).toBeGreaterThan(20); // 8カテゴリ × 複数の種
		});
	});

	describe("問いの種の選択", () => {
		it("ランダムに問いの種を選択できる", () => {
			const library = new InquiryLibrary();

			const seed = library.getRandomSeed();
			expect(seed).toBeDefined();
			expect(seed.pattern).toBeDefined();
		});

		it("特定カテゴリからランダムに問いの種を選択できる", () => {
			const library = new InquiryLibrary();

			const seed = library.getRandomSeed("aporic");
			expect(seed).toBeDefined();
			expect(seed.expectedDepth).toBe("aporic");
		});
	});

	describe("推奨", () => {
		it("コンテキストに基づいて推奨される問いの種を取得できる", () => {
			const library = new InquiryLibrary();

			const recommended = library.getRecommendedSeeds(
				"なぜ効率性が重要視されているのか？",
				5
			);

			expect(recommended.length).toBeLessThanOrEqual(5);
			expect(recommended.length).toBeGreaterThan(0);
		});

		it("「完了」に関連するコンテキストでは適切な問いが推奨される", () => {
			const library = new InquiryLibrary();

			const recommended = library.getRecommendedSeeds(
				"このタスクを完了と言うことで何を見逃しているか？",
				5
			);

			// 「完了」に関連する問いが推奨されるはず
			expect(recommended.length).toBeGreaterThan(0);
		});
	});

	describe("問いの種の内容", () => {
		it("問題化の問いが含まれている", () => {
			const library = new InquiryLibrary();

			const seeds = library.getSeedsByCategory("problematization");
			expect(seeds.length).toBeGreaterThan(0);

			// 「なぜこれは「問題」と見なされているのか？」のパターンがあることを確認
			const hasProblemQuestion = seeds.some((s) =>
				s.pattern.includes("問題")
			);
			expect(hasProblemQuestion).toBe(true);
		});

		it("脱構築の問いが含まれている", () => {
			const library = new InquiryLibrary();

			const seeds = library.getSeedsByCategory("deconstruction");
			expect(seeds.length).toBeGreaterThan(0);

			// 「この概念は何を排除しているか？」のパターンがあることを確認
			const hasExclusionQuestion = seeds.some((s) =>
				s.pattern.includes("排除")
			);
			expect(hasExclusionQuestion).toBe(true);
		});

		it("アポリアの問いが含まれている", () => {
			const library = new InquiryLibrary();

			const seeds = library.getSeedsByCategory("aporic");
			expect(seeds.length).toBeGreaterThan(0);

			// 「解決不能な緊張関係」に関連するパターンがあることを確認
			const hasAporiaQuestion = seeds.some((s) =>
				s.pattern.includes("緊張") || s.pattern.includes("統合")
			);
			expect(hasAporiaQuestion).toBe(true);
		});

		it("メタ問いが含まれている", () => {
			const library = new InquiryLibrary();

			const seeds = library.getSeedsByCategory("meta_inquiry");
			expect(seeds.length).toBeGreaterThan(0);

			// 「なぜ私はこの問いを立てたのか？」のパターンがあることを確認
			const hasMetaQuestion = seeds.some((s) =>
				s.pattern.includes("問い") || s.pattern.includes("思考")
			);
			expect(hasMetaQuestion).toBe(true);
		});

		it("倫理的問いが含まれている", () => {
			const library = new InquiryLibrary();

			const seeds = library.getSeedsByCategory("ethical");
			expect(seeds.length).toBeGreaterThan(0);

			// 「どのような世界を創っているか」のパターンがあることを確認
			const hasEthicalQuestion = seeds.some((s) =>
				s.pattern.includes("世界") || s.pattern.includes("他者")
			);
			expect(hasEthicalQuestion).toBe(true);
		});
	});

	describe("シングルトン", () => {
		it("シングルトンインスタンスを取得できる", () => {
			const library1 = getInquiryLibrary();
			const library2 = getInquiryLibrary();

			expect(library1).toBe(library2);
		});
	});
});
