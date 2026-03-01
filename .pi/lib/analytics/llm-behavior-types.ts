/**
 * @abdd.meta
 * path: .pi/lib/analytics/llm-behavior-types.ts
 * role: LLM行動計測基盤の型定義
 * why: LLM実行の効率・品質をデータ駆動で最適化するためのメトリクス型を提供
 * related: .pi/lib/analytics/metric-collectors.ts, .pi/lib/analytics/behavior-storage.ts
 * public_api: LLMBehaviorRecord, PromptMetrics, OutputMetrics, ExecutionMetrics, QualityMetrics, ExecutionContext
 * invariants: スコアは0-1の範囲、トークン見積は文字数/4で概算
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: LLMの実行メトリクス（プロンプト、出力、実行時間、品質）を記録・分析するための型定義
 * what_it_does:
 *   - プロンプトサイズ、スキル数、制約数を記録
 *   - 出力サイズ、Thinkingブロック有無、構造タイプを記録
 *   - 実行時間、リトライ回数、モデル情報を記録
 *   - フォーマット遵守率、CLAIM-RESULT整合性を記録
 * why_it_exists:
 *   - LLM実行の効率を定量化し、最適化効果を測定するため
 *   - データ駆動のプロンプトエンジニアリングを可能にするため
 * scope:
 *   in: なし（型定義）
 *   out: LLMBehaviorRecord等のインターフェース
 */

import type { RunOutcomeCode, ThinkingLevel } from "../agent/agent-types.js";

// ============================================================================
// Core Types
// ============================================================================

/**
 * LLM行動レコード
 * @summary 1回のLLM実行の完全なメトリクス
 */
export interface LLMBehaviorRecord {
  /** レコードID */
  id: string;
  /** 記録時刻 (ISO 8601) */
  timestamp: string;
  /** 実行ソース */
  source: "subagent" | "team_member" | "main_agent";

  /** プロンプトメトリクス */
  prompt: PromptMetrics;
  /** 出力メトリクス */
  output: OutputMetrics;
  /** 実行メトリクス */
  execution: ExecutionMetrics;
  /** 品質メトリクス */
  quality: QualityMetrics;
  /** 実行コンテキスト */
  context: ExecutionContext;
}

/**
 * プロンプトメトリクス
 * @summary 入力プロンプトのサイズと構成
 */
export interface PromptMetrics {
  /** 文字数 */
  charCount: number;
  /** 推定トークン数（~4文字/トークン） */
  estimatedTokens: number;
  /** 含まれるスキル数 */
  skillCount: number;
  /** システムプロンプト含有 */
  hasSystemPrompt: boolean;
  /** 例示含有 */
  hasExamples: boolean;
  /** 制約条件の数 */
  constraintCount: number;
}

/**
 * 出力メトリクス
 * @summary LLM出力のサイズと構造
 */
export interface OutputMetrics {
  /** 文字数 */
  charCount: number;
  /** 推定トークン数 */
  estimatedTokens: number;
  /** Thinkingブロック存在 */
  thinkingBlockPresent: boolean;
  /** Thinkingブロック文字数 */
  thinkingBlockChars: number;
  /** Thinkingブロック推定トークン数 */
  thinkingBlockTokens: number;
  /** 構造タイプ */
  structureType: "internal" | "external" | "mixed" | "unstructured";
}

/**
 * 実行メトリクス
 * @summary 実行時間とリソース使用
 */
export interface ExecutionMetrics {
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** リトライ回数 */
  retryCount: number;
  /** 結果コード */
  outcomeCode: RunOutcomeCode | string;
  /** 使用モデル */
  modelUsed: string;
  /** 思考レベル */
  thinkingLevel: ThinkingLevel | string;
}

/**
 * 品質メトリクス
 * @summary 出力の品質スコア
 */
export interface QualityMetrics {
  /** フォーマット遵守スコア（0.0-1.0） */
  formatComplianceScore: number;
  /** CLAIM-RESULT整合性（0.0-1.0） */
  claimResultConsistency: number;
  /** 必須ラベル含有 */
  hasRequiredLabels: boolean;
  /** 証拠項目数 */
  evidenceCount: number;
  /** 結果完全性（0.0-1.0） */
  resultCompleteness: number;
}

/**
 * 実行コンテキスト
 * @summary タスクの種類と関連情報
 */
export interface ExecutionContext {
  /** タスクタイプ */
  taskType: "research" | "implementation" | "review" | "planning" | "other";
  /** エージェントロール */
  agentRole: string;
  /** 親実行ID */
  parentRunId?: string;
  /** 関連ファイルパターン */
  filePatterns: string[];
}

// ============================================================================
// Aggregate Types
// ============================================================================

/**
 * 集計メトリクス
 * @summary 期間ごとの集計データ
 */
export interface LLMBehaviorAggregates {
  /** 集計期間 */
  period: "hour" | "day" | "week";
  /** 開始時刻 */
  startTime: string;
  /** 終了時刻 */
  endTime: string;

  /** 合計値 */
  totals: {
    runs: number;
    errors: number;
    totalPromptTokens: number;
    totalOutputTokens: number;
    totalThinkingTokens: number;
    totalDurationMs: number;
  };

  /** 平均値 */
  averages: {
    promptTokens: number;
    outputTokens: number;
    efficiency: number;
    formatCompliance: number;
    claimResultConsistency: number;
    durationMs: number;
  };

  /** 検出された異常 */
  anomalies: AnomalyRecord[];
}

/**
 * 異常レコード
 * @summary 検出された異常パターン
 */
export interface AnomalyRecord {
  /** 検出時刻 */
  timestamp: string;
  /** 異常タイプ */
  type: "efficiency_drop" | "format_violation" | "timeout_spike" | "unusual_pattern";
  /** 重要度 */
  severity: "low" | "medium" | "high";
  /** 詳細説明 */
  details: string;
  /** 関連実行ID */
  runId: string;
}

// ============================================================================
// Efficiency Types
// ============================================================================

/**
 * 効率スコア
 * @summary 総合的な実行効率評価
 */
export interface EfficiencyScore {
  /** 総合スコア（0.0-1.0） */
  overall: number;
  /** コンポーネント別スコア */
  components: {
    /** トークン効率 */
    tokenEfficiency: number;
    /** 時間効率 */
    timeEfficiency: number;
    /** フォーマット効率 */
    formatEfficiency: number;
    /** 品質効率 */
    qualityEfficiency: number;
  };
}

/**
 * 最適化比較結果
 * @summary 最適化前後の比較
 */
export interface OptimizationComparison {
  /** ベースライン期間 */
  baseline: TimeRange;
  /** 最適化後期間 */
  optimized: TimeRange;
  /** 変化量 */
  metrics: {
    efficiencyDelta: number;
    tokenDelta: number;
    timeDelta: number;
    qualityDelta: number;
  };
  /** 統計的有意性 */
  significance: "significant" | "marginal" | "insignificant";
}

/**
 * 期間範囲
 * @summary 時間範囲の定義
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * 計測設定
 * @summary LLM行動計測の設定
 */
export interface LLMBehaviorConfig {
  /** 計測有効/無効 */
  enabled: boolean;
  /** サンプリングレート（0.0-1.0） */
  samplingRate: number;
  /** 異常検出閾値 */
  thresholds: {
    efficiencyDrop: number;
    formatViolationRate: number;
    timeoutSpikeMultiplier: number;
    zScoreThreshold: number;
  };
  /** データ保持期間 */
  retention: {
    recordsDays: number;
    aggregatesDays: number;
    anomaliesDays: number;
  };
  /** 集計スケジュール */
  aggregation: {
    hourly: boolean;
    daily: boolean;
    weekly: boolean;
  };
}

/**
 * デフォルト設定
 */
export const DEFAULT_LLM_BEHAVIOR_CONFIG: LLMBehaviorConfig = {
  enabled: process.env.PI_BEHAVIOR_TRACKING !== "false",
  samplingRate: parseFloat(process.env.PI_BEHAVIOR_SAMPLING || "1.0"),
  thresholds: {
    efficiencyDrop: -0.3,
    formatViolationRate: 0.2,
    timeoutSpikeMultiplier: 2.0,
    zScoreThreshold: 2.0,
  },
  retention: {
    recordsDays: 30,
    aggregatesDays: 365,
    anomaliesDays: 90,
  },
  aggregation: {
    hourly: true,
    daily: true,
    weekly: true,
  },
};
