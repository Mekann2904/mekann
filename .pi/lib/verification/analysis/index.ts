/**
 * @abdd.meta
 * path: .pi/lib/verification/analysis/index.ts
 * role: 分析機能モジュールのエクスポート統合
 * why: 分析機能への統一アクセスポイントを提供するため
 * related: ./metacognitive-check.ts, ./inference-chain.ts, ./thinking-mode.ts, ./dystopian-risk.ts
 * public_api: runMetacognitiveCheck, parseInferenceChain, analyzeThinkingMode, assessDystopianRisk
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 分析モジュールの公開APIを統合
 * what_it_does:
 *   - メタ認知チェック機能をエクスポート
 *   - 推論チェーン解析機能をエクスポート
 *   - 思考モード分析機能をエクスポート
 *   - ディストピアリスク評価機能をエクスポート
 * why_it_exists:
 *   - 利用側のimportを簡素化するため
 * scope:
 *   in: ./metacognitive-check.ts, ./inference-chain.ts, ./thinking-mode.ts, ./dystopian-risk.ts
 *   out: ../generation/, ../extraction/, ../assessment/
 */

// Metacognitive Check
export {
  runMetacognitiveCheck,
  detectInnerFascism,
  detectBinaryOppositions,
  detectFallacies,
  generateMetacognitiveSummary,
  type MetacognitiveCheck,
  type AporiaDetection,
  type AporiaType,
  type FallacyDetection
} from './metacognitive-check.js';

// Inference Chain
export {
  parseInferenceChain,
  detectAporiaAvoidanceTemptation,
  connectInferenceSteps,
  calculateChainQualityScore,
  type InferenceChain,
  type InferenceStep
} from './inference-chain.js';

// Thinking Mode
export {
  analyzeThinkingMode,
  runIntegratedThinkingAnalysis,
  type ThinkingHat,
  type ThinkingSystem,
  type BloomLevel,
  type ThinkingModeAnalysis
} from './thinking-mode.js';

// Dystopian Risk
export {
  assessDystopianRisk,
  generateDystopianRiskSummary,
  type DystopianRiskAssessment,
  type DystopianPattern,
  type LiberatingPossibility,
  type RiskCategoryResult
} from './dystopian-risk.js';
