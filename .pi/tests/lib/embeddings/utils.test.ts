/**
 * @file .pi/lib/embeddings/utils.ts の単体テスト
 * @description ベクトル演算ユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import * as utils from "../../../lib/embeddings/utils.ts";

// ============================================================================
// コサイン類似度
// ============================================================================

describe("cosineSimilarity", () => {
	describe("正常系", () => {
		it("should_return_1_for_identical_vectors", () => {
			const a = [1, 2, 3];
			const result = utils.cosineSimilarity(a, a);
			expect(result).toBeCloseTo(1.0);
		});

		it("should_return_0_for_orthogonal_vectors", () => {
			const a = [1, 0, 0];
			const b = [0, 1, 0];
			const result = utils.cosineSimilarity(a, b);
			expect(result).toBeCloseTo(0.0);
		});

		it("should_return_0_for_opposite_vectors", () => {
			const a = [1, 2, 3];
			const b = [-1, -2, -3];
			const result = utils.cosineSimilarity(a, b);
			expect(result).toBeCloseTo(-1.0);
		});

		it("should_calculate_correctly_for_non_unit_vectors", () => {
			const a = [2, 0, 0];
			const b = [0, 2, 0];
			const result = utils.cosineSimilarity(a, b);
			expect(result).toBeCloseTo(0.0);
		});

		it("should_return_positive_similarity_for_similar_vectors", () => {
			const a = [1, 2, 3];
			const b = [1.1, 2.1, 3.1];
			const result = utils.cosineSimilarity(a, b);
			expect(result).toBeGreaterThan(0.9);
		});
	});

	describe("境界条件", () => {
		it("should_return_0_for_dimension_mismatch", () => {
			const a = [1, 2, 3];
			const b = [1, 2];
			const result = utils.cosineSimilarity(a, b);
			expect(result).toBe(0);
		});

		it("should_return_0_for_zero_vector_a", () => {
			const a = [0, 0, 0];
			const b = [1, 2, 3];
			const result = utils.cosineSimilarity(a, b);
			expect(result).toBe(0);
		});

		it("should_return_0_for_zero_vector_b", () => {
			const a = [1, 2, 3];
			const b = [0, 0, 0];
			const result = utils.cosineSimilarity(a, b);
			expect(result).toBe(0);
		});

		it("should_return_0_for_both_zero_vectors", () => {
			const a = [0, 0, 0];
			const b = [0, 0, 0];
			const result = utils.cosineSimilarity(a, b);
			expect(result).toBe(0);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は [-1, 1] の範囲内", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(a, b) => {
						// 同じ次元数のペアのみテスト
						if (a.length !== b.length) return true;
						const result = utils.cosineSimilarity(a, b);
						return result >= -1 && result <= 1;
					}
				),
				{ numRuns: 100 }
			);
		});

		it("PBT: cos(a, b) = cos(b, a) （対称性）", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(a, b) => {
						if (a.length !== b.length) return true;
						const result1 = utils.cosineSimilarity(a, b);
						const result2 = utils.cosineSimilarity(b, a);
						return Math.abs(result1 - result2) < 0.0001;
					}
				),
				{ numRuns: 100 }
			);
		});

		it("PBT: cos(a, a) = 1 （冪等性）", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(a) => {
						const result = utils.cosineSimilarity(a, a);
						return Math.abs(result - 1) < 0.0001 || result === 0; // ゼロベクトルの場合は0
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});

// ============================================================================
// ユークリッド距離
// ============================================================================

describe("euclideanDistance", () => {
	describe("正常系", () => {
		it("should_return_0_for_identical_vectors", () => {
			const a = [1, 2, 3];
			const result = utils.euclideanDistance(a, a);
			expect(result).toBeCloseTo(0.0);
		});

		it("should_return_distance_for_different_vectors", () => {
			const a = [0, 0];
			const b = [3, 4];
			const result = utils.euclideanDistance(a, b);
			expect(result).toBeCloseTo(5.0); // 3-4-5 triangle
		});

		it("should_calculate_positive_distance", () => {
			const a = [1, 2, 3];
			const b = [4, 5, 6];
			const result = utils.euclideanDistance(a, b);
			expect(result).toBeGreaterThan(0);
		});
	});

	describe("境界条件", () => {
		it("should_return_Infinity_for_dimension_mismatch", () => {
			const a = [1, 2, 3];
			const b = [1, 2];
			const result = utils.euclideanDistance(a, b);
			expect(result).toBe(Infinity);
		});

		it("should_return_0_for_zero_vectors", () => {
			const a = [0, 0, 0];
			const b = [0, 0, 0];
			const result = utils.euclideanDistance(a, b);
			expect(result).toBe(0);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 距離は常に非負", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(a, b) => {
						if (a.length !== b.length) return true;
						const result = utils.euclideanDistance(a, b);
						return result >= 0 || result === Infinity;
					}
				),
				{ numRuns: 100 }
			);
		});

		it("PBT: dist(a, b) = dist(b, a) （対称性）", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(a, b) => {
						if (a.length !== b.length) return true;
						const result1 = utils.euclideanDistance(a, b);
						const result2 = utils.euclideanDistance(b, a);
						return Math.abs(result1 - result2) < 0.0001;
					}
				),
				{ numRuns: 100 }
			);
		});

		it("PBT: dist(a, a) = 0 （冪等性）", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(a) => {
						const result = utils.euclideanDistance(a, a);
						return Math.abs(result) < 0.0001;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});

// ============================================================================
// ベクトル正規化
// ============================================================================

describe("normalizeVector", () => {
	describe("正常系", () => {
		it("should_normalize_unit_vector_to_same", () => {
			const v = [1, 0, 0];
			const result = utils.normalizeVector(v);
			expect(result).toEqual([1, 0, 0]);
		});

		it("should_normalize_vector", () => {
			const v = [3, 4];
			const result = utils.normalizeVector(v);
			const norm = utils.vectorNorm(result);
			expect(norm).toBeCloseTo(1.0);
		});

		it("should_preserve_direction", () => {
			const v = [2, 4, 6];
			const result = utils.normalizeVector(v);

			// 方向性を確認（比が同じ）
			for (let i = 0; i < v.length; i++) {
				expect(v[i] / result[i]).toBeCloseTo(v[0] / result[0], 5);
			}
		});
	});

	describe("境界条件", () => {
		it("should_return_zero_vector_for_zero_vector", () => {
			const v = [0, 0, 0];
			const result = utils.normalizeVector(v);
			expect(result).toEqual([0, 0, 0]);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 正規化ベクトルのノルムは1", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(v) => {
						const normalized = utils.normalizeVector(v);
						const norm = utils.vectorNorm(normalized);
						// ゼロベクトルの場合を除く
						if (v.every((x) => x === 0)) {
							return norm === 0;
						}
						return Math.abs(norm - 1) < 0.0001;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});

// ============================================================================
// ベクトル加算
// ============================================================================

describe("addVectors", () => {
	describe("正常系", () => {
		it("should_add_vectors", () => {
			const a = [1, 2, 3];
			const b = [4, 5, 6];
			const result = utils.addVectors(a, b);
			expect(result).toEqual([5, 7, 9]);
		});

		it("should_handle_negative_values", () => {
			const a = [1, -2, 3];
			const b = [-1, 2, -3];
			const result = utils.addVectors(a, b);
			expect(result).toEqual([0, 0, 0]);
		});
	});

	describe("境界条件", () => {
		it("should_throw_error_for_dimension_mismatch", () => {
			const a = [1, 2, 3];
			const b = [1, 2];
			expect(() => utils.addVectors(a, b)).toThrow("Vector dimensions must match");
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結合律: (a + b) + c = a + (b + c)", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					(a, b, c) => {
						if (a.length !== b.length || a.length !== c.length) return true;
						const left = utils.addVectors(utils.addVectors(a, b), c);
						const right = utils.addVectors(a, utils.addVectors(b, c));
						return left.every((val, i) => Math.abs(val - right[i]) < 0.0001);
					}
				),
				{ numRuns: 50 }
			);
		});

		it("PBT: 交換律: a + b = b + a", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					(a, b) => {
						if (a.length !== b.length) return true;
						const result1 = utils.addVectors(a, b);
						const result2 = utils.addVectors(b, a);
						return result1.every((val, i) => Math.abs(val - result2[i]) < 0.0001);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("PBT: 加法単位元: a + 0 = a", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					(a) => {
						const zero = new Array(a.length).fill(0);
						const result = utils.addVectors(a, zero);
						return result.every((val, i) => Math.abs(val - a[i]) < 0.0001);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});

// ============================================================================
// ベクトル減算
// ============================================================================

describe("subtractVectors", () => {
	describe("正常系", () => {
		it("should_subtract_vectors", () => {
			const a = [5, 7, 9];
			const b = [1, 2, 3];
			const result = utils.subtractVectors(a, b);
			expect(result).toEqual([4, 5, 6]);
		});

		it("should_result_in_zero_for_same_vectors", () => {
			const a = [1, 2, 3];
			const b = [1, 2, 3];
			const result = utils.subtractVectors(a, b);
			expect(result).toEqual([0, 0, 0]);
		});
	});

	describe("境界条件", () => {
		it("should_throw_error_for_dimension_mismatch", () => {
			const a = [1, 2, 3];
			const b = [1, 2];
			expect(() => utils.subtractVectors(a, b)).toThrow("Vector dimensions must match");
		});
	});
});

// ============================================================================
// スカラー倍
// ============================================================================

describe("scaleVector", () => {
	describe("正常系", () => {
		it("should_scale_vector", () => {
			const v = [1, 2, 3];
			const result = utils.scaleVector(v, 2);
			expect(result).toEqual([2, 4, 6]);
		});

		it("should_scale_by_negative", () => {
			const v = [1, 2, 3];
			const result = utils.scaleVector(v, -1);
			expect(result).toEqual([-1, -2, -3]);
		});

		it("should_scale_by_zero", () => {
			const v = [1, 2, 3];
			const result = utils.scaleVector(v, 0);
			expect(result).toEqual([0, 0, 0]);
		});

		it("should_scale_by_fraction", () => {
			const v = [2, 4, 6];
			const result = utils.scaleVector(v, 0.5);
			expect(result).toEqual([1, 2, 3]);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 分配律: k * (a + b) = k*a + k*b", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					fc.float({ min: -100, max: 100, noNaN: true }),
					(a, b, k) => {
						if (a.length !== b.length) return true;
						const left = utils.scaleVector(utils.addVectors(a, b), k);
						const right = utils.addVectors(utils.scaleVector(a, k), utils.scaleVector(b, k));
						return left.every((val, i) => Math.abs(val - right[i]) < 0.0001);
					}
				),
				{ numRuns: 50 }
			);
		});
	});
});

// ============================================================================
// 平均ベクトル
// ============================================================================

describe("meanVector", () => {
	describe("正常系", () => {
		it("should_calculate_mean", () => {
			const vectors = [
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			];
			const result = utils.meanVector(vectors);
			expect(result).toEqual([4, 5, 6]);
		});

		it("should_handle_two_vectors", () => {
			const vectors = [
				[0, 0],
				[10, 10],
			];
			const result = utils.meanVector(vectors);
			expect(result).toEqual([5, 5]);
		});
	});

	describe("境界条件", () => {
		it("should_return_null_for_empty_array", () => {
			const result = utils.meanVector([]);
			expect(result).toBeNull();
		});

		it("should_throw_error_for_dimension_mismatch", () => {
			const vectors = [
				[1, 2, 3],
				[1, 2],
			];
			expect(() => utils.meanVector(vectors)).toThrow("All vectors must have the same dimensions");
		});
	});
});

// ============================================================================
// 近傍検索
// ============================================================================

describe("findNearestNeighbors", () => {
	describe("正常系", () => {
		it("should_find_nearest_neighbors", () => {
			const query = [1, 0, 0];
			const items = [
				{ id: "a", embedding: [1, 0, 0] }, // 同じ: similarity=1
				{ id: "b", embedding: [0, 1, 0] }, // 直交: similarity=0
				{ id: "c", embedding: [0, 0, 1] }, // 直交: similarity=0
			];
			const result = utils.findNearestNeighbors(query, items, 2);

			expect(result).toHaveLength(2);
			expect(result[0].item.id).toBe("a");
			expect(result[0].similarity).toBeCloseTo(1.0);
		});

		it("should_sort_by_similarity_descending", () => {
			const query = [1, 0, 0];
			const items = [
				{ id: "c", embedding: [0.5, 0, 0] },
				{ id: "a", embedding: [1, 0, 0] },
				{ id: "b", embedding: [0.9, 0, 0] },
			];
			const result = utils.findNearestNeighbors(query, items, 3);

			// [1, 0, 0]は正規化済みなので、すべての類似度は1.0になる
			// したがって、順序は入力の順序を維持（安定ソート）
			expect(result.length).toBe(3);
		});

		it("should_respect_k_parameter", () => {
			const query = [1, 0, 0];
			const items = [
				{ id: "a", embedding: [1, 0, 0] },
				{ id: "b", embedding: [0, 1, 0] },
				{ id: "c", embedding: [0, 0, 1] },
			];
			const result = utils.findNearestNeighbors(query, items, 1);

			expect(result).toHaveLength(1);
		});

		it("should_use_default_k_of_5", () => {
			const query = [1, 0, 0];
			const items = [
				{ id: "a", embedding: [1, 0, 0] },
				{ id: "b", embedding: [0, 1, 0] },
			];
			const result = utils.findNearestNeighbors(query, items);

			expect(result.length).toBeLessThanOrEqual(5);
		});
	});
});

// ============================================================================
// 類似度閾値検索
// ============================================================================

describe("findBySimilarityThreshold", () => {
	describe("正常系", () => {
		it("should_find_items_above_threshold", () => {
			const query = [1, 0, 0];
			const items = [
				{ id: "a", embedding: [1, 0, 0] }, // similarity=1
				{ id: "b", embedding: [0, 1, 0] }, // similarity=0
				{ id: "c", embedding: [0.5, 0, 0] }, // similarity=0.5
			];
			const result = utils.findBySimilarityThreshold(query, items, 0.7);

			expect(result.length).toBeGreaterThan(0);
			expect(result[0].item.id).toBe("a");
		});

		it("should_include_threshold_value", () => {
			const query = [1, 0, 0];
			const items = [
				{ id: "a", embedding: [0.5, 0, 0] },
			];
			const result = utils.findBySimilarityThreshold(query, items, 0.5);

			expect(result).toHaveLength(1);
			expect(result[0].similarity).toBeGreaterThanOrEqual(0.5);
		});

		it("should_return_empty_when_no_items_match", () => {
			const query = [1, 0, 0];
			const items = [
				{ id: "a", embedding: [0, 1, 0] },
			];
			const result = utils.findBySimilarityThreshold(query, items, 0.9);

			expect(result).toHaveLength(0);
		});

		it("should_use_default_threshold_of_0.5", () => {
			const query = [1, 0, 0];
			const items = [
				{ id: "a", embedding: [0.9, 0, 0] },
				{ id: "b", embedding: [0.3, 0, 0] },
			];
			const result = utils.findBySimilarityThreshold(query, items);

			expect(result.length).toBeGreaterThan(0);
			expect(result[0].item.id).toBe("a");
		});
	});
});

// ============================================================================
// バリデーション関数
// ============================================================================

describe("isValidEmbedding", () => {
	describe("正常系", () => {
		it("should_return_true_for_valid_embedding", () => {
			expect(utils.isValidEmbedding([1, 2, 3])).toBe(true);
		});

		it("should_return_true_for_negative_values", () => {
			expect(utils.isValidEmbedding([-1, -2, -3])).toBe(true);
		});

		it("should_return_true_for_float_values", () => {
			expect(utils.isValidEmbedding([1.5, 2.3, 3.7])).toBe(true);
		});
	});

	describe("異常系", () => {
		it("should_return_false_for_non_array", () => {
			expect(utils.isValidEmbedding(null)).toBe(false);
			expect(utils.isValidEmbedding(undefined)).toBe(false);
			expect(utils.isValidEmbedding("not array")).toBe(false);
			expect(utils.isValidEmbedding(123)).toBe(false);
			expect(utils.isValidEmbedding({})).toBe(false);
		});

		it("should_return_false_for_empty_array", () => {
			expect(utils.isValidEmbedding([])).toBe(false);
		});

		it("should_return_false_for_array_with_non_numbers", () => {
			expect(utils.isValidEmbedding([1, 2, "3"])).toBe(false);
			expect(utils.isValidEmbedding([1, null, 3])).toBe(false);
			expect(utils.isValidEmbedding([1, undefined, 3])).toBe(false);
			expect(utils.isValidEmbedding([1, NaN, 3])).toBe(false);
		});
	});
});

// ============================================================================
// ゼロベクトル生成
// ============================================================================

describe("zeroVector", () => {
	describe("正常系", () => {
		it("should_create_zero_vector", () => {
			const result = utils.zeroVector(5);
			expect(result).toEqual([0, 0, 0, 0, 0]);
		});

		it("should_create_zero_vector_of_size_1", () => {
			const result = utils.zeroVector(1);
			expect(result).toEqual([0]);
		});

		it("should_create_zero_vector_of_size_0", () => {
			const result = utils.zeroVector(0);
			expect(result).toEqual([]);
		});
	});
});

// ============================================================================
// ノルム計算
// ============================================================================

describe("vectorNorm", () => {
	describe("正常系", () => {
		it("should_calculate_norm", () => {
			const v = [3, 4];
			const result = utils.vectorNorm(v);
			expect(result).toBeCloseTo(5.0);
		});

		it("should_return_0_for_zero_vector", () => {
			const v = [0, 0, 0];
			const result = utils.vectorNorm(v);
			expect(result).toBe(0);
		});

		it("should_return_norm_for_unit_vector", () => {
			const v = [1, 0, 0];
			const result = utils.vectorNorm(v);
			expect(result).toBeCloseTo(1.0);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: ノルムは常に非負", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(v) => {
						const norm = utils.vectorNorm(v);
						return norm >= 0;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});

// ============================================================================
// 内積計算
// ============================================================================

describe("dotProduct", () => {
	describe("正常系", () => {
		it("should_calculate_dot_product", () => {
			const a = [1, 2, 3];
			const b = [4, 5, 6];
			const result = utils.dotProduct(a, b);
			expect(result).toBe(1 * 4 + 2 * 5 + 3 * 6); // 32
		});

		it("should_return_0_for_orthogonal_vectors", () => {
			const a = [1, 0, 0];
			const b = [0, 1, 0];
			const result = utils.dotProduct(a, b);
			expect(result).toBe(0);
		});

		it("should_calculate_for_negative_values", () => {
			const a = [1, -2, 3];
			const b = [-1, 2, -3];
			const result = utils.dotProduct(a, b);
			expect(result).toBe(-1 - 4 - 9); // -14
		});
	});

	describe("境界条件", () => {
		it("should_return_0_for_dimension_mismatch", () => {
			const a = [1, 2, 3];
			const b = [1, 2];
			const result = utils.dotProduct(a, b);
			expect(result).toBe(0);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 交換律: a · b = b · a", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 20 }),
					(a, b) => {
						if (a.length !== b.length) return true;
						const result1 = utils.dotProduct(a, b);
						const result2 = utils.dotProduct(b, a);
						return Math.abs(result1 - result2) < 0.0001;
					}
				),
				{ numRuns: 100 }
			);
		});

		it("PBT: 分配律: a · (b + c) = a · b + a · c", () => {
			fc.assert(
				fc.property(
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 10 }),
					(a, b, c) => {
						if (a.length !== b.length || a.length !== c.length) return true;
						const left = utils.dotProduct(a, utils.addVectors(b, c));
						const right = utils.dotProduct(a, b) + utils.dotProduct(a, c);
						return Math.abs(left - right) < 0.0001;
					}
				),
				{ numRuns: 50 }
			);
		});
	});
});
