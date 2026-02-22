/**
 * 検証システムのエッジケース検証スクリプト
 * 偽陽性/偽陰性のケースを具体的に検証する
 */

import {
  detectClaimResultMismatch,
  detectOverconfidence,
  detectMissingAlternatives,
  detectConfirmationBias,
} from "../.pi/lib/verification-workflow.js";
import { verifyOutput } from "../.pi/lib/verification-simple.js";

// テストケース定義
const testCases = {
  // ========================================
  // 偽陰性ケース（検出すべきだが検出されない）
  // ========================================
  falseNegatives: [
    {
      name: "FN-1: 日本語形式でCLAIM/RESULT相当の内容が不一致",
      input: `主張: 実装は完了している
結果: 削除が必要である`,
      expectedIssue: "claim-result-mismatch",
      reason: "CLAIM:/RESULT: 形式でないため検出されない",
    },
    {
      name: "FN-2: 形式は正しいが否定表現が異なる",
      input: `CLAIM: This approach works correctly
RESULT: We discovered several issues that need fixing`,
      expectedIssue: "claim-result-mismatch",
      reason: "否定語リストに'discovered issues'が含まれていない",
    },
    {
      name: "FN-3: 日本語での過信（英語キーワード不在）",
      input: `CLAIM: これは間違いなく正解です
EVIDENCE: 少し確認しただけ
CONFIDENCE: 0.99`,
      expectedIssue: "overconfidence",
      reason: "日本語の過信キーワードが検出されない可能性",
    },
    {
      name: "FN-4: CLAIMとRESULTが論理的に矛盾しているが表現が異なる",
      input: `CLAIM: The system is stable and reliable
RESULT: Crashes occur frequently under load`,
      expectedIssue: "claim-result-mismatch",
      reason: "否定語の直接的な不一致がないため検出されない",
    },
    {
      name: "FN-5: 代替案検討がないがキーワードが含まれる",
      input: `CLAIM: Solution A is best
CONCLUSION: We should proceed with Solution A
EVIDENCE: Solution A works well
CONFIDENCE: 0.95
DISCUSSION: Solution A has many benefits and is the clear winner.`,
      expectedIssue: "missing-alternatives",
      reason: "DISCUSSIONセクションがあるが、代替案の検討がない",
    },
  ],

  // ========================================
  // 偽陽性ケース（誤検出）
  // ========================================
  falsePositives: [
    {
      name: "FP-1: 短いが十分な証拠（テスト結果等）",
      input: `CLAIM: Tests pass
EVIDENCE: All 50 tests passed successfully in CI pipeline
CONFIDENCE: 0.95`,
      shouldNotTrigger: "overconfidence",
      reason: "証拠は短いが質が高い（CIでテスト通過）",
    },
    {
      name: "FP-2: 'definitely' がファイル名に含まれる",
      input: `CLAIM: File created successfully
RESULT: Created definitely-not-empty.txt with proper content
EVIDENCE: File definitely-not-empty.txt exists at /tmp/
CONFIDENCE: 0.8`,
      shouldNotTrigger: "overconfidence",
      reason: "'definitely' はファイル名の一部であり過信ではない",
    },
    {
      name: "FP-3: 肯定語が多いが否定証拠も検討している",
      input: `EVIDENCE: 
- 成功: テストが通った (success)
- 成功: ビルドが完了 (success)
- 成功: デプロイ成功 (success)
- 注意: エッジケースで失敗の可能性あり (issue)
- 反例: 負荷テストで問題発見 (disconfirm)

COUNTER_EVIDENCE: 負荷テストで問題を発見した`,
      shouldNotTrigger: "confirmation-bias",
      reason: "COUNTER_EVIDENCEセクションがあり否定証拠を検討している",
    },
    {
      name: "FP-4: 高信頼度だら適切な長さの証拠がある",
      input: `CLAIM: Implementation is complete and tested
EVIDENCE: 
- Unit tests: 100% coverage achieved across all modules
- Integration tests: All API endpoints verified
- Performance tests: Response time under 100ms
- Security scan: No vulnerabilities detected
- Code review: Approved by 2 senior engineers
CONFIDENCE: 0.95`,
      shouldNotTrigger: "overconfidence",
      reason: "十分な長さの証拠があるため過信ではない",
    },
    {
      name: "FP-5: 否定語が両方に含まれるが意味は整合",
      input: `CLAIM: The function does not crash on invalid input
RESULT: No crashes occur even with invalid input
EVIDENCE: Tested with null, undefined, and malformed data
CONFIDENCE: 0.9`,
      shouldNotTrigger: "claim-result-mismatch",
      reason: "否定語が両方にあり、意味は整合している",
    },
  ],
};

// 検出関数を実行
function runTests() {
  console.log("=".repeat(60));
  console.log("検証システム エッジケース検証レポート");
  console.log("=".repeat(60));
  console.log();

  // 偽陰性テスト
  console.log("## 偽陰性ケース（検出すべきだが検出されない可能性）\n");
  
  let fnDetected = 0;
  let fnMissed = 0;
  
  for (const tc of testCases.falseNegatives) {
    console.log(`### ${tc.name}`);
    console.log(`期待される検出: ${tc.expectedIssue}`);
    console.log(`理由: ${tc.reason}`);
    
    // 各検出関数を実行
    const mismatch = detectClaimResultMismatch(tc.input);
    const overconfidence = detectOverconfidence(tc.input);
    const missing = detectMissingAlternatives(tc.input);
    const bias = detectConfirmationBias(tc.input);
    
    const fullResult = verifyOutput(tc.input, 0.8, { task: "test", triggerMode: "post-subagent" });
    
    console.log("検出結果:");
    console.log(`  - CLAIM-RESULT不一致: ${mismatch.detected ? `検出 (${mismatch.reason})` : "未検出"}`);
    console.log(`  - 過信: ${overconfidence.detected ? `検出 (${overconfidence.reason})` : "未検出"}`);
    console.log(`  - 代替解釈欠如: ${missing.detected ? `検出 (${missing.reason})` : "未検出"}`);
    console.log(`  - 確認バイアス: ${bias.detected ? `検出 (${bias.reason})` : "未検出"}`);
    console.log(`  - verifyOutput判定: ${fullResult.verdict}`);
    console.log(`  - 検出された問題: [${fullResult.issues.map(i => i.type).join(", ") || "なし"}]`);
    
    // 期待される検出がされたか
    const expectedDetected = 
      tc.expectedIssue === "claim-result-mismatch" ? mismatch.detected :
      tc.expectedIssue === "overconfidence" ? overconfidence.detected :
      tc.expectedIssue === "missing-alternatives" ? missing.detected :
      tc.expectedIssue === "confirmation-bias" ? bias.detected :
      fullResult.issues.some(i => i.type === tc.expectedIssue);
    
    if (!expectedDetected) {
      console.log(`  ⚠️  【偽陰性】期待された検出が行われなかった`);
      fnMissed++;
    } else {
      console.log(`  ✓ 期待通り検出された`);
      fnDetected++;
    }
    console.log();
  }
  
  // 偽陽性テスト
  console.log("## 偽陽性ケース（誤検出の可能性）\n");
  
  let fpTriggered = 0;
  let fpCorrect = 0;
  
  for (const tc of testCases.falsePositives) {
    console.log(`### ${tc.name}`);
    console.log(`誤検出懸念: ${tc.shouldNotTrigger}`);
    console.log(`理由: ${tc.reason}`);
    
    const fullResult = verifyOutput(tc.input, 0.8, { task: "test", triggerMode: "post-subagent" });
    
    console.log("検出結果:");
    console.log(`  - 判定: ${fullResult.verdict}`);
    console.log(`  - 検出された問題: [${fullResult.issues.map(i => i.type).join(", ") || "なし"}]`);
    
    const hasFalsePositive = fullResult.issues.some(i => i.type === tc.shouldNotTrigger);
    
    if (hasFalsePositive) {
      console.log(`  ⚠️  【偽陽性】誤検出が発生: ${tc.shouldNotTrigger}`);
      fpTriggered++;
    } else {
      console.log(`  ✓ 誤検出なし`);
      fpCorrect++;
    }
    console.log();
  }
  
  // サマリー
  console.log("=".repeat(60));
  console.log("## サマリー");
  console.log("=".repeat(60));
  console.log();
  console.log(`偽陰性: ${fnDetected}件検出 / ${testCases.falseNegatives.length}件中 (${fnMissed}件見逃し)`);
  console.log(`偽陽性: ${fpCorrect}件正解 / ${testCases.falsePositives.length}件中 (${fpTriggered}件誤検出)`);
  console.log();
  
  // アーキテクチャ問題点のまとめ
  console.log("## 特定されたアーキテクチャ問題点");
  console.log();
  console.log("1. **表記依存**: CLAIM:/RESULT:/CONFIDENCE: 形式が必須。日本語や他形式に対応できない");
  console.log("2. **言語依存**: 英語キーワード(however, definitely等)を検出。日本語の同義語は不完全");
  console.log("3. **意味不理解**: 文脈を理解せず文字列マッチングのみ");
  console.log("4. **閾値の硬直性**: 証拠長100文字等、文脈を考慮しない固定閾値");
  console.log("5. **モジュール結合**: 検出関数が密結合で、個別の改善が困難");
}

runTests();
