/**
 * @abdd.meta
 * path: .pi/lib/verification-workflow.ts
 * role: 検証ワークフローの実装
 * why: Inspector/ChallengerエージェントによるLLM推論の自動検証メカニズムを実装するため
 * related: ./verification-workflow-types.ts, ./agents.ts
 * public_api: shouldTriggerVerification, detectClaimResultMismatch, detectOverconfidence
 * invariants: 検出関数は純粋関数として動作する
 * side_effects: なし
 * failure_modes: パターンマッチの誤検出
 * @abdd.explain
 * overview: LLM推論失敗の検出と検証ロジック
 * what_it_does:
 *   - 出力パターンの検出
 *   - バイアスの特定
 *   - 検証トリガーの判定
 * why_it_exists:
 *   - LLMの推論失敗モードをシステム的に検知・緩和するため
 * scope:
 *   in: verification-workflow-types.ts
 *   out: 拡張機能、サブエージェント
 */

// 型定義と定数をインポート
export {
  type VerificationWorkflowConfig,
  type VerificationTriggerMode,
  type FallbackBehavior,
  type ChallengerConfig,
  type ChallengeCategory,
  type InspectorConfig,
  type SuspicionThreshold,
  type InspectionPattern,
  type VerificationResult,
  type VerificationVerdict,
  type InspectorOutput,
  type DetectedPattern,
  type ChallengerOutput,
  type ChallengedClaim,
  type VerificationContext,
  DEFAULT_VERIFICATION_CONFIG,
  HIGH_STAKES_PATTERNS,
} from "./verification-workflow-types.js";

 * 出力パターンをチェック
 */
function checkOutputPatterns(
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

  // === バグハンティングパターン ===

  // 第1理由で探索停止チェック
  if (patterns.includes("first-reason-stopping")) {
    const firstReasonStopping = detectFirstReasonStopping(output);
    if (firstReasonStopping.detected) {
      return { trigger: true, reason: firstReasonStopping.reason };
    }
  }

  // 近接性バイアスチェック
  if (patterns.includes("proximity-bias")) {
    const proximityBias = detectProximityBias(output);
    if (proximityBias.detected) {
      return { trigger: true, reason: proximityBias.reason };
    }
  }

  // 具体性バイアスチェック
  if (patterns.includes("concreteness-bias")) {
    const concretenessBias = detectConcretenessBias(output);
    if (concretenessBias.detected) {
      return { trigger: true, reason: concretenessBias.reason };
    }
  }

  // 対症療法的修正チェック
  if (patterns.includes("palliative-fix")) {
    const palliativeFix = detectPalliativeFix(output);
    if (palliativeFix.detected) {
      return { trigger: true, reason: palliativeFix.reason };
    }
  }

  return { trigger: false, reason: "" };
}

/**
 * 否定語のリスト
 */
const NEGATION_WORDS = ['not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere', "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't", "shouldn't", 'ない', 'ません', 'しない', 'なし'];

/**
 * 不確実性を示す語のリスト
 */
const UNCERTAINTY_WORDS = ['might', 'may', 'could', 'possibly', 'perhaps', 'maybe', 'likely', 'probably', 'apparently', 'seemingly', 'かもしれません', 'だろう', 'と思われる', '可能性がある'];

/**
 * 高信頼度を示す語のリスト
 */
const HIGH_CONFIDENCE_WORDS = ['definitely', 'certainly', 'absolutely', 'undoubtedly', 'clearly', 'obviously', 'always', 'never', 'must', '間違いなく', '確実に', '当然', '必ず', '絶対'];

/**
 * CLAIM-RESULT不一致を検出
 * 単純な単語重複ではなく、意味的な構造を分析
 */
export function detectClaimResultMismatch(output: string): { detected: boolean; reason: string } {
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
 */
function extractKeyTerms(text: string): string[] {
  // 英語の重要語（冠詞、前置詞などを除外）
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also']);
  
  const words = text.toLowerCase().split(/\s+/);
  return words.filter(w => w.length > 3 && !stopWords.has(w) && !w.match(/^[0-9]+$/));
}

/**
 * 過信を検出
 */
export function detectOverconfidence(output: string): { detected: boolean; reason: string } {
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const evidenceMatch = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is);
  
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
 */
export function detectMissingAlternatives(output: string): { detected: boolean; reason: string } {
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
 */
export function detectConfirmationBias(output: string): { detected: boolean; reason: string } {
  // 「検索した」「探した」などの表現
  const hasSearchIndication = /検索|調査|探|search|investigate|look|find/i.test(output);
  
  // 否定証拠を探した兆候
  const hasNegativeSearch = /反例|反証|否定|矛盾|disconfirm|contradict|negative|counter|反対|異なる結果/i.test(output);
  
  // 肯定的な証拠のみを列挙している可能性
  const evidenceSection = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is);
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
 * 第1理由で探索停止を検出（バグハンティング）
 * @summary 第1理由停止検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectFirstReasonStopping(output: string): { detected: boolean; reason: string } {
  // 「なぜ」の使用回数をカウント
  const whyPatterns = [/なぜ|why|how come/i];
  let whyCount = 0;
  
  for (const pattern of whyPatterns) {
    const matches = output.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      whyCount += matches.length;
    }
  }
  
  // 原因の説明があるが、「なぜ」が1回しかない場合
  const hasCauseExplanation = /原因|理由|cause|reason|because|ため|ので/i.test(output);
  
  if (hasCauseExplanation && whyCount <= 1) {
    return {
      detected: true,
      reason: "First-reason stopping detected: cause explanation without deeper 'why' exploration"
    };
  }
  
  // 因果チェーンの深さを推定
  const causalChainIndicators = [
    /さらに|さらに言えば|moreover|furthermore/i,
    /根本的|根源的|fundamental|root/i,
    /本来|本質的|essentially|inherently/i,
    /背景として|背景には|underlying|behind this/i
  ];
  
  const hasDeepAnalysis = causalChainIndicators.some(p => p.test(output));
  
  if (hasCauseExplanation && !hasDeepAnalysis) {
    return {
      detected: true,
      reason: "First-reason stopping detected: direct cause identified without root cause analysis"
    };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 近接性バイアスを検出（バグハンティング）
 * @summary 近接性バイアス検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectProximityBias(output: string): { detected: boolean; reason: string } {
  // エラー/問題の場所と原因の場所が同じだと仮定している兆候
  const locationWords = ['場所', '位置', 'ここ', 'このファイル', 'この行', 'location', 'here', 'this file', 'this line'];
  const causeWords = ['原因', '理由', '問題', 'cause', 'reason', 'problem', 'issue'];
  
  const hasLocationMention = locationWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  const hasCauseMention = causeWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  
  // 場所と言及しているが、他の場所を探索する兆候がない
  const hasRemoteCauseSearch = /他の|別の|上位|下位|呼び出し元|呼び出し先|other|another|upstream|downstream|caller|callee/i.test(output);
  
  if (hasLocationMention && hasCauseMention && !hasRemoteCauseSearch) {
    return {
      detected: true,
      reason: "Proximity bias detected: assuming cause is at the same location as symptom"
    };
  }
  
  // 「この部分を修正すれば」「ここを直せば」などの表現
  const quickFixPatterns = [
    /この[部分箇所]を修正すれば|ここを直せば|fix this and/,
    /この[行ファイル]を変えれば|change this and/,
    /これで解決|this will fix|this solves/
  ];
  
  for (const pattern of quickFixPatterns) {
    if (pattern.test(output)) {
      // ただし、他の場所も調査している場合は除外
      if (!hasRemoteCauseSearch) {
        return {
          detected: true,
          reason: "Proximity bias detected: quick fix at symptom location without broader investigation"
        };
      }
    }
  }
  
  return { detected: false, reason: "" };
}

/**
 * 具体性バイアスを検出（バグハンティング）
 * @summary 具体性バイアス検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectConcretenessBias(output: string): { detected: boolean; reason: string } {
  // 具体的なレベル（実装・実行）の言及
  const concreteLevelWords = [
    '変数', '関数', 'メソッド', 'クラス', 'ファイル', '行',
    'variable', 'function', 'method', 'class', 'file', 'line',
    'null', 'undefined', 'error', 'exception', 'type', 'value'
  ];
  
  // 抽象的なレベル（設計・契約・意図）の言及
  const abstractLevelWords = [
    '設計', 'アーキテクチャ', '契約', 'インターフェース', '意図', '要件',
    'design', 'architecture', 'contract', 'interface', 'intent', 'requirement',
    '責任', '境界', '依存', '抽象', '原則',
    'responsibility', 'boundary', 'dependency', 'abstraction', 'principle'
  ];
  
  const hasConcreteMention = concreteLevelWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  const hasAbstractMention = abstractLevelWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  
  // 原因の説明があるが、抽象レベルの言及がない
  const hasCauseExplanation = /原因|理由|cause|reason|because|ため|ので/i.test(output);
  
  if (hasCauseExplanation && hasConcreteMention && !hasAbstractMention) {
    return {
      detected: true,
      reason: "Concreteness bias detected: cause analysis limited to implementation/execution level"
    };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 対症療法的修正を検出（バグハンティング）
 * @summary 対症療法検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectPalliativeFix(output: string): { detected: boolean; reason: string } {
  // 修正の言及
  const fixWords = ['修正', '変更', '追加', '削除', 'fix', 'change', 'add', 'remove', 'modify'];
  const hasFixMention = fixWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  
  if (!hasFixMention) {
    return { detected: false, reason: "" };
  }
  
  // 再発防止の兆候
  const recurrencePreventionPatterns = [
    /再発防止|同様の問題|他の場所も|同様のバグ/,
    /prevent recurrence|similar issue|other places|same bug/,
    /根本的な|本質的な|構造的な/,
    /fundamental|essential|structural/,
    /見直し|見直す|レビュー|再考/,
    /review|reconsider|rethink/
  ];
  
  const hasRecurrencePrevention = recurrencePreventionPatterns.some(p => p.test(output));
  
  // 対症療法の兆候
  const palliativePatterns = [
    /とりあえず|暫定的|一時的|とにかく/,
    /temporarily|for now|quick fix|workaround/,
    /この場合格ってる|これで動く/,
    /this works|fixes the issue/
  ];
  
  const hasPalliativeIndication = palliativePatterns.some(p => p.test(output));
  
  if (hasFixMention && !hasRecurrencePrevention) {
    if (hasPalliativeIndication) {
      return {
        detected: true,
        reason: "Palliative fix detected: workaround without recurrence prevention"
      };
    }
    
    // 修正があるが、再発防止の言及がない
    // ただし、修正が詳細でない場合は控えめに判定
    const fixDetailPatterns = [
      /以下の通り|このように|具体的には/,
      /as follows|like this|specifically/
    ];
    const hasFixDetail = fixDetailPatterns.some(p => p.test(output));
    
    if (hasFixDetail && !hasRecurrencePrevention) {
      return {
        detected: true,
        reason: "Potential palliative fix: detailed fix without explicit recurrence prevention measures"
      };
    }
  }
  
  return { detected: false, reason: "" };
}

/**
 * アポリアタイプ（バグハンティング特化）
 * @summary バグハンティングにおける解決不能な緊張関係
 */
export type BugHuntingAporiaType =
  | "speed-vs-completeness"   // 速度 vs 完全性
  | "hypothesis-vs-evidence"  // 仮説駆動 vs 証拠駆動
  | "depth-vs-breadth";       // 深さ vs 幅

/**
 * アポリア認識結果
 * @summary 検出されたアポリアと推奨される傾き
 */
export interface BugHuntingAporiaRecognition {
  aporiaType: BugHuntingAporiaType;
  pole1: {
    concept: string;
    value: string;
    indicators: string[];
  };
  pole2: {
    concept: string;
    value: string;
    indicators: string[];
  };
  tensionLevel: number;
  recommendedTilt: "pole1" | "pole2" | "balanced";
  tiltRationale: string;
  contextFactors: string[];
}
