/**
 * @abdd.meta
 * path: .pi/lib/philosophy/index.ts
 * role: 哲学的推論・信念更新機能の集約エントリーポイント
 * why: アポレティック推論、ベイズ的信念更新を一箇所で提供
 * related: ./aporetic-reasoning.ts, ./belief-updater.ts
 * public_api: createAporeticEngine, updateBelief, 型定義
 * invariants: 外部依存なし
 * side_effects: なし
 * failure_modes: モジュール解決エラー
 * @abdd.explain
 * overview: 哲学的推論エンジンと信念更新システムを提供するモジュール
 * what_it_does:
 *   - アポレティック推論エンジンを提供
 *   - ベイズ的信念更新を提供
 * why_it_exists:
 *   - 自己改善ループでの内省的推論をサポート
 * scope:
 *   in: Layer 0-2のモジュール
 *   out: self-improvement-loop, inquiry-exploration
 */

// Aporetic reasoning (Philosophy)
export {
  type AporiaPole,
  type AporeticBeliefState,
  type BalanceUpdate,
  type ParetoOptimalSolution,
  type AporeticInferenceResult,
  type AporeticReasoningEngine,
  type AporeticEngineConfig,
  createAporeticEngine,
  createInitialBeliefState,
} from "./aporetic-reasoning.js";

export {
  type AporiaDetection,
  type AporiaResolution,
} from "./aporia-handler.js";

// Belief updater (Philosophy)
export {
  type Distribution,
  type Evidence,
  type EvidenceType,
  type BayesianBelief,
  type BayesianUpdateOptions,
  createPrior,
  normalizeDistribution,
  updateBelief,
  updateWithMultipleEvidence,
  createBayesianBelief,
} from "./belief-updater.js";

// Aporia awareness (Philosophy)
export {
  type AporiaType,
  type Aporia,
  type FalseResolution,
  type AporiaState,
  APORIA_PATTERNS,
} from "./aporia-awareness.js";

// Aporia tracker (Philosophy)
export {
  type AporiaStatus,
  type AporiaDecision,
  type TrackedAporia,
  type AporiaTrackerConfig,
  AporiaTracker,
} from "./aporia-tracker.js";
