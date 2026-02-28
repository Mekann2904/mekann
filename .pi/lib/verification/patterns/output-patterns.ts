/**
 * @abdd.meta
 * path: .pi/lib/verification/patterns/output-patterns.ts
 * role: 出力パターン検出モジュール
 * why: LLM出力における推論失敗パターンを検出し、品質を担保するため
 * related: ../types.ts, ../config.ts, ../../verification-workflow.ts
 * public_api: detectClaimResultMismatch, detectOverconfidence, detectMissingAlternatives, detectConfirmationBias, isHighStakesTask, checkOutputPatterns
 * invariants: すべての検出関数は純粋関数として動作する
 * side_effects: なし
 * failure_modes: パターンマッチの誤検出、偽陽性の過多
 * @abdd.explain
 * overview: LLM出力のパターン検出関数群
 * what_it_does:
 *   - CLAIM-RESULT不一致を検出する
 *   - 過信パターンを検出する
 *   - 代替解釈の欠如を検出する
 *   - 確認バイアスを検出する
 *   - 高リスクタスクを判定する
 * why_it_exists:
 *   - LLMの推論失敗モードを体系的に検知する
 *   - 自動検証の基盤となる検出ロジックを提供する
 * scope:
 *   in: types.ts
 *   out: config.ts, core.ts, integrated-detection.ts
 */

import {
  type VerificationWorkflowConfig,
  type PatternDetectionResult,
  NEGATION_WORDS,
  UNCERTAINTY_WORDS,
  HIGH_CONFIDENCE_WORDS,
  HIGH_STAKES_PATTERNS,
} from "../types.js";

// ============================================================================
// Output Pattern Detection
// ============================================================================

/**
 * CLAIM-RESULT不一致を検出
 * 単純な単語重複ではなく、意味的な構造を分析
 * @summary CLAIM-RESULT不一致検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectClaimResultMismatch(output: string): PatternDetectionResult {
  const claimMatch = output.match(/CLAIM:\s*(.+?)(?:\n|$)/i);
  const resultMatch = output.match(/RESULT:\s*(.+?)(?:\n|$)/i);

  if (!claimMatch || !resultMatch) {
    return { detected: false, reason: "" };
  }

  const claim = claimMatch[1].trim();
  const result = resultMatch[1].trim();

  // 1. 否定の不一致チェック
  const claimHasNegation = NEGATION_WORDS.some(w => claim.toLowerCase().includes(w));
  const resultHasNegation = NEGATION_WORDS.some(w => result.toLowerCase().includes(w));

  if (claimHasNegation !== resultHasNegation) {
    // ただし、どちらも否定語を含まない場合はOK
    const claimWords = claim.toLowerCase().split(/\s+/);
    const resultWords = result.toLowerCase().split(/\s+/);
    const overlap = claimWords.filter(w => resultWords.includes(w) && w.length > 3).length;

    // 単語の重複が低く、否定が異なる場合は不一致の可能性が高い
    if (overlap < Math.min(claimWords.length, resultWords.length) * 0.3) {
      return { detected: true, reason: "CLAIM-RESULT mismatch: negation pattern differs significantly" };
    }
  }

  // 2. 不確実性/確実性の不一致
  const claimHasUncertainty = UNCERTAINTY_WORDS.some(w => claim.toLowerCase().includes(w));
  const resultHasHighConfidence = HIGH_CONFIDENCE_WORDS.some(w => result.toLowerCase().includes(w));

  if (claimHasUncertainty && resultHasHighConfidence) {
    return { detected: true, reason: "CLAIM-RESULT mismatch: uncertain claim leads to high-confidence result" };
  }

  // 3. 主題の不一致チェック（重要名詞の比較）
  const claimNouns = extractKeyTerms(claim);
  const resultNouns = extractKeyTerms(result);

  // 共通する重要語がない場合
  const commonTerms = claimNouns.filter(n => resultNouns.includes(n));
  if (claimNouns.length > 0 && resultNouns.length > 0 && commonTerms.length === 0) {
    return { detected: true, reason: "CLAIM-RESULT mismatch: no common key terms found" };
  }

  return { detected: false, reason: "" };
}

/**
 * テキストから重要な用語を抽出（簡易版）
 * @summary 用語抽出
 * @param text テキスト
 * @returns 重要用語の配列
 */
function extractKeyTerms(text: string): string[] {
  // 英語の重要語（冠詞、前置詞などを除外）
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also']);

  const words = text.toLowerCase().split(/\s+/);
  return words.filter(w => w.length > 3 && !stopWords.has(w) && !w.match(/^[0-9]+$/));
}

/**
 * 過信を検出
 * @summary 過信検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectOverconfidence(output: string): PatternDetectionResult {
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  // Note: Using [\s\S] instead of 's' flag for ES5 compatibility
  const evidenceMatch = output.match(/EVIDENCE:\s*([\s\S]+?)(?:\n\n|\n[A-Z]+:|$)/i);

  if (!confidenceMatch || !evidenceMatch) {
    return { detected: false, reason: "" };
  }

  const confidence = parseFloat(confidenceMatch[1]);
  const evidence = evidenceMatch[1].trim();
  const evidenceLength = evidence.length;

  // 1. 証拠が短いのに信頼度が高い場合
  if (confidence > 0.9 && evidenceLength < 100) {
    return { detected: true, reason: `Overconfidence detected: CONFIDENCE ${confidence} with minimal EVIDENCE (${evidenceLength} chars)` };
  }

  // 2. 高信頼度語の使用に対する証拠の評価
  const highConfidenceWordCount = HIGH_CONFIDENCE_WORDS.filter(w => output.toLowerCase().includes(w)).length;
  const uncertaintyWordCount = UNCERTAINTY_WORDS.filter(w => evidence.toLowerCase().includes(w)).length;

  // 高信頼度語が多いのに、証拠に不確実性語がない場合
  if (highConfidenceWordCount >= 2 && uncertaintyWordCount === 0 && confidence > 0.85) {
    return { detected: true, reason: "Overconfidence detected: multiple high-confidence markers without uncertainty acknowledgment" };
  }

  // 3. 証拠内の具体性の評価
  const hasFileReference = /[a-zA-Z0-9_/-]+\.(ts|js|py|md|json|yaml|yml)/i.test(evidence);
  const hasLineNumber = /line\s*\d+|:\d+|行\d+/i.test(evidence);
  const hasCodeReference = /`[^`]+`/.test(evidence);

  const specificityScore = (hasFileReference ? 1 : 0) + (hasLineNumber ? 1 : 0) + (hasCodeReference ? 1 : 0);

  // 短い証拠で具体性が乏しい場合のみ、追加の過信判定を行う
  // 100文字ちょうどは境界値として許容し、過剰検知を抑える
  if (confidence > 0.9 && evidenceLength < 100 && specificityScore < 2) {
    return { detected: true, reason: `Overconfidence detected: high confidence (${confidence}) with low evidence specificity (score: ${specificityScore}/3)` };
  }

  return { detected: false, reason: "" };
}

/**
 * 代替解釈の欠如を検出
 * @summary 代替解釈欠如検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectMissingAlternatives(output: string): PatternDetectionResult {
  const hasConclusion = /CONCLUSION:|結論|RESULT:|最終的|したがって/i.test(output);
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
  const hasDiscussion = /DISCUSSION:|議論|考察/i.test(output);

  // 代替解釈の兆候を探す
  const hasAlternatives = /ALTERNATIVE:|代替|別の解釈|他の可能性|一方で|あるいは|または|could also|alternatively|another possibility|other explanation/i.test(output);
  const hasCounterEvidence = /COUNTER_EVIDENCE:|反証|否定する証拠|矛盾する|disconfirming|contradicting|however|but|nevertheless/i.test(output);
  const hasLimitations = /LIMITATION:|制限|限界|注意点| caveat|limitation|constraint|boundary/i.test(output);

  // 結論があり、高信頼度だが、代替解釈、反証、制限の記述がない場合
  if (hasConclusion && !hasAlternatives && !hasCounterEvidence && !hasLimitations && !hasDiscussion && confidence > 0.8) {
    return { detected: true, reason: "Missing alternative interpretations for high-confidence conclusion" };
  }

  if (hasConclusion && !hasDiscussion && confidence > 0.85) {
    return { detected: true, reason: "Missing DISCUSSION section with alternative perspectives" };
  }

  return { detected: false, reason: "" };
}

/**
 * 確認バイアスパターンを検出
 * @summary 確認バイアス検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectConfirmationBias(output: string): PatternDetectionResult {
  // 「検索した」「探した」などの表現
  const hasSearchIndication = /検索|調査|探|search|investigate|look|find/i.test(output);

  // 否定証拠を探した兆候
  const hasNegativeSearch = /反例|反証|否定|矛盾|disconfirm|contradict|negative|counter|反対|異なる結果/i.test(output);

  // 肯定的な証拠のみを列挙している可能性
  // Note: Using [\s\S] instead of 's' flag for ES5 compatibility
  const evidenceSection = output.match(/EVIDENCE:\s*([\s\S]+?)(?:\n\n|\n[A-Z]+:|$)/i);
  if (evidenceSection) {
    const evidence = evidenceSection[1];
    const positiveMarkers = (evidence.match(/成功|動作|正しく|完了|works|correct|success|passed|verified|確認/gi) || []).length;
    const negativeMarkers = (evidence.match(/失敗|エラー|問題|バグ|fail|error|bug|issue|problem|incorrect/gi) || []).length;

    // 肯定的な証拠のみで、否定証拠の探索がない場合
    if (positiveMarkers > 3 && negativeMarkers === 0 && !hasNegativeSearch) {
      return { detected: true, reason: "Confirmation bias pattern: only positive evidence listed without seeking disconfirming evidence" };
    }
  }

  // 「〜を確認した」「〜が正しいことを検証」などの確認バイアス的表現
  const confirmationPhrases = [
    /期待通り|as expected|予想通り/i,
    /問題ない|no problem|問題なし/i,
    /正しく動作|works correctly|正常に動作/i
  ];

  const confirmationCount = confirmationPhrases.filter(p => p.test(output)).length;

  if (confirmationCount >= 2 && !hasNegativeSearch) {
    return { detected: true, reason: "Confirmation bias pattern: multiple confirmation phrases without counter-evidence search" };
  }

  return { detected: false, reason: "" };
}

/**
 * 高リスクタスク判定
 * @summary リスク判定
 * @param task タスク内容
 * @returns 高リスクの場合はtrue
 */
export function isHighStakesTask(task: string): boolean {
  return HIGH_STAKES_PATTERNS.some(pattern => pattern.test(task));
}

/**
 * 出力パターンをチェック
 * @summary パターンチェック
 * @param output 出力内容
 * @param config 検証設定
 * @returns トリガー判定と理由
 */
export function checkOutputPatterns(
  output: string,
  config: VerificationWorkflowConfig
): { trigger: boolean; reason: string } {
  const patterns = config.inspectorConfig.requiredPatterns;

  // CLAIM-RESULT不一致チェック
  if (patterns.includes("claim-result-mismatch")) {
    const mismatch = detectClaimResultMismatch(output);
    if (mismatch.detected) {
      return { trigger: true, reason: mismatch.reason };
    }
  }

  // 過信チェック
  if (patterns.includes("overconfidence")) {
    const overconfidence = detectOverconfidence(output);
    if (overconfidence.detected) {
      return { trigger: true, reason: overconfidence.reason };
    }
  }

  // 代替解釈欠如チェック
  if (patterns.includes("missing-alternatives")) {
    const missingAlternatives = detectMissingAlternatives(output);
    if (missingAlternatives.detected) {
      return { trigger: true, reason: missingAlternatives.reason };
    }
  }

  // 確認バイアスパターンチェック
  if (patterns.includes("confirmation-bias")) {
    const confirmationBias = detectConfirmationBias(output);
    if (confirmationBias.detected) {
      return { trigger: true, reason: confirmationBias.reason };
    }
  }

  return { trigger: false, reason: "" };
}
