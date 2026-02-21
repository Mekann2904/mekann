/**
 * execution-rules.ts 単体テスト
 * カバレッジ分析: COMMON_EXECUTION_RULES, SUBAGENT_SPECIFIC_RULES,
 * buildExecutionRulesSection, getSubagentExecutionRules,
 * getTeamMemberExecutionRules, getChallengerExecutionRules,
 * getInspectorExecutionRules, getVerificationWorkflowExecutionRules
 */
import {
  describe,
  it,
  expect,
} from "vitest";
import {
  COMMON_EXECUTION_RULES,
  SUBAGENT_SPECIFIC_RULES,
  COGNITIVE_BIAS_COUNTERMEASURES,
  SELF_VERIFICATION_RULES,
  WORKING_MEMORY_GUIDELINES,
  TERMINATION_CHECK_RULES,
  COMPOSITIONAL_INFERENCE_RULES,
  CHALLENGE_RULES,
  INSPECTION_RULES,
  VERIFICATION_WORKFLOW_RULES,
  TEAM_MEMBER_SPECIFIC_RULES,
  COMMUNICATION_PHASE_RULES,
  DISCUSSION_RULES,
  AUTONOMY_GUIDELINES,
  NO_SHORTCUTS_GUIDELINES,
  QUESTION_TOOL_GUIDELINES,
  buildExecutionRulesSection,
  getSubagentExecutionRules,
  getTeamMemberExecutionRules,
  getChallengerExecutionRules,
  getInspectorExecutionRules,
  getVerificationWorkflowExecutionRules,
} from "../../../.pi/lib/execution-rules.js";

// ============================================================================
// 定数テスト
// ============================================================================

describe("定数テスト", () => {
  // ==========================================================================
  // COMMON_EXECUTION_RULES
  // ==========================================================================

  describe("COMMON_EXECUTION_RULES", () => {
    it("COMMON_EXECUTION_RULES_配列形式", () => {
      // Assert
      expect(Array.isArray(COMMON_EXECUTION_RULES)).toBe(true);
      expect(COMMON_EXECUTION_RULES.length).toBeGreaterThan(0);
    });

    it("COMMON_EXECUTION_RULES_絵文字禁止ルール含む", () => {
      // Assert
      expect(
        COMMON_EXECUTION_RULES.some((rule) => rule.includes("emoji") || rule.includes("絵文字"))
      ).toBe(true);
    });

    it("COMMON_EXECUTION_RULES_questionツールルール含む", () => {
      // Assert
      expect(
        COMMON_EXECUTION_RULES.some((rule) => rule.includes("question"))
      ).toBe(true);
    });

    it("COMMON_EXECUTION_RULES_as const_読み取り専用", () => {
      // TypeScriptの型チェックレベルで保証されるが、
      // 実行時に配列であることを確認
      expect(() => {
        const rules = [...COMMON_EXECUTION_RULES];
        rules.push("test");
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // SUBAGENT_SPECIFIC_RULES
  // ==========================================================================

  describe("SUBAGENT_SPECIFIC_RULES", () => {
    it("SUBAGENT_SPECIFIC_RULES_配列形式", () => {
      // Assert
      expect(Array.isArray(SUBAGENT_SPECIFIC_RULES)).toBe(true);
    });

    it("SUBAGENT_SPECIFIC_RULES_ファイルパス指定ルール含む", () => {
      // Assert
      expect(
        SUBAGENT_SPECIFIC_RULES.some((rule) => rule.includes("ファイルパス"))
      ).toBe(true);
    });
  });

  // ==========================================================================
  // COGNITIVE_BIAS_COUNTERMEASURES
  // ==========================================================================

  describe("COGNITIVE_BIAS_COUNTERMEASURES", () => {
    it("COGNITIVE_BIAS_COUNTERMEASURES_文字列形式", () => {
      // Assert
      expect(typeof COGNITIVE_BIAS_COUNTERMEASURES).toBe("string");
    });

    it("COGNITIVE_BIAS_COUNTERMEASURES_確認バイアス含む", () => {
      // Assert
      expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("Confirmation Bias");
    });

    it("COGNITIVE_BIAS_COUNTERMEASURES_アンカリング効果含む", () => {
      // Assert
      expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("Anchoring Bias");
    });

    it("COGNITIVE_BIAS_COUNTERMEASURES_フレーミング効果含む", () => {
      // Assert
      expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("Framing Effect");
    });

    it("COGNITIVE_BIAS_COUNTERMEASURES_5つのバイアス対策含む", () => {
      // Assert
      expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("1.");
      expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("2.");
      expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("3.");
      expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("4.");
      expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("5.");
    });
  });

  // ==========================================================================
  // SELF_VERIFICATION_RULES
  // ==========================================================================

  describe("SELF_VERIFICATION_RULES", () => {
    it("SELF_VERIFICATION_RULES_文字列形式", () => {
      // Assert
      expect(typeof SELF_VERIFICATION_RULES).toBe("string");
    });

    it("SELF_VERIFICATION_RULES_自己矛盾チェック含む", () => {
      // Assert
      expect(SELF_VERIFICATION_RULES).toContain("自己矛盾");
    });

    it("SELF_VERIFICATION_RULES_証拠評価含む", () => {
      // Assert
      expect(SELF_VERIFICATION_RULES).toContain("証拠");
    });

    it("SELF_VERIFICATION_RULES_4つのチェックリスト含む", () => {
      // Assert
      expect(SELF_VERIFICATION_RULES).toContain("1.");
      expect(SELF_VERIFICATION_RULES).toContain("2.");
      expect(SELF_VERIFICATION_RULES).toContain("3.");
      expect(SELF_VERIFICATION_RULES).toContain("4.");
    });
  });

  // ==========================================================================
  // WORKING_MEMORY_GUIDELINES
  // ==========================================================================

  describe("WORKING_MEMORY_GUIDELINES", () => {
    it("WORKING_MEMORY_GUIDELINES_文字列形式", () => {
      // Assert
      expect(typeof WORKING_MEMORY_GUIDELINES).toBe("string");
    });

    it("WORKING_MEMORY_GUIDELINES_状態要約含む", () => {
      // Assert
      expect(WORKING_MEMORY_GUIDELINES).toContain("状態要約");
    });

    it("WORKING_MEMORY_GUIDELINES_CARRIED_FORWARD含む", () => {
      // Assert
      expect(WORKING_MEMORY_GUIDELINES).toContain("CARRIED_FORWARD");
    });
  });

  // ==========================================================================
  // TERMINATION_CHECK_RULES
  // ==========================================================================

  describe("TERMINATION_CHECK_RULES", () => {
    it("TERMINATION_CHECK_RULES_文字列形式", () => {
      // Assert
      expect(typeof TERMINATION_CHECK_RULES).toBe("string");
    });

    it("TERMINATION_CHECK_RULES_完了基準含む", () => {
      // Assert
      expect(TERMINATION_CHECK_RULES).toContain("完了基準");
    });

    it("TERMINATION_CHECK_RULES_CONFIDENCE含む", () => {
      // Assert
      expect(TERMINATION_CHECK_RULES).toContain("CONFIDENCE");
    });
  });

  // ==========================================================================
  // CHALLENGE_RULES
  // ==========================================================================

  describe("CHALLENGE_RULES", () => {
    it("CHALLENGE_RULES_文字列形式", () => {
      // Assert
      expect(typeof CHALLENGE_RULES).toBe("string");
    });

    it("CHALLENGE_RULES_欠陥指摘含む", () => {
      // Assert
      expect(CHALLENGE_RULES).toContain("欠陥");
    });

    it("CHALLENGE_RULES_CHALLENGED_CLAIM含む", () => {
      // Assert
      expect(CHALLENGE_RULES).toContain("CHALLENGED_CLAIM");
    });

    it("CHALLENGE_RULES_FLAW含む", () => {
      // Assert
      expect(CHALLENGE_RULES).toContain("FLAW");
    });
  });

  // ==========================================================================
  // INSPECTION_RULES
  // ==========================================================================

  describe("INSPECTION_RULES", () => {
    it("INSPECTION_RULES_文字列形式", () => {
      // Assert
      expect(typeof INSPECTION_RULES).toBe("string");
    });

    it("INSPECTION_RULES_CLAIM-RESULT整合性含む", () => {
      // Assert
      expect(INSPECTION_RULES).toContain("CLAIM-RESULT");
    });

    it("INSPECTION_RULES_SUSPICION含む", () => {
      // Assert
      expect(INSPECTION_RULES).toContain("SUSPICION");
    });
  });

  // ==========================================================================
  // TEAM_MEMBER_SPECIFIC_RULES
  // ==========================================================================

  describe("TEAM_MEMBER_SPECIFIC_RULES", () => {
    it("TEAM_MEMBER_SPECIFIC_RULES_配列形式", () => {
      // Assert
      expect(Array.isArray(TEAM_MEMBER_SPECIFIC_RULES)).toBe(true);
    });

    it("TEAM_MEMBER_SPECIFIC_RULES_日本語出力ルール含む", () => {
      // Assert
      expect(
        TEAM_MEMBER_SPECIFIC_RULES.some((rule) => rule.includes("日本語"))
      ).toBe(true);
    });
  });

  // ==========================================================================
  // DISCUSSION_RULES
  // ==========================================================================

  describe("DISCUSSION_RULES", () => {
    it("DISCUSSION_RULES_配列形式", () => {
      // Assert
      expect(Array.isArray(DISCUSSION_RULES)).toBe(true);
    });

    it("DISCUSSION_RULES_同意点/不同意点ルール含む", () => {
      // Assert
      expect(
        DISCUSSION_RULES.some((rule) => rule.includes("同意") || rule.includes("不同意"))
      ).toBe(true);
    });
  });
});

// ============================================================================
// buildExecutionRulesSection テスト
// ============================================================================

describe("buildExecutionRulesSection", () => {
  it("buildExecutionRulesSection_デフォルト_共通ルールのみ", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection();

    // Assert
    expect(result).toContain("実行ルール:");
    expect(result).toContain("絵文字");
  });

  it("buildExecutionRulesSection_forSubagent_サブエージェントルール追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({ forSubagent: true });

    // Assert
    expect(result).toContain("ファイルパス");
  });

  it("buildExecutionRulesSection_forTeam_チームルール追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({ forTeam: true });

    // Assert
    expect(result).toContain("日本語");
  });

  it("buildExecutionRulesSection_phase_communication_フェーズルール追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({ phase: "communication" });

    // Assert
    expect(result).toContain("連携");
  });

  it("buildExecutionRulesSection_includeGuidelines_ガイドライン追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({ includeGuidelines: true });

    // Assert
    expect(result).toContain("自走性");
  });

  it("buildExecutionRulesSection_includeCognitiveBiasCountermeasures_バイアス対策追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({
      includeCognitiveBiasCountermeasures: true,
    });

    // Assert
    expect(result).toContain("Confirmation Bias");
  });

  it("buildExecutionRulesSection_includeSelfVerification_検証ルール追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({
      includeSelfVerification: true,
    });

    // Assert
    expect(result).toContain("自己検証");
  });

  it("buildExecutionRulesSection_includeWorkingMemoryGuidelines_作業記憶追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({
      includeWorkingMemoryGuidelines: true,
    });

    // Assert
    expect(result).toContain("作業記憶");
  });

  it("buildExecutionRulesSection_includeTerminationCheck_終了チェック追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({
      includeTerminationCheck: true,
    });

    // Assert
    expect(result).toContain("終了チェック");
  });

  it("buildExecutionRulesSection_includeChallengeRules_異議ルール追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({
      includeChallengeRules: true,
    });

    // Assert
    expect(result).toContain("異議");
  });

  it("buildExecutionRulesSection_includeInspectionRules_検査ルール追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({
      includeInspectionRules: true,
    });

    // Assert
    expect(result).toContain("検査");
  });

  it("buildExecutionRulesSection_複数オプション_全て追加", () => {
    // Arrange & Act
    const result = buildExecutionRulesSection({
      forSubagent: true,
      includeCognitiveBiasCountermeasures: true,
      includeSelfVerification: true,
    });

    // Assert
    expect(result).toContain("ファイルパス");
    expect(result).toContain("Confirmation Bias");
    expect(result).toContain("自己検証");
  });

  it("buildExecutionRulesSection_キャッシュ_同一結果返却", () => {
    // Arrange & Act
    const result1 = buildExecutionRulesSection({ forSubagent: true });
    const result2 = buildExecutionRulesSection({ forSubagent: true });

    // Assert
    expect(result1).toBe(result2);
  });
});

// ============================================================================
// getSubagentExecutionRules テスト
// ============================================================================

describe("getSubagentExecutionRules", () => {
  it("getSubagentExecutionRules_基本_サブエージェントルール返却", () => {
    // Arrange & Act
    const result = getSubagentExecutionRules();

    // Assert
    expect(result).toContain("実行ルール:");
    expect(result).toContain("ファイルパス");
  });

  it("getSubagentExecutionRules_includeGuidelines_ガイドライン追加", () => {
    // Arrange & Act
    const result = getSubagentExecutionRules(true);

    // Assert
    expect(result).toContain("自走性");
  });

  it("getSubagentExecutionRules_キャッシュ_同一結果返却", () => {
    // Arrange & Act
    const result1 = getSubagentExecutionRules();
    const result2 = getSubagentExecutionRules();

    // Assert
    expect(result1).toBe(result2);
  });
});

// ============================================================================
// getTeamMemberExecutionRules テスト
// ============================================================================

describe("getTeamMemberExecutionRules", () => {
  it("getTeamMemberExecutionRules_基本_チームルール返却", () => {
    // Arrange & Act
    const result = getTeamMemberExecutionRules();

    // Assert
    expect(result).toContain("日本語");
    expect(result).toContain("連携");
  });

  it("getTeamMemberExecutionRules_phase_communication_コミュニケーションフェーズ追加", () => {
    // Arrange & Act
    const result = getTeamMemberExecutionRules("communication");

    // Assert
    expect(result).toContain("連携コンテキスト");
  });

  it("getTeamMemberExecutionRules_includeGuidelines_ガイドライン追加", () => {
    // Arrange & Act
    const result = getTeamMemberExecutionRules("initial", true);

    // Assert
    expect(result).toContain("自走性");
  });

  it("getTeamMemberExecutionRules_キャッシュ_同一結果返却", () => {
    // Arrange & Act
    const result1 = getTeamMemberExecutionRules("initial", false);
    const result2 = getTeamMemberExecutionRules("initial", false);

    // Assert
    expect(result1).toBe(result2);
  });
});

// ============================================================================
// getChallengerExecutionRules テスト
// ============================================================================

describe("getChallengerExecutionRules", () => {
  it("getChallengerExecutionRules_基本_チャレンジャールール返却", () => {
    // Arrange & Act
    const result = getChallengerExecutionRules();

    // Assert
    expect(result).toContain("異議");
  });

  it("getChallengerExecutionRules_includeGuidelines_ガイドライン追加", () => {
    // Arrange & Act
    const result = getChallengerExecutionRules(true);

    // Assert
    expect(result).toContain("自走性");
  });
});

// ============================================================================
// getInspectorExecutionRules テスト
// ============================================================================

describe("getInspectorExecutionRules", () => {
  it("getInspectorExecutionRules_基本_インスペクタールール返却", () => {
    // Arrange & Act
    const result = getInspectorExecutionRules();

    // Assert
    expect(result).toContain("検査");
  });

  it("getInspectorExecutionRules_includeGuidelines_ガイドライン追加", () => {
    // Arrange & Act
    const result = getInspectorExecutionRules(true);

    // Assert
    expect(result).toContain("自走性");
  });
});

// ============================================================================
// getVerificationWorkflowExecutionRules テスト
// ============================================================================

describe("getVerificationWorkflowExecutionRules", () => {
  it("getVerificationWorkflowExecutionRules_phase_both_両方含む", () => {
    // Arrange & Act
    const result = getVerificationWorkflowExecutionRules("both");

    // Assert
    expect(result).toContain("検査");
    expect(result).toContain("異議");
  });

  it("getVerificationWorkflowExecutionRules_phase_inspector_検査のみ", () => {
    // Arrange & Act
    const result = getVerificationWorkflowExecutionRules("inspector");

    // Assert
    expect(result).toContain("検査");
  });

  it("getVerificationWorkflowExecutionRules_phase_challenger_異議のみ", () => {
    // Arrange & Act
    const result = getVerificationWorkflowExecutionRules("challenger");

    // Assert
    expect(result).toContain("異議");
  });

  it("getVerificationWorkflowExecutionRules_検証ワークフロー含む", () => {
    // Arrange & Act
    const result = getVerificationWorkflowExecutionRules();

    // Assert
    expect(result).toContain("検証ワークフロー");
  });
});

// ============================================================================
// キャッシュ動作テスト
// ============================================================================

describe("キャッシュ動作", () => {
  it("異なるオプション_異なる結果", () => {
    // Arrange & Act
    const result1 = buildExecutionRulesSection({ forSubagent: true });
    const result2 = buildExecutionRulesSection({ forTeam: true });

    // Assert
    expect(result1).not.toBe(result2);
  });

  it("同一オプション_同一結果_キャッシュヒット", () => {
    // Arrange & Act
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(buildExecutionRulesSection({ forSubagent: true }));
    }

    // Assert
    expect(new Set(results).size).toBe(1);
  });
});

// ============================================================================
// 内容確認テスト
// ============================================================================

describe("内容確認", () => {
  it("AUTONOMY_GUIDELINES_自走性判断基準含む", () => {
    // Assert
    expect(AUTONOMY_GUIDELINES).toContain("自走性");
    expect(AUTONOMY_GUIDELINES).toContain("ユーザー確認なし");
    expect(AUTONOMY_GUIDELINES).toContain("ユーザー確認が必要");
  });

  it("NO_SHORTCUTS_GUIDELINES_品質チェックリスト含む", () => {
    // Assert
    expect(NO_SHORTCUTS_GUIDELINES).toContain("品質");
    expect(NO_SHORTCUTS_GUIDELINES).toContain("完全性");
    expect(NO_SHORTCUTS_GUIDELINES).toContain("禁止事項");
  });

  it("QUESTION_TOOL_GUIDELINES_question使用基準含む", () => {
    // Assert
    expect(QUESTION_TOOL_GUIDELINES).toContain("question");
    expect(QUESTION_TOOL_GUIDELINES).toContain("使用すべき場合");
    expect(QUESTION_TOOL_GUIDELINES).toContain("使用しなくて良い場合");
  });

  it("COMPOSITIONAL_INFERENCE_RULES_構成推論含む", () => {
    // Assert
    expect(COMPOSITIONAL_INFERENCE_RULES).toContain("構成推論");
    expect(COMPOSITIONAL_INFERENCE_RULES).toContain("KNOWLEDGE_SOURCES");
    expect(COMPOSITIONAL_INFERENCE_RULES).toContain("INFERENCE_STEPS");
  });

  it("VERIFICATION_WORKFLOW_RULES_検証フロー含む", () => {
    // Assert
    expect(VERIFICATION_WORKFLOW_RULES).toContain("検証ワークフロー");
    expect(VERIFICATION_WORKFLOW_RULES).toContain("Inspector");
    expect(VERIFICATION_WORKFLOW_RULES).toContain("Challenger");
  });

  it("COMMUNICATION_PHASE_RULES_コミュニケーションフェーズ含む", () => {
    // Assert
    expect(Array.isArray(COMMUNICATION_PHASE_RULES)).toBe(true);
    expect(COMMUNICATION_PHASE_RULES.some((r) => r.includes("連携"))).toBe(true);
  });
});
