/**
 * @abdd.meta
 * path: .pi/lib/context-breakdown-types.ts
 * role: コンテキスト利用状況の内訳情報を提供する型定義モジュール
 * why: コンテキストウィンドウの使用状況を可視化し、最適化のための分析データを提供するため
 * related: .pi/lib/context-engineering.ts, .pi/lib/context-repository.ts, .pi/lib/context-summarizer.ts
 * public_api: ContextBreakdown, ContextLayerBreakdown, ContextUsageMetrics, ContextEfficiencyScore
 * invariants:
 *   - ContextBreakdownのtotalTokensは各レイヤーの合計と一致する
 *   - efficiencyScoreは0.0〜1.0の範囲である
 *   - utilizationRatioは0.0を超える値である
 * side_effects:
 *   - なし（純粋な型定義）
 * failure_modes:
 *   - 型の不整合によるコンパイルエラー
 * @abdd.explain
 * overview: コンテキスト利用状況の多層的な内訳と効率性メトリクスを定義する
 * what_it_does:
 *   - カテゴリ別・優先度別・ソース別のコンテキスト使用量を定義する
 *   - コンテキスト効率性スコアと警告フラグを提供する
 *   - 時間経過による使用量変化の追跡データ構造を定義する
 * why_it_exists:
 *   - コンテキストウィンドウの使用パターンを分析し、最適化ポイントを特定するため
 *   - 異なる次元（カテゴリ、優先度、ソース）からの内訳情報を統一的に扱うため
 * scope:
 *   in: コンテキスト利用データ、トークン数、カテゴリ/優先度/ソース情報
 *   out: 構造化された内訳情報と効率性メトリクス
 */

import type { ContextCategory, ContextPriority } from "./context-engineering.js";

// ============================================================================
// Core Breakdown Types
// ============================================================================

/**
 * カテゴリ別コンテキスト内訳
 * @summary カテゴリ別内訳定義
 */
export interface CategoryBreakdown {
  /** カテゴリ名 */
  category: ContextCategory;
  /** 使用トークン数 */
  tokens: number;
  /** アイテム数 */
  itemCount: number;
  /** 総容量に対する割合 */
  ratio: number;
  /** 制限値（設定されている場合） */
  limit?: number;
  /** 制限超過フラグ */
  isOverLimit: boolean;
}

/**
 * 優先度別コンテキスト内訳
 * @summary 優先度別内訳定義
 */
export interface PriorityBreakdown {
  /** 優先度レベル */
  priority: ContextPriority;
  /** 使用トークン数 */
  tokens: number;
  /** アイテム数 */
  itemCount: number;
  /** 総容量に対する割合 */
  ratio: number;
  /** 重み付け係数 */
  weight: number;
}

/**
 * ソース別コンテキスト内訳
 * @summary ソース別内訳定義
 */
export interface SourceBreakdown {
  /** ソース識別子 */
  source: string;
  /** 使用トークン数 */
  tokens: number;
  /** アイテム数 */
  itemCount: number;
  /** 総容量に対する割合 */
  ratio: number;
  /** 最終更新タイムスタンプ */
  lastUpdated: number;
}

/**
 * 時間帯別コンテキスト使用量
 * @summary 時間帯別使用量定義
 */
export interface TemporalBreakdown {
  /** 時間帯識別子（ISO 8601形式または相対時間） */
  timeSlot: string;
  /** 開始タイムスタンプ */
  startTime: number;
  /** 終了タイムスタンプ */
  endTime: number;
  /** 使用トークン数 */
  tokens: number;
  /** アイテム追加数 */
  itemsAdded: number;
  /** アイテム削除数 */
  itemsRemoved: number;
}

// ============================================================================
// Layer Breakdown
// ============================================================================

/**
 * コンテキストレイヤー内訳
 * @summary レイヤー別内訳定義
 */
export interface ContextLayerBreakdown {
  /** Layer 1: システムプロンプト */
  systemPrompt: {
    tokens: number;
    itemCount: number;
    ratio: number;
    description: string;
  };
  /** Layer 2: タスク指示 */
  taskInstruction: {
    tokens: number;
    itemCount: number;
    ratio: number;
    description: string;
  };
  /** Layer 3: 実行ルール */
  executionRules: {
    tokens: number;
    itemCount: number;
    ratio: number;
    description: string;
  };
  /** Layer 4: ファイルコンテンツ */
  fileContent: {
    tokens: number;
    itemCount: number;
    ratio: number;
    description: string;
  };
  /** Layer 5: 会話履歴 */
  conversation: {
    tokens: number;
    itemCount: number;
    ratio: number;
    description: string;
  };
  /** Layer 6: エージェント出力 */
  agentOutput: {
    tokens: number;
    itemCount: number;
    ratio: number;
    description: string;
  };
  /** Layer 7: ワーキングメモリ */
  workingMemory: {
    tokens: number;
    itemCount: number;
    ratio: number;
    description: string;
  };
}

// ============================================================================
// Main ContextBreakdown Type
// ============================================================================

/**
 * コンテキスト内訳のメイン型
 * @summary コンテキスト内訳定義
 */
export interface ContextBreakdown {
  /** メタデータ */
  metadata: {
    /** 生成タイムスタンプ */
    generatedAt: number;
    /** 測定対象セッションID */
    sessionId?: string;
    /** 測定対象タスクID */
    taskId?: string;
    /** バージョン */
    version: string;
  };

  /** 基本メトリクス */
  metrics: {
    /** 総トークン数 */
    totalTokens: number;
    /** 最大許容トークン数 */
    maxTokens: number;
    /** 予約トークン数 */
    reservedTokens: number;
    /** 有効予算 */
    effectiveBudget: number;
    /** 利用率 */
    utilizationRatio: number;
    /** 残りトークン数 */
    remainingTokens: number;
  };

  /** レイヤー別内訳 */
  layerBreakdown: ContextLayerBreakdown;

  /** カテゴリ別内訳 */
  categoryBreakdown: CategoryBreakdown[];

  /** 優先度別内訳 */
  priorityBreakdown: PriorityBreakdown[];

  /** ソース別内訳（上位10件） */
  sourceBreakdown: SourceBreakdown[];

  /** 時間帯別内訳（オプション） */
  temporalBreakdown?: TemporalBreakdown[];

  /** 最も制約となっている要因 */
  limitingFactor?: {
    /** 要因タイプ */
    type: "category_limit" | "priority_weight" | "budget_exceeded" | "token_overflow";
    /** 要因の詳細 */
    detail: string;
    /** 影響を受けるカテゴリ/ソース */
    affectedItems: string[];
  };
}

// ============================================================================
// Usage Metrics
// ============================================================================

/**
 * コンテキスト使用メトリクス
 * @summary 使用メトリクス定義
 */
export interface ContextUsageMetrics {
  /** メトリクスID */
  id: string;
  /** 測定開始タイムスタンプ */
  startTime: number;
  /** 測定終了タイムスタンプ */
  endTime: number;
  /** 期間（ミリ秒） */
  duration: number;

  /** 平均使用率 */
  averageUtilization: number;
  /** 最大使用率 */
  peakUtilization: number;
  /** 最小使用率 */
  minUtilization: number;

  /** サマリー生成回数 */
  summarizationCount: number;
  /** トリムされたアイテム数 */
  trimmedItemCount: number;
  /** 完全に削除されたアイテム数 */
  removedItemCount: number;

  /** カテゴリ別の推移 */
  categoryTrends: Record<ContextCategory, {
    initialTokens: number;
    finalTokens: number;
    peakTokens: number;
  }>;

  /** 警告発生回数 */
  warningCount: number;
  /** エラー発生回数 */
  errorCount: number;
}

// ============================================================================
// Efficiency Score
// ============================================================================

/**
 * コンテキスト効率性スコア
 * @summary 効率性スコア定義
 */
export interface ContextEfficiencyScore {
  /** スコアID */
  id: string;
  /** 測定タイムスタンプ */
  timestamp: number;

  /** 総合効率性スコア（0.0〜1.0） */
  overallScore: number;

  /** 詳細スコア */
  breakdown: {
    /** 利用率スコア（適切な範囲での使用） */
    utilizationScore: number;
    /** 分布スコア（カテゴリ間のバランス） */
    distributionScore: number;
    /** 優先度スコア（重要なコンテンツの保持） */
    priorityScore: number;
    /** 鮮度スコア（最新情報の保持） */
    freshnessScore: number;
    /** 冗長性スコア（重複の少なさ） */
    redundancyScore: number;
  };

  /** 改善提案 */
  recommendations: {
    /** 優先度 */
    priority: "high" | "medium" | "low";
    /** 説明 */
    description: string;
    /** 推定効果 */
    estimatedImpact: string;
    /** 対象カテゴリ（該当する場合） */
    targetCategory?: ContextCategory;
  }[];

  /** 警告フラグ */
  warnings: {
    /** 警告タイプ */
    type: "high_utilization" | "low_priority_dominance" | "stale_content" | "redundancy_detected";
    /** 説明 */
    description: string;
    /** 深刻度 */
    severity: "warning" | "critical";
  }[];
}

// ============================================================================
// Comparison Types
// ============================================================================

/**
 * コンテキスト内訳比較結果
 * @summary 内訳比較定義
 */
export interface ContextBreakdownComparison {
  /** 比較ID */
  id: string;
  /** ベース内訳 */
  baseline: ContextBreakdown;
  /** 比較対象内訳 */
  comparison: ContextBreakdown;
  /** 差分 */
  diff: {
    /** トークン増減 */
    tokenDelta: number;
    /** 利用率変化 */
    utilizationDelta: number;
    /** カテゴリ別変化 */
    categoryChanges: Array<{
      category: ContextCategory;
      tokenDelta: number;
      ratioDelta: number;
    }>;
    /** 新規追加ソース */
    newSources: string[];
    /** 削除されたソース */
    removedSources: string[];
  };
  /** 分析結果 */
  analysis: {
    /** 効率性向上フラグ */
    isImproved: boolean;
    /** 主な変化要因 */
    primaryChangeFactors: string[];
    /** 推奨事項 */
    recommendations: string[];
  };
}

// ============================================================================
// Export all types
// ============================================================================

// Types are exported via `export interface` declarations above
// No runtime exports needed for pure type definitions
