/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration/index.ts
 * role: 深層探索モジュールの公開API
 * why: モジュール利用者に統一されたエントリポイントを提供するため
 * related: ./types.ts, ./core.ts, ./meta-metacognition.ts, ./non-linear.ts, ./paraconsistent.ts, ./self-destruction.ts, ./seven-perspectives.ts
 * public_api: 全ての型と関数を再エクスポート
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 深層探索モジュールの統一エントリポイント
 * what_it_does:
 *   - 型定義を再エクスポート
 *   - コア関数を再エクスポート
 *   - サブモジュール関数を再エクスポート
 * why_it_exists: 利用者が内部構造を意識せずにモジュールを使用できるようにするため
 * scope:
 *   in: なし
 *   out: 公開API
 */

// 型定義
export type {
  MetaMetacognitiveState,
  AssociationType,
  NonLinearThought,
  ContradictionState,
  Contradiction,
  ExplosionGuard,
  ProductiveContradiction,
  ParaconsistentState,
  DestroyedPremise,
  ReconstructedView,
  SelfDestructionResult,
  DeconstructionAnalysis,
  SchizoAnalysisResult,
  EudaimoniaEvaluation,
  UtopiaDystopiaAnalysis,
  ThinkingAnalysis,
  TaxonomyResult,
  LogicalFallacy,
  LogicAnalysis,
  SevenPerspectivesAnalysis,
  AporiaCoexistence,
  ExplorationStatus,
  DeepExplorationSession,
  NonLinearThinkingOptions,
  DeepExplorationOptions,
  DestructionMethod,
} from './types.js';

// コア関数
export { performDeepExploration, deepenExploration, generateSessionId } from './core.js';

// 超メタ認知
export { performMetaMetacognition } from './meta-metacognition.js';

// 非線形思考
export { performNonLinearThinking } from './non-linear.js';

// 準矛盾推論
export { performParaconsistentReasoning, areContradictory } from './paraconsistent.js';

// 自己前提破壊
export {
  performSelfDestruction,
  selectDestructionMethod,
  destroyPremise,
} from './self-destruction.js';

// 7つの視座からの分析
export { performSevenPerspectivesAnalysis } from './seven-perspectives.js';
