/**
 * @abdd.meta
 * path: .pi/lib/deep-exploration/types.ts
 * role: 深層探索のための型定義
 * why: 認知プロセスの複雑な状態を型安全に表現するため
 * related: ./core.ts, ./seven-perspectives.ts, ../philosophy/aporia-handler.ts
 * public_api: MetaMetacognitiveState, NonLinearThought, Contradiction, ParaconsistentState, SelfDestructionResult, DeepExplorationSession
 * invariants:
 *   - MetaMetacognitiveState.layer0は必ず存在する
 *   - NonLinearThought.associationsのstrengthは0以上1以下
 *   - Contradictionのstateはactive, acknowledged, productiveのいずれか
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 深層探索セッションで使用されるすべての型定義
 * what_it_does:
 *   - 超メタ認知状態、非線形思考、矛盾状態などのデータ構造を定義
 *   - 7つの視座からの分析結果の型を定義
 *   - セッション全体の状態を表現する型を定義
 * why_it_exists: 複雑な認知プロセスを型安全に扱い、コンパイル時エラーを防ぐため
 * scope:
 *   in: なし
 *   out: 型定義のみ
 */

import type { AporiaDetection, AporiaResolution } from '../philosophy/aporia-handler.js';

// ============================================================================
// 超メタ認知
// ============================================================================

/**
 * 超メタ認知状態
 * @summary メタ認知そのものをメタ認知する多層構造
 */
export interface MetaMetacognitiveState {
  /** 第0層：直接的な思考 */
  layer0: {
    content: string;
    confidence: number;
  };

  /** 第1層：思考についての思考（従来のメタ認知） */
  layer1: {
    observation: string;
    evaluation: string;
  };

  /** 第2層：メタ認知についての思考（超メタ認知） */
  layer2: {
    metaObservation: string;
    /** 「自分はメタ認知していると思っているが、それは形式的ではないか？」 */
    formalizationRisk: number;
    /** 「このメタ認科学は何を排除しているか？」 */
    exclusions: string[];
  };

  /** 第3層：超メタ認知の限界の認識 */
  layer3: {
    /** 「この分析自体もまた形式的パターンに陥っていないか？」 */
    infiniteRegressAwareness: boolean;
    /** 分析の停止点（どこで「十分」とするか） */
    stoppingPoint: string;
    /** 停止点選択の恣意性の認識 */
    arbitrarinessAcknowledged: boolean;
  };
}

// ============================================================================
// 非線形思考
// ============================================================================

/**
 * 連想タイプ
 */
export type AssociationType = 'semantic' | 'phonetic' | 'visual' | 'emotional' | 'random';

/**
 * 非線形思考結果
 * @summary 論理的接続を必要としない連想・直観
 */
export interface NonLinearThought {
  /** 出発点 */
  seed: string;

  /** 連想チェーン（論理的接続を必要としない） */
  associations: Array<{
    content: string;
    /** なぜこの連想が生まれたか（事後的な合理化） */
    rationale?: string;
    /** 連想の強度（0-1） */
    strength: number;
    /** 連想タイプ */
    type: AssociationType;
  }>;

  /** 収束点（複数可、またはなし） */
  convergencePoints: string[];

  /** 評価（事後的） */
  evaluation: {
    novelConnections: string[];
    potentialInsights: string[];
    discardedAsRandom: string[];
  };
}

// ============================================================================
// 矛盾と準矛盾推論
// ============================================================================

/**
 * 矛盾の状態
 */
export type ContradictionState = 'active' | 'acknowledged' | 'productive';

/**
 * 矛盾
 * @summary 保持される矛盾
 */
export interface Contradiction {
  propositionA: string;
  propositionB: string;
  /** 矛盾の状態 */
  state: ContradictionState;
  /** 矛盾から生まれる洞察 */
  insights: string[];
}

/**
 * 爆発ガード
 */
export interface ExplosionGuard {
  /** 「Aかつ非A」から「任意のB」を導出しないための防衛 */
  guardCondition: string;
  protectedPropositions: string[];
}

/**
 * 生産的矛盾
 */
export interface ProductiveContradiction {
  contradiction: Contradiction;
  /** 矛盾から引き出された有用な結論 */
  derivedInsights: string[];
}

/**
 * 準矛盾的状態
 * @summary ダイアレティズムに基づき、矛盾を許容する推論状態
 */
export interface ParaconsistentState {
  /** 保持している矛盾 */
  contradictions: Contradiction[];

  /** 爆発原理を回避するためのマーカー */
  explosionGuards: ExplosionGuard[];

  /** 矛盾を活用した推論 */
  productiveContradictions: ProductiveContradiction[];
}

// ============================================================================
// 自己前提破壊
// ============================================================================

/**
 * 破壊された前提
 */
export interface DestroyedPremise {
  premise: string;
  destructionMethod: string;
  whatRemains: string;
}

/**
 * 再構築された視点
 */
export interface ReconstructedView {
  description: string;
  basedOn: string[];
  /** どれくらい脆いか */
  instability: number;
}

/**
 * 自己前提破壊結果
 * @summary 自身の前提を意図的に破壊し再構築する
 */
export interface SelfDestructionResult {
  /** 破壊された前提 */
  destroyedPremises: DestroyedPremise[];

  /** 新たに構築された視点 */
  reconstructedViews: ReconstructedView[];

  /** 破壊の連鎖（破壊が破壊を呼ぶ） */
  destructionChain: string[];
}

// ============================================================================
// 7つの視座からの分析
// ============================================================================

/**
 * 脱構築分析結果
 */
export interface DeconstructionAnalysis {
  binaryOppositions: string[];
  exclusions: string[];
  aporias: AporiaDetection[];
  diffranceTraces: string[];
}

/**
 * スキゾ分析結果
 */
export interface SchizoAnalysisResult {
  desireProductions: string[];
  innerFascismSigns: string[];
  microFascisms: string[];
  deterritorializationLines: string[];
}

/**
 * エウダイモニア評価
 */
export interface EudaimoniaEvaluation {
  excellencePursuit: string;
  pleasureTrapDetected: boolean;
  meaningfulGrowth: string;
  stoicAutonomy: number;
}

/**
 * ユートピア/ディストピア分析
 */
export interface UtopiaDystopiaAnalysis {
  worldBeingCreated: string;
  totalitarianRisks: string[];
  powerDynamics: string[];
  lastManTendency: number;
}

/**
 * 思考分析
 */
export interface ThinkingAnalysis {
  isThinking: boolean;
  metacognitionLevel: number;
  autopilotSigns: string[];
  chineseRoomRisk: number;
}

/**
 * 思考分類学結果
 */
export interface TaxonomyResult {
  currentMode: string;
  recommendedMode: string;
  modeRationale: string;
  missingModes: string[];
}

/**
 * 論理的誤謬
 */
export interface LogicalFallacy {
  type: string;
  location: string;
  description: string;
  correction: string;
}

/**
 * 論理分析
 */
export interface LogicAnalysis {
  fallacies: LogicalFallacy[];
  validInferences: string[];
  invalidInferences: string[];
  classicalLogicLimitations: string[];
}

/**
 * 7つの視座からの分析結果
 */
export interface SevenPerspectivesAnalysis {
  deconstruction: DeconstructionAnalysis;
  schizoAnalysis: SchizoAnalysisResult;
  eudaimonia: EudaimoniaEvaluation;
  utopiaDystopia: UtopiaDystopiaAnalysis;
  philosophyOfThought: ThinkingAnalysis;
  taxonomyOfThought: TaxonomyResult;
  logic: LogicAnalysis;
}

// ============================================================================
// アポリア共生
// ============================================================================

/**
 * アポリアとの共生状態
 */
export interface AporiaCoexistence {
  acknowledgedAporias: string[];
  maintainedTensions: string[];
  responsibleDecisions: string[];
  avoidanceTemptations: string[];
}

// ============================================================================
// セッション
// ============================================================================

/**
 * 探求の状態
 */
export type ExplorationStatus = 'exploring' | 'deepening' | 'resting' | 'returning' | 'stagnant';

/**
 * 深層探求セッション
 * @summary 「答えのない問題」への対処を支援するセッション
 */
export interface DeepExplorationSession {
  /** セッションID */
  id: string;

  /** 探求の対象 */
  inquiry: string;

  /** 開始時刻 */
  startedAt: Date;

  /** 最終更新時刻 */
  lastUpdatedAt: Date;

  /** 7つの視座からの分析 */
  perspectives: SevenPerspectivesAnalysis;

  /** 検出されたアポリア */
  aporias: AporiaDetection[];

  /** アポリア対処結果 */
  aporiaResolutions: AporiaResolution[];

  /** アポリアとの「共生」状態 */
  aporiaCoexistence: AporiaCoexistence;

  /** 自己破壊と再構築 */
  selfDestruction: SelfDestructionResult;

  /** 超メタ認知状態 */
  metaMetacognition: MetaMetacognitiveState;

  /** 非線形思考結果 */
  nonLinearThoughts: NonLinearThought[];

  /** 準矛盾的推論状態 */
  paraconsistentState: ParaconsistentState;

  /** 探求の状態（「完了」ではない） */
  status: ExplorationStatus;

  /** 次の探求方向（「答え」ではない） */
  nextDirections: string[];

  /** 探求の深さ */
  depth: number;

  /** 警告事項 */
  warnings: string[];
}

// ============================================================================
// オプション型
// ============================================================================

/**
 * 非線形思考のオプション
 */
export interface NonLinearThinkingOptions {
  maxAssociations?: number;
  allowRandomJump?: boolean;
}

/**
 * 深層探求のオプション
 */
export interface DeepExplorationOptions {
  initialPremises?: string[];
  depth?: number;
  enableNonLinearThinking?: boolean;
  enableSelfDestruction?: boolean;
}

/**
 * 破壊方法
 */
export type DestructionMethod =
  | '逆転'
  | '極端化'
  | '抽象化'
  | '具体化'
  | '歴史化'
  | '相対化'
  | '無意味化'
  | '脱構築';
