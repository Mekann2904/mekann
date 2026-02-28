/**
 * @abdd.meta
 * path: .pi/lib/verification/assessment/uncertainty.ts
 * role: 検出不確実性評価機能
 * why: 「何が検出されなかったか」を認識する能力を実装するため
 * related: ../extraction/integrated-detection.ts, ../analysis/dystopian-risk.ts, ../types.ts
 * public_api: assessDetectionUncertainty, generateUncertaintySummary, DetectionUncertaintyAssessment
 * invariants: assessDetectionUncertaintyは常にDetectionUncertaintyAssessmentを返す
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、低信頼度評価を返す
 * @abdd.explain
 * overview: 検出システムの限界と見落とし可能性を評価するメタ認知的機能
 * what_it_does:
 *   - 各検出カテゴリの信頼度を評価する
 *   - 検出の限界（形式依存、言語依存など）を特定する
 *   - 代替形式で表現されているリスクを評価する
 *   - 見落とされた可能性のある問題を特定する
 *   - 「検出なし」への信頼度を計算する
 * why_it_exists:
 *   - 検出システムの不完全性を認識し、見落としを防ぐため
 * scope:
 *   in: ../extraction/integrated-detection.ts, ../types.ts
 *   out: ../core.ts
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 検出不確実性評価結果
 * @summary 検出の限界と見落とし可能性を評価
 */
export interface DetectionUncertaintyAssessment {
  /** 評価対象の出力 */
  targetOutput: string;
  /** 検出実行結果の要約 */
  detectionSummary: {
    claimResultMismatch: { detected: boolean; confidence: number };
    overconfidence: { detected: boolean; confidence: number };
    missingAlternatives: { detected: boolean; confidence: number };
    confirmationBias: { detected: boolean; confidence: number };
  };
  /** 検出の限界 */
  detectionLimitations: DetectionLimitation[];
  /** 「検出されなかった」ことへの信頼度（低いほど見落としの可能性が高い） */
  negativeResultConfidence: number;
  /** 代替形式で表現されている可能性 */
  alternativeFormatRisk: {
    risk: number;
    possibleFormats: string[];
    reason: string;
  };
  /** 検出されなかった問題の候補 */
  potentiallyMissedIssues: MissedIssueCandidate[];
  /** 推奨される追加検証 */
  recommendedAdditionalChecks: string[];
}

/**
 * 検出の限界を表す
 * @summary 検出限界
 */
export interface DetectionLimitation {
  /** 限界の種類 */
  type: 'format-dependency' | 'language-dependency' | 'threshold-arbitrariness' | 'pattern-coverage';
  /** 限界の説明 */
  description: string;
  /** 影響度（0-1） */
  impact: number;
  /** 軽減策 */
  mitigation: string;
}

/**
 * 見落とされた可能性のある問題
 * @summary 見落とし候補
 */
export interface MissedIssueCandidate {
  /** 問題の種類 */
  issueType: string;
  /** 見落とされた理由 */
  reason: string;
  /** 存在する可能性（0-1） */
  probability: number;
  /** 確認方法 */
  howToVerify: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 検出の不確実性を評価する
 * 「何が検出されなかったか」を認識する能力の実装
 * @summary 検出不確実性評価
 * @param output 検証対象の出力
 * @param detectionResults 既存の検出結果（省略時は自動実行）
 * @returns 不確実性評価結果
 */
export function assessDetectionUncertainty(
  output: string,
  detectionResults?: {
    claimResultMismatch?: { detected: boolean; reason: string };
    overconfidence?: { detected: boolean; reason: string };
    missingAlternatives?: { detected: boolean; reason: string };
    confirmationBias?: { detected: boolean; reason: string };
  }
): DetectionUncertaintyAssessment {
  // 検出を実行または使用
  const claimResult = detectionResults?.claimResultMismatch ?? detectClaimResultMismatch(output);
  const overconfidenceResult = detectionResults?.overconfidence ?? detectOverconfidence(output);
  const alternativesResult = detectionResults?.missingAlternatives ?? detectMissingAlternatives(output);
  const biasResult = detectionResults?.confirmationBias ?? detectConfirmationBias(output);

  // 各検出の信頼度を評価
  const claimResultConfidence = assessClaimResultDetectionConfidence(output);
  const overconfidenceConfidence = assessOverconfidenceDetectionConfidence(output);
  const alternativesConfidence = assessAlternativesDetectionConfidence(output);
  const biasConfidence = assessBiasDetectionConfidence(output);

  // 検出の限界を特定
  const limitations = identifyDetectionLimitations(output);

  // 代替形式リスクを評価
  const alternativeFormatRisk = assessAlternativeFormatRisk(output);

  // 見落とされた可能性のある問題を特定
  const potentiallyMissed = identifyPotentiallyMissedIssues(
    output,
    { claimResult: claimResult.detected, overconfidence: overconfidenceResult.detected, 
      alternatives: alternativesResult.detected, bias: biasResult.detected },
    limitations
  );

  // 「検出なし」への信頼度を計算
  const negativeConfidence = calculateNegativeResultConfidence(
    output,
    { claimResult: claimResultConfidence, overconfidence: overconfidenceConfidence,
      alternatives: alternativesConfidence, bias: biasConfidence },
    limitations,
    alternativeFormatRisk
  );

  // 推奨される追加検証を生成
  const additionalChecks = generateRecommendedAdditionalChecks(
    limitations,
    potentiallyMissed,
    alternativeFormatRisk
  );

  return {
    targetOutput: output.slice(0, 500),
    detectionSummary: {
      claimResultMismatch: { detected: claimResult.detected, confidence: claimResultConfidence },
      overconfidence: { detected: overconfidenceResult.detected, confidence: overconfidenceConfidence },
      missingAlternatives: { detected: alternativesResult.detected, confidence: alternativesConfidence },
      confirmationBias: { detected: biasResult.detected, confidence: biasConfidence }
    },
    detectionLimitations: limitations,
    negativeResultConfidence: negativeConfidence,
    alternativeFormatRisk,
    potentiallyMissedIssues: potentiallyMissed,
    recommendedAdditionalChecks: additionalChecks
  };
}

/**
 * 検出不確実性評価のサマリーを生成
 * @summary 不確実性サマリー生成
 * @param assessment 評価結果
 * @returns 人間可読なサマリー
 */
export function generateUncertaintySummary(assessment: DetectionUncertaintyAssessment): string {
  const lines: string[] = [];

  lines.push('## 検出不確実性評価');
  lines.push('');

  // 検出サマリー
  lines.push('### 検出結果と信頼度');
  for (const [key, value] of Object.entries(assessment.detectionSummary)) {
    const name = {
      claimResultMismatch: 'CLAIM-RESULT不一致',
      overconfidence: '過信',
      missingAlternatives: '代替解釈欠如',
      confirmationBias: '確認バイアス'
    }[key] || key;
    const status = value.detected ? '検出' : 'なし';
    const conf = (value.confidence * 100).toFixed(0);
    lines.push(`- ${name}: ${status} (信頼度: ${conf}%)`);
  }
  lines.push('');

  // 「検出なし」への信頼度
  const negativeConf = (assessment.negativeResultConfidence * 100).toFixed(0);
  lines.push(`### 「検出なし」への信頼度: ${negativeConf}%`);
  if (assessment.negativeResultConfidence < 0.6) {
    lines.push('> 警告: 信頼度が低い。見落としの可能性があります。');
  }
  lines.push('');

  // 代替形式リスク
  if (assessment.alternativeFormatRisk.risk > 0) {
    lines.push(`### 代替形式リスク: ${(assessment.alternativeFormatRisk.risk * 100).toFixed(0)}%`);
    lines.push(`> ${assessment.alternativeFormatRisk.reason}`);
    lines.push('');
  }

  // 検出の限界
  if (assessment.detectionLimitations.length > 0) {
    lines.push('### 検出の限界');
    for (const lim of assessment.detectionLimitations) {
      lines.push(`- [${lim.type}] ${lim.description} (影響度: ${(lim.impact * 100).toFixed(0)}%)`);
    }
    lines.push('');
  }

  // 見落とし候補
  if (assessment.potentiallyMissedIssues.length > 0) {
    lines.push('### 見落としの可能性');
    for (const missed of assessment.potentiallyMissedIssues.slice(0, 3)) {
      lines.push(`- [${missed.issueType}] ${(missed.probability * 100).toFixed(0)}%の可能性`);
      lines.push(`  > ${missed.reason}`);
      lines.push(`  > 確認方法: ${missed.howToVerify}`);
    }
    lines.push('');
  }

  // 推奨される追加検証
  if (assessment.recommendedAdditionalChecks.length > 0) {
    lines.push('### 推奨される追加検証');
    for (const check of assessment.recommendedAdditionalChecks) {
      lines.push(`- ${check}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Helper Functions - Detection
// ============================================================================

/**
 * CLAIM-RESULT不一致を検出
 */
function detectClaimResultMismatch(output: string): { detected: boolean; reason: string } {
  const hasClaimResult = /CLAIM:\s*.+\nRESULT:\s*.+/i.test(output);
  if (!hasClaimResult) {
    return { detected: false, reason: 'CLAIM/RESULT形式が存在しない' };
  }
  // 簡易的な不一致検出
  const claimMatch = output.match(/CLAIM:\s*(.+?)(?:\n|$)/i);
  const resultMatch = output.match(/RESULT:\s*(.+?)(?:\n|$)/i);
  if (claimMatch && resultMatch) {
    const claim = claimMatch[1].toLowerCase();
    const result = resultMatch[1].toLowerCase();
    // 共通単語が少ない場合を不一致とみなす
    const claimWords = claim.split(/\s+/);
    const resultWords = result.split(/\s+/);
    const commonWords = claimWords.filter(w => resultWords.includes(w));
    if (commonWords.length < 2 && claim.length > 20 && result.length > 20) {
      return { detected: true, reason: 'CLAIMとRESULTの関連性が低い' };
    }
  }
  return { detected: false, reason: '問題なし' };
}

/**
 * 過信を検出
 */
function detectOverconfidence(output: string): { detected: boolean; reason: string } {
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const evidenceMatch = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/i);
  
  if (!confidenceMatch) {
    return { detected: false, reason: '信頼度が記述されていない' };
  }
  
  const confidence = parseFloat(confidenceMatch[1]);
  const evidenceLength = evidenceMatch ? evidenceMatch[1].trim().length : 0;
  
  // 高信頼度だが証拠が短い場合
  if (confidence > 0.9 && evidenceLength < 100) {
    return { detected: true, reason: `高信頼度(${confidence})だが証拠が短い(${evidenceLength}文字)` };
  }
  
  return { detected: false, reason: '問題なし' };
}

/**
 * 代替解釈の欠如を検出
 */
function detectMissingAlternatives(output: string): { detected: boolean; reason: string } {
  const hasAlternatives = /ALTERNATIVE:|代替|あるいは|または|別の解釈|他の可能性/i.test(output);
  const hasConclusion = /CONCLUSION:|結論|したがって|以上より/i.test(output);
  
  if (hasConclusion && !hasAlternatives) {
    return { detected: true, reason: '結論があるが代替解釈が検討されていない' };
  }
  
  return { detected: false, reason: '問題なし' };
}

/**
 * 確認バイアスを検出
 */
function detectConfirmationBias(output: string): { detected: boolean; reason: string } {
  const hasPositiveOnly = /成功|動作|正しく|完了|passed|works|success|verified|問題ない/i.test(output);
  const hasNegativeSearch = /反例|反証|失敗|エラー|counter|disconfirm|contradict/i.test(output);
  
  if (hasPositiveOnly && !hasNegativeSearch) {
    return { detected: true, reason: '肯定的結果のみで反証探索がない' };
  }
  
  return { detected: false, reason: '問題なし' };
}

// ============================================================================
// Helper Functions - Confidence Assessment
// ============================================================================

/**
 * CLAIM-RESULT検出の信頼度を評価
 */
function assessClaimResultDetectionConfidence(output: string): number {
  let confidence = 1.0;

  // 標準形式（CLAIM:/RESULT:）が存在する場合は高信頼度
  const hasStandardFormat = /CLAIM:\s*.+\nRESULT:\s*.+/i.test(output);
  if (!hasStandardFormat) {
    // 代替形式を確認
    const hasAlternateFormat = /主張:|結論:|CONCLUSION:| assertion:| conclusion:/i.test(output);
    if (hasAlternateFormat) {
      confidence *= 0.4; // 代替形式は検出できない可能性が高い
    } else {
      confidence *= 0.7; // 形式が不明確
    }
  }

  // 日本語ラベルの存在確認
  const hasJapaneseLabels = /主張|結果|結論|成果/.test(output);
  if (hasJapaneseLabels && !hasStandardFormat) {
    confidence *= 0.3; // 日本語ラベルは現在の検出で見逃される
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * 過信検出の信頼度を評価
 */
function assessOverconfidenceDetectionConfidence(output: string): number {
  let confidence = 1.0;

  const hasConfidenceSection = /CONFIDENCE:\s*[0-9.]+/i.test(output);
  const hasEvidenceSection = /EVIDENCE:\s*.+/i.test(output);

  if (!hasConfidenceSection) {
    confidence *= 0.5; // 信頼度セクションがない
  }
  if (!hasEvidenceSection) {
    confidence *= 0.6; // 証拠セクションがない
  }

  // 境界値付近の証拠長を確認
  const evidenceMatch = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/i);
  if (evidenceMatch) {
    const length = evidenceMatch[1].trim().length;
    if (length >= 95 && length <= 105) {
      confidence *= 0.7; // 境界値付近は判定が不安定
    }
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * 代替解釈欠如検出の信頼度を評価
 */
function assessAlternativesDetectionConfidence(output: string): number {
  let confidence = 1.0;

  // 代替解釈キーワードの網羅性を評価
  const englishKeywords = /ALTERNATIVE:|alternatively|another possibility|other explanation/i.test(output);
  const japaneseKeywords = /代替|あるいは|または|別の解釈|他の可能性/.test(output);

  if (!englishKeywords && !japaneseKeywords) {
    // キーワードがない場合でも、議論があるかを確認
    const hasDiscussion = /DISCUSSION:|議論|考察|検討/i.test(output);
    if (!hasDiscussion) {
      confidence *= 0.6; // 完全に欠けている可能性
    }
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * 確認バイアス検出の信頼度を評価
 */
function assessBiasDetectionConfidence(output: string): number {
  let confidence = 1.0;

  // 証拠セクションの有無
  const hasEvidenceSection = /EVIDENCE:\s*.+/i.test(output);
  if (!hasEvidenceSection) {
    confidence *= 0.5;
  }

  // 反証探索のキーワード
  const hasCounterSearch = /反例|反証|否定|矛盾|disconfirm|contradict|counter/i.test(output);
  if (hasCounterSearch) {
    confidence = 1.0; // 反証探索がある場合は信頼できる
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

// ============================================================================
// Helper Functions - Limitation Detection
// ============================================================================

/**
 * 検出の限界を特定
 */
function identifyDetectionLimitations(output: string): DetectionLimitation[] {
  const limitations: DetectionLimitation[] = [];

  // 形式依存の限界
  const hasStandardClaimResult = /CLAIM:\s*.+\nRESULT:\s*.+/i.test(output);
  const hasAlternateClaimResult = /主張:|結論:|C:|R:/i.test(output);
  if (!hasStandardClaimResult && hasAlternateClaimResult) {
    limitations.push({
      type: 'format-dependency',
      description: 'CLAIM/RESULTの標準形式ではない表現が使用されている',
      impact: 0.8,
      mitigation: '代替形式（主張/結果、C/R等）にも対応するか、手動で確認'
    });
  }

  // 言語依存の限界
  const japaneseContent = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(output);
  const hasEnglishKeywords = /CLAIM|RESULT|CONFIDENCE|EVIDENCE/i.test(output);
  if (japaneseContent && !hasEnglishKeywords) {
    limitations.push({
      type: 'language-dependency',
      description: '日本語コンテンツだが英語キーワードがない',
      impact: 0.6,
      mitigation: '日本語キーワード（主張/結果/信頼度/証拠）の使用を検討'
    });
  }

  // 境界値の恣意性
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const evidenceMatch = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/i);
  if (confidenceMatch && evidenceMatch) {
    const conf = parseFloat(confidenceMatch[1]);
    const length = evidenceMatch[1].trim().length;
    
    if ((conf > 0.88 && conf < 0.92) || (length >= 95 && length <= 105)) {
      limitations.push({
        type: 'threshold-arbitrariness',
        description: '信頼度または証拠長が境界値付近にある',
        impact: 0.4,
        mitigation: '境界値付近は判定が不安定。文脈を考慮した判断が必要'
      });
    }
  }

  // パターン網羅性の限界
  const hasStructuredReasoning = /summary:|claim:|evidence:|result:|discussion:/i.test(output);
  if (!hasStructuredReasoning && output.length > 500) {
    limitations.push({
      type: 'pattern-coverage',
      description: '構造化されていない長文出力で、パターンマッチングの効果が限定的',
      impact: 0.5,
      mitigation: '構造化フォーマットの使用またはLLMによる詳細分析'
    });
  }

  return limitations;
}

/**
 * 代替形式リスクを評価
 */
function assessAlternativeFormatRisk(output: string): {
  risk: number;
  possibleFormats: string[];
  reason: string;
} {
  const possibleFormats: string[] = [];
  let risk = 0;
  let reason = '';

  // 日本語ラベルの検出
  if (/主張:|結果:|結論:/.test(output)) {
    possibleFormats.push('日本語ラベル（主張/結果/結論）');
    risk += 0.3;
  }

  // 省略形の検出
  if (/\bC:|\bR:|\bCL:|\bRES:/.test(output)) {
    possibleFormats.push('省略形（C:/R:等）');
    risk += 0.25;
  }

  // 記号区切りの検出
  if (/Claim\s*[-=]|Result\s*[-=]|Conclusion\s*[-=]/i.test(output)) {
    possibleFormats.push('記号区切り（=または-）');
    risk += 0.2;
  }

  // 段落構造のみ
  if (!/CLAIM:|RESULT:|CONFIDENCE:|EVIDENCE:/i.test(output) && output.length > 300) {
    possibleFormats.push('構造化されていない段落形式');
    risk += 0.35;
    reason = '標準的なセクションヘッダーが存在しない';
  }

  if (possibleFormats.length === 0) {
    reason = '標準形式が使用されている';
  } else {
    reason = `代替形式が検出された: ${possibleFormats.join(', ')}`;
  }

  return {
    risk: Math.min(1, risk),
    possibleFormats,
    reason
  };
}

/**
 * 見落とされた可能性のある問題を特定
 */
function identifyPotentiallyMissedIssues(
  output: string,
  detectionStatus: { claimResult: boolean; overconfidence: boolean; alternatives: boolean; bias: boolean },
  limitations: DetectionLimitation[]
): MissedIssueCandidate[] {
  const candidates: MissedIssueCandidate[] = [];

  // CLAIM-RESULT不一致が見落とされている可能性
  if (!detectionStatus.claimResult) {
    const hasJapaneseLabels = /主張:|結果:/.test(output);
    const hasAbbreviations = /\bC:|\bR:/.test(output);
    
    if (hasJapaneseLabels || hasAbbreviations) {
      candidates.push({
        issueType: 'CLAIM-RESULT mismatch',
        reason: '代替形式（日本語ラベルまたは省略形）が使用されているため標準検出を回避している可能性',
        probability: 0.6,
        howToVerify: '手動で主張と結果の論理的整合性を確認'
      });
    }
  }

  // 過信が見落とされている可能性
  if (!detectionStatus.overconfidence) {
    const hasHighConfidence = /確信|自信|明らかに|間違いなく|clearly|obviously|definitely/i.test(output);
    const hasShortEvidence = output.length < 500 && /EVIDENCE:|証拠|根拠/i.test(output);
    
    if (hasHighConfidence && hasShortEvidence) {
      candidates.push({
        issueType: 'Overconfidence',
        reason: '高信頼度表現があるが、証拠が簡潔。過信の可能性',
        probability: 0.5,
        howToVerify: '証拠の具体性と信頼度表現のバランスを確認'
      });
    }
  }

  // 代替解釈の欠如が見落とされている可能性
  if (!detectionStatus.alternatives) {
    const hasConclusion = /CONCLUSION:|結論|したがって|以上より|therefore|最適/i.test(output);
    const highConfidence = /CONFIDENCE:\s*0\.[89]\d*/i.test(output);
    const noDiscussion = !/DISCUSSION:|議論|考察|alternatively|あるいは|または/i.test(output);
    
    if (hasConclusion && highConfidence && noDiscussion) {
      candidates.push({
        issueType: 'Missing alternatives',
        reason: '高信頼度の結論があるが、代替解釈や議論が含まれていない',
        probability: 0.55,
        howToVerify: '他の可能性や反証を探求したか確認'
      });
    }
  }

  // 確認バイアスが見落とされている可能性
  if (!detectionStatus.bias) {
    const onlyPositive = /成功|動作|正しく|完了|passed|works|success|verified|問題ない/i.test(output);
    const noNegativeSearch = !/反例|反証|失敗|エラー|counter|disconfirm|contradict/i.test(output);
    
    if (onlyPositive && noNegativeSearch && output.length > 100) {
      candidates.push({
        issueType: 'Confirmation bias',
        reason: '肯定的な結果のみが記述され、反証の探索が言及されていない',
        probability: 0.45,
        howToVerify: '否定証拠を探索したか、失敗ケースを検討したか確認'
      });
    }
  }

  // 限界に基づく追加の候補
  for (const limitation of limitations) {
    if (limitation.impact > 0.5) {
      candidates.push({
        issueType: `Detection limitation: ${limitation.type}`,
        reason: limitation.description,
        probability: limitation.impact * 0.5,
        howToVerify: limitation.mitigation
      });
    }
  }

  return candidates.sort((a, b) => b.probability - a.probability).slice(0, 5);
}

/**
 * 「検出なし」への信頼度を計算
 */
function calculateNegativeResultConfidence(
  _output: string,
  detectionConfidences: { claimResult: number; overconfidence: number; alternatives: number; bias: number },
  limitations: DetectionLimitation[],
  alternativeFormatRisk: { risk: number }
): number {
  // 各検出の信頼度の平均
  const avgConfidence = (
    detectionConfidences.claimResult +
    detectionConfidences.overconfidence +
    detectionConfidences.alternatives +
    detectionConfidences.bias
  ) / 4;

  // 限界の影響を減算
  const limitationImpact = limitations.reduce((sum, l) => sum + l.impact, 0) / Math.max(1, limitations.length);
  
  // 代替形式リスクを減算
  const formatRisk = alternativeFormatRisk.risk;

  // 総合信頼度 = 検出信頼度 - 限界影響 - 形式リスク
  const overallConfidence = avgConfidence * (1 - limitationImpact * 0.3) * (1 - formatRisk * 0.4);

  return Math.max(0.1, Math.min(0.95, overallConfidence));
}

/**
 * 推奨される追加検証を生成
 */
function generateRecommendedAdditionalChecks(
  limitations: DetectionLimitation[],
  potentiallyMissed: MissedIssueCandidate[],
  alternativeFormatRisk: { risk: number; possibleFormats: string[] }
): string[] {
  const checks: string[] = [];

  // 限界に基づく推奨
  for (const limitation of limitations) {
    if (limitation.impact >= 0.5) {
      checks.push(`[${limitation.type}] ${limitation.mitigation}`);
    }
  }

  // 見落とし候補に基づく推奨
  for (const missed of potentiallyMissed.slice(0, 3)) {
    if (missed.probability >= 0.4) {
      checks.push(`[${missed.issueType}] ${missed.howToVerify}`);
    }
  }

  // 形式リスクに基づく推奨
  if (alternativeFormatRisk.risk >= 0.3) {
    checks.push(`[Format] 標準形式（CLAIM:/RESULT:/CONFIDENCE:/EVIDENCE:）への変換を検討`);
  }

  return Array.from(new Set(checks)).slice(0, 5);
}
