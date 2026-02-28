/**
 * @abdd.meta
 * path: .pi/lib/aporetic-reasoning.ts
 * role: アポリア（両立不可能な価値観の葛藤）を論理的な矛盾として解消せず、両者の緊張関係を維持したまま共生させるための推論エンジンとデータ構造を定義する
 * why: 矛盾する信念を統合する「誘惑」に抵抗し、多目的最適化（パレート最適）に基づいた責任ある決定を下すため
 * related: ./aporia-handler.js, ./belief-updater.js
 * public_api: AporiaPole, AporeticBeliefState, ParetoOptimalSolution, AporeticInferenceResult, AporeticReasoningEngine
 * invariants: AporeticBeliefStateのtensionIntensityは0から1の間、pole1とpole2は競合する価値観を表す、balancePointは-1から1の間
 * side_effects: 信念分布の更新、バランス点のシフト、統計情報の蓄積
 * failure_modes: 爆発原理の回避失敗、パレート解の不存在、信念分布の正規化エラー
 * @abdd.explain
 * overview: アポリアを構成する二つの極の信念を保持し、緊張関係下で最適なバランス点を探索する共生型推論システム
 * what_it_does:
 *   - 2つの対立する信念の強度と緊張度を管理する
 *   - 証拠に基づいてバランス点と不確実性を更新する
 *   - パレート最適解を導出し、トレードオフを伴う決定を提示する
 *   - 矛盾の安易な統合や回避を防ぐガード条件を維持する
 * why_it_exists:
 *   - 矛盾を解決するのではなく、その中で最善の選択を行う哲学的アプローチを実装するため
 *   - 爆発原理（矛盾から任意の結論が導かれる）を回避しつつ推論を行うため
 *   - 複雑な意思決定におけるリスクとトレードオフを明示化するため
 * scope:
 *   in: アポリア検出結果、証拠、信念更新パラメータ
 *   out: 更新された信念状態、パレート最適解のリスト、推奨決断と警告
 */

import type { AporiaDetection, AporiaResolution } from './aporia-handler.js';
import type { Distribution, Evidence } from './belief-updater.js';
import { createPrior, normalizeDistribution, calculateEntropy, getMostProbable } from './belief-updater.js';

// Re-export types from aporia-handler for convenience
export type { AporiaDetection, AporiaResolution } from './aporia-handler.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * アポリアの極
 * @summary アポリアを構成する一方の極
 */
export interface AporiaPole {
  /** 極の名前（例: 「完全性」「速度」） */
  name: string;
  /** 極が表す価値の説明 */
  valueDescription: string;
  /** この極に対する信念分布 */
  beliefDistribution: Distribution;
  /** この極を支持する証拠 */
  supportingEvidence: Evidence[];
  /** 現在の信念強度（0-1） */
  beliefStrength: number;
}

/**
 * アポリア信念状態
 * @summary 両極の信念を同時に維持する状態
 */
export interface AporeticBeliefState {
  /** 対象のアポリア */
  aporia: AporiaDetection;
  /** 極1（例: 完全性） */
  pole1: AporiaPole;
  /** 極2（例: 速度） */
  pole2: AporiaPole;
  /** 緊張関係の強度（0-1） */
  tensionIntensity: number;
  /** 現在のバランス点（-1: 極1寄り, 0: バランス, +1: 極2寄り） */
  balancePoint: number;
  /** バランスの不確実性（高いほどバランスが不安定） */
  balanceUncertainty: number;
  /** 爆発原理を回避するためのガード条件 */
  explosionGuards: string[];
  /** 更新履歴 */
  updateHistory: BalanceUpdate[];
}

/**
 * バランス更新記録
 * @summary バランス点の更新履歴
 */
export interface BalanceUpdate {
  timestamp: Date;
  previousBalance: number;
  newBalance: number;
  evidence: Evidence;
  rationale: string;
}

/**
 * パレート最適解
 * @summary 多目的最適化におけるパレートフロント上の解
 */
export interface ParetoOptimalSolution {
  /** 解の説明 */
  description: string;
  /** 極1に対する達成度（0-1） */
  pole1Achievement: number;
  /** 極2に対する達成度（0-1） */
  pole2Achievement: number;
  /** この解を選択する際のリスク */
  risk: number;
  /** この解を選択する際のトレードオフの説明 */
  tradeoffDescription: string;
  /** 推奨度（文脈依存） */
  contextDependentRecommendation: number;
}

/**
 * アポリア推論結果
 * @summary アポリア共生型推論の結果
 */
export interface AporeticInferenceResult {
  /** 更新された信念状態 */
  beliefState: AporeticBeliefState;
  /** パレート最適解のリスト */
  paretoFront: ParetoOptimalSolution[];
  /** 推奨される決断（もしあれば） */
  recommendedDecision?: {
    solution: ParetoOptimalSolution;
    rationale: string;
    confidence: number;
    warnings: string[];
  };
  /** 避けるべき誘惑（統合、回避など） */
  temptationsToAvoid: string[];
  /** 推論の信頼度 */
  inferenceConfidence: number;
}

/**
 * アポリア推論エンジン
 * @summary アポリア共生型推論を実行するエンジン
 */
export interface AporeticReasoningEngine {
  /** 現在の信念状態のリスト */
  beliefStates: Map<string, AporeticBeliefState>;
  /** エンジンの設定 */
  config: AporeticEngineConfig;
  /** 統計情報 */
  statistics: {
    totalInferences: number;
    successfulCoexistences: number;
    avoidedTemptations: number;
    responsibleDecisions: number;
  };
}

/**
 * エンジン設定
 */
export interface AporeticEngineConfig {
  /** 緊張維持の閾値（これ以下ならバランス維持を試みる） */
  tensionThreshold: number;
  /** 決断実行の閾値（これ以上なら決断を推奨） */
  decisionThreshold: number;
  /** 平滑化係数 */
  smoothingFactor: number;
  /** 最大履歴保持数 */
  maxHistorySize: number;
  /** パレートフロント探索の深さ */
  paretoSearchDepth: number;
}

// ============================================================================
// デフォルト設定
// ============================================================================

const DEFAULT_CONFIG: AporeticEngineConfig = {
  tensionThreshold: 0.7,
  decisionThreshold: 0.85,
  smoothingFactor: 0.001,
  maxHistorySize: 100,
  paretoSearchDepth: 5
};

// ============================================================================
// コア関数
// ============================================================================

/**
 * @summary アポリア推論エンジンを作成
 * @param config エンジン設定
 * @returns 作成されたエンジン
 */
export function createAporeticEngine(
  config: Partial<AporeticEngineConfig> = {}
): AporeticReasoningEngine {
  return {
    beliefStates: new Map(),
    config: { ...DEFAULT_CONFIG, ...config },
    statistics: {
      totalInferences: 0,
      successfulCoexistences: 0,
      avoidedTemptations: 0,
      responsibleDecisions: 0
    }
  };
}

/**
 * @summary アポリアに対する初期信念状態を作成
 * @param aporia 対象のアポリア
 * @returns 初期信念状態
 */
export function createInitialBeliefState(aporia: AporiaDetection): AporeticBeliefState {
  // 両極の初期信念分布を作成
  const pole1Belief = createPrior(['重要', 'やや重要', '普通', 'やや不要', '不要']);
  const pole2Belief = createPrior(['重要', 'やや重要', '普通', 'やや不要', '不要']);

  return {
    aporia,
    pole1: {
      name: aporia.pole1.concept,
      valueDescription: aporia.pole1.value,
      beliefDistribution: pole1Belief,
      supportingEvidence: [],
      beliefStrength: 0.5
    },
    pole2: {
      name: aporia.pole2.concept,
      valueDescription: aporia.pole2.value,
      beliefDistribution: pole2Belief,
      supportingEvidence: [],
      beliefStrength: 0.5
    },
    tensionIntensity: aporia.tensionLevel,
    balancePoint: 0,
    balanceUncertainty: 0.5,
    explosionGuards: [
      '矛盾から任意の命題を導出しない',
      `${aporia.pole1.concept}と${aporia.pole2.concept}の統合を前提としない`,
      '「解決」ではなく「共生」を追求する'
    ],
    updateHistory: []
  };
}

/**
 * @summary 証拠に基づいて信念状態を更新
 * @param state 現在の信念状態
 * @param evidence 新しい証拠
 * @param targetPole 更新対象の極（'pole1' | 'pole2' | 'both'）
 * @returns 更新された信念状態
 */
export function updateBeliefState(
  state: AporeticBeliefState,
  evidence: Evidence,
  targetPole: 'pole1' | 'pole2' | 'both' = 'both'
): AporeticBeliefState {
  const previousBalance = state.balancePoint;
  let newPole1 = { ...state.pole1 };
  let newPole2 = { ...state.pole2 };

  // 極1の信念を更新
  if (targetPole === 'pole1' || targetPole === 'both') {
    const updatedDist = updatePoleBelief(state.pole1.beliefDistribution, evidence);
    const strength = calculatePoleStrength(updatedDist);
    newPole1 = {
      ...state.pole1,
      beliefDistribution: updatedDist,
      supportingEvidence: [...state.pole1.supportingEvidence, evidence],
      beliefStrength: strength
    };
  }

  // 極2の信念を更新
  if (targetPole === 'pole2' || targetPole === 'both') {
    const updatedDist = updatePoleBelief(state.pole2.beliefDistribution, evidence);
    const strength = calculatePoleStrength(updatedDist);
    newPole2 = {
      ...state.pole2,
      beliefDistribution: updatedDist,
      supportingEvidence: [...state.pole2.supportingEvidence, evidence],
      beliefStrength: strength
    };
  }

  // バランス点を再計算
  const newBalancePoint = calculateBalancePoint(newPole1.beliefStrength, newPole2.beliefStrength);
  const newUncertainty = calculateBalanceUncertainty(
    newPole1.beliefDistribution,
    newPole2.beliefDistribution
  );

  // 更新履歴を記録
  const updateRecord: BalanceUpdate = {
    timestamp: new Date(),
    previousBalance,
    newBalance: newBalancePoint,
    evidence,
    rationale: `証拠「${evidence.value}」に基づく更新`
  };

  return {
    ...state,
    pole1: newPole1,
    pole2: newPole2,
    balancePoint: newBalancePoint,
    balanceUncertainty: newUncertainty,
    updateHistory: [...state.updateHistory.slice(-99), updateRecord]
  };
}

/**
 * @summary アポリア共生型推論を実行
 * @param engine 推論エンジン
 * @param aporia 対象のアポリア
 * @param evidenceList 証拠のリスト
 * @param context コンテキスト情報
 * @returns 推論結果
 */
export function performAporeticInference(
  engine: AporeticReasoningEngine,
  aporia: AporiaDetection,
  evidenceList: Evidence[],
  context: {
    urgencyLevel?: number;
    stakeholderImportance?: number;
    reversibility?: boolean;
  } = {}
): AporeticInferenceResult {
  // 既存の信念状態を取得または作成
  const aporiaKey = `${aporia.type}-${aporia.description}`;
  let beliefState = engine.beliefStates.get(aporiaKey);
  
  if (!beliefState) {
    beliefState = createInitialBeliefState(aporia);
  }

  // 証拠を順次適用
  for (const evidence of evidenceList) {
    // 証拠がどちらの極に関連するかを判定
    const targetPole = determineEvidenceTarget(evidence, aporia);
    beliefState = updateBeliefState(beliefState, evidence, targetPole);
  }

  // 統計を更新
  engine.statistics.totalInferences++;

  // パレートフロントを計算
  const paretoFront = calculateParetoFront(beliefState, engine.config.paretoSearchDepth);

  // 推奨決断を決定
  const recommendedDecision = determineRecommendedDecision(
    beliefState,
    paretoFront,
    context,
    engine.config
  );

  if (recommendedDecision) {
    engine.statistics.responsibleDecisions++;
  } else {
    engine.statistics.successfulCoexistences++;
  }

  // 避けるべき誘惑を特定
  const temptationsToAvoid = identifyTemptationsToAvoid(beliefState, paretoFront);
  engine.statistics.avoidedTemptations += temptationsToAvoid.length;

  // 信念状態を保存
  engine.beliefStates.set(aporiaKey, beliefState);

  // 推論の信頼度を計算
  const inferenceConfidence = calculateInferenceConfidence(beliefState, evidenceList);

  return {
    beliefState,
    paretoFront,
    recommendedDecision,
    temptationsToAvoid,
    inferenceConfidence
  };
}

/**
 * @summary エンジンにアポリア対処結果を統合
 * @param engine 推論エンジン
 * @param resolution アポリア対処結果
 * @returns 更新されたエンジン
 */
export function integrateResolution(
  engine: AporeticReasoningEngine,
  resolution: AporiaResolution
): AporeticReasoningEngine {
  const aporiaKey = `${resolution.aporia.type}-${resolution.aporia.description}`;
  const beliefState = engine.beliefStates.get(aporiaKey);

  if (beliefState) {
    // 決断が行われた場合、バランス点を更新
    if (resolution.decision) {
      const decisionEvidence: Evidence = {
        type: 'inference',
        value: `決断: ${resolution.decision}`,
        strength: 0.8,
        source: 'responsible-decision',
        timestamp: new Date(),
        likelihoods: new Map([
          [resolution.decision === resolution.aporia.pole1.concept ? '重要' : '不要', 0.9]
        ])
      };

      const updatedState = updateBeliefState(
        beliefState,
        decisionEvidence,
        resolution.decision === resolution.aporia.pole1.concept ? 'pole1' : 'pole2'
      );
      engine.beliefStates.set(aporiaKey, updatedState);
    }
  }

  return engine;
}

/**
 * @summary パレートフロントを可視化用データに変換
 * @param paretoFront パレート最適解のリスト
 * @returns 可視化用データ
 */
export function paretoFrontToVisualization(paretoFront: ParetoOptimalSolution[]): {
  points: Array<{ x: number; y: number; label: string }>;
  dominatedRegion: string;
} {
  const points = paretoFront.map((solution, index) => ({
    x: solution.pole1Achievement,
    y: solution.pole2Achievement,
    label: `解${index + 1}: ${solution.description.substring(0, 30)}...`
  }));

  // 支配領域の説明
  const dominatedRegion = paretoFront.length > 0
    ? `${paretoFront[0].tradeoffDescription}`
    : 'パレート最適解なし';

  return { points, dominatedRegion };
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 極の信念分布を更新
 */
function updatePoleBelief(distribution: Distribution, evidence: Evidence): Distribution {
  const newProbabilities = new Map<string, number>();

  distribution.probabilities.forEach((prob, hypothesis) => {
    const likelihood = evidence.likelihoods?.get(hypothesis) ?? 0.5;
    const updated = prob * likelihood + 0.001; // 平滑化
    newProbabilities.set(hypothesis, updated);
  });

  return normalizeDistribution({
    probabilities: newProbabilities,
    createdAt: distribution.createdAt,
    version: distribution.version + 1
  });
}

/**
 * 極の信念強度を計算
 */
function calculatePoleStrength(distribution: Distribution): number {
  const mostProbable = getMostProbable(distribution);
  
  // 「重要」「やや重要」の確率を合計
  let strength = 0;
  distribution.probabilities.forEach((prob, hypothesis) => {
    if (hypothesis === '重要' || hypothesis === 'やや重要') {
      strength += prob;
    }
  });

  return Math.max(strength, mostProbable.probability);
}

/**
 * バランス点を計算
 */
function calculateBalancePoint(pole1Strength: number, pole2Strength: number): number {
  // -1（極1寄り）から+1（極2寄り）の範囲
  const diff = pole2Strength - pole1Strength;
  return Math.max(-1, Math.min(1, diff));
}

/**
 * バランスの不確実性を計算
 */
function calculateBalanceUncertainty(dist1: Distribution, dist2: Distribution): number {
  const entropy1 = calculateEntropy(dist1);
  const entropy2 = calculateEntropy(dist2);
  const avgEntropy = (entropy1 + entropy2) / 2;
  
  // エントロピーが高いほど不確実性が高い
  const maxEntropy = Math.log2(5); // 5つの仮説
  return Math.min(1, avgEntropy / maxEntropy);
}

/**
 * 証拠がどちらの極に関連するかを判定
 */
function determineEvidenceTarget(
  evidence: Evidence,
  aporia: AporiaDetection
): 'pole1' | 'pole2' | 'both' {
  const value = evidence.value.toLowerCase();
  
  // キーワードベースの簡易判定
  const pole1Keywords = aporia.pole1.value.toLowerCase().split(/[\s,]/);
  const pole2Keywords = aporia.pole2.value.toLowerCase().split(/[\s,]/);

  let pole1Score = 0;
  let pole2Score = 0;

  for (const keyword of pole1Keywords) {
    if (value.includes(keyword)) pole1Score++;
  }
  for (const keyword of pole2Keywords) {
    if (value.includes(keyword)) pole2Score++;
  }

  if (pole1Score > pole2Score) return 'pole1';
  if (pole2Score > pole1Score) return 'pole2';
  return 'both';
}

/**
 * パレートフロントを計算
 */
function calculateParetoFront(
  state: AporeticBeliefState,
  depth: number
): ParetoOptimalSolution[] {
  const solutions: ParetoOptimalSolution[] = [];

  // 基本的な解の候補を生成
  const baseSolutions = [
    { pole1: 0.9, pole2: 0.1, desc: `${state.pole1.name}を優先` },
    { pole1: 0.7, pole2: 0.5, desc: `${state.pole1.name}をやや優先` },
    { pole1: 0.5, pole2: 0.7, desc: `${state.pole2.name}をやや優先` },
    { pole1: 0.1, pole2: 0.9, desc: `${state.pole2.name}を優先` },
    { pole1: 0.6, pole2: 0.6, desc: 'バランス型' }
  ];

  // 現在の信念状態に基づいて調整
  for (const base of baseSolutions) {
    const adjustedPole1 = base.pole1 * (0.5 + state.pole1.beliefStrength * 0.5);
    const adjustedPole2 = base.pole2 * (0.5 + state.pole2.beliefStrength * 0.5);

    solutions.push({
      description: base.desc,
      pole1Achievement: adjustedPole1,
      pole2Achievement: adjustedPole2,
      risk: calculateRisk(adjustedPole1, adjustedPole2, state),
      tradeoffDescription: `${state.pole1.name}: ${(adjustedPole1 * 100).toFixed(0)}%, ${state.pole2.name}: ${(adjustedPole2 * 100).toFixed(0)}%`,
      contextDependentRecommendation: 0.5
    });
  }

  // パレート支配されている解を除外
  return filterParetoOptimal(solutions);
}

/**
 * 解のリスクを計算
 */
function calculateRisk(
  pole1Achievement: number,
  pole2Achievement: number,
  state: AporeticBeliefState
): number {
  // 両極とも低い達成度の場合、リスクが高い
  const minAchievement = Math.min(pole1Achievement, pole2Achievement);
  
  // バランスが極端な場合、リスクが高い
  const imbalance = Math.abs(pole1Achievement - pole2Achievement);
  
  // 不確実性が高い場合、リスクが高い
  const uncertainty = state.balanceUncertainty;

  return Math.min(1, (1 - minAchievement) * 0.4 + imbalance * 0.3 + uncertainty * 0.3);
}

/**
 * パレート最適解のみを抽出
 */
function filterParetoOptimal(solutions: ParetoOptimalSolution[]): ParetoOptimalSolution[] {
  const paretoOptimal: ParetoOptimalSolution[] = [];

  for (const solution of solutions) {
    const isDominated = solutions.some(other =>
      other !== solution &&
      other.pole1Achievement >= solution.pole1Achievement &&
      other.pole2Achievement >= solution.pole2Achievement &&
      (other.pole1Achievement > solution.pole1Achievement ||
       other.pole2Achievement > solution.pole2Achievement)
    );

    if (!isDominated) {
      paretoOptimal.push(solution);
    }
  }

  return paretoOptimal.sort((a, b) => b.pole1Achievement + b.pole2Achievement - (a.pole1Achievement + a.pole2Achievement));
}

/**
 * 推奨決断を決定
 */
function determineRecommendedDecision(
  state: AporeticBeliefState,
  paretoFront: ParetoOptimalSolution[],
  context: {
    urgencyLevel?: number;
    stakeholderImportance?: number;
    reversibility?: boolean;
  },
  config: AporeticEngineConfig
): AporeticInferenceResult['recommendedDecision'] {
  const urgency = context.urgencyLevel ?? 0.5;
  const stakeholderImportance = context.stakeholderImportance ?? 0.5;

  // 緊張レベルが低い場合は決断を推奨しない
  if (state.tensionIntensity < config.tensionThreshold) {
    return undefined;
  }

  // 緊急性が低く、可逆的な場合は判断を保留
  if (urgency < 0.5 && context.reversibility !== false) {
    return undefined;
  }

  // パレートフロントから最適な解を選択
  if (paretoFront.length === 0) {
    return undefined;
  }

  // 文脈に応じた推奨度を計算
  const scoredSolutions = paretoFront.map(solution => ({
    solution,
    score: calculateContextScore(solution, urgency, stakeholderImportance, state)
  }));

  scoredSolutions.sort((a, b) => b.score - a.score);
  const best = scoredSolutions[0];

  return {
    solution: best.solution,
    rationale: `緊急性(${urgency.toFixed(1)})とステークホルダー重要度(${stakeholderImportance.toFixed(1)})を考慮`,
    confidence: Math.min(0.9, state.tensionIntensity * best.score),
    warnings: [
      `この決断は${best.solution.risk > 0.5 ? '高い' : '中程度の'}リスクを伴います`,
      `もう一方の極（${state.balancePoint < 0 ? state.pole2.name : state.pole1.name}）の価値は依然として有効です`,
      '状況が変われば再検討が必要です'
    ]
  };
}

/**
 * 文脈スコアを計算
 */
function calculateContextScore(
  solution: ParetoOptimalSolution,
  urgency: number,
  stakeholderImportance: number,
  state: AporeticBeliefState
): number {
  // 緊急性が高い場合、より極端な解を好む
  const urgencyScore = urgency > 0.7
    ? Math.max(solution.pole1Achievement, solution.pole2Achievement)
    : Math.min(solution.pole1Achievement, solution.pole2Achievement);

  // ステークホルダーが重要な場合、バランスを好む
  const stakeholderScore = stakeholderImportance > 0.5
    ? 1 - Math.abs(solution.pole1Achievement - solution.pole2Achievement)
    : 0.5;

  // リスクが低い解を好む
  const riskScore = 1 - solution.risk;

  // 現在のバランス点に近い解を好む
  const balanceScore = 1 - Math.abs(
    (solution.pole2Achievement - solution.pole1Achievement) / 2 - state.balancePoint / 2
  );

  return urgencyScore * 0.3 + stakeholderScore * 0.2 + riskScore * 0.3 + balanceScore * 0.2;
}

/**
 * 避けるべき誘惑を特定
 */
function identifyTemptationsToAvoid(
  state: AporeticBeliefState,
  paretoFront: ParetoOptimalSolution[]
): string[] {
  const temptations: string[] = [];

  // ヘーゲル的統合への誘惑
  temptations.push(
    `${state.pole1.name}と${state.pole2.name}を「統合」しようとする誘惑 - 両極を維持してください`
  );

  // 過度な最適化への誘惑
  if (paretoFront.length > 3) {
    temptations.push(
      '「最適解」を探し続ける誘惑 - 完璧な解は存在しません'
    );
  }

  // 決断回避への誘惑
  if (state.tensionIntensity > 0.7 && state.balanceUncertainty > 0.5) {
    temptations.push(
      '判断を保留し続ける誘惑 - 必要に応じて責任ある決断を行ってください'
    );
  }

  // 片方の極の無視
  if (state.pole1.beliefStrength < 0.3 || state.pole2.beliefStrength < 0.3) {
    const weakPole = state.pole1.beliefStrength < state.pole2.beliefStrength
      ? state.pole1.name
      : state.pole2.name;
    temptations.push(
      `${weakPole}を無視する誘惑 - 両方の価値を認識してください`
    );
  }

  return temptations;
}

/**
 * 推論の信頼度を計算
 */
function calculateInferenceConfidence(
  state: AporeticBeliefState,
  evidenceList: Evidence[]
): number {
  // 証拠の数と品質
  const evidenceScore = Math.min(1, evidenceList.length / 5);

  // 信念の安定性
  const stabilityScore = 1 - state.balanceUncertainty;

  // 更新履歴の一貫性
  const historyScore = state.updateHistory.length > 3 ? 0.8 : 0.5;

  return evidenceScore * 0.4 + stabilityScore * 0.4 + historyScore * 0.2;
}

/**
 * @summary エンジンの状態をレポート
 * @param engine 推論エンジン
 * @returns レポート文字列
 */
export function generateEngineReport(engine: AporeticReasoningEngine): string {
  const lines: string[] = [
    '# アポリア推論エンジン レポート',
    '',
    '## 統計情報',
    `- 総推論回数: ${engine.statistics.totalInferences}`,
    `- 成功した共生: ${engine.statistics.successfulCoexistences}`,
    `- 回避した誘惑: ${engine.statistics.avoidedTemptations}`,
    `- 責任ある決断: ${engine.statistics.responsibleDecisions}`,
    '',
    '## 現在の信念状態'
  ];

  engine.beliefStates.forEach((state, key) => {
    lines.push(``);
    lines.push(`### ${key}`);
    lines.push(`- 緊張強度: ${(state.tensionIntensity * 100).toFixed(0)}%`);
    lines.push(`- バランス点: ${state.balancePoint.toFixed(2)} (${state.balancePoint < 0 ? state.pole1.name + '寄り' : state.balancePoint > 0 ? state.pole2.name + '寄り' : 'バランス'})`);
    lines.push(`- 不確実性: ${(state.balanceUncertainty * 100).toFixed(0)}%`);
    lines.push(`- 更新回数: ${state.updateHistory.length}`);
  });

  return lines.join('\n');
}
