/**
 * @abdd.meta
 * path: .pi/lib/verification/extraction/integrated-detection.ts
 * role: 統合検出機能
 * why: パターンマッチングとLLM判定を組み合わせた検出を実現するため
 * related: ./candidates.ts, ../generation/prompts.ts, ../types.ts
 * public_api: runIntegratedDetection, runLLMEnhancedDetection, IntegratedVerificationResult
 * invariants: runIntegratedDetectionは常にIntegratedVerificationResultを返す
 * side_effects: なし（runLLMEnhancedDetectionを除く）
 * failure_modes: 入力が空の場合、空の結果を返す
 * @abdd.explain
 * overview: パターンマッチングによる候補抽出とLLM判定を統合した検出システム
 * what_it_does:
 *   - パターンマッチングで候補を抽出する
 *   - コンテキストフィルタで偽陽性を削減する
 *   - LLM判定で信頼度を向上させる（オプション）
 *   - 統合判定結果を生成する
 * why_it_exists:
 *   - 高精度な検出を実現し、偽陽性を最小化するため
 * scope:
 *   in: ./candidates.ts, ../generation/prompts.ts, ../types.ts
 *   out: ../assessment/uncertainty.ts, ../core.ts
 */

import {
  extractCandidates,
  applyContextFilter,
  generateFilterStats,
  type CandidateDetection,
  FALLACY_PATTERNS,
  BINARY_OPPOSITION_PATTERNS,
  FASCISM_PATTERNS,
  CRAVING_PATTERNS
} from './candidates.js';
import {
  generateLLMVerificationPrompt,
  parseLLMVerificationResponse,
  mapTypeToVerificationType
} from '../generation/prompts.js';

// ============================================================================
// Types
// ============================================================================

/**
 * LLM判定リクエスト
 * @summary LLMによる判定依頼
 */
export interface LLMVerificationRequest {
  /** 検出候補 */
  candidate: CandidateDetection;
  /** 分析対象テキスト全体 */
  fullText: string;
  /** タスクコンテキスト */
  taskContext?: string;
  /** 判定タイプ */
  verificationType: 'fallacy' | 'binary_opposition' | 'aporia' | 'fascism' | 'reasoning_gap';
}

/**
 * LLM判定結果
 * @summary LLMによる判定結果
 */
export interface LLMVerificationResult {
  /** 元の候補 */
  candidate: CandidateDetection;
  /** 判定結果 */
  verdict: 'confirmed' | 'rejected' | 'uncertain';
  /** 信頼度（0-1） */
  confidence: number;
  /** 判定理由 */
  reasoning: string;
  /** 文脈的考慮事項 */
  contextualFactors: string[];
  /** 代替解釈 */
  alternativeInterpretation?: string;
}

/**
 * 統合検出結果
 * @summary パターンマッチングとLLM判定を組み合わせた結果
 */
export interface IntegratedVerificationResult {
  /** 検出候補リスト */
  candidates: CandidateDetection[];
  /** LLM判定結果（実行した場合） */
  llmResults?: LLMVerificationResult[];
  /** 最終判定 */
  finalVerdict: 'confirmed' | 'rejected' | 'uncertain' | 'skipped';
  /** 総合信頼度 */
  overallConfidence: number;
  /** 判定方法 */
  method: 'pattern-only' | 'llm-enhanced' | 'llm-only';
  /** 判定理由の要約 */
  summary: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 統合検出を実行（パターンマッチングのみ）
 * @summary 統合候補抽出
 * @param text 分析対象テキスト
 * @param options 検出オプション
 * @returns 統合判定結果
 */
export function runIntegratedDetection(
  text: string,
  options: {
    detectFallacies?: boolean;
    detectBinaryOppositions?: boolean;
    detectFascism?: boolean;
    detectCravings?: boolean;
    minPatternConfidence?: number;
    /** コンテキストフィルタを適用するか */
    applyFilter?: boolean;
  } = {}
): IntegratedVerificationResult {
  const {
    detectFallacies = true,
    detectBinaryOppositions = true,
    detectFascism = true,
    detectCravings = true,
    minPatternConfidence = 0.2,
    applyFilter = true
  } = options;

  const allCandidates: CandidateDetection[] = [];

  if (detectFallacies) {
    allCandidates.push(...extractCandidates(text, FALLACY_PATTERNS));
  }
  if (detectBinaryOppositions) {
    allCandidates.push(...extractCandidates(text, BINARY_OPPOSITION_PATTERNS));
  }
  if (detectFascism) {
    allCandidates.push(...extractCandidates(text, FASCISM_PATTERNS));
  }
  if (detectCravings) {
    allCandidates.push(...extractCandidates(text, CRAVING_PATTERNS));
  }

  // Step 1: コンテキストフィルタを適用
  const afterContextFilter = applyFilter 
    ? applyContextFilter(allCandidates, text)
    : allCandidates;
  
  const filterStats = generateFilterStats(allCandidates.length, afterContextFilter);

  // Step 2: 信頼度でフィルタリング
  const filteredCandidates = afterContextFilter.filter(
    c => c.patternConfidence >= minPatternConfidence
  );

  // Step 3: 重複除去（同じ位置の検出をまとめる）
  const uniqueCandidates = filteredCandidates.filter((candidate, index, self) =>
    index === self.findIndex(c =>
      c.location.start === candidate.location.start &&
      c.location.end === candidate.location.end
    )
  );

  // パターンのみの判定結果
  const avgConfidence = uniqueCandidates.length > 0
    ? uniqueCandidates.reduce((sum, c) => sum + c.patternConfidence, 0) / uniqueCandidates.length
    : 0;

  // 詳細なサマリーを生成
  const summaryParts: string[] = [];
  if (uniqueCandidates.length > 0) {
    summaryParts.push(`${uniqueCandidates.length}件の候補`);
    if (filterStats.excludedCount > 0) {
      summaryParts.push(`(${filterStats.excludedCount}件除外)`);
    }
    summaryParts.push(`高信頼度: ${filterStats.confidenceDistribution.high}件`);
  }

  return {
    candidates: uniqueCandidates,
    finalVerdict: uniqueCandidates.length > 0 ? 'uncertain' : 'rejected',
    overallConfidence: avgConfidence,
    method: 'pattern-only',
    summary: uniqueCandidates.length > 0
      ? summaryParts.join(', ')
      : '検出候補なし'
  };
}

/**
 * LLM拡張メタ認知チェックを実行
 * @summary LLM拡張メタ認知チェック
 * @param text 分析対象テキスト
 * @param llmVerifyFunction LLM検証関数（外部から注入）
 * @param context コンテキスト
 * @returns 統合判定結果
 */
export async function runLLMEnhancedDetection(
  text: string,
  llmVerifyFunction: (prompt: string) => Promise<string>,
  context: { task?: string; skipPatternsWithHighConfidence?: boolean } = {}
): Promise<IntegratedVerificationResult> {
  // Step 1: パターンマッチングで候補抽出
  const patternResult = runIntegratedDetection(text);
  
  if (patternResult.candidates.length === 0) {
    return patternResult;
  }

  // Step 2: 各候補をLLMで検証
  const llmResults: LLMVerificationResult[] = [];
  
  for (const candidate of patternResult.candidates) {
    // 高信頼度パターンはスキップ可能
    if (context.skipPatternsWithHighConfidence && candidate.patternConfidence >= 0.8) {
      llmResults.push({
        candidate,
        verdict: 'confirmed',
        confidence: candidate.patternConfidence,
        reasoning: '高信頼度パターン（LLM検証スキップ）',
        contextualFactors: []
      });
      continue;
    }

    const verificationType = mapTypeToVerificationType(candidate.type);
    const request: LLMVerificationRequest = {
      candidate,
      fullText: text,
      taskContext: context.task,
      verificationType
    };

    const prompt = generateLLMVerificationPrompt({
      candidate: {
        type: candidate.type,
        matchedText: candidate.matchedText,
        context: candidate.context
      },
      fullText: text,
      taskContext: context.task,
      verificationType
    });
    
    try {
      const llmResponse = await llmVerifyFunction(prompt);
      const result = parseLLMVerificationResponse(llmResponse, {
        type: candidate.type,
        matchedText: candidate.matchedText,
        context: candidate.context
      });
      llmResults.push({
        candidate,
        verdict: result.verdict,
        confidence: result.confidence,
        reasoning: result.reasoning,
        contextualFactors: result.contextualFactors,
        alternativeInterpretation: result.alternativeInterpretation
      });
    } catch (error) {
      // LLM検証エラーの場合は不確定として扱う
      llmResults.push({
        candidate,
        verdict: 'uncertain',
        confidence: 0.3,
        reasoning: `LLM検証エラー: ${error}`,
        contextualFactors: []
      });
    }
  }

  // Step 3: 結果を統合
  const confirmedCount = llmResults.filter(r => r.verdict === 'confirmed').length;
  const rejectedCount = llmResults.filter(r => r.verdict === 'rejected').length;
  const uncertainCount = llmResults.filter(r => r.verdict === 'uncertain').length;

  let finalVerdict: 'confirmed' | 'rejected' | 'uncertain';
  let overallConfidence: number;

  if (confirmedCount > rejectedCount) {
    finalVerdict = 'confirmed';
    overallConfidence = llmResults
      .filter(r => r.verdict === 'confirmed')
      .reduce((sum, r) => sum + r.confidence, 0) / confirmedCount;
  } else if (rejectedCount > confirmedCount) {
    finalVerdict = 'rejected';
    overallConfidence = llmResults
      .filter(r => r.verdict === 'rejected')
      .reduce((sum, r) => sum + r.confidence, 0) / rejectedCount;
  } else {
    finalVerdict = 'uncertain';
    overallConfidence = 0.5;
  }

  const summary = `検出: ${patternResult.candidates.length}件, ` +
    `確認: ${confirmedCount}件, ` +
    `却下: ${rejectedCount}件, ` +
    `不明: ${uncertainCount}件`;

  return {
    candidates: patternResult.candidates,
    llmResults,
    finalVerdict,
    overallConfidence,
    method: 'llm-enhanced',
    summary
  };
}

/**
 * 検出結果のサマリーを生成
 * @summary 検出結果サマリー
 * @param result 統合検出結果
 * @returns 人間可読なサマリー
 */
export function generateDetectionSummary(result: IntegratedVerificationResult): string {
  const lines: string[] = [];

  lines.push('## 統合検出結果');
  lines.push('');

  // 判定結果
  const verdictLabel = {
    confirmed: '確認済み',
    rejected: '却下',
    uncertain: '不確定',
    skipped: 'スキップ'
  };
  lines.push(`### 最終判定: ${verdictLabel[result.finalVerdict]}`);
  lines.push(`- 信頼度: ${(result.overallConfidence * 100).toFixed(0)}%`);
  lines.push(`- 方法: ${result.method}`);
  lines.push('');

  // 候補一覧
  if (result.candidates.length > 0) {
    lines.push('### 検出候補');
    for (const candidate of result.candidates.slice(0, 10)) {
      lines.push(`- [${candidate.type}] "${candidate.matchedText.slice(0, 30)}" (${(candidate.patternConfidence * 100).toFixed(0)}%)`);
    }
    if (result.candidates.length > 10) {
      lines.push(`  ... 他 ${result.candidates.length - 10}件`);
    }
    lines.push('');
  }

  // LLM結果
  if (result.llmResults && result.llmResults.length > 0) {
    lines.push('### LLM判定結果');
    for (const llmResult of result.llmResults.slice(0, 5)) {
      lines.push(`- [${llmResult.verdict}] "${llmResult.candidate.matchedText.slice(0, 20)}" (${(llmResult.confidence * 100).toFixed(0)}%)`);
      lines.push(`  > ${llmResult.reasoning.slice(0, 100)}`);
    }
    lines.push('');
  }

  lines.push(`### サマリー: ${result.summary}`);

  return lines.join('\n');
}
