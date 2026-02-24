/**
 * @abdd.meta
 * path: tests/unit/lib/embeddings/utils.property.test.ts
 * role: ベクトル演算ユーティリティのプロパティベーステスト
 * why: 数学的性質（可換性、冪等性、範囲制約）が常に成り立つことを保証するため
 * related: .pi/lib/embeddings/utils.ts
 * public_api: cosineSimilarity, euclideanDistance, normalizeVector, dotProduct
 * invariants: コサイン類似度は[-1,1]、ユークリッド距離は[0,∞)、正規化ベクトルのノルムは1
 * side_effects: なし（純粋関数）
 * failure_modes: 次元不一致、NaN/Infinity入力、ゼロベクトル
 * @abdd.explain
 * overview: ベクトル演算の数学的性質をfast-checkで網羅的にテストする
 * what_it_does:
 *   - コサイン類似度の可換性、範囲制約、自己類似度をテスト
 *   - ユークリッド距離の非負性、可換性、三角不等式をテスト
 *   - 正規化ベクトルの単位ベクトル性、冪等性をテスト
 * why_it_exists:
 *   - 数学的性質が常に成り立つことを保証し、エッジケースを見逃さないため
 * scope:
 *   in: 数値配列（ベクトル）
 *   out: テストの実行結果
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	cosineSimilarity,
	euclideanDistance,
	normalizeVector,
	addVectors,
	subtractVectors,
	scaleVector,
	meanVector,
	findNearestNeighbors,
	findBySimilarityThreshold,
	isValidEmbedding,
	zeroVector,
	vectorNorm,
	dotProduct,
} from '@lib/embeddings/utils';

// 有効なベクトルのArbitrary（NaNを含まない、空でない）
const validVector = fc.array(
	fc.float({ min: -1000, max: 1000, noNaN: true }),
	{ minLength: 1, maxLength: 100 }
);

// 同じ長さの2つのベクトルのペア
const vectorPair = fc.tuple(validVector, validVector).filter(([a, b]) => a.length === b.length);

describe('cosineSimilarity', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: 同一ベクトルとの類似度は1', () => {
			fc.assert(
				fc.property(validVector, (vec) => {
					const similarity = cosineSimilarity(vec, vec);
					return Math.abs(similarity - 1) < 0.0001;
				})
			);
		});

		it('PBT: 可換性 a.similarity(b) === b.similarity(a)', () => {
			fc.assert(
				fc.property(vectorPair, ([a, b]) => {
					const simAB = cosineSimilarity(a, b);
					const simBA = cosineSimilarity(b, a);
					return Math.abs(simAB - simBA) < 0.0001;
				})
			);
		});

		it('PBT: 戻り値は[-1, 1]の範囲', () => {
			fc.assert(
				fc.property(vectorPair, ([a, b]) => {
					const similarity = cosineSimilarity(a, b);
					return similarity >= -1 && similarity <= 1;
				})
			);
		});

		it('PBT: 直交ベクトルの類似度は0に近い', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 2, max: 10 }),
					(dimensions) => {
						// 直交ベクトルを作成
						const a = new Array(dimensions).fill(0);
						const b = new Array(dimensions).fill(0);
						a[0] = 1;
						b[1] = 1;

						const similarity = cosineSimilarity(a, b);
						return Math.abs(similarity) < 0.0001;
					}
				)
			);
		});

		it('PBT: 反対方向のベクトルの類似度は-1', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 2, max: 10 }),
					fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }),
					(dimensions, scale) => {
						const a = new Array(dimensions).fill(scale);
						const b = new Array(dimensions).fill(-scale);

						const similarity = cosineSimilarity(a, b);
						return Math.abs(similarity - (-1)) < 0.0001;
					}
				)
			);
		});
	});

	describe('境界値テスト', () => {
		it('境界値: 次元数が異なる場合は0を返す', () => {
			const a = [1, 2, 3];
			const b = [1, 2];

			expect(cosineSimilarity(a, b)).toBe(0);
		});

		it('境界値: ゼロベクトル同士の場合は0を返す', () => {
			const a = [0, 0, 0];
			const b = [0, 0, 0];

			expect(cosineSimilarity(a, b)).toBe(0);
		});

		it('境界値: 片方がゼロベクトルの場合は0を返す', () => {
			const a = [1, 2, 3];
			const b = [0, 0, 0];

			expect(cosineSimilarity(a, b)).toBe(0);
		});

		it('境界値: 1次元ベクトルで正しく計算', () => {
			expect(cosineSimilarity([1], [1])).toBe(1);
			expect(cosineSimilarity([1], [-1])).toBe(-1);
		});
	});
});

describe('euclideanDistance', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: 非負性', () => {
			fc.assert(
				fc.property(vectorPair, ([a, b]) => {
					const distance = euclideanDistance(a, b);
					return distance >= 0;
				})
			);
		});

		it('PBT: 同一ベクトルとの距離は0', () => {
			fc.assert(
				fc.property(validVector, (vec) => {
					const distance = euclideanDistance(vec, vec);
					return Math.abs(distance) < 0.0001;
				})
			);
		});

		it('PBT: 可換性', () => {
			fc.assert(
				fc.property(vectorPair, ([a, b]) => {
					const distAB = euclideanDistance(a, b);
					const distBA = euclideanDistance(b, a);
					return Math.abs(distAB - distBA) < 0.0001;
				})
			);
		});

		it('PBT: 三角不等式', () => {
			fc.assert(
				fc.property(
					validVector.chain((a) =>
						fc.tuple(
							fc.constant(a),
							fc.array(fc.float({ min: -1000, max: 1000, noNaN: true }), {
								minLength: a.length,
								maxLength: a.length,
							}),
							fc.array(fc.float({ min: -1000, max: 1000, noNaN: true }), {
								minLength: a.length,
								maxLength: a.length,
							})
						)
					),
					([a, b, c]) => {
						const distAB = euclideanDistance(a, b);
						const distBC = euclideanDistance(b, c);
						const distAC = euclideanDistance(a, c);
						// |AC| <= |AB| + |BC|
						return distAC <= distAB + distBC + 0.0001;
					}
				)
			);
		});
	});

	describe('境界値テスト', () => {
		it('境界値: 次元数が異なる場合はInfinityを返す', () => {
			const a = [1, 2, 3];
			const b = [1, 2];

			expect(euclideanDistance(a, b)).toBe(Infinity);
		});

		it('境界値: ゼロベクトル同士の距離は0', () => {
			const a = [0, 0, 0];
			const b = [0, 0, 0];

			expect(euclideanDistance(a, b)).toBe(0);
		});

		it('境界値: 1次元ベクトルで正しく計算', () => {
			expect(euclideanDistance([0], [5])).toBe(5);
			expect(euclideanDistance([3], [7])).toBe(4);
		});
	});
});

describe('normalizeVector', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: 正規化後のノルムは1', () => {
			fc.assert(
				fc.property(validVector, (vec) => {
					const normalized = normalizeVector(vec);
					const norm = vectorNorm(normalized);
					// ゼロベクトルの場合は例外
					if (vec.every((v) => v === 0)) {
						return norm === 0;
					}
					return Math.abs(norm - 1) < 0.0001;
				})
			);
		});

		it('PBT: 冪等性 normalize(normalize(v)) === normalize(v)', () => {
			fc.assert(
				fc.property(validVector, (vec) => {
					const norm1 = normalizeVector(vec);
					const norm2 = normalizeVector(norm1);

					if (vec.every((v) => v === 0)) {
						return true; // ゼロベクトルは除外
					}

					return norm1.every((v, i) => Math.abs(v - norm2[i]) < 0.0001);
				})
			);
		});

		it('PBT: 元のベクトルと同じ次元数', () => {
			fc.assert(
				fc.property(validVector, (vec) => {
					const normalized = normalizeVector(vec);
					return normalized.length === vec.length;
				})
			);
		});

		it('PBT: 方向は変わらない（正のスカラー倍）', () => {
			fc.assert(
				fc.property(
					validVector.filter((v) => v.some((x) => x !== 0)),
					(vec) => {
						const normalized = normalizeVector(vec);
						const similarity = cosineSimilarity(vec, normalized);
						return Math.abs(similarity - 1) < 0.0001;
					}
				)
			);
		});
	});

	describe('境界値テスト', () => {
		it('境界値: ゼロベクトルはゼロベクトルを返す', () => {
			const result = normalizeVector([0, 0, 0]);
			expect(result).toEqual([0, 0, 0]);
		});

		it('境界値: 単位ベクトルはそのまま', () => {
			const result = normalizeVector([1, 0, 0]);
			expect(result).toEqual([1, 0, 0]);
		});

		it('境界値: 1次元ベクトルで正しく計算', () => {
			const result = normalizeVector([5]);
			expect(result[0]).toBe(1);
		});
	});
});

describe('addVectors', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: 可換性', () => {
			fc.assert(
				fc.property(vectorPair, ([a, b]) => {
					const sumAB = addVectors(a, b);
					const sumBA = addVectors(b, a);
					return sumAB.every((v, i) => Math.abs(v - sumBA[i]) < 0.0001);
				})
			);
		});

		it('PBT: 結合性', () => {
			fc.assert(
				fc.property(
					validVector.chain((a) =>
						fc.tuple(
							fc.constant(a),
							fc.array(fc.float({ min: -100, max: 100, noNaN: true }), {
								minLength: a.length,
								maxLength: a.length,
							}),
							fc.array(fc.float({ min: -100, max: 100, noNaN: true }), {
								minLength: a.length,
								maxLength: a.length,
							})
						)
					),
					([a, b, c]) => {
						const sumAB_C = addVectors(addVectors(a, b), c);
						const sumA_BC = addVectors(a, addVectors(b, c));
						return sumAB_C.every((v, i) => Math.abs(v - sumA_BC[i]) < 0.0001);
					}
				)
			);
		});

		it('PBT: ゼロベクトルとの加算は元のベクトル', () => {
			fc.assert(
				fc.property(validVector, (a) => {
					const zero = zeroVector(a.length);
					const result = addVectors(a, zero);
					return result.every((v, i) => Math.abs(v - a[i]) < 0.0001);
				})
			);
		});
	});

	describe('境界値テスト', () => {
		it('境界値: 次元数が異なる場合はエラー', () => {
			expect(() => addVectors([1, 2], [1, 2, 3])).toThrow();
		});

		it('境界値: 空配列で正しく計算', () => {
			expect(addVectors([], [])).toEqual([]);
		});
	});
});

describe('subtractVectors', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: 自分自身との減算はゼロベクトル', () => {
			fc.assert(
				fc.property(validVector, (a) => {
					const result = subtractVectors(a, a);
					return result.every((v) => Math.abs(v) < 0.0001);
				})
			);
		});

		it('PBT: 減算の逆演算 a - b + b = a', () => {
			fc.assert(
				fc.property(vectorPair, ([a, b]) => {
					const result = addVectors(subtractVectors(a, b), b);
					return result.every((v, i) => Math.abs(v - a[i]) < 0.0001);
				})
			);
		});
	});

	describe('境界値テスト', () => {
		it('境界値: 次元数が異なる場合はエラー', () => {
			expect(() => subtractVectors([1, 2], [1, 2, 3])).toThrow();
		});
	});
});

describe('scaleVector', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: スカラー1で変化しない', () => {
			fc.assert(
				fc.property(validVector, (vec) => {
					const result = scaleVector(vec, 1);
					return result.every((v, i) => v === vec[i]);
				})
			);
		});

		it('PBT: スカラー0でゼロベクトル', () => {
			fc.assert(
				fc.property(validVector, (vec) => {
					const result = scaleVector(vec, 0);
					return result.every((v) => v === 0);
				})
			);
		});

		it('PBT: 結合性 scale(scale(v, a), b) = scale(v, a*b)', () => {
			fc.assert(
				fc.property(
					validVector,
					fc.float({ min: -10, max: 10, noNaN: true }),
					fc.float({ min: -10, max: 10, noNaN: true }),
					(vec, a, b) => {
						const result1 = scaleVector(scaleVector(vec, a), b);
						const result2 = scaleVector(vec, a * b);
						return result1.every((v, i) => Math.abs(v - result2[i]) < 0.0001);
					}
				)
			);
		});

		it('PBT: 分配性 scale(a+b, s) = scale(a, s) + scale(b, s)', () => {
			fc.assert(
				fc.property(
					vectorPair,
					fc.float({ min: -10, max: 10, noNaN: true }),
					([a, b], s) => {
						const result1 = scaleVector(addVectors(a, b), s);
						const result2 = addVectors(scaleVector(a, s), scaleVector(b, s));
						return result1.every((v, i) => Math.abs(v - result2[i]) < 0.0001);
					}
				)
			);
		});
	});
});

describe('meanVector', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: 同じベクトルの平均は元のベクトル', () => {
			fc.assert(
				fc.property(validVector, fc.integer({ min: 1, max: 10 }), (vec, count) => {
					const vectors = Array(count).fill(vec);
					const mean = meanVector(vectors);
					if (mean === null) return false;
					return mean.every((v, i) => Math.abs(v - vec[i]) < 0.0001);
				})
			);
		});

		it('PBT: 平均のノルムは最大ノルム以下', () => {
			fc.assert(
				fc.property(
					fc.array(validVector, { minLength: 2, maxLength: 10 }).filter((arr) =>
						arr.every((v) => v.length === arr[0].length)
					),
					(vectors) => {
						const mean = meanVector(vectors);
						if (mean === null) return true;
						const meanNorm = vectorNorm(mean);
						const maxNorm = Math.max(...vectors.map((v) => vectorNorm(v)));
						return meanNorm <= maxNorm + 0.0001;
					}
				)
			);
		});
	});

	describe('境界値テスト', () => {
		it('境界値: 空配列はnullを返す', () => {
			expect(meanVector([])).toBeNull();
		});

		it('境界値: 単一ベクトルはそのまま返す', () => {
			const vec = [1, 2, 3];
			const result = meanVector([vec]);
			expect(result).toEqual([1, 2, 3]);
		});

		it('境界値: 次元数が異なる場合はエラー', () => {
			expect(() => meanVector([[1, 2], [1, 2, 3]])).toThrow();
		});
	});
});

describe('dotProduct', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: 可換性', () => {
			fc.assert(
				fc.property(vectorPair, ([a, b]) => {
					const dotAB = dotProduct(a, b);
					const dotBA = dotProduct(b, a);
					return dotAB === dotBA;
				})
			);
});

		it('PBT: 分配性 dot(a+b, c) = dot(a,c) + dot(b,c)', () => {
			fc.assert(
				fc.property(
					validVector.chain((a) =>
						fc.tuple(
							fc.constant(a),
							fc.array(fc.float({ min: -100, max: 100, noNaN: true }), {
								minLength: a.length,
								maxLength: a.length,
							}),
							fc.array(fc.float({ min: -100, max: 100, noNaN: true }), {
								minLength: a.length,
								maxLength: a.length,
							})
						)
					),
					([a, b, c]) => {
						const left = dotProduct(addVectors(a, b), c);
						const right = dotProduct(a, c) + dotProduct(b, c);
						return Math.abs(left - right) < 0.0001;
					}
				)
			);
		});

		it('PBT: ゼロベクトルとの内積は0', () => {
			fc.assert(
				fc.property(validVector, (a) => {
					const zero = zeroVector(a.length);
					return dotProduct(a, zero) === 0;
				})
			);
		});
	});

	describe('境界値テスト', () => {
		it('境界値: 次元数が異なる場合は0を返す', () => {
			expect(dotProduct([1, 2], [1, 2, 3])).toBe(0);
		});
	});
});

describe('vectorNorm', () => {
	describe('プロパティベーステスト', () => {
		it('PBT: 非負性', () => {
			fc.assert(
				fc.property(validVector, (vec) => {
					return vectorNorm(vec) >= 0;
				})
			);
		});

		it('PBT: ゼロベクトルのノルムは0', () => {
			fc.assert(
				fc.property(fc.integer({ min: 1, max: 100 }), (dimensions) => {
					const zero = zeroVector(dimensions);
					return vectorNorm(zero) === 0;
				})
			);
		});

		it('PBT: スカラー倍 scale(v, s)のノルム = |s| * norm(v)', () => {
			fc.assert(
				fc.property(
					validVector,
					fc.float({ min: -10, max: 10, noNaN: true }),
					(vec, s) => {
						const normV = vectorNorm(vec);
						const normScaled = vectorNorm(scaleVector(vec, s));
						return Math.abs(normScaled - Math.abs(s) * normV) < 0.0001;
					}
				)
			);
		});
	});
});

describe('findNearestNeighbors', () => {
	it('正常系: k件の近傍を返す', () => {
		const query = [1, 0, 0];
		const items = [
			{ embedding: [0.9, 0.1, 0], id: 'a' },
			{ embedding: [0.1, 0.9, 0], id: 'b' },
			{ embedding: [0.8, 0.2, 0], id: 'c' },
			{ embedding: [0, 0, 1], id: 'd' },
		];

		const result = findNearestNeighbors(query, items, 2);

		expect(result).toHaveLength(2);
		expect(result[0].item.id).toBe('a');
		expect(result[1].item.id).toBe('c');
	});

	it('正常系: アイテム数より大きいkを指定しても全件返す', () => {
		const query = [1, 0];
		const items = [
			{ embedding: [1, 0], id: 'a' },
			{ embedding: [0, 1], id: 'b' },
		];

		const result = findNearestNeighbors(query, items, 10);

		expect(result).toHaveLength(2);
	});

	it('境界値: 空配列の場合は空配列を返す', () => {
		const result = findNearestNeighbors([1, 0], [], 5);
		expect(result).toEqual([]);
	});
});

describe('findBySimilarityThreshold', () => {
	it('正常系: 閾値を超えるアイテムのみ返す', () => {
		const query = [1, 0];
		const items = [
			{ embedding: [0.9, 0.1], id: 'a' }, // high similarity
			{ embedding: [0.1, 0.9], id: 'b' }, // low similarity
			{ embedding: [0.8, 0.2], id: 'c' }, // high similarity
		];

		const result = findBySimilarityThreshold(query, items, 0.5);

		expect(result.length).toBe(2);
		expect(result.map((r) => r.item.id)).toContain('a');
		expect(result.map((r) => r.item.id)).toContain('c');
	});

	it('正常系: 結果は類似度降順', () => {
		const query = [1, 0];
		const items = [
			{ embedding: [0.7, 0.3], id: 'a' },
			{ embedding: [0.9, 0.1], id: 'b' },
			{ embedding: [0.8, 0.2], id: 'c' },
		];

		const result = findBySimilarityThreshold(query, items, 0);

		expect(result[0].item.id).toBe('b');
		expect(result[1].item.id).toBe('c');
		expect(result[2].item.id).toBe('a');
	});

	it('境界値: すべてのアイテムが閾値未満の場合は空配列', () => {
		const query = [1, 0];
		const items = [
			{ embedding: [0, 1], id: 'a' },
			{ embedding: [0.1, 0.9], id: 'b' },
		];

		const result = findBySimilarityThreshold(query, items, 0.9);

		expect(result).toEqual([]);
	});
});

describe('isValidEmbedding', () => {
	it('正常系: 有効なベクトルはtrue', () => {
		expect(isValidEmbedding([1, 2, 3])).toBe(true);
		expect(isValidEmbedding([0.5, -0.5, 0])).toBe(true);
	});

	it('境界値: 空配列はfalse', () => {
		expect(isValidEmbedding([])).toBe(false);
	});

	it('境界値: 配列でない値はfalse', () => {
		expect(isValidEmbedding(null)).toBe(false);
		expect(isValidEmbedding(undefined)).toBe(false);
		expect(isValidEmbedding('not an array')).toBe(false);
		expect(isValidEmbedding(123)).toBe(false);
	});

	it('境界値: NaNを含む配列はfalse', () => {
		expect(isValidEmbedding([1, NaN, 3])).toBe(false);
	});

	it('境界値: 数値以外を含む配列はfalse', () => {
		expect(isValidEmbedding([1, 'two', 3] as unknown[])).toBe(false);
	});
});

describe('zeroVector', () => {
	it('正常系: 指定した次元数のゼロベクトルを生成', () => {
		expect(zeroVector(3)).toEqual([0, 0, 0]);
		expect(zeroVector(0)).toEqual([]);
		expect(zeroVector(5)).toEqual([0, 0, 0, 0, 0]);
	});

	it('PBT: すべての要素が0', () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 100 }), (dimensions) => {
				const zero = zeroVector(dimensions);
				return zero.length === dimensions && zero.every((v) => v === 0);
			})
		);
	});
});
