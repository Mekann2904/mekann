/**
 * @abdd.meta
 * path: .pi/tests/lib/sbfl.test.ts
 * role: SBFLアルゴリズムの単体テスト
 * why: バグ位置特定アルゴリズムの正確性を保証するため
 * related: .pi/lib/sbfl.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Ochiai/Tarantula/OP2アルゴリズムの包括的なテストスイート
 * what_it_does:
 *   - 各アルゴリズムの数学的正確性を検証
 *   - 境界値（ゼロ除算等）のテスト
 *   - 一括計算・カバレッジ集計のテスト
 * why_it_exists:
 *   - バグ位置特定の信頼性を保証するため
 * scope:
 *   in: なし
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  calculateOchiai,
  calculateTarantula,
  calculateOP2,
  calculateSuspiciousness,
  calculateBatchSuspiciousness,
  aggregateCoverage,
  isValidCoverage,
  coverageToString,
  type CoverageData,
  type SBFLAlgorithm,
} from "../../lib/sbfl.js";

// ============================================
// Tests: Ochiai Algorithm
// ============================================

describe("calculateOchiai", () => {
  it("失敗テストのみでカバーされた行は高スコア", () => {
    // n_cf=5, n_nf=0, n_cs=0, n_ns=5 (失敗テスト5件全てでカバー、成功テストではカバーされず)
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 };
    const score = calculateOchiai(coverage);

    // Ochiai = 5 / sqrt(5 * 5) = 5 / 5 = 1.0
    expect(score).toBe(1.0);
  });

  it("成功テストのみでカバーされた行は0スコア", () => {
    // n_cf=0, n_nf=5, n_cs=5, n_ns=0
    const coverage: CoverageData = { n_cf: 0, n_nf: 5, n_cs: 5, n_ns: 0 };
    const score = calculateOchiai(coverage);

    // n_cf=0 なので 0
    expect(score).toBe(0);
  });

  it("全テストでカバーされた行は中程度のスコア", () => {
    // n_cf=5, n_nf=0, n_cs=5, n_ns=0 (全テストでカバー)
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 5, n_ns: 0 };
    const score = calculateOchiai(coverage);

    // Ochiai = 5 / sqrt(5 * 10) = 5 / sqrt(50) ≈ 0.707
    expect(score).toBeCloseTo(5 / Math.sqrt(50), 5);
  });

  it("ゼロ除算のケース：n_cf=0 の場合は0を返す", () => {
    const coverage: CoverageData = { n_cf: 0, n_nf: 0, n_cs: 0, n_ns: 0 };
    const score = calculateOchiai(coverage);
    expect(score).toBe(0);
  });

  it("ゼロ除算のケース：全て0でもn_cf>0の場合", () => {
    const coverage: CoverageData = { n_cf: 1, n_nf: 0, n_cs: 0, n_ns: 0 };
    const score = calculateOchiai(coverage);
    // 1 / sqrt(1 * 1) = 1
    expect(score).toBe(1);
  });

  it("スコアは常に0.0〜1.0の範囲", () => {
    const testCases: CoverageData[] = [
      { n_cf: 10, n_nf: 5, n_cs: 20, n_ns: 10 },
      { n_cf: 1, n_nf: 100, n_cs: 100, n_ns: 1 },
      { n_cf: 50, n_nf: 50, n_cs: 50, n_ns: 50 },
    ];

    for (const coverage of testCases) {
      const score = calculateOchiai(coverage);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================
// Tests: Tarantula Algorithm
// ============================================

describe("calculateTarantula", () => {
  it("失敗テストのみでカバーされた行は高スコア", () => {
    // n_cf=5, n_nf=0, n_cs=0, n_ns=5
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 };
    const score = calculateTarantula(coverage);

    // failRate = 5/5 = 1.0, passRate = 0/5 = 0
    // Tarantula = 1.0 / (1.0 + 0) = 1.0
    expect(score).toBe(1.0);
  });

  it("成功テストのみでカバーされた行は0スコア", () => {
    // n_cf=0, n_nf=5, n_cs=5, n_ns=0
    const coverage: CoverageData = { n_cf: 0, n_nf: 5, n_cs: 5, n_ns: 0 };
    const score = calculateTarantula(coverage);

    // failRate = 0/5 = 0
    expect(score).toBe(0);
  });

  it("全テストでカバーされた行は中程度のスコア", () => {
    // 失敗5件、成功5件、全てカバー
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 5, n_ns: 0 };
    const score = calculateTarantula(coverage);

    // failRate = 5/5 = 1.0, passRate = 5/5 = 1.0
    // Tarantula = 1.0 / (1.0 + 1.0) = 0.5
    expect(score).toBe(0.5);
  });

  it("失敗テストが全てカバー、成功テストがカバーされない場合は1.0", () => {
    const coverage: CoverageData = { n_cf: 10, n_nf: 0, n_cs: 0, n_ns: 10 };
    const score = calculateTarantula(coverage);

    // failRate = 1.0, passRate = 0
    // 成功テストがない場合、failRate > 0 なら 1.0
    expect(score).toBe(1.0);
  });

  it("ゼロ除算のケース：全て0の場合", () => {
    const coverage: CoverageData = { n_cf: 0, n_nf: 0, n_cs: 0, n_ns: 0 };
    const score = calculateTarantula(coverage);
    expect(score).toBe(0);
  });

  it("スコアは常に0.0〜1.0の範囲", () => {
    const testCases: CoverageData[] = [
      { n_cf: 10, n_nf: 5, n_cs: 20, n_ns: 10 },
      { n_cf: 1, n_nf: 100, n_cs: 100, n_ns: 1 },
      { n_cf: 50, n_nf: 50, n_cs: 50, n_ns: 50 },
    ];

    for (const coverage of testCases) {
      const score = calculateTarantula(coverage);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================
// Tests: OP2 Algorithm
// ============================================

describe("calculateOP2", () => {
  it("失敗テストのみでカバーされた行は高スコア", () => {
    // n_cf=5, n_cs=0, n_ns=5
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 };
    const score = calculateOP2(coverage);

    // OP2 = 5 - (0 / (0 + 5 + 1)) = 5 - 0 = 5
    expect(score).toBe(5);
  });

  it("成功テストのみでカバーされた行は負のスコア", () => {
    // n_cf=0, n_cs=5, n_ns=0
    const coverage: CoverageData = { n_cf: 0, n_nf: 5, n_cs: 5, n_ns: 0 };
    const score = calculateOP2(coverage);

    // OP2 = 0 - (5 / (5 + 0 + 1)) = 0 - 0.833... ≈ -0.833
    expect(score).toBeCloseTo(-5/6, 5);
  });

  it("全テストでカバーされた場合", () => {
    // n_cf=5, n_cs=5, n_ns=0
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 5, n_ns: 0 };
    const score = calculateOP2(coverage);

    // OP2 = 5 - (5 / (5 + 0 + 1)) = 5 - 0.833... ≈ 4.167
    expect(score).toBeCloseTo(5 - 5/6, 5);
  });

  it("OP2は負の値を取りうる", () => {
    const coverage: CoverageData = { n_cf: 0, n_nf: 0, n_cs: 10, n_ns: 0 };
    const score = calculateOP2(coverage);

    expect(score).toBeLessThan(0);
  });

  it("OP2は1.0を超える値を取りうる", () => {
    const coverage: CoverageData = { n_cf: 10, n_nf: 0, n_cs: 1, n_ns: 0 };
    const score = calculateOP2(coverage);

    // OP2 = 10 - (1 / 2) = 9.5
    expect(score).toBeGreaterThan(1);
  });
});

// ============================================
// Tests: calculateSuspiciousness (Unified API)
// ============================================

describe("calculateSuspiciousness", () => {
  it("アルゴリズムを指定して計算できる", () => {
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 5, n_ns: 0 };

    const ochiaiResult = calculateSuspiciousness(coverage, "ochiai");
    const tarantulaResult = calculateSuspiciousness(coverage, "tarantula");
    const op2Result = calculateSuspiciousness(coverage, "op2");

    expect(ochiaiResult.algorithm).toBe("ochiai");
    expect(tarantulaResult.algorithm).toBe("tarantula");
    expect(op2Result.algorithm).toBe("op2");

    // 結果が返されることを確認
    expect(ochiaiResult.suspiciousness).toBeGreaterThanOrEqual(0);
    expect(tarantulaResult.suspiciousness).toBeGreaterThanOrEqual(0);
    expect(op2Result.suspiciousness).toBeGreaterThanOrEqual(0);
  });

  it("デフォルトはOchiaiアルゴリズム", () => {
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 };
    const result = calculateSuspiciousness(coverage);

    expect(result.algorithm).toBe("ochiai");
    expect(result.suspiciousness).toBe(1.0);
  });

  it("OP2のスコアは正規化される（0.0-1.0の範囲）", () => {
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 };
    const result = calculateSuspiciousness(coverage, "op2");

    // 元のOP2スコアは5だが、正規化されて0.0-1.0の範囲になる
    expect(result.suspiciousness).toBeGreaterThanOrEqual(0);
    expect(result.suspiciousness).toBeLessThanOrEqual(1);
  });

  it("結果に元のカバレッジデータが含まれる", () => {
    const coverage: CoverageData = { n_cf: 5, n_nf: 3, n_cs: 2, n_ns: 1 };
    const result = calculateSuspiciousness(coverage, "ochiai");

    expect(result.coverage).toEqual(coverage);
  });

  it("無効なアルゴリズム名でエラーを投げる", () => {
    const coverage: CoverageData = { n_cf: 1, n_nf: 0, n_cs: 0, n_ns: 0 };

    expect(() => {
      calculateSuspiciousness(coverage, "invalid" as SBFLAlgorithm);
    }).toThrow("Unknown SBFL algorithm: invalid");
  });
});

// ============================================
// Tests: calculateBatchSuspiciousness
// ============================================

describe("calculateBatchSuspiciousness", () => {
  it("複数位置のsuspiciousnessを一括計算", () => {
    const locations = [
      { file: "a.ts", line: 10, coverage: { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 } },
      { file: "b.ts", line: 20, coverage: { n_cf: 0, n_nf: 5, n_cs: 5, n_ns: 0 } },
      { file: "c.ts", line: 30, coverage: { n_cf: 3, n_nf: 2, n_cs: 2, n_ns: 3 } },
    ];

    const results = calculateBatchSuspiciousness(locations, "ochiai");

    expect(results).toHaveLength(3);
    // 怪しさの降順でソートされている
    expect(results[0].suspiciousness).toBeGreaterThanOrEqual(results[1].suspiciousness);
    expect(results[1].suspiciousness).toBeGreaterThanOrEqual(results[2].suspiciousness);
  });

  it("閾値でフィルタリング", () => {
    const locations = [
      { file: "a.ts", line: 10, coverage: { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 } }, // score = 1.0
      { file: "b.ts", line: 20, coverage: { n_cf: 0, n_nf: 5, n_cs: 5, n_ns: 0 } }, // score = 0
    ];

    const results = calculateBatchSuspiciousness(locations, "ochiai", 0.5);

    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("a.ts");
  });

  it("メソッド名が含まれる場合", () => {
    const locations = [
      { file: "a.ts", line: 10, method: "main", coverage: { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 } },
    ];

    const results = calculateBatchSuspiciousness(locations, "ochiai");

    expect(results[0].method).toBe("main");
  });

  it("coveredByFailing/coveredByPassingが正しく設定される", () => {
    const locations = [
      { file: "a.ts", line: 10, coverage: { n_cf: 3, n_nf: 2, n_cs: 4, n_ns: 1 } },
    ];

    const results = calculateBatchSuspiciousness(locations, "ochiai");

    expect(results[0].coveredByFailing).toBe(3);
    expect(results[0].coveredByPassing).toBe(4);
  });
});

// ============================================
// Tests: aggregateCoverage
// ============================================

describe("aggregateCoverage", () => {
  it("テスト結果からカバレッジを集計", () => {
    const testResults = [
      {
        passed: false,
        coveredLines: [
          { file: "a.ts", line: 10 },
          { file: "a.ts", line: 11 },
        ],
      },
      {
        passed: true,
        coveredLines: [
          { file: "a.ts", line: 10 },
          { file: "b.ts", line: 20 },
        ],
      },
    ];

    const coverageMap = aggregateCoverage(testResults);

    // a.ts:10 は失敗テスト1回、成功テスト1回でカバー
    const a10 = coverageMap.get("a.ts")?.get(10);
    expect(a10).toBeDefined();
    expect(a10!.n_cf).toBe(1); // 失敗テストでカバー
    expect(a10!.n_cs).toBe(1); // 成功テストでカバー
    expect(a10!.n_nf).toBe(0); // 失敗テストでカバーされなかった
    expect(a10!.n_ns).toBe(0); // 成功テストでカバーされなかった

    // a.ts:11 は失敗テストのみでカバー
    const a11 = coverageMap.get("a.ts")?.get(11);
    expect(a11!.n_cf).toBe(1);
    expect(a11!.n_cs).toBe(0);

    // b.ts:20 は成功テストのみでカバー
    const b20 = coverageMap.get("b.ts")?.get(20);
    expect(b20!.n_cf).toBe(0);
    expect(b20!.n_cs).toBe(1);
  });

  it("n_nf と n_ns が正しく計算される", () => {
    const testResults = [
      { passed: false, coveredLines: [{ file: "a.ts", line: 10 }] },
      { passed: false, coveredLines: [] }, // この失敗テストはa.ts:10をカバーしない
      { passed: true, coveredLines: [{ file: "a.ts", line: 10 }] },
      { passed: true, coveredLines: [] }, // この成功テストはa.ts:10をカバーしない
    ];

    const coverageMap = aggregateCoverage(testResults);
    const a10 = coverageMap.get("a.ts")?.get(10);

    // 失敗テスト2件中1件でカバー → n_cf=1, n_nf=1
    // 成功テスト2件中1件でカバー → n_cs=1, n_ns=1
    expect(a10!.n_cf).toBe(1);
    expect(a10!.n_nf).toBe(1);
    expect(a10!.n_cs).toBe(1);
    expect(a10!.n_ns).toBe(1);
  });

  it("空のテスト結果で空のマップを返す", () => {
    const coverageMap = aggregateCoverage([]);
    expect(coverageMap.size).toBe(0);
  });
});

// ============================================
// Tests: Utility Functions
// ============================================

describe("isValidCoverage", () => {
  it("有効なカバレッジでtrue", () => {
    const coverage: CoverageData = { n_cf: 5, n_nf: 3, n_cs: 2, n_ns: 1 };
    expect(isValidCoverage(coverage)).toBe(true);
  });

  it("負の値がある場合はfalse", () => {
    const coverage: CoverageData = { n_cf: -1, n_nf: 0, n_cs: 0, n_ns: 0 };
    expect(isValidCoverage(coverage)).toBe(false);
  });

  it("全て0でも有効", () => {
    const coverage: CoverageData = { n_cf: 0, n_nf: 0, n_cs: 0, n_ns: 0 };
    expect(isValidCoverage(coverage)).toBe(true);
  });
});

describe("coverageToString", () => {
  it("カバレッジを文字列表現に変換", () => {
    const coverage: CoverageData = { n_cf: 5, n_nf: 3, n_cs: 2, n_ns: 1 };
    const str = coverageToString(coverage);

    expect(str).toBe("cf=5, nf=3, cs=2, ns=1");
  });
});

// ============================================
// Tests: Algorithm Comparison
// ============================================

describe("アルゴリズム比較", () => {
  it("失敗テストのみでカバーされた行は全アルゴリズムで最高スコア", () => {
    const coverage: CoverageData = { n_cf: 5, n_nf: 0, n_cs: 0, n_ns: 5 };

    const ochiai = calculateSuspiciousness(coverage, "ochiai");
    const tarantula = calculateSuspiciousness(coverage, "tarantula");
    const op2 = calculateSuspiciousness(coverage, "op2");

    // 全て正規化後は1.0になるはず
    expect(ochiai.suspiciousness).toBe(1.0);
    expect(tarantula.suspiciousness).toBe(1.0);
    expect(op2.suspiciousness).toBe(1.0);
  });

  it("成功テストのみでカバーされた行は全アルゴリズムで最低スコア", () => {
    const coverage: CoverageData = { n_cf: 0, n_nf: 5, n_cs: 5, n_ns: 0 };

    const ochiai = calculateSuspiciousness(coverage, "ochiai");
    const tarantula = calculateSuspiciousness(coverage, "tarantula");
    const op2 = calculateSuspiciousness(coverage, "op2");

    // 全て0になるはず
    expect(ochiai.suspiciousness).toBe(0);
    expect(tarantula.suspiciousness).toBe(0);
    expect(op2.suspiciousness).toBe(0);
  });
});
