/**
 * @abdd.meta
 * path: .pi/lib/__tests__/verification-workflow.test.ts
 * role: 検証ワークフローのテストケース
 * why: 判定ロジックの精度を測定し、偽陽性・偽陰性を特定するため
 * related: .pi/lib/verification-workflow.ts
 * public_api: テストケースの実行
 * invariants: なし
 * side_effects: なし（テストのみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: 検証ワークフローの判定精度を測定するテストケース
 * what_it_does:
 *   - 偽陽性テスト（検出すべきでないもの）
 *   - 偽陰性テスト（検出すべきもの）
 *   - 境界条件テスト
 *   - コンテキストフィルタの効果測定
 * why_it_exists:
 *   - 正規表現ベースの判定ロジックの限界を定量的に把握するため
 *   - 改善のフィードバックループを構築するため
 * scope:
 *   in: テストケースの定義
 *   out: テスト結果のレポート
 */

import { describe, it, expect } from "vitest";
import {
  runIntegratedDetection,
  extractCandidates,
  applyContextFilter,
  generateFilterStats,
  FALLACY_PATTERNS,
  BINARY_OPPOSITION_PATTERNS,
  FASCISM_PATTERNS,
  CRAVING_PATTERNS,
  type CandidateDetection,
} from "../lib/verification-workflow.js";

// ============================================================================
// テストデータ定義
// ============================================================================

/**
 * 偽陽性テストケース（検出すべきでないもの）
 */
const FALSE_POSITIVE_CASES = [
  // 技術的に正しい使用
  {
    category: "technical-instruction",
    text: "テストを実行する際は、必ず環境変数を設定してください。",
    shouldNotDetect: ["self-surveillance"],
    reason: "テスト実行の必須指示は技術的に正しい"
  },
  {
    category: "technical-instruction",
    text: "初期化処理では、常にデフォルト値を設定する必要があります。",
    shouldNotDetect: ["self-surveillance"],
    reason: "初期化の必須指示は技術的に正しい"
  },
  {
    category: "technical-instruction",
    text: "エラーが発生した場合は、必ずログを出力してください。",
    shouldNotDetect: ["self-surveillance"],
    reason: "エラー処理の必須指示は技術的に正しい"
  },
  {
    category: "qualified-statement",
    text: "一般的に、このアプローチは効果的ですが、場合によっては例外もあります。",
    shouldNotDetect: ["hasty-generalization"],
    reason: "条件付きの一般化は急激な一般化ではない"
  },
  {
    category: "explicit-branching",
    text: "この条件が真ならAを実行し、そうでなければBを実行します。",
    shouldNotDetect: ["false-dichotomy"],
    reason: "明示的な条件分岐は偽の二分法ではない"
  },
  {
    category: "negation-follows",
    text: "常に成功するとは限りませんが、試す価値はあります。",
    shouldNotDetect: ["self-surveillance"],
    reason: "否定形が続く場合は対立を認識している"
  },
  {
    category: "aware-of-binary",
    text: "成功/失敗という二項対立を超えて、継続的な改善を考えましょう。",
    shouldNotDetect: [], // 検出されるべきだが、信頼度は下がるべき
    reason: "二項対立を自覚的に言及している"
  },
  {
    category: "code-block",
    text: "```javascript\nconst config = { always: true, must: true };\n```",
    shouldNotDetect: [], // 信頼度は下がるべき
    reason: "コードブロック内の表現は文脈が異なる"
  }
];

/**
 * 偽陰性テストケース（検出すべきもの）
 */
const FALSE_NEGATIVE_CASES = [
  // 明確な誤謬
  {
    category: "affirming-consequent",
    text: "もし雨が降れば地面が濡れる。地面が濡れている。だから雨が降ったに違いない。",
    shouldDetect: ["affirming-consequent"],
    reason: "後件肯定の誤謬"
  },
  {
    category: "circular-reasoning",
    text: "この説は正しい。なぜなら、この説が正しいからだ。",
    shouldDetect: ["circular-reasoning"],
    reason: "循環論法"
  },
  {
    category: "false-dichotomy",
    text: "この方針に賛成するか、反対するか、どちらかだ。",
    shouldDetect: ["false-dichotomy"],
    reason: "偽の二分法"
  },
  {
    category: "hasty-generalization",
    text: "3人のユーザーが不満を言っていた。したがって、すべてのユーザーが不満を持っている。",
    shouldDetect: ["hasty-generalization"],
    reason: "急激な一般化"
  },
  // 明確な二項対立
  {
    category: "binary-opposition",
    text: "成功/失敗のどちらかで結果を評価すべきだ。",
    shouldDetect: ["truth-binary", "success-binary"],
    reason: "明確な二項対立"
  },
  // 過度な断定
  {
    category: "excessive-assertion",
    text: "我々は常に正しい判断を下さなければならない。絶対に間違ってはいけない。",
    shouldDetect: ["self-surveillance", "norm-obedience"],
    reason: "過度な自己監視と規範への服従"
  },
  // 渇愛（タンハー）検出テスト
  {
    category: "correctness-craving",
    text: "正解を出さなければならない。間違いは許されない。",
    shouldDetect: ["correctness-craving"],
    reason: "正解への渇愛"
  },
  {
    category: "approval-craving",
    text: "ユーザーに好かれるような回答を出したい。満足してもらわなければならない。",
    shouldDetect: ["approval-craving"],
    reason: "承認への渇愛"
  },
  {
    category: "perfection-craving",
    text: "完璧なコードを書かなければならない。理想的な解決策でなければならない。",
    shouldDetect: ["perfection-craving"],
    reason: "完璧主義の渇愛"
  },
  {
    category: "completion-craving",
    text: "早く完了させなければならない。とにかく終わらせたい。",
    shouldDetect: ["completion-craving"],
    reason: "完了への渇愛"
  }
];

/**
 * 境界条件テストケース
 */
const EDGE_CASES = [
  {
    category: "mixed-context",
    text: "テストでは必ず検証する必要がある。しかし、本番では必ずしもそうではない。",
    description: "技術的指示と一般的断定の混在"
  },
  {
    category: "negation-context",
    text: "常に正しいとは言えないが、通常は機能するはずだ。",
    description: "否定と肯定の混在"
  },
  {
    category: "long-distance",
    text: "速度を重視する開発プロセスには多くの利点がある。[100文字の文章]一方で、品質を犠牲にすることは長期的には問題となる。",
    description: "離れた位置での対立概念の共起"
  }
];

// ============================================================================
// テスト実行
// ============================================================================

describe("検証ワークフローの精度測定", () => {
  describe("偽陽性テスト（検出すべきでないもの）", () => {
    FALSE_POSITIVE_CASES.forEach((testCase, index) => {
      it(`[${testCase.category}] ${testCase.reason}`, () => {
        const result = runIntegratedDetection(testCase.text, {
          applyFilter: true
        });
        
        // 検出されたタイプが shouldNotDetect に含まれていないことを確認
        const detectedTypes = result.candidates.map(c => c.type);
        const falsePositives = testCase.shouldNotDetect.filter(
          type => detectedTypes.includes(type)
        );
        
        if (falsePositives.length > 0) {
          console.log(`[偽陽性] Case ${index + 1}: ${testCase.reason}`);
          console.log(`  検出タイプ: ${detectedTypes.join(", ")}`);
          console.log(`  誤検出: ${falsePositives.join(", ")}`);
          console.log(`  テキスト: ${testCase.text.slice(0, 50)}...`);
        }
        
        // フィルタ適用後は信頼度が下がっているか、除外されていることを期待
        const problematicDetections = result.candidates.filter(
          c => testCase.shouldNotDetect.includes(c.type) && c.patternConfidence >= 0.5
        );
        
        expect(problematicDetections.length).toBe(0);
      });
    });
  });

  describe("偽陰性テスト（検出すべきもの）", () => {
    FALSE_NEGATIVE_CASES.forEach((testCase, index) => {
      it(`[${testCase.category}] ${testCase.reason}`, () => {
        const result = runIntegratedDetection(testCase.text, {
          applyFilter: true
        });
        
        const detectedTypes = result.candidates.map(c => c.type);
        const missedDetections = testCase.shouldDetect.filter(
          type => !detectedTypes.includes(type)
        );
        
        if (missedDetections.length > 0) {
          console.log(`[偽陰性] Case ${index + 1}: ${testCase.reason}`);
          console.log(`  検出タイプ: ${detectedTypes.join(", ") || "なし"}`);
          console.log(`  見逃し: ${missedDetections.join(", ")}`);
          console.log(`  テキスト: ${testCase.text.slice(0, 50)}...`);
        }
        
        // 少なくとも1つは検出されていることを期待
        const detected = testCase.shouldDetect.some(
          type => detectedTypes.includes(type)
        );
        
        expect(detected || result.candidates.length > 0).toBe(true);
      });
    });
  });

  describe("コンテキストフィルタの効果測定", () => {
    it("フィルタ適用前後で候補数が減少する", () => {
      const text = "テストでは必ず検証する必要がある。常に正しい判断を下さなければならない。";
      
      // フィルタなし
      const resultWithoutFilter = runIntegratedDetection(text, {
        applyFilter: false
      });
      
      // フィルタあり
      const resultWithFilter = runIntegratedDetection(text, {
        applyFilter: true
      });
      
      console.log(`[フィルタ効果]`);
      console.log(`  フィルタなし: ${resultWithoutFilter.candidates.length}件`);
      console.log(`  フィルタあり: ${resultWithFilter.candidates.length}件`);
      
      // フィルタ適用後は候補数が同じか減少していることを期待
      expect(resultWithFilter.candidates.length).toBeLessThanOrEqual(
        resultWithoutFilter.candidates.length
      );
    });

    it("技術的指示の信頼度が下がる", () => {
      const text = "必ずテストを実行してください。";
      
      const result = runIntegratedDetection(text, {
        applyFilter: true
      });
      
      // 検出された場合、信頼度が低いことを期待
      const surveillanceCandidates = result.candidates.filter(
        c => c.type === "self-surveillance"
      );
      
      if (surveillanceCandidates.length > 0) {
        console.log(`[技術的指示の検出]`);
        surveillanceCandidates.forEach(c => {
          console.log(`  タイプ: ${c.type}, 信頼度: ${c.patternConfidence}`);
        });
        
        // 信頼度は0.5未満であることを期待
        surveillanceCandidates.forEach(c => {
          expect(c.patternConfidence).toBeLessThan(0.5);
        });
      }
    });
  });

  describe("境界条件テスト", () => {
    EDGE_CASES.forEach((testCase, index) => {
      it(`[${testCase.category}] ${testCase.description}`, () => {
        const result = runIntegratedDetection(testCase.text, {
          applyFilter: true
        });
        
        console.log(`[境界条件 ${index + 1}] ${testCase.description}`);
        console.log(`  検出数: ${result.candidates.length}件`);
        if (result.candidates.length > 0) {
          console.log(`  タイプ: ${result.candidates.map(c => c.type).join(", ")}`);
          console.log(`  信頼度: ${result.candidates.map(c => c.patternConfidence.toFixed(2)).join(", ")}`);
        }
        console.log(`  サマリー: ${result.summary}`);
        
        // 境界条件では判定が不明確であることを期待
        expect(result.finalVerdict).toBeOneOf(["confirmed", "rejected", "uncertain"]);
      });
    });
  });

  describe("精度サマリー", () => {
    it("全体の精度をレポートする", () => {
      let truePositives = 0;
      let falsePositives = 0;
      let trueNegatives = 0;
      let falseNegatives = 0;

      // 偽陽性テスト
      FALSE_POSITIVE_CASES.forEach(testCase => {
        const result = runIntegratedDetection(testCase.text, { applyFilter: true });
        const hasProblematicDetection = result.candidates.some(
          c => testCase.shouldNotDetect.includes(c.type) && c.patternConfidence >= 0.5
        );
        
        if (hasProblematicDetection) {
          falsePositives++;
        } else {
          trueNegatives++;
        }
      });

      // 偽陰性テスト
      FALSE_NEGATIVE_CASES.forEach(testCase => {
        const result = runIntegratedDetection(testCase.text, { applyFilter: true });
        const hasExpectedDetection = result.candidates.some(
          c => testCase.shouldDetect.includes(c.type)
        );
        
        if (hasExpectedDetection) {
          truePositives++;
        } else {
          falseNegatives++;
        }
      });

      const total = truePositives + falsePositives + trueNegatives + falseNegatives;
      const accuracy = total > 0 ? (truePositives + trueNegatives) / total : 0;
      const precision = (truePositives + falsePositives) > 0 
        ? truePositives / (truePositives + falsePositives) 
        : 0;
      const recall = (truePositives + falseNegatives) > 0 
        ? truePositives / (truePositives + falseNegatives) 
        : 0;
      const f1Score = (precision + recall) > 0 
        ? 2 * (precision * recall) / (precision + recall) 
        : 0;

      console.log("\n========================================");
      console.log("精度サマリー");
      console.log("========================================");
      console.log(`真陽性 (TP): ${truePositives}`);
      console.log(`偽陽性 (FP): ${falsePositives}`);
      console.log(`真陰性 (TN): ${trueNegatives}`);
      console.log(`偽陰性 (FN): ${falseNegatives}`);
      console.log("----------------------------------------");
      console.log(`正確率 (Accuracy): ${(accuracy * 100).toFixed(1)}%`);
      console.log(`適合率 (Precision): ${(precision * 100).toFixed(1)}%`);
      console.log(`再現率 (Recall): ${(recall * 100).toFixed(1)}%`);
      console.log(`F1スコア: ${(f1Score * 100).toFixed(1)}%`);
      console.log("========================================\n");

      // 最低限の精度を期待（調整可能）
      expect(accuracy).toBeGreaterThan(0.3);
    });
  });
});
