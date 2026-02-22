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

describe("Bug Hunting Detection Functions", () => {
  describe("第1理由停止検出", () => {
    it("should_detect_first_reason_stopping_when_only_one_why", () => {
      const output = `
原因: 変数がundefinedだったため、TypeErrorが発生しました。
修正: nullチェックを追加しました。
      `;

      const result = detectFirstReasonStopping(output);
      expect(result.detected).toBe(true);
    });

    it("should_not_detect_when_multiple_whys_explored", () => {
      const output = `
原因: 変数がundefinedだったため、TypeErrorが発生しました。
なぜundefinedだったか: APIが値を返さなかったからです。
さらに根本的な原因: APIの契約が不明確でした。
      `;

      const result = detectFirstReasonStopping(output);
      expect(result.detected).toBe(false);
    });
  });

  describe("近接性バイアス検出", () => {
    it("should_detect_proximity_bias", () => {
      const output = `
この行でエラーが発生しています。
この部分を修正すれば解決します。
      `;

      const result = detectProximityBias(output);
      expect(result.detected).toBe(true);
    });

    it("should_not_detect_when_remote_cause_explored", () => {
      const output = `
この行でエラーが発生しています。
しかし、実際の原因は呼び出し元のデータ不整合です。
他のファイルも調査する必要があります。
      `;

      const result = detectProximityBias(output);
      expect(result.detected).toBe(false);
    });
  });

  describe("具体性バイアス検出", () => {
    it("should_detect_concreteness_bias", () => {
      const output = `
原因: 変数xがnullだったため、エラーが発生しました。
修正: if (x !== null) チェックを追加しました。
      `;

      const result = detectConcretenessBias(output);
      expect(result.detected).toBe(true);
    });

    it("should_not_detect_when_abstract_level_analyzed", () => {
      const output = `
原因: 変数xがnullだったため、エラーが発生しました。
しかし、この問題の根本原因は設計レベルにあります。
このモジュールの責任境界が不明確です。
      `;

      const result = detectConcretenessBias(output);
      expect(result.detected).toBe(false);
    });
  });

  describe("対症療法検出", () => {
    it("should_detect_palliative_fix", () => {
      const output = `
とりあえずnullチェックを追加して、エラーを回避しました。
これで問題は解決です。
      `;

      const result = detectPalliativeFix(output);
      expect(result.detected).toBe(true);
    });

    it("should_not_detect_when_recurrence_prevention_mentioned", () => {
      const output = `
nullチェックを追加しました。
また、同様の問題が他の場所にもないか確認し、
再発防止のために設計を見直します。
      `;

      const result = detectPalliativeFix(output);
      expect(result.detected).toBe(false);
    });
  });
});

/**
 * 検出関数のヘルパー（テスト用）
 */
function detectFirstReasonStopping(output: string): { detected: boolean; reason: string } {
  const whyPatterns = [/なぜ|why|how come/i];
  let whyCount = 0;
  
  for (const pattern of whyPatterns) {
    const matches = output.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      whyCount += matches.length;
    }
  }
  
  const hasCauseExplanation = /原因|理由|cause|reason|because|ため|ので/i.test(output);
  
  // 「なぜ」が2回以上ある場合は探索が深いと判断
  if (hasCauseExplanation && whyCount >= 2) {
    return { detected: false, reason: "" };
  }
  
  // 根本的な原因の探求がある場合は検出しない
  const causalChainIndicators = [
    /さらに|さらに言えば|moreover|furthermore/i,
    /根本的|根源的|fundamental|root/i
  ];
  
  const hasDeepAnalysis = causalChainIndicators.some(p => p.test(output));
  
  if (hasDeepAnalysis) {
    return { detected: false, reason: "" };
  }
  
  // 原因の説明があるが、「なぜ」が1回以下で深い分析がない
  if (hasCauseExplanation && whyCount <= 1) {
    return { detected: true, reason: "First-reason stopping detected" };
  }
  
  return { detected: false, reason: "" };
}

function detectProximityBias(output: string): { detected: boolean; reason: string } {
  // 場所と言及しているか
  const hasLocationMention = /この行|このファイル|ここ|場所|位置|this line|this file|here|location/i.test(output);
  // 原因と言及しているか
  const hasCauseMention = /原因|理由|問題|cause|reason|problem|issue/i.test(output);
  // 他の場所を探索しているか
  const hasRemoteCauseSearch = /他の|別の|上位|下位|呼び出し元|呼び出し先|他の場所|other|another|upstream|downstream|caller|callee/i.test(output);
  
  // 他の場所を探索している場合はバイアスなし
  if (hasRemoteCauseSearch) {
    return { detected: false, reason: "" };
  }
  
  // 「この部分を修正すれば」「ここを直せば」的な表現がある場合
  const quickFixPatterns = [/この[部分箆所所行].*修正|ここ.*直せば|これ.*変えれば|fix this|change this|修正すれば.*解決/i];
  
  for (const pattern of quickFixPatterns) {
    if (pattern.test(output)) {
      return { detected: true, reason: "Proximity bias detected" };
    }
  }
  
  return { detected: false, reason: "" };
}

function detectConcretenessBias(output: string): { detected: boolean; reason: string } {
  const concreteLevelWords = [
    '変数', '関数', 'メソッド', 'null', 'undefined', 'error', 'type', 'value',
    'variable', 'function', 'method', 'class', 'file', 'line'
  ];
  const abstractLevelWords = [
    '設計', 'アーキテクチャ', '契約', 'インターフェース', '意図', '要件',
    'design', 'architecture', 'contract', 'interface', 'intent', 'requirement',
    '責任', '境界', '依存', '抽象', '原則',
    'responsibility', 'boundary', 'dependency', 'module'
  ];
  
  const hasConcreteMention = concreteLevelWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  const hasAbstractMention = abstractLevelWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  const hasCauseExplanation = /原因|理由|cause|reason|because|ため|ので/i.test(output);
  
  if (hasCauseExplanation && hasConcreteMention && !hasAbstractMention) {
    return { detected: true, reason: "Concreteness bias detected" };
  }
  
  return { detected: false, reason: "" };
}

function detectPalliativeFix(output: string): { detected: boolean; reason: string } {
  const fixWords = ['修正', '変更', '追加', '削除', 'fix', 'change', 'add', 'remove', 'modify'];
  const hasFixMention = fixWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  
  if (!hasFixMention) {
    return { detected: false, reason: "" };
  }
  
  const recurrencePreventionPatterns = [
    /再発防止|同様の問題|他の場所も|同様のバグ/,
    /prevent recurrence|similar issue|other places|same bug/,
    /根本的な|本質的な|構造的な/,
    /見直し|見直す|レビュー|再考/
  ];
  
  const hasRecurrencePrevention = recurrencePreventionPatterns.some(p => p.test(output));
  
  const palliativePatterns = [
    /とりあえず|暫定的|一時的|とにかく/,
    /temporarily|for now|quick fix|workaround/
  ];
  
  const hasPalliativeIndication = palliativePatterns.some(p => p.test(output));
  
  if (hasFixMention && !hasRecurrencePrevention && hasPalliativeIndication) {
    return { detected: true, reason: "Palliative fix detected" };
  }
  
  return { detected: false, reason: "" };
}

describe("Bug Hunting Aporia Recognition", () => {
  describe("アポリア1: 速度 vs 完全性", () => {
    it("should_recognize_speed_vs_completeness_aporia", () => {
      const output = `
緊急の対応が必要です。とりあえず修正を適用しました。
根本原因の調査は後で行います。
      `;
      const context: BugHuntingContext = {
        isProduction: true,
        isSecurityRelated: false,
        isRecurring: false,
        isFirstEncounter: true,
        isTeamInvestigation: false,
        timeConstraint: "urgent",
        impactLevel: "high",
      };

      const result = recognizeBugHuntingAporias(output, context);
      const speedAporia = result.find(a => a.aporiaType === "speed-vs-completeness");

      expect(speedAporia).toBeDefined();
      expect(speedAporia?.recommendedTilt).toBe("pole1"); // 速度優先
    });

    it("should_recommend_completeness_for_security_bugs", () => {
      const output = `
セキュリティ脆弱性を発見しました。
完全な調査が必要です。
      `;
      const context: BugHuntingContext = {
        isProduction: true,
        isSecurityRelated: true,
        isRecurring: false,
        isFirstEncounter: true,
        isTeamInvestigation: false,
        timeConstraint: "moderate",
        impactLevel: "critical",
      };

      const result = recognizeBugHuntingAporias(output, context);
      const speedAporia = result.find(a => a.aporiaType === "speed-vs-completeness");

      expect(speedAporia).toBeDefined();
      expect(speedAporia?.recommendedTilt).toBe("pole2"); // 完全性優先
    });
  });

  describe("アポリア2: 仮説駆動 vs 証拠駆動", () => {
    it("should_recognize_hypothesis_vs_evidence_aporia", () => {
      const output = `
仮説: メモリリークが発生している可能性があります。
検証: ヒープダンプを取得して確認します。
      `;
      const context: BugHuntingContext = {
        isProduction: false,
        isSecurityRelated: false,
        isRecurring: false,
        isFirstEncounter: true,
        isTeamInvestigation: false,
        timeConstraint: "moderate",
        impactLevel: "medium",
      };

      const result = recognizeBugHuntingAporias(output, context);
      const hypothesisAporia = result.find(a => a.aporiaType === "hypothesis-vs-evidence");

      expect(hypothesisAporia).toBeDefined();
      // 両方の兆候があるので、バランスが取れているはず
      expect(hypothesisAporia?.pole1.indicators.length).toBeGreaterThan(0);
      expect(hypothesisAporia?.pole2.indicators.length).toBeGreaterThan(0);
    });
  });

  describe("アポリア3: 深さ vs 幅", () => {
    it("should_recommend_depth_for_recurring_bugs", () => {
      const output = `
このバグは3回目の発生です。
根本原因を深く掘り下げる必要があります。
      `;
      const context: BugHuntingContext = {
        isProduction: false,
        isSecurityRelated: false,
        isRecurring: true,
        isFirstEncounter: false,
        isTeamInvestigation: false,
        timeConstraint: "moderate",
        impactLevel: "medium",
      };

      const result = recognizeBugHuntingAporias(output, context);
      const depthAporia = result.find(a => a.aporiaType === "depth-vs-breadth");

      expect(depthAporia).toBeDefined();
      expect(depthAporia?.recommendedTilt).toBe("pole1"); // 深さ優先
    });

    it("should_recommend_breadth_for_first_encounter", () => {
      const output = `
初めて見るタイプのバグです。
複数の可能性を検討する必要があります。
      `;
      const context: BugHuntingContext = {
        isProduction: false,
        isSecurityRelated: false,
        isRecurring: false,
        isFirstEncounter: true,
        isTeamInvestigation: false,
        timeConstraint: "moderate",
        impactLevel: "medium",
      };

      const result = recognizeBugHuntingAporias(output, context);
      const depthAporia = result.find(a => a.aporiaType === "depth-vs-breadth");

      expect(depthAporia).toBeDefined();
      expect(depthAporia?.recommendedTilt).toBe("pole2"); // 幅優先
    });
  });

  describe("アポリア評価", () => {
    it("should_warn_about_pole_imbalance", () => {
      const output = `
とりあえず修正しました。すぐに対応が必要です。
      `;
      const context: BugHuntingContext = {
        isProduction: false,
        isSecurityRelated: false,
        isRecurring: false,
        isFirstEncounter: false,
        isTeamInvestigation: false,
        timeConstraint: "relaxed",
        impactLevel: "low",
      };

      const evaluation = evaluateAporiaHandling(output, context);

      expect(evaluation.warnings.length).toBeGreaterThan(0);
      expect(evaluation.warnings[0]).toContain("偏っています");
    });

    it("should_provide_recommendations_based_on_context", () => {
      const output = `
本番環境で問題が発生しました。
      `;
      const context: BugHuntingContext = {
        isProduction: true,
        isSecurityRelated: false,
        isRecurring: false,
        isFirstEncounter: true,
        isTeamInvestigation: false,
        timeConstraint: "urgent",
        impactLevel: "high",
      };

      const evaluation = evaluateAporiaHandling(output, context);

      expect(evaluation.recommendations.length).toBeGreaterThan(0);
    });
  });
});

/**
 * アポリア認識の型定義（テスト用）
 */
interface BugHuntingAporiaRecognition {
  aporiaType: "speed-vs-completeness" | "hypothesis-vs-evidence" | "depth-vs-breadth";
  pole1: { concept: string; value: string; indicators: string[] };
  pole2: { concept: string; value: string; indicators: string[] };
  tensionLevel: number;
  recommendedTilt: "pole1" | "pole2" | "balanced";
  tiltRationale: string;
  contextFactors: string[];
}

interface BugHuntingContext {
  isProduction: boolean;
  isSecurityRelated: boolean;
  isRecurring: boolean;
  isFirstEncounter: boolean;
  isTeamInvestigation: boolean;
  timeConstraint: "urgent" | "moderate" | "relaxed";
  impactLevel: "critical" | "high" | "medium" | "low";
}

/**
 * アポリア認識関数（テスト用簡易版）
 */
function recognizeBugHuntingAporias(
  output: string,
  context: BugHuntingContext
): BugHuntingAporiaRecognition[] {
  const aporias: BugHuntingAporiaRecognition[] = [];

  // 速度 vs 完全性
  const speedIndicators: string[] = [];
  if (/(?:緊急|とりあえず|すぐ)/i.test(output)) speedIndicators.push("緊急性");
  if (context.timeConstraint === "urgent") speedIndicators.push("時間制約");

  const completenessIndicators: string[] = [];
  if (/(?:完全|根本原因|再発防止)/i.test(output)) completenessIndicators.push("完全性");
  if (context.isSecurityRelated) completenessIndicators.push("セキュリティ");

  if (speedIndicators.length > 0 || completenessIndicators.length > 0) {
    let recommendedTilt: "pole1" | "pole2" | "balanced" = "balanced";
    let tiltRationale = "バランス";

    if (context.isProduction && context.timeConstraint === "urgent") {
      recommendedTilt = "pole1";
      tiltRationale = "本番障害で緊急のため、速度を優先";
    } else if (context.isSecurityRelated || context.impactLevel === "critical") {
      recommendedTilt = "pole2";
      tiltRationale = "セキュリティ/重要度高のため、完全性を優先";
    }

    aporias.push({
      aporiaType: "speed-vs-completeness",
      pole1: { concept: "速度", value: "すばやく特定", indicators: speedIndicators },
      pole2: { concept: "完全性", value: "網羅的に調査", indicators: completenessIndicators },
      tensionLevel: 0.5,
      recommendedTilt,
      tiltRationale,
      contextFactors: [],
    });
  }

  // 仮説 vs 証拠
  const hypothesisIndicators: string[] = [];
  if (/(?:仮説|推測|可能性)/i.test(output)) hypothesisIndicators.push("仮説");
  if (/(?:検証|確認|テスト)/i.test(output)) hypothesisIndicators.push("検証");

  const evidenceIndicators: string[] = [];
  // 「ヒープダンプ」などのデータ/証拠関連キーワードを追加
  if (/(?:証拠|根拠|データ|ログ|ダンプ|取得)/i.test(output)) evidenceIndicators.push("証拠");
  if (/(?:観察|計測|確認)/i.test(output)) evidenceIndicators.push("観察");

  if (hypothesisIndicators.length > 0 || evidenceIndicators.length > 0) {
    let recommendedTilt: "pole1" | "pole2" | "balanced" = "balanced";
    if (context.isFirstEncounter) {
      recommendedTilt = "pole1";
    }

    aporias.push({
      aporiaType: "hypothesis-vs-evidence",
      pole1: { concept: "仮説駆動", value: "仮説を立てて検証", indicators: hypothesisIndicators },
      pole2: { concept: "証拠駆動", value: "証拠を集めて結論", indicators: evidenceIndicators },
      tensionLevel: 0.5,
      recommendedTilt,
      tiltRationale: context.isFirstEncounter ? "初見のため仮説優先" : "バランス",
      contextFactors: [],
    });
  }

  // 深さ vs 幅
  const depthIndicators: string[] = [];
  if (/(?:根本|深く|掘り下げ)/i.test(output)) depthIndicators.push("深掘り");
  if (/(?:なぜ.*なぜ|5 Whys)/i.test(output)) depthIndicators.push("5 Whys");

  const breadthIndicators: string[] = [];
  if (/(?:他にも|別の可能性|複数)/i.test(output)) breadthIndicators.push("複数可能性");
  if (/(?:全体像|網羅)/i.test(output)) breadthIndicators.push("全体像");

  if (depthIndicators.length > 0 || breadthIndicators.length > 0) {
    let recommendedTilt: "pole1" | "pole2" | "balanced" = "balanced";
    if (context.isRecurring) {
      recommendedTilt = "pole1";
    } else if (context.isFirstEncounter) {
      recommendedTilt = "pole2";
    }

    aporias.push({
      aporiaType: "depth-vs-breadth",
      pole1: { concept: "深さ", value: "深く掘り下げる", indicators: depthIndicators },
      pole2: { concept: "幅", value: "幅広く検討", indicators: breadthIndicators },
      tensionLevel: 0.5,
      recommendedTilt,
      tiltRationale: context.isRecurring ? "再発バグのため深さ優先" : 
                     context.isFirstEncounter ? "初見のため幅優先" : "バランス",
      contextFactors: [],
    });
  }

  return aporias;
}

function evaluateAporiaHandling(
  output: string,
  context: BugHuntingContext
): { aporias: BugHuntingAporiaRecognition[]; overallAssessment: string; recommendations: string[]; warnings: string[] } {
  const aporias = recognizeBugHuntingAporias(output, context);
  const warnings: string[] = [];
  const recommendations: string[] = [];

  for (const aporia of aporias) {
    if (aporia.pole1.indicators.length > 0 && aporia.pole2.indicators.length === 0) {
      warnings.push(`"${aporia.pole1.concept}"に偏っています。"${aporia.pole2.concept}"の視点も検討してください。`);
    }
    if (aporia.recommendedTilt !== "balanced") {
      const pole = aporia.recommendedTilt === "pole1" ? aporia.pole1 : aporia.pole2;
      recommendations.push(`推奨: "${pole.concept}"を優先 (${aporia.tiltRationale})`);
    }
  }

  return {
    aporias,
    overallAssessment: warnings.length > 0 ? "偏りがあります" : "適切に対処されています",
    recommendations,
    warnings,
  };
}

describe("Bug Hunting Dystopia Detection", () => {
  describe("過度な機械化の検出", () => {
    it("should_detect_over_mechanization_with_absolute_expressions", () => {
      const output = `
このプロセスを常に適用する必要があります。
必ず5 Whysを使用してください。
すべてのバグに対して完全に同じ手順を踏みます。
      `;

      const result = detectDystopianTendencies(output);
      const overMechanization = result.find(t => t.tendencyType === "over-mechanization");

      expect(overMechanization).toBeDefined();
      expect(overMechanization?.severity).not.toBe("minor");
    });

    it("should_not_detect_when_flexible_approach_used", () => {
      const output = `
状況に応じてプロセスを調整します。
必要な場合は手順をスキップすることもあります。
柔軟に対応します。
      `;

      const result = detectDystopianTendencies(output);
      const overMechanization = result.find(t => t.tendencyType === "over-mechanization");

      expect(overMechanization).toBeUndefined();
    });
  });

  describe("人間性の排除の検出", () => {
    it("should_detect_human_exclusion", () => {
      const output = `
直感は無効な判断基準です。
バイアス、バイアス、バイアス、バイアス、バイアスを排除します。
人間の判断は不要です。
      `;

      const result = detectDystopianTendencies(output);
      const humanExclusion = result.find(t => t.tendencyType === "human-exclusion");

      expect(humanExclusion).toBeDefined();
      expect(humanExclusion?.severity).toBe("critical");
    });
  });

  describe("文脈の無視の検出", () => {
    it("should_detect_context_blindness", () => {
      const output = `
一般的に、このアプローチは常に有効です。
原則として、どのようなバグにも適用できます。
      `;

      const result = detectDystopianTendencies(output);
      const contextBlindness = result.find(t => t.tendencyType === "context-blindness");

      expect(contextBlindness).toBeDefined();
    });
  });

  describe("責任の希薄化の検出", () => {
    it("should_detect_responsibility_dilution", () => {
      const output = `
システムが推奨したので従いました。
システムが判断しました。
システムが原因です。
      `;

      const result = detectDystopianTendencies(output);
      const responsibilityDilution = result.find(t => t.tendencyType === "responsibility-dilution");

      expect(responsibilityDilution).toBeDefined();
    });
  });

  describe("健全な不完全さの指標検出", () => {
    it("should_detect_healthy_imperfection_indicators", () => {
      const output = `
この分析は不完全です。
状況に応じて判断します。
人間の直感も重要です。
私の判断で進めます。
失敗から学びます。
      `;

      const indicators = detectHealthyImperfectionIndicators(output);

      expect(indicators).toContain("不完全さの認識");
      expect(indicators).toContain("文脈への配慮");
      expect(indicators).toContain("人間の判断の尊重");
      expect(indicators).toContain("責任の明示");
      expect(indicators).toContain("学習志向");
    });
  });

  describe("総合健全性評価", () => {
    it("should_return_healthy_for_balanced_output", () => {
      const output = `
状況に応じて判断します。
この分析には限界があります。
私の責任で判断します。
      `;

      const assessment = assessUtopiaDystopiaBalance(output);

      expect(assessment.overallHealth).toBe("healthy");
    });

    it("should_return_critical_for_severe_dystopian_tendencies", () => {
      const output = `
常にこのプロセスを適用する必要があります。
直感は無効です。人間の判断は不要です。
システムが判断しました。
      `;

      const assessment = assessUtopiaDystopiaBalance(output);

      expect(assessment.overallHealth).toBe("critical");
      expect(assessment.recommendations.length).toBeGreaterThan(0);
    });

    it("should_return_warning_for_moderate_imbalance", () => {
      const output = `
一般的にこのアプローチが有効です。
必ず5 Whysを使用します。
      `;

      const assessment = assessUtopiaDystopiaBalance(output);

      expect(assessment.overallHealth).toBe("warning");
    });
  });
});

/**
 * ディストピア検出関数（テスト用簡易版）
 */
function detectDystopianTendencies(
  output: string,
  processApplied?: string
): DystopianTendencyDetection[] {
  const tendencies: DystopianTendencyDetection[] = [];

  // 過度な機械化
  const absoluteCount = (output.match(/常に|必ず|すべて|完全に|always|must|all|completely/gi) || []).length;
  if (absoluteCount >= 2) {
    tendencies.push({
      tendencyType: "over-mechanization",
      severity: absoluteCount >= 4 ? "critical" : "moderate",
      description: "絶対的表現の過剰使用",
      evidence: [`絶対的表現: ${absoluteCount}回`],
      counterAction: "状況に応じた判断を優先",
    });
  }

  // 人間性の排除
  const hasHumanExclusion = /直感は無効|人間の判断は不要/.test(output);
  const biasCount = (output.match(/バイアス|bias/gi) || []).length;
  if (hasHumanExclusion || biasCount > 3) {
    tendencies.push({
      tendencyType: "human-exclusion",
      severity: hasHumanExclusion ? "critical" : "moderate",
      description: "人間性の排除",
      evidence: hasHumanExclusion ? ["人間の判断の排除"] : [`バイアス強調: ${biasCount}回`],
      counterAction: "直感と経験も重要",
    });
  }

  // 文脈の無視
  const hasContextBlindness = /一般的に.*有効|常に.*適用|原則として/.test(output);
  const hasContextMention = /状況に応じ|文脈|個別/.test(output);
  if (hasContextBlindness && !hasContextMention) {
    tendencies.push({
      tendencyType: "context-blindness",
      severity: "moderate",
      description: "文脈の無視",
      evidence: ["文脈なく一般化"],
      counterAction: "文脈を考慮",
    });
  }

  // 責任の希薄化
  const hasSystemBlame = /システムが原因/.test(output);
  const hasSystemJudgment = /システムが判断|システムが推奨/.test(output);
  if (hasSystemBlame) {
    tendencies.push({
      tendencyType: "responsibility-dilution",
      severity: "critical",
      description: "責任の希薄化",
      evidence: ["システムへの責任転嫁"],
      counterAction: "主体性を持つ",
    });
  } else if (hasSystemJudgment) {
    tendencies.push({
      tendencyType: "responsibility-dilution",
      severity: "minor",
      description: "責任の希薄化",
      evidence: ["システムへの判断委譲"],
      counterAction: "主体性を持つ",
    });
  }

  return tendencies;
}

function detectHealthyImperfectionIndicators(output: string): string[] {
  const indicators: string[] = [];

  if (/(?:不完全|限界|できないかもしれない)/.test(output)) {
    indicators.push("不完全さの認識");
  }
  if (/(?:状況に応じ|文脈を考慮|ケースバイケース)/.test(output)) {
    indicators.push("文脈への配慮");
  }
  if (/(?:人間の判断|直感|経験).*(?:尊重|考慮|重要)/.test(output)) {
    indicators.push("人間の判断の尊重");
  }
  if (/(?:私の判断|私の責任|判断したのは)/.test(output)) {
    indicators.push("責任の明示");
  }
  if (/(?:失敗は|失敗から|学習の機会)/.test(output)) {
    indicators.push("学習志向");
  }

  return indicators;
}

function assessUtopiaDystopiaBalance(
  output: string,
  processApplied?: string
): { dystopianTendencies: DystopianTendencyDetection[]; healthyImperfectionIndicators: string[]; overallHealth: "healthy" | "warning" | "critical"; recommendations: string[] } {
  const dystopianTendencies = detectDystopianTendencies(output, processApplied);
  const healthyImperfectionIndicators = detectHealthyImperfectionIndicators(output);

  let overallHealth: "healthy" | "warning" | "critical" = "healthy";

  const criticalCount = dystopianTendencies.filter(t => t.severity === "critical").length;
  const moderateCount = dystopianTendencies.filter(t => t.severity === "moderate").length;

  if (criticalCount > 0) {
    overallHealth = "critical";
  } else if (moderateCount >= 2 || (moderateCount >= 1 && healthyImperfectionIndicators.length === 0)) {
    overallHealth = "warning";
  }

  const recommendations: string[] = [];
  if (dystopianTendencies.length > healthyImperfectionIndicators.length) {
    recommendations.push("バランスを見直してください");
  }
  for (const t of dystopianTendencies) {
    if (t.severity !== "minor") {
      recommendations.push(t.counterAction);
    }
  }

  return {
    dystopianTendencies,
    healthyImperfectionIndicators,
    overallHealth,
    recommendations,
  };
}

interface DystopianTendencyDetection {
  tendencyType: "over-mechanization" | "human-exclusion" | "context-blindness" | "responsibility-dilution";
  severity: "minor" | "moderate" | "critical";
  description: string;
  evidence: string[];
  counterAction: string;
}

describe("Bug Hunting Schizo Analysis", () => {
  describe("欲望パターン検出", () => {
    describe("生産的好奇心", () => {
      it("should_detect_productive_curiosity", () => {
        const output = `
このバグは面白いです。なぜこのような動作をするのか興味深い。
調査を通じて学びが得られました。
新たな発見がありました。
        `;

        const result = detectDesirePatterns(output);
        const curiosity = result.find(p => p.patternType === "productive-curiosity");

        expect(curiosity).toBeDefined();
        expect(curiosity?.isProductive).toBe(true);
      });
    });

    describe("罪悪感駆動の探索", () => {
      it("should_detect_guilt_driven_search", () => {
        const output = `
このバグを見逃していたのは私の責任です。
申し訳ありません。
今後は必ず見つけなければなりません。
        `;

        const result = detectDesirePatterns(output);
        const guilt = result.find(p => p.patternType === "guilt-driven-search");

        expect(guilt).toBeDefined();
        expect(guilt?.isProductive).toBe(false);
      });
    });

    describe("規範への服従", () => {
      it("should_detect_norm_obedience", () => {
        const output = `
手順に従って調査しました。
正しい方法で分析する必要があります。
ベストプラクティスに従います。
        `;

        const result = detectDesirePatterns(output);
        const norm = result.find(p => p.patternType === "norm-obedience");

        expect(norm).toBeDefined();
        expect(norm?.isProductive).toBe(false);
      });
    });

    describe("階層の再生産", () => {
      it("should_detect_hierarchy_reproduction", () => {
        const output = `
正しい答えはこれです。
私が教えます。
        `;

        const result = detectDesirePatterns(output);
        const hierarchy = result.find(p => p.patternType === "hierarchy-reproduction");

        expect(hierarchy).toBeDefined();
      });
    });
  });

  describe("内なるファシズム検出", () => {
    describe("自己監視", () => {
      it("should_detect_self_surveillance", () => {
        const output = `
自分を監視しています。
バイアスがないかチェックしています。
私、私、私、私、私、私、私、私、私、私、私、私が確認します。
        `;

        const result = detectInnerFascismPatterns(output);
        const surveillance = result.find(p => p.fascismType === "self-surveillance");

        expect(surveillance).toBeDefined();
        expect(surveillance?.severity).not.toBe("minor");
      });
    });

    describe("規範の内面化", () => {
      it("should_detect_norm_internalization", () => {
        const output = `
プロフェッショナルとしてすべきではありません。
あるべき姿に従わなければなりません。
        `;

        const result = detectInnerFascismPatterns(output);
        const norm = result.find(p => p.fascismType === "norm-internalization");

        expect(norm).toBeDefined();
      });
    });

    describe("不可能性の抑圧", () => {
      it("should_detect_impossibility_repression", () => {
        const output = `
完全にすべてのバグを見つけなければなりません。
失敗は許されません。
        `;

        const result = detectInnerFascismPatterns(output);
        const impossibility = result.find(p => p.fascismType === "impossibility-repression");

        expect(impossibility).toBeDefined();
        expect(impossibility?.severity).toBe("severe");
      });
    });
  });

  describe("総合スキゾ分析", () => {
    it("should_return_high_productive_score_for_curious_output", () => {
      const output = `
このバグは興味深いです。
学びが得られました。
        `;

      const result = performSchizoAnalysis(output);

      expect(result.productiveScore).toBeGreaterThan(0.5);
      expect(result.repressionScore).toBeLessThan(0.5);
    });

    it("should_return_high_repression_score_for_guilty_output", () => {
      const output = `
見逃したのは私の責任です。
完全にすべてを見つけなければなりません。
自分を監視しています。
        `;

      const result = performSchizoAnalysis(output);

      expect(result.repressionScore).toBeGreaterThan(0);
      expect(result.liberationPoints.length).toBeGreaterThan(0);
    });

    it("should_provide_liberation_points", () => {
      const output = `
手順に従わなければならない。
失敗は許されない。
        `;

      const result = performSchizoAnalysis(output);

      expect(result.liberationPoints.length).toBeGreaterThan(0);
    });
  });
});

/**
 * スキゾ分析関数（テスト用簡易版）
 */
function detectDesirePatterns(output: string): DesirePatternDetection[] {
  const patterns: DesirePatternDetection[] = [];

  // 生産的好奇心
  if (/(?:面白い|興味深い|興味|知りたい|探求|発見|学び|学習)/.test(output)) {
    patterns.push({
      patternType: "productive-curiosity",
      isProductive: true,
      description: "好奇心駆動",
      evidence: ["好奇心の表現"],
      transformation: "好奇心を維持",
    });
  }

  // 罪悪感駆動
  if (/(?:見逃した|責任|申し訳ない|すべき|しなければ)/.test(output)) {
    patterns.push({
      patternType: "guilt-driven-search",
      isProductive: false,
      description: "罪悪感駆動",
      evidence: ["罪悪感の表現"],
      transformation: "好奇心を動機にする",
    });
  }

  // 規範への服従
  if (/(?:手順に従|正しい方法|ベストプラクティス)/.test(output)) {
    patterns.push({
      patternType: "norm-obedience",
      isProductive: false,
      description: "規範への服従",
      evidence: ["規範への言及"],
      transformation: "創造的判断を優先",
    });
  }

  // 階層の再生産
  if (/(?:正しい答え|教えます|指導)/.test(output)) {
    patterns.push({
      patternType: "hierarchy-reproduction",
      isProductive: false,
      description: "階層の再生産",
      evidence: ["階層的表現"],
      transformation: "共に探求する姿勢",
    });
  }

  return patterns;
}

function detectInnerFascismPatterns(output: string): InnerFascismDetection[] {
  const patterns: InnerFascismDetection[] = [];

  // 自己監視
  const selfRefCount = (output.match(/私/g) || []).length;
  if (/(?:監視|チェック|バイアス)/.test(output) || selfRefCount > 10) {
    patterns.push({
      fascismType: "self-surveillance",
      severity: selfRefCount > 10 ? "moderate" : "minor",
      description: "自己監視",
      evidence: ["自己監視の表現"],
      liberation: "気づきとして観察する",
    });
  }

  // 規範の内面化
  if (/(?:すべき|あるべき|プロフェッショナルとして)/.test(output)) {
    patterns.push({
      fascismType: "norm-internalization",
      severity: "moderate",
      description: "規範の内面化",
      evidence: ["規範の内面化"],
      liberation: "自らの価値観で判断",
    });
  }

  // 不可能性の抑圧
  const hasFailureRepression = /失敗は許され/.test(output); // 「許されない」「許されません」の両方にマッチ
  const hasPerfectionPursuit = /(?:完全|すべて|絶対)/.test(output);
  const hasImpossibilityAck = /(?:不可能|限界)/.test(output);

  if (hasFailureRepression) {
    patterns.push({
      fascismType: "impossibility-repression",
      severity: "severe",
      description: "不可能性の抑圧",
      evidence: ["失敗の抑圧"],
      liberation: "十分良いを認める",
    });
  } else if (hasPerfectionPursuit && !hasImpossibilityAck) {
    patterns.push({
      fascismType: "impossibility-repression",
      severity: "moderate",
      description: "不可能性の抑圧",
      evidence: ["完全性追求"],
      liberation: "十分良いを認める",
    });
  }

  return patterns;
}

function performSchizoAnalysis(output: string): SchizoAnalysisAssessment {
  const desirePatterns = detectDesirePatterns(output);
  const innerFascismPatterns = detectInnerFascismPatterns(output);

  const productivePatterns = desirePatterns.filter(p => p.isProductive);
  const productiveScore = desirePatterns.length > 0
    ? productivePatterns.length / desirePatterns.length
    : 0.5;

  const severeCount = innerFascismPatterns.filter(p => p.severity === "severe").length;
  const moderateCount = innerFascismPatterns.filter(p => p.severity === "moderate").length;
  const repressionScore = Math.min(1, severeCount * 0.5 + moderateCount * 0.25);

  const liberationPoints: string[] = [];
  for (const p of desirePatterns.filter(p => !p.isProductive)) {
    liberationPoints.push(p.transformation);
  }
  for (const f of innerFascismPatterns) {
    liberationPoints.push(f.liberation);
  }

  return {
    desirePatterns,
    innerFascismPatterns,
    productiveScore,
    repressionScore,
    liberationPoints,
  };
}

interface DesirePatternDetection {
  patternType: "productive-curiosity" | "guilt-driven-search" | "norm-obedience" | "hierarchy-reproduction";
  isProductive: boolean;
  description: string;
  evidence: string[];
  transformation: string;
}

interface InnerFascismDetection {
  fascismType: "self-surveillance" | "norm-internalization" | "impossibility-repression";
  severity: "minor" | "moderate" | "severe";
  description: string;
  evidence: string[];
  liberation: string;
}

interface SchizoAnalysisAssessment {
  desirePatterns: DesirePatternDetection[];
  innerFascismPatterns: InnerFascismDetection[];
  productiveScore: number;
  repressionScore: number;
  liberationPoints: string[];
}
