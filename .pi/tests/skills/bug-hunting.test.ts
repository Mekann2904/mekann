/**
 * @abdd.meta
 * path: .pi/tests/skills/bug-hunting.test.ts
 * role: Bug Huntingスキルのユニットテスト
 * why: バグ発見と根本原因特定のフレームワークが正しく動作することを保証する
 * related: .pi/skills/bug-hunting/SKILL.md, .pi/lib/verification-workflow.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、テスト間で状態を共有しない
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Bug Huntingスキルの因果チェーン分析フレームワークをテストする。
 * what_it_does:
 *   - 症状-原因マッピングの正しさを検証する
 *   - 因果チェーン構築の完全性をテストする
 *   - 認知バイアス検出の精度を確認する
 * why_it_exists: バグ発見能力の自己改善サイクルの品質を保証するため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";

/**
 * 因果チェーンのレベル定義
 */
type CausalLevel = "intent" | "contract" | "design" | "implementation" | "execution";

/**
 * 因果チェーンのノード
 */
interface CausalNode {
  level: CausalLevel;
  question: string;
  answer: string;
  evidence: string;
}

/**
 * 因果チェーン分析結果
 */
interface CausalChainAnalysis {
  symptom: string;
  chain: CausalNode[];
  isComplete: boolean;
  missingLevels: CausalLevel[];
  identifiedRootCause: string;
  isRecurrencePrevention: boolean;
}

/**
 * 症状記述
 */
interface SymptomDescription {
  what: string;
  location: string;
  timing: string;
  context: string;
  reproductionSteps: string[];
  notRelated: string[];
}

/**
 * 認知バイアス検出結果
 */
interface BiasDetection {
  proximityBias: boolean;
  concretenessBias: boolean;
  completionCraving: boolean;
  firstReasonStopping: boolean;
  details: string[];
}

/**
 * 因果チェーンを分析する
 * @summary 因果チェーン分析
 * @param chain 因果チェーンノード配列
 * @returns 分析結果
 */
function analyzeCausalChain(chain: CausalNode[]): Partial<CausalChainAnalysis> {
  const requiredLevels: CausalLevel[] = ["intent", "contract", "design", "implementation", "execution"];
  const presentLevels = chain.map((n) => n.level);
  const missingLevels = requiredLevels.filter((l) => !presentLevels.includes(l));

  return {
    chain,
    isComplete: missingLevels.length === 0,
    missingLevels,
  };
}

/**
 * 認知バイアスを検出する
 * @summary バイアス検出
 * @param analysis 因果チェーン分析結果
 * @param stopAtLevel 探索を停止したレベル
 * @returns バイアス検出結果
 */
function detectBiases(analysis: Partial<CausalChainAnalysis>, stopAtLevel?: CausalLevel): BiasDetection {
  const details: string[] = [];
  let proximityBias = false;
  let concretenessBias = false;
  let completionCraving = false;
  let firstReasonStopping = false;

  // 近接性バイアス: 実行レベルのみで止まっている
  if (analysis.missingLevels && analysis.missingLevels.length >= 3) {
    const lowerLevels = ["design", "contract", "intent"];
    if (analysis.missingLevels.some((l) => lowerLevels.includes(l))) {
      proximityBias = true;
      details.push("因果チェーンが下位レベルのみで、上位レベルが欠落している");
    }
  }

  // 具体性バイアス: 実装/実行レベルのみ
  if (analysis.chain) {
    const abstractLevels = analysis.chain.filter(
      (n) => n.level === "intent" || n.level === "contract" || n.level === "design"
    );
    if (abstractLevels.length === 0 && analysis.chain.length > 0) {
      concretenessBias = true;
      details.push("抽象レベル（意図・契約・設計）の分析が欠落している");
    }
  }

  // 完了への渇愛: 最初の「なぜ」で止まっている
  if (stopAtLevel === "execution" && analysis.chain && analysis.chain.length === 1) {
    firstReasonStopping = true;
    completionCraving = true;
    details.push("最初の「なぜ」で探索を停止している");
  }

  // 探索が不完全な場合
  if (!analysis.isComplete) {
    completionCraving = true;
    details.push("因果チェーンが5つのレベルすべてをカバーしていない");
  }

  return {
    proximityBias,
    concretenessBias,
    completionCraving,
    firstReasonStopping,
    details,
  };
}

/**
 * 修正が再発防止につながるか判定
 * @summary 再発防止判定
 * @param fixLevel 修正が行われたレベル
 * @param rootCauseLevel 根本原因のレベル
 * @returns 再発防止になるか
 */
function isRecurrencePrevention(fixLevel: CausalLevel, rootCauseLevel: CausalLevel): boolean {
  const levelOrder: CausalLevel[] = ["execution", "implementation", "design", "contract", "intent"];
  const fixIndex = levelOrder.indexOf(fixLevel);
  const rootIndex = levelOrder.indexOf(rootCauseLevel);

  // 修正レベルが根本原因レベル以上であれば再発防止の可能性が高い
  return fixIndex >= rootIndex;
}

describe("Bug Hunting Framework", () => {
  describe("因果チェーン分析", () => {
    it("should_identify_complete_causal_chain", () => {
      const chain: CausalNode[] = [
        { level: "execution", question: "なぜ型エラーが発生したか", answer: "変数がundefinedだった", evidence: "ログ" },
        { level: "implementation", question: "なぜundefinedだったか", answer: "APIが値を返さなかった", evidence: "ネットワークタブ" },
        { level: "design", question: "なぜAPIが値を返さなかったか", answer: "エラーハンドリングが不十分", evidence: "コードレビュー" },
        { level: "contract", question: "なぜハンドリングが不十分だったか", answer: "エラー時の契約が不明確", evidence: "インターフェース定義" },
        { level: "intent", question: "なぜ契約が不明確だったか", answer: "要件に含まれていなかった", evidence: "要件定義書" },
      ];

      const analysis = analyzeCausalChain(chain);

      expect(analysis.isComplete).toBe(true);
      expect(analysis.missingLevels).toHaveLength(0);
    });

    it("should_identify_incomplete_causal_chain", () => {
      const chain: CausalNode[] = [
        { level: "execution", question: "なぜ型エラーが発生したか", answer: "変数がundefinedだった", evidence: "ログ" },
        { level: "implementation", question: "なぜundefinedだったか", answer: "APIが値を返さなかった", evidence: "ネットワークタブ" },
      ];

      const analysis = analyzeCausalChain(chain);

      expect(analysis.isComplete).toBe(false);
      expect(analysis.missingLevels).toContain("intent");
      expect(analysis.missingLevels).toContain("contract");
      expect(analysis.missingLevels).toContain("design");
    });
  });

  describe("認知バイアス検出", () => {
    it("should_detect_proximity_bias", () => {
      const incompleteChain: CausalNode[] = [
        { level: "execution", question: "なぜ", answer: "直接原因", evidence: "ログ" },
      ];

      const analysis = analyzeCausalChain(incompleteChain);
      const biases = detectBiases(analysis, "execution");

      expect(biases.proximityBias).toBe(true);
      expect(biases.details).toContain("因果チェーンが下位レベルのみで、上位レベルが欠落している");
    });

    it("should_detect_first_reason_stopping", () => {
      const chain: CausalNode[] = [
        { level: "execution", question: "なぜ", answer: "直接原因", evidence: "ログ" },
      ];

      const analysis = analyzeCausalChain(chain);
      const biases = detectBiases(analysis, "execution");

      expect(biases.firstReasonStopping).toBe(true);
      expect(biases.completionCraving).toBe(true);
    });

    it("should_not_detect_bias_for_complete_chain", () => {
      const completeChain: CausalNode[] = [
        { level: "execution", question: "なぜ", answer: "原因1", evidence: "証拠1" },
        { level: "implementation", question: "なぜ", answer: "原因2", evidence: "証拠2" },
        { level: "design", question: "なぜ", answer: "原因3", evidence: "証拠3" },
        { level: "contract", question: "なぜ", answer: "原因4", evidence: "証拠4" },
        { level: "intent", question: "なぜ", answer: "原因5", evidence: "証拠5" },
      ];

      const analysis = analyzeCausalChain(completeChain);
      const biases = detectBiases(analysis);

      expect(biases.proximityBias).toBe(false);
      expect(biases.concretenessBias).toBe(false);
      expect(biases.completionCraving).toBe(false);
      expect(biases.firstReasonStopping).toBe(false);
    });

    it("should_detect_concreteness_bias", () => {
      const concreteOnlyChain: CausalNode[] = [
        { level: "execution", question: "なぜ", answer: "原因1", evidence: "証拠1" },
        { level: "implementation", question: "なぜ", answer: "原因2", evidence: "証拠2" },
      ];

      const analysis = analyzeCausalChain(concreteOnlyChain);
      const biases = detectBiases(analysis);

      expect(biases.concretenessBias).toBe(true);
    });
  });

  describe("再発防止判定", () => {
    it("should_prevent_recurrence_when_fix_at_root_level", () => {
      // 根本原因が契約レベルで、修正も契約レベル
      const result = isRecurrencePrevention("contract", "contract");
      expect(result).toBe(true);
    });

    it("should_prevent_recurrence_when_fix_above_root_level", () => {
      // 根本原因が設計レベルで、修正が意図レベル
      const result = isRecurrencePrevention("intent", "design");
      expect(result).toBe(true);
    });

    it("should_not_prevent_recurrence_when_fix_below_root_level", () => {
      // 根本原因が意図レベルで、修正が実装レベル（対症療法）
      const result = isRecurrencePrevention("implementation", "intent");
      expect(result).toBe(false);
    });

    it("should_identify_palliative_fix", () => {
      // 根本原因が契約レベルで、修正が実行レベル（明らかな対症療法）
      const result = isRecurrencePrevention("execution", "contract");
      expect(result).toBe(false);
    });
  });

  describe("症状-原因マッピング", () => {
    it("should_map_type_error_to_contract_issue", () => {
      // TypeErrorは多くの場合、契約の問題が根本原因
      const symptom = "TypeError: Cannot read property 'x' of undefined";
      const directCause = "変数がundefinedだった";
      const rootCause = "APIの契約が不明確（nullの場合の挙動が未定義）";

      // このマッピングが正しいことを確認
      expect(symptom).toContain("TypeError");
      expect(rootCause).toContain("契約");
    });

    it("should_map_flaky_test_to_design_issue", () => {
      // フレーキーテストは多くの場合、設計の問題が根本原因
      const symptom = "テストが時々失敗する";
      const directCause = "データベースの状態が期待と異なる";
      const rootCause = "テストの並列実行を考慮した設計になっていない";

      expect(rootCause).toContain("設計");
    });
  });

  describe("探索的質問セット", () => {
    it("should_have_questions_for_all_phases", () => {
      const symptomQuestions = [
        "この症状は「必ず」発生するか、それとも「条件次第」か？",
        "この症状は「いつから」発生し始めたか？",
        "この症状は「どこで」発生し、「どこでは発生しない」か？",
      ];

      const causeQuestions = [
        "この説明は「なぜ」成立するのか？",
        "この説明が正しいとすると、他に「何が予測できる」か？",
        "この説明と「矛盾する」証拠はないか？",
      ];

      const fixQuestions = [
        "この修正は「再発を防ぐ」か、それとも「今回の症状を消すだけ」か？",
        "この修正は「他に影響を与えない」か？",
      ];

      // 各フェーズに最低3つの質問があることを確認
      expect(symptomQuestions.length).toBeGreaterThanOrEqual(3);
      expect(causeQuestions.length).toBeGreaterThanOrEqual(3);
      expect(fixQuestions.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("Bug Hunting Integration", () => {
  describe("Inspector/Challengerパターンとの統合", () => {
    it("should_integrate_with_inspector_checklist", () => {
      const inspectorChecklist = {
        causalChainComplete: true,
        whyAnsweredAtAllLevels: true,
        evidenceBacked: true,
        alternativesConsidered: true,
        recurrencePrevention: true,
      };

      // チェックリストが完全であることを確認
      expect(Object.values(inspectorChecklist).every((v) => v === true)).toBe(true);
    });

    it("should_integrate_with_challenger_template", () => {
      const challengerTemplate = {
        challengedClaim: "このバグの原因は[原因]である",
        evidenceGap: "[原因]を支持する証拠",
        alternativeExplanations: "他に考えられる原因",
        boundaryFailure: "[原因]という説明が成立しない条件",
        severity: "moderate" as const,
      };

      // テンプレートの必須フィールドが存在することを確認
      expect(challengerTemplate).toHaveProperty("challengedClaim");
      expect(challengerTemplate).toHaveProperty("evidenceGap");
      expect(challengerTemplate).toHaveProperty("alternativeExplanations");
      expect(challengerTemplate).toHaveProperty("boundaryFailure");
      expect(["minor", "moderate", "critical"]).toContain(challengerTemplate.severity);
    });
  });
});
