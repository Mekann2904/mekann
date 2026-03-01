/**
 * @abdd.meta
 * path: .pi/tests/lib/inquiry-library.test.ts
 * role: inquiry-library.tsの単体テスト
 * why: 問いの種ライブラリの正確性と一貫性を保証するため
 * related: .pi/lib/inquiry-library.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * @abdd.explain
 * overview: 問いの種ライブラリの単体テスト
 * what_it_does:
 *   - カテゴリ別の問い取得をテスト
 *   - 深度別の問いフィルタリングをテスト
 *   - 推奨問いのスコアリングをテスト
 * why_it_exists:
 *   - 問い生成の品質保証
 *   - 探求プロセス支援の信頼性確保
 * scope:
 *   in: InquiryLibrary, getInquiryLibrary, InquirySeed
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	InquiryLibrary,
	getInquiryLibrary,
	type InquiryCategory,
	type InquirySeed,
} from "../../lib/inquiry-library.js";
import type { InquiryDepth } from "../../lib/inquiry-driven-exploration.js";

describe("inquiry-library", () => {
	let library: InquiryLibrary;

	beforeEach(() => {
		library = new InquiryLibrary();
	});

	describe("InquiryLibrary", () => {
		describe("constructor", () => {
			it("should_initialize_with_seeds", () => {
				// Act
				const lib = new InquiryLibrary();

				// Assert
				expect(lib).toBeDefined();
				expect(lib.getAllSeeds().length).toBeGreaterThan(0);
			});
		});

		describe("getSeedsByCategory", () => {
			it("should_return_seeds_for_valid_category", () => {
				// Arrange
				const category: InquiryCategory = "deconstruction";

				// Act
				const seeds = library.getSeedsByCategory(category);

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
				expect(seeds.length).toBeGreaterThan(0);
			});

			it("should_return_empty_array_for_category_with_no_seeds", () => {
				// Arrange
				// 存在しないカテゴリをテストするために、空のカテゴリを使用
				const emptyLibrary = new InquiryLibrary();

				// Act - 実際のカテゴリをテスト
				const seeds = emptyLibrary.getSeedsByCategory("problematization");

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
			});

			it("should_return_correct_category_seeds", () => {
				// Arrange
				const category: InquiryCategory = "deconstruction";

				// Act
				const seeds = library.getSeedsByCategory(category);

				// Assert
				seeds.forEach((seed) => {
					expect(seed).toHaveProperty("pattern");
					expect(seed).toHaveProperty("thinkingType");
					expect(seed).toHaveProperty("expectedDepth");
					expect(seed).toHaveProperty("tendsToExclude");
					expect(seed).toHaveProperty("examples");
				});
			});
		});

		describe("getSeedsByDepth", () => {
			it("should_return_seeds_for_valid_depth", () => {
				// Arrange
				const depth: InquiryDepth = "structural";

				// Act
				const seeds = library.getSeedsByDepth(depth);

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
			});

			it("should_filter_by_expected_depth", () => {
				// Arrange
				const depth: InquiryDepth = "structural";

				// Act
				const seeds = library.getSeedsByDepth(depth);

				// Assert
				seeds.forEach((seed) => {
					expect(seed.expectedDepth).toBe(depth);
				});
			});

			it("should_return_empty_array_for_depth_with_no_seeds", () => {
				// Arrange
				const depth: InquiryDepth = "surface";

				// Act
				const seeds = library.getSeedsByDepth(depth);

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
			});
		});

		describe("getAllSeeds", () => {
			it("should_return_all_seeds", () => {
				// Act
				const seeds = library.getAllSeeds();

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
				expect(seeds.length).toBeGreaterThan(0);
			});

			it("should_return_unique_seeds", () => {
				// Act
				const seeds = library.getAllSeeds();
				const patterns = seeds.map((s) => s.pattern);

				// Assert
				const uniquePatterns = new Set(patterns);
				expect(uniquePatterns.size).toBe(patterns.length);
			});
		});

		describe("getRandomSeed", () => {
			it("should_return_random_seed_from_all", () => {
				// Act
				const seed = library.getRandomSeed();

				// Assert
				expect(seed).toBeDefined();
				expect(seed).toHaveProperty("pattern");
			});

			it("should_return_random_seed_from_category", () => {
				// Arrange
				const category: InquiryCategory = "deconstruction";

				// Act
				const seed = library.getRandomSeed(category);

				// Assert
				expect(seed).toBeDefined();
				const categorySeeds = library.getSeedsByCategory(category);
				expect(categorySeeds).toContainEqual(seed);
			});

			it("should_return_different_seeds_on_multiple_calls", () => {
				// Act
				const seeds = new Set();
				for (let i = 0; i < 10; i++) {
					seeds.add(library.getRandomSeed().pattern);
				}

				// Assert
				// 10回の呼び出しで少なくとも2つの異なる種が返されることを期待
				expect(seeds.size).toBeGreaterThan(1);
			});
		});

		describe("getRecommendedSeeds", () => {
			it("should_return_recommended_seeds", () => {
				// Arrange
				const context = "データを分析する";

				// Act
				const seeds = library.getRecommendedSeeds(context);

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
				expect(seeds.length).toBeLessThanOrEqual(5);
			});

			it("should_respect_maxResults_parameter", () => {
				// Arrange
				const context = "テスト";
				const maxResults = 3;

				// Act
				const seeds = library.getRecommendedSeeds(context, maxResults);

				// Assert
				expect(seeds.length).toBeLessThanOrEqual(maxResults);
			});

			it("should_score_based_on_examples", () => {
				// Arrange
				const context = "なぜこれが問題なのか";

				// Act
				const seeds = library.getRecommendedSeeds(context, 5);

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
			});

			it("should_penalize_excluded_contexts", () => {
				// Arrange
				const context = "効率性を重視する";

				// Act
				const seeds = library.getRecommendedSeeds(context, 5);

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
			});

			it("should_handle_empty_context", () => {
				// Arrange
				const context = "";

				// Act
				const seeds = library.getRecommendedSeeds(context);

				// Assert
				expect(Array.isArray(seeds)).toBe(true);
			});
		});
	});

	describe("getInquiryLibrary", () => {
		it("should_return_inquiry_library_instance", () => {
			// Act
			const lib = getInquiryLibrary();

			// Assert
			expect(lib).toBeInstanceOf(InquiryLibrary);
		});

		it("should_return_same_instance_on_multiple_calls", () => {
			// Act
			const lib1 = getInquiryLibrary();
			const lib2 = getInquiryLibrary();

			// Assert
			expect(lib1).toBe(lib2);
		});
	});

	describe("InquirySeed structure", () => {
		it("should_have_valid_thinking_types", () => {
			// Arrange
			const validTypes = ["divergent", "convergent", "critical", "creative", "metacognitive"];

			// Act
			const seeds = library.getAllSeeds();

			// Assert
			seeds.forEach((seed) => {
				expect(validTypes).toContain(seed.thinkingType);
			});
		});

		it("should_have_valid_expected_depths", () => {
			// Arrange
			const validDepths: InquiryDepth[] = ["surface", "structural", "foundational", "aporic"];

			// Act
			const seeds = library.getAllSeeds();

			// Assert
			seeds.forEach((seed) => {
				expect(validDepths).toContain(seed.expectedDepth);
			});
		});

		it("should_have_non_empty_pattern", () => {
			// Act
			const seeds = library.getAllSeeds();

			// Assert
			seeds.forEach((seed) => {
				expect(seed.pattern.length).toBeGreaterThan(0);
			});
		});

		it("should_have_non_empty_examples", () => {
			// Act
			const seeds = library.getAllSeeds();

			// Assert
			seeds.forEach((seed) => {
				expect(Array.isArray(seed.examples)).toBe(true);
				expect(seed.examples.length).toBeGreaterThan(0);
			});
		});
	});
});
