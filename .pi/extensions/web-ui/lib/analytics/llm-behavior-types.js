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
/**
 * デフォルト設定
 */
export const DEFAULT_LLM_BEHAVIOR_CONFIG = {
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
