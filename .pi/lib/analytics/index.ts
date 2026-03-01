/**
 * @abdd.meta
 * path: .pi/lib/analytics/index.ts
 * role: アナリティクスモジュールのエクスポート統合
 * why: アナリティクス機能への統一的なアクセスポイントを提供
 * related: .pi/lib/analytics/llm-behavior-types.ts, .pi/lib/analytics/metric-collectors.ts, .pi/lib/analytics/behavior-storage.ts
 * public_api: なし（再エクスポートのみ）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: アナリティクスモジュールの公開APIをまとめるエントリポイント
 * what_it_does:
 *   - 型定義を再エクスポート
 *   - 収集関数を再エクスポート
 *   - ストレージ関数を再エクスポート
 *   - 分析関数を再エクスポート
 * why_it_exists:
 *   - 利用側のインポートを簡素化するため
 *   - モジュール構造を隠蔽するため
 * scope:
 *   in: なし
 *   out: 各モジュールの公開API
 */

// Types
export type {
  LLMBehaviorRecord,
  PromptMetrics,
  OutputMetrics,
  ExecutionMetrics,
  QualityMetrics,
  ExecutionContext,
  LLMBehaviorAggregates,
  AnomalyRecord,
  EfficiencyScore,
  OptimizationComparison,
  TimeRange,
  LLMBehaviorConfig,
} from "./llm-behavior-types.js";

export { DEFAULT_LLM_BEHAVIOR_CONFIG } from "./llm-behavior-types.js";

// Collectors
export {
  collectPromptMetrics,
  collectOutputMetrics,
  collectQualityMetrics,
  collectExecutionMetrics,
  extractExecutionContext,
} from "./metric-collectors.js";

// Storage
export {
  recordBehaviorMetrics,
  createAndRecordMetrics,
  loadBehaviorRecords,
  loadRecentRecords,
  cleanupOldRecords,
  getStorageStats,
  getAnalyticsPaths,
} from "./behavior-storage.js";

// Analysis
export {
  calculateEfficiencyScore,
  calculateAggregates,
  normalizeRatio,
  comparePeriods,
} from "./efficiency-analyzer.js";
