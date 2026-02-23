/**
 * @abdd.meta
 * path: .pi/lib/learnable-mode-selector.ts
 * role: ベイズ更新に基づき動的に思考モードを選択・学習するステートフルセレクタ
 * why: 静的ルールだけでなく過去の履歴とフィードバックから最適な思考モードを導出するため
 * related: ./thinking-process.ts, ./belief-updater.ts
 * public_api: createLearnableSelector, selectMode, provideFeedback, extractFeatures (推測), LearnableModeSelector interface
 * invariants: modeBeliefの確率総和は1.0, learningRateは0から1の間, selectionHistoryとfeedbackHistoryは不変(追加のみ)
 * side_effects: 内部のmodeBelief, phaseBeliefs, selectionHistory, feedbackHistoryを更新する
 * failure_modes: 学習率が高すぎる場合の過学習、探索率設定による非最適解の定着、エントロピー計算の数値エラー
 * @abdd.explain
 * overview: 思考モードの選択をベイズ推論により最適化し、フィードバックを通じて適応的に改善する仕組みを提供する
 * what_it_does:
 *   - 思考モードとフェーズに対する確率的信念を管理する
 *   - コンテキスト特徴量に基づき、信念分布と探索率を考慮してモードを選択する
 *   - 選択結果に対するフィードバックを受け取り、事後分布を更新して学習する
 *   - 履歴と信頼度を含む選択結果を返す
 * why_it_exists:
 *   - 状況に応じた最適な思考モードの自動選択を実現するため
 *   - 静的なルールベースでは対応できない動的な環境や個人差に適応するため
 *   - 試行錯誤を通じた意思決定プロセスの改善を支援するため
 * scope:
 *   in: 初期事前分布、学習率、探索率、思考コンテキスト、選択フィードバック
 *   out: モード選択結果、選択時の確率分布、更新された内部状態
 */

import {
  ThinkingMode,
  ThinkingPhase,
  ThinkingContext,
  selectThinkingMode as staticSelectMode,
  getModePhaseCompatibility
} from './thinking-process';
import {
  Distribution,
  BayesianBelief,
  createPrior,
  updateBelief,
  getMostProbable,
  calculateEntropy,
  getMaxEntropy,
  createEvidence,
  Evidence
} from './belief-updater';

/**
 * 選択結果
 * @summary 思考モード選択の結果を表す型
 * @param selectedMode 選択されたモード
 * @param confidence 選択の信頼度
 * @param distribution 選択時の確率分布
 * @param reasoning 選択理由
 * @param alternatives 代替モードとその確率
 */
export interface ModeSelectionResult {
  selectedMode: ThinkingMode;
  confidence: number;
  distribution: Distribution;
  reasoning: string;
  alternatives: Array<{
    mode: ThinkingMode;
    probability: number;
  }>;
  context: ThinkingContext;
  timestamp: Date;
}

/**
 * 選択結果のフィードバック
 * @summary 選択結果に対するフィードバック
 * @param result 元の選択結果
 * @param outcome アウトカム（成功/失敗/部分的成功）
 * @param effectiveness 有効性スコア（0-1）
 * @param notes 追加メモ
 */
export interface ModeSelectionFeedback {
  result: ModeSelectionResult;
  outcome: 'success' | 'failure' | 'partial';
  effectiveness: number;
  notes?: string;
}

/**
 * コンテキスト特徴量
 * @summary コンテキストから抽出された特徴量
 * @param taskKeywords タスクキーワード
 * @param phaseWeights フェーズごとの重み
 * @param historyFeatures 履歴から抽出された特徴量
 */
export interface ContextFeatures {
  taskKeywords: Map<string, number>;
  phaseWeights: Map<ThinkingPhase, number>;
  historyFeatures: {
    recentModes: ThinkingMode[];
    modeDiversity: number;
    avgConfidence: number;
  };
}

/**
 * 学習可能モード選択器
 * @summary ベイズ更新を用いた学習可能な思考モード選択器
 */
export interface LearnableModeSelector {
  /** 思考モードの信念 */
  modeBelief: BayesianBelief;
  /** フェーズ別の信念マップ */
  phaseBeliefs: Map<ThinkingPhase, BayesianBelief>;
  /** 選択履歴 */
  selectionHistory: ModeSelectionResult[];
  /** フィードバック履歴 */
  feedbackHistory: ModeSelectionFeedback[];
  /** 学習率 */
  learningRate: number;
  /** 探索率（新しいモードを試す確率） */
  explorationRate: number;
  /** 作成時刻 */
  createdAt: Date;
  /** 更新回数 */
  updateCount: number;
}

/**
 * 選択器作成オプション
 * @summary createLearnableSelector関数のオプション
 * @param initialPriors 初期事前確率
 * @param learningRate 学習率
 * @param explorationRate 探索率
 */
export interface LearnableSelectorOptions {
  initialPriors?: Map<ThinkingMode, number>;
  learningRate?: number;
  explorationRate?: number;
  useStaticFallback?: boolean;
}

/**
 * デフォルトオプション
 */
const DEFAULT_SELECTOR_OPTIONS: Required<LearnableSelectorOptions> = {
  initialPriors: new Map(),
  learningRate: 0.1,
  explorationRate: 0.1,
  useStaticFallback: true
};

/** 全思考モード */
const ALL_MODES: ThinkingMode[] = [
  'creative', 'analytical', 'critical', 'practical', 'social', 'emotional'
];

/** 全思考フェーズ */
const ALL_PHASES: ThinkingPhase[] = [
  'problem-discovery', 'problem-formulation', 'strategy-development', 'solution-evaluation'
];

/**
 * @summary 学習可能な思考モード選択器を作成
 * @param options 作成オプション
 * @returns 初期化された選択器
 */
export function createLearnableSelector(
  options: LearnableSelectorOptions = {}
): LearnableModeSelector {
  const opts = { ...DEFAULT_SELECTOR_OPTIONS, ...options };

  // 初期事前確率を設定
  const initialPriors = new Map<string, number>();
  ALL_MODES.forEach(mode => {
    initialPriors.set(mode, opts.initialPriors.get(mode) ?? 1 / ALL_MODES.length);
  });

  // メイン信念を作成
  const modeBelief: BayesianBelief = {
    hypothesis: 'optimal-mode',
    prior: createPrior(ALL_MODES, initialPriors),
    likelihood: createPrior(ALL_MODES),
    posterior: createPrior(ALL_MODES, initialPriors),
    evidence: [],
    lastUpdated: new Date()
  };

  // フェーズ別信念を作成
  const phaseBeliefs = new Map<ThinkingPhase, BayesianBelief>();
  ALL_PHASES.forEach(phase => {
    const phasePriors = new Map<string, number>();
    ALL_MODES.forEach(mode => {
      // フェーズ互換性を初期事前確率として使用
      const compatibility = getModePhaseCompatibility(mode, phase);
      phasePriors.set(mode, compatibility);
    });
    phaseBeliefs.set(phase, {
      hypothesis: `optimal-mode-for-${phase}`,
      prior: createPrior(ALL_MODES, phasePriors),
      likelihood: createPrior(ALL_MODES),
      posterior: createPrior(ALL_MODES, phasePriors),
      evidence: [],
      lastUpdated: new Date()
    });
  });

  return {
    modeBelief,
    phaseBeliefs,
    selectionHistory: [],
    feedbackHistory: [],
    learningRate: opts.learningRate,
    explorationRate: opts.explorationRate,
    createdAt: new Date(),
    updateCount: 0
  };
}

/**
 * @summary コンテキストから思考モードを選択
 * @param selector 選択器
 * @param context 思考コンテキスト
 * @returns 選択結果
 */
export function selectMode(
  selector: LearnableModeSelector,
  context: ThinkingContext
): ModeSelectionResult {
  // コンテキスト特徴量を抽出
  const features = extractContextFeatures(context);

  // フェーズ別信念を取得（存在しない場合はメイン信念）
  const phaseBelief = selector.phaseBeliefs.get(context.phase) || selector.modeBelief;

  // ベイズ推定に基づく選択
  let distribution = phaseBelief.posterior;

  // コンテキスト特徴量で調整
  const adjustedDistribution = adjustDistributionByContext(distribution, features, context);

  // 探索（exploration）の実行
  if (Math.random() < selector.explorationRate) {
    return selectExploratoryMode(selector, context, adjustedDistribution);
  }

  // 最も確率の高いモードを選択
  const { hypothesis, probability } = getMostProbable(adjustedDistribution);
  const selectedMode = hypothesis as ThinkingMode;

  // 信頼度を計算
  const confidence = calculateSelectionConfidence(adjustedDistribution, selectedMode);

  // 代替案を取得
  const alternatives = getAlternatives(adjustedDistribution, selectedMode);

  // 選択理由を生成
  const reasoning = generateSelectionReasoning(selectedMode, context, features, probability);

  const result: ModeSelectionResult = {
    selectedMode,
    confidence,
    distribution: adjustedDistribution,
    reasoning,
    alternatives,
    context,
    timestamp: new Date()
  };

  return result;
}

/**
 * @summary 選択結果に基づいて事前分布を更新
 * @param selector 選択器
 * @param feedback フィードバック
 * @returns 更新された選択器
 */
export function updatePriors(
  selector: LearnableModeSelector,
  feedback: ModeSelectionFeedback
): LearnableModeSelector {
  const { result, outcome, effectiveness } = feedback;

  // 尤度を計算
  const likelihoods = new Map<string, number>();
  const selectedMode = result.selectedMode;

  ALL_MODES.forEach(mode => {
    if (mode === selectedMode) {
      // 選択されたモード: 結果に基づいて尤度を設定
      switch (outcome) {
        case 'success':
          likelihoods.set(mode, 0.7 + effectiveness * 0.3);
          break;
        case 'partial':
          likelihoods.set(mode, 0.4 + effectiveness * 0.3);
          break;
        case 'failure':
          likelihoods.set(mode, 0.1 + effectiveness * 0.2);
          break;
      }
    } else {
      // 選択されなかったモード: 逆の尤度
      const selectedLikelihood = likelihoods.get(selectedMode) ?? 0.5;
      likelihoods.set(mode, 1 - selectedLikelihood * 0.5);
    }
  });

  // 証拠を作成
  const evidence = createEvidence(
    'user-feedback',
    `mode-${selectedMode}-${outcome}`,
    likelihoods,
    effectiveness
  );

  // メイン信念を更新
  const updatedModeBelief = updateBayesianBeliefWithLearning(
    selector.modeBelief,
    evidence,
    selector.learningRate
  );

  // フェーズ別信念を更新
  const updatedPhaseBeliefs = new Map<ThinkingPhase, BayesianBelief>();
  selector.phaseBeliefs.forEach((belief, phase) => {
    if (phase === result.context.phase) {
      updatedPhaseBeliefs.set(
        phase,
        updateBayesianBeliefWithLearning(belief, evidence, selector.learningRate)
      );
    } else {
      updatedPhaseBeliefs.set(phase, belief);
    }
  });

  return {
    ...selector,
    modeBelief: updatedModeBelief,
    phaseBeliefs: updatedPhaseBeliefs,
    selectionHistory: [...selector.selectionHistory, result],
    feedbackHistory: [...selector.feedbackHistory, feedback],
    updateCount: selector.updateCount + 1
  };
}

/**
 * @summary バッチ更新（複数のフィードバックを一括適用）
 * @param selector 選択器
 * @param feedbacks フィードバックのリスト
 * @returns 更新された選択器
 */
export function batchUpdatePriors(
  selector: LearnableModeSelector,
  feedbacks: ModeSelectionFeedback[]
): LearnableModeSelector {
  return feedbacks.reduce(
    (currentSelector, feedback) => updatePriors(currentSelector, feedback),
    selector
  );
}

/**
 * @summary 選択器のパフォーマンスを評価
 * @param selector 選択器
 * @returns パフォーマンス評価
 */
export function evaluateSelectorPerformance(selector: LearnableModeSelector): {
  successRate: number;
  avgEffectiveness: number;
  modeDistribution: Map<ThinkingMode, number>;
  recentTrend: 'improving' | 'declining' | 'stable';
} {
  const { feedbackHistory } = selector;

  if (feedbackHistory.length === 0) {
    return {
      successRate: 0,
      avgEffectiveness: 0,
      modeDistribution: new Map(),
      recentTrend: 'stable'
    };
  }

  // 成功率
  const successes = feedbackHistory.filter(f => f.outcome === 'success').length;
  const successRate = successes / feedbackHistory.length;

  // 平均有効性
  const avgEffectiveness = feedbackHistory.reduce(
    (sum, f) => sum + f.effectiveness,
    0
  ) / feedbackHistory.length;

  // モード分布
  const modeDistribution = new Map<ThinkingMode, number>();
  ALL_MODES.forEach(mode => modeDistribution.set(mode, 0));
  feedbackHistory.forEach(f => {
    const mode = f.result.selectedMode;
    modeDistribution.set(mode, (modeDistribution.get(mode) || 0) + 1);
  });

  // 最近の傾向
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (feedbackHistory.length >= 10) {
    const recent = feedbackHistory.slice(-5);
    const earlier = feedbackHistory.slice(-10, -5);

    const recentAvg = recent.reduce((s, f) => s + f.effectiveness, 0) / 5;
    const earlierAvg = earlier.reduce((s, f) => s + f.effectiveness, 0) / 5;

    if (recentAvg > earlierAvg + 0.1) {
      recentTrend = 'improving';
    } else if (recentAvg < earlierAvg - 0.1) {
      recentTrend = 'declining';
    }
  }

  return {
    successRate,
    avgEffectiveness,
    modeDistribution,
    recentTrend
  };
}

/**
 * @summary 選択器をリセット（学習データを保持）
 * @param selector 選択器
 * @returns リセットされた選択器
 */
export function resetSelector(selector: LearnableModeSelector): LearnableModeSelector {
  return {
    ...createLearnableSelector({
      learningRate: selector.learningRate,
      explorationRate: selector.explorationRate
    }),
    // 履歴は保持
    selectionHistory: selector.selectionHistory,
    feedbackHistory: selector.feedbackHistory,
    createdAt: selector.createdAt,
    updateCount: selector.updateCount
  };
}

/**
 * @summary 選択器の設定を調整
 * @param selector 選択器
 * @param adjustments 調整内容
 * @returns 調整された選択器
 */
export function adjustSelectorSettings(
  selector: LearnableModeSelector,
  adjustments: {
    learningRate?: number;
    explorationRate?: number;
  }
): LearnableModeSelector {
  return {
    ...selector,
    learningRate: adjustments.learningRate ?? selector.learningRate,
    explorationRate: adjustments.explorationRate ?? selector.explorationRate
  };
}

// ===== ヘルパー関数 =====

/**
 * コンテキストから特徴量を抽出
 */
function extractContextFeatures(context: ThinkingContext): ContextFeatures {
  // タスクキーワード
  const taskKeywords = new Map<string, number>();
  const keywordPatterns: Array<{ pattern: RegExp; keyword: string; weight: number }> = [
    { pattern: /設計|デザイン|企画|創造/, keyword: 'creative', weight: 0.3 },
    { pattern: /分析|調査|検討|論理/, keyword: 'analytical', weight: 0.3 },
    { pattern: /レビュー|評価|検証|批判/, keyword: 'critical', weight: 0.3 },
    { pattern: /実装|修正|開発|実現/, keyword: 'practical', weight: 0.3 },
    { pattern: /合意|協議|調整|関係/, keyword: 'social', weight: 0.3 },
    { pattern: /倫理|配慮|感情|共感/, keyword: 'emotional', weight: 0.3 }
  ];

  if (context.task) {
    keywordPatterns.forEach(({ pattern, keyword, weight }) => {
      if (pattern.test(context.task)) {
        taskKeywords.set(keyword, (taskKeywords.get(keyword) || 0) + weight);
      }
    });
  }

  // フェーズ重み
  const phaseWeights = new Map<ThinkingPhase, number>();
  phaseWeights.set(context.phase, 1.0);

  // 履歴特徴量
  const recentModes = context.history.slice(-5).map(h => h.mode);
  const uniqueRecentModes = new Set(recentModes);
  const modeDiversity = uniqueRecentModes.size / ALL_MODES.length;
  const avgConfidence = context.history.length > 0
    ? context.history.reduce((s, h) => s + h.confidence, 0) / context.history.length
    : 0.5;

  return {
    taskKeywords,
    phaseWeights,
    historyFeatures: {
      recentModes,
      modeDiversity,
      avgConfidence
    }
  };
}

/**
 * コンテキストで分布を調整
 */
function adjustDistributionByContext(
  distribution: Distribution,
  features: ContextFeatures,
  context: ThinkingContext
): Distribution {
  const adjustedProbabilities = new Map<string, number>();

  distribution.probabilities.forEach((baseProb, mode) => {
    let adjusted = baseProb;

    // タスクキーワードによる調整
    const keywordBoost = features.taskKeywords.get(mode) || 0;
    adjusted += keywordBoost;

    // フェーズ互換性による調整
    const phaseCompatibility = getModePhaseCompatibility(mode as ThinkingMode, context.phase);
    adjusted = adjusted * 0.7 + phaseCompatibility * 0.3;

    // 履歴の多様性が低い場合は異なるモードを優先
    if (features.historyFeatures.modeDiversity < 0.3) {
      const recentCount = features.historyFeatures.recentModes.filter(m => m === mode).length;
      if (recentCount > 2) {
        adjusted *= 0.5;  // 最近多用されているモードは減らす
      }
    }

    adjustedProbabilities.set(mode, Math.max(0.01, adjusted));
  });

  // 正規化
  let sum = 0;
  adjustedProbabilities.forEach(p => sum += p);
  adjustedProbabilities.forEach((p, m) => adjustedProbabilities.set(m, p / sum));

  return {
    probabilities: adjustedProbabilities,
    createdAt: distribution.createdAt,
    version: distribution.version + 1
  };
}

/**
 * 探索的選択
 */
function selectExploratoryMode(
  selector: LearnableModeSelector,
  context: ThinkingContext,
  distribution: Distribution
): ModeSelectionResult {
  // 最近使用していないモードを優先的に選択
  const recentModes = selector.selectionHistory
    .slice(-10)
    .map(s => s.selectedMode);

  const modeUsage = new Map<ThinkingMode, number>();
  ALL_MODES.forEach(m => modeUsage.set(m, 0));
  recentModes.forEach(m => modeUsage.set(m, (modeUsage.get(m) || 0) + 1));

  // 使用頻度の低いモードを見つける
  let leastUsed: ThinkingMode = 'creative';
  let minUsage = Infinity;
  modeUsage.forEach((usage, mode) => {
    if (usage < minUsage) {
      minUsage = usage;
      leastUsed = mode;
    }
  });

  const confidence = 0.3;  // 探索は低信頼度
  const alternatives = getAlternatives(distribution, leastUsed);

  return {
    selectedMode: leastUsed,
    confidence,
    distribution,
    reasoning: `[探索] 最近使用していないモード「${leastUsed}」を試行`,
    alternatives,
    context,
    timestamp: new Date()
  };
}

/**
 * 選択信頼度を計算
 */
function calculateSelectionConfidence(
  distribution: Distribution,
  selectedMode: ThinkingMode
): number {
  const entropy = calculateEntropy(distribution);
  const maxEntropy = getMaxEntropy(ALL_MODES.length);

  // エントロピーが低いほど信頼度が高い
  const certaintyRatio = maxEntropy > 0 ? 1 - entropy / maxEntropy : 1;
  const selectedProb = distribution.probabilities.get(selectedMode) || 0;

  // 信頼度 = 選択確率 × 確実性比率
  return Math.min(1, selectedProb * (0.5 + certaintyRatio * 0.5));
}

/**
 * 代替案を取得
 */
function getAlternatives(
  distribution: Distribution,
  selectedMode: ThinkingMode
): Array<{ mode: ThinkingMode; probability: number }> {
  const alternatives: Array<{ mode: ThinkingMode; probability: number }> = [];

  distribution.probabilities.forEach((prob, mode) => {
    if (mode !== selectedMode) {
      alternatives.push({
        mode: mode as ThinkingMode,
        probability: prob
      });
    }
  });

  return alternatives
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);
}

/**
 * 選択理由を生成
 */
function generateSelectionReasoning(
  mode: ThinkingMode,
  context: ThinkingContext,
  features: ContextFeatures,
  probability: number
): string {
  const reasons: string[] = [];

  // ベイズ推定の結果
  reasons.push(`ベイズ推定による確率: ${(probability * 100).toFixed(0)}%`);

  // フェーズ適合性
  const phaseCompat = getModePhaseCompatibility(mode, context.phase);
  if (phaseCompat > 0.7) {
    reasons.push(`フェーズ「${context.phase}」との高適合性`);
  }

  // タスクキーワード
  const keywordBoost = features.taskKeywords.get(mode) || 0;
  if (keywordBoost > 0) {
    reasons.push('タスク内容との合致');
  }

  // 履歴多様性
  if (features.historyFeatures.modeDiversity < 0.5) {
    reasons.push('思考モードの多様化を考慮');
  }

  return `モード「${mode}」を選択: ${reasons.join(', ')}`;
}

/**
 * 学習率を適用して信念を更新
 */
function updateBayesianBeliefWithLearning(
  belief: BayesianBelief,
  evidence: Evidence,
  learningRate: number
): BayesianBelief {
  // 学習率を適用した尤度の調整
  const adjustedLikelihoods = new Map<string, number>();
  evidence.likelihoods?.forEach((likelihood, hypothesis) => {
    // 現在の確率との加重平均
    const currentProb = belief.posterior.probabilities.get(hypothesis) || 0.5;
    const adjusted = currentProb * (1 - learningRate) + likelihood * learningRate;
    adjustedLikelihoods.set(hypothesis, adjusted);
  });

  const adjustedEvidence: Evidence = {
    ...evidence,
    likelihoods: adjustedLikelihoods
  };

  // 事後分布を更新
  const updatedPosterior = updateBelief(belief.posterior, adjustedEvidence);

  return {
    ...belief,
    posterior: updatedPosterior,
    evidence: [...belief.evidence, adjustedEvidence],
    lastUpdated: new Date()
  };
}

/**
 * @summary 選択器の状態をJSON形式でエクスポート
 * @param selector 選択器
 * @returns JSON互換オブジェクト
 */
export function selectorToJSON(selector: LearnableModeSelector): Record<string, unknown> {
  return {
    modeBelief: {
      hypothesis: selector.modeBelief.hypothesis,
      posterior: Array.from(selector.modeBelief.posterior.probabilities.entries())
    },
    learningRate: selector.learningRate,
    explorationRate: selector.explorationRate,
    updateCount: selector.updateCount,
    feedbackCount: selector.feedbackHistory.length,
    createdAt: selector.createdAt.toISOString()
  };
}

/**
 * @summary 選択器のサマリーを取得
 * @param selector 選択器
 * @returns サマリー文字列
 */
export function summarizeSelector(selector: LearnableModeSelector): string {
  const performance = evaluateSelectorPerformance(selector);
  const modeDist = Array.from(performance.modeDistribution.entries())
    .filter(([_, count]) => count > 0)
    .map(([mode, count]) => `${mode}: ${count}`)
    .join(', ');

  return [
    `学習可能選択器 (更新${selector.updateCount}回)`,
    `成功率: ${(performance.successRate * 100).toFixed(0)}%`,
    `平均有効性: ${(performance.avgEffectiveness * 100).toFixed(0)}%`,
    `傾向: ${performance.recentTrend}`,
    `モード分布: [${modeDist}]`
  ].join(' | ');
}
