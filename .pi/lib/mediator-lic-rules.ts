/**
 * @abdd.meta
 * path: .pi/lib/mediator-lic-rules.ts
 * role: ルールベースのLiC（Lost in Context）検出エンジン
 * why: LLM呼び出しを減らし、高速なLiC検出を提供するため。論文Section 4.5の知見をルール化
 * related: ./mediator-types.ts, ./intent-mediator.ts
 * public_api: detectLicIndicators, LiCDetectionRule, LIC_DETECTION_RULES
 * invariants: 各ルールは副作用を持たない純粋関数である
 * side_effects: なし
 * failure_modes: 過検出（false positive）のリスク、文脈依存の誤判定
 * @abdd.explain
 * overview: LLMを使用せずにLost in Context兆候を検出するルールベースエンジン。論文の知見を軽量なヒューリスティックとして実装する
 * what_it_does:
 *   - 汎用応答パターンの検出
 *   - 文脈無視の検出
 *   - 前提不一致の検出
 *   - 過度な確認要求の検出
 * why_it_exists:
 *   - LLM呼び出しのオーバーヘッドを削減するため
 *   - 高速なリアルタイム検出を可能にするため
 * scope:
 *   in: エージェント応答、会話履歴、確認済み事実
 *   out: 検出されたLiC兆候のリスト
 */

/**
 * LiC Rule-Based Detection Engine.
 * Provides fast, training-free detection of Lost in Context indicators.
 * Based on paper Section 4.5: LiC Detection patterns.
 */

import {
  type LiCIndicator,
  type ConfirmedFact,
  type ConversationTurn,
  type MediatorContext,
} from "./mediator-types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * LiC検出ルール
 * @summary 検出ルール定義
 */
export interface LiCDetectionRule {
  /** ルールID */
  id: string;
  /** ルール名 */
  name: string;
  /** 兆候タイプ */
  indicatorType: LiCIndicator["type"];
  /** 検出関数 */
  detect: (context: DetectionContext) => LiCDetectionResult | null;
  /** 信頼度ベースライン */
  confidenceBaseline: number;
  /** ルールの説明 */
  description: string;
}

/**
 * 検出コンテキスト
 * @summary 検出コンテキスト
 */
export interface DetectionContext {
  /** エージェント応答 */
  agentResponse: string;
  /** ユーザー入力 */
  userInput: string;
  /** 直近の会話履歴 */
  recentHistory: ConversationTurn[];
  /** 確認済み事実 */
  confirmedFacts: ConfirmedFact[];
  /** 現在のターン番号 */
  turnNumber: number;
}

/**
 * 検出結果
 * @summary 検出結果
 */
export interface LiCDetectionResult {
  /** 検出されたか */
  detected: boolean;
  /** 信頼度（0.0-1.0） */
  confidence: number;
  /** 検出内容の説明 */
  content: string;
  /** 推奨対処 */
  recommendedAction?: string;
}

// ============================================================================
// Generic Response Detection Rules
// ============================================================================

/**
 * 汎用応答パターンを検出するルール
 * 文脈に固有の情報が欠落している場合に検出
 */
const GENERIC_RESPONSE_RULE: LiCDetectionRule = {
  id: "generic-response-v1",
  name: "Generic Response Detection",
  indicatorType: "generic_response",
  confidenceBaseline: 0.6,
  description: "汎用的すぎる応答（文脈固有情報の欠落）を検出",

  detect: (context: DetectionContext): LiCDetectionResult | null => {
    const { agentResponse, confirmedFacts } = context;

    // 汎用的な応答パターン
    const genericPatterns = [
      /^申し訳ありませんが、.*理解できませんでした/,
      /^もう少し詳しく教えていただけますか/,
      /^どのようなことをお知りになりたいですか/,
      /^一般的には、/,
      /^通常は、/,
    ];

    for (const pattern of genericPatterns) {
      if (pattern.test(agentResponse)) {
        // 確認済み事実が存在するのに汎用応答の場合は高信頼度
        const hasFacts = confirmedFacts.length > 0;
        return {
          detected: true,
          confidence: hasFacts ? 0.8 : 0.6,
          content: `汎用応答パターン「${pattern.source.slice(0, 30)}...」を検出`,
          recommendedAction: "文脈を再強調して再質問する",
        };
      }
    }

    return null;
  },
};

// ============================================================================
// Context Ignoration Detection Rules
// ============================================================================

/**
 * 文脈無視を検出するルール
 * 明示的に言及された情報が応答に反映されていない場合
 */
const CONTEXT_IGNORATION_RULE: LiCDetectionRule = {
  id: "context-ignoration-v1",
  name: "Context Ignoration Detection",
  indicatorType: "context_ignore",
  confidenceBaseline: 0.7,
  description: "明示的な文脈の無視を検出",

  detect: (context: DetectionContext): LiCDetectionResult | null => {
    const { agentResponse, userInput, confirmedFacts } = context;

    // ユーザー入力に含まれる重要なキーワードを抽出
    const importantKeywords = extractImportantKeywords(userInput);

    // 確認済み事実からもキーワードを追加
    const factKeywords = confirmedFacts
      .slice(-5)
      .flatMap((f) => extractImportantKeywords(f.value));

    const allKeywords = [...new Set([...importantKeywords, ...factKeywords])];

    // 応答にキーワードが含まれていない場合
    const missingKeywords = allKeywords.filter(
      (kw) => !agentResponse.toLowerCase().includes(kw.toLowerCase())
    );

    if (missingKeywords.length > 0 && allKeywords.length > 2) {
      const ratio = missingKeywords.length / allKeywords.length;
      if (ratio > 0.5) {
        return {
          detected: true,
          confidence: Math.min(0.9, 0.5 + ratio * 0.4),
          content: `重要キーワード「${missingKeywords.slice(0, 3).join(", ")}」が応答に反映されていない`,
          recommendedAction: "不足情報を明示的に再指定する",
        };
      }
    }

    return null;
  },
};

// ============================================================================
// Premise Mismatch Detection Rules
// ============================================================================

/**
 * 前提不一致を検出するルール
 * ユーザーの前提とエージェントの前提が異なる場合
 */
const PREMISE_MISMATCH_RULE: LiCDetectionRule = {
  id: "premise-mismatch-v1",
  name: "Premise Mismatch Detection",
  indicatorType: "premise_mismatch",
  confidenceBaseline: 0.6,
  description: "ユーザーとエージェントの前提不一致を検出",

  detect: (context: DetectionContext): LiCDetectionResult | null => {
    const { agentResponse, userInput } = context;

    // 否定的な反応パターン（前提不一致を示唆）
    const mismatchPatterns = [
      { pattern: /違います|異なります|そうではありません/, confidence: 0.7 },
      { pattern: /を想定していましたが/, confidence: 0.6 },
      { pattern: /ではなく、/, confidence: 0.5 },
      { pattern: /当初の/, confidence: 0.4 },
    ];

    for (const { pattern, confidence } of mismatchPatterns) {
      if (pattern.test(agentResponse)) {
        return {
          detected: true,
          confidence,
          content: `前提不一致パターン「${pattern.source}」を検出`,
          recommendedAction: "前提を明確化する質問を生成する",
        };
      }
    }

    // ユーザー入力に「A」が含まれるのに応答が「Aではない」としている場合
    const userNegation = /(.+)ではなく/;
    const match = userNegation.exec(userInput);
    if (match) {
      const excluded = match[1];
      if (agentResponse.includes(excluded)) {
        return {
          detected: true,
          confidence: 0.8,
          content: `ユーザーが除外指定した「${excluded}」が応答に含まれている`,
          recommendedAction: "除外条件を再確認する",
        };
      }
    }

    return null;
  },
};

// ============================================================================
// Confirmation Overload Detection Rules
// ============================================================================

/**
 * 過度な確認要求を検出するルール
 * 短期間に同じ質問を繰り返している場合
 */
const CONFIRMATION_OVERLOAD_RULE: LiCDetectionRule = {
  id: "confirmation-overload-v1",
  name: "Confirmation Overload Detection",
  indicatorType: "confirmation_overload",
  confidenceBaseline: 0.5,
  description: "過度な確認要求を検出",

  detect: (context: DetectionContext): LiCDetectionResult | null => {
    const { agentResponse, recentHistory } = context;

    // 確認要求パターン
    const confirmationPattern = /(確認|確認させて|よろしいですか|正しいですか)/;
    if (!confirmationPattern.test(agentResponse)) {
      return null;
    }

    // 直近3ターンでの確認要求数をカウント
    const recentConfirmations = recentHistory
      .slice(-3)
      .filter((turn) => confirmationPattern.test(turn.agentResponse)).length;

    if (recentConfirmations >= 2) {
      return {
        detected: true,
        confidence: 0.5 + recentConfirmations * 0.15,
        content: `直近${recentConfirmations + 1}回連続で確認要求が発生`,
        recommendedAction: "確認をまとめて行うか、自律的に判断させる",
      };
    }

    return null;
  },
};

// ============================================================================
// Topic Drift Detection Rules
// ============================================================================

/**
 * トピック逸脱を検出するルール
 * 会話の焦点が大きく変化している場合
 */
const TOPIC_DRIFT_RULE: LiCDetectionRule = {
  id: "topic-drift-v1",
  name: "Topic Drift Detection",
  indicatorType: "topic_drift",
  confidenceBaseline: 0.5,
  description: "トピックの逸脱を検出",

  detect: (context: DetectionContext): LiCDetectionResult | null => {
    const { userInput, recentHistory, confirmedFacts } = context;

    if (recentHistory.length < 3) {
      return null;
    }

    // 現在の入力と直近の履歴の類似度を簡易チェック
    const currentKeywords = extractImportantKeywords(userInput);
    const recentKeywords = recentHistory
      .slice(-3)
      .flatMap((turn) => extractImportantKeywords(turn.userInput));

    // キーワード重複がない場合
    const overlap = currentKeywords.filter((kw) =>
      recentKeywords.some((rk) => rk.toLowerCase() === kw.toLowerCase())
    );

    if (currentKeywords.length > 2 && overlap.length === 0) {
      // 確認済み事実との関連もチェック
      const factKeywords = confirmedFacts.flatMap((f) =>
        extractImportantKeywords(f.value)
      );
      const factOverlap = currentKeywords.filter((kw) =>
        factKeywords.some((fk) => fk.toLowerCase() === kw.toLowerCase())
      );

      if (factOverlap.length === 0) {
        return {
          detected: true,
          confidence: 0.6,
          content: "直近の会話および確認済み事実との関連性が低い",
          recommendedAction: "コンテキストスイッチの意図を確認する",
        };
      }
    }

    return null;
  },
};

// ============================================================================
// Rule Registry
// ============================================================================

/**
 * 全てのLiC検出ルール
 * @summary ルールレジストリ
 */
export const LIC_DETECTION_RULES: LiCDetectionRule[] = [
  GENERIC_RESPONSE_RULE,
  CONTEXT_IGNORATION_RULE,
  PREMISE_MISMATCH_RULE,
  CONFIRMATION_OVERLOAD_RULE,
  TOPIC_DRIFT_RULE,
];

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * ルールベースでLiC兆候を検出する
 * @summary LiC兆候検出
 * @param context 検出コンテキスト
 * @param rules 使用するルール（デフォルト: 全ルール）
 * @returns 検出されたLiC兆候のリスト
 */
export function detectLicIndicators(
  context: DetectionContext,
  rules: LiCDetectionRule[] = LIC_DETECTION_RULES
): LiCIndicator[] {
  const indicators: LiCIndicator[] = [];
  const timestamp = new Date().toISOString();

  for (const rule of rules) {
    try {
      const result = rule.detect(context);

      if (result && result.detected) {
        indicators.push({
          id: `lic-rule-${rule.id}-${Date.now()}`,
          type: rule.indicatorType,
          detectedContent: result.content,
          confidence: Math.max(result.confidence, rule.confidenceBaseline),
          detectedAt: timestamp,
          recommendedAction: result.recommendedAction || "",
        });
      }
    } catch (error) {
      console.error(`[mediator-lic-rules] Rule ${rule.id} failed:`, error);
    }
  }

  return indicators;
}

/**
 * 高信頼度の兆候のみを抽出
 * @summary 高信頼度兆候抽出
 * @param indicators 全ての兆候
 * @param threshold 信頼度閾値（デフォルト: 0.7）
 * @returns 高信頼度の兆候のみ
 */
export function filterHighConfidenceIndicators(
  indicators: LiCIndicator[],
  threshold = 0.7
): LiCIndicator[] {
  return indicators.filter((i) => i.confidence >= threshold);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 重要なキーワードを抽出する
 * @summary キーワード抽出
 * @param text テキスト
 * @returns 抽出されたキーワード
 */
function extractImportantKeywords(text: string): string[] {
  // 日本語のストップワード
  const stopWords = new Set([
    "して", "しない", "した", "する", "です", "ます", "て", "に", "は", "が",
    "を", "の", "で", "と", "から", "まで", "より", "また", "そして", "または",
    "この", "その", "あの", "どの", "これ", "それ", "あれ", "どれ",
    "いる", "ある", "ない", "なる", "できる", "ください", "お願い",
  ]);

  // 単語境界で分割（日本語は文字ベース）
  const words = text
    .replace(/[ぁ-ん]{1,2}/g, " ") // 1-2文字のひらがなを除去
    .replace(/[、。！？]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w));

  return [...new Set(words)];
}

/**
 * 検出結果のサマリーを生成
 * @summary 検出サマリー生成
 * @param indicators 検出された兆候
 * @returns サマリーテキスト
 */
export function generateDetectionSummary(indicators: LiCIndicator[]): string {
  if (indicators.length === 0) {
    return "LiC兆候は検出されませんでした";
  }

  const byType: Record<string, number> = {};
  for (const indicator of indicators) {
    byType[indicator.type] = (byType[indicator.type] || 0) + 1;
  }

  const summaryParts = Object.entries(byType).map(
    ([type, count]) => `${type}: ${count}件`
  );

  const avgConfidence =
    indicators.reduce((sum, i) => sum + i.confidence, 0) / indicators.length;

  return `LiC兆候検出: ${indicators.length}件 (${summaryParts.join(", ")}) - 平均信頼度: ${(avgConfidence * 100).toFixed(0)}%`;
}
