/**
 * @abdd.meta
 * path: .pi/lib/hyper-metacognition.ts
 * role: 超メタ認知エンジン
 * why: メタ認知そのものをメタ認知する再帰的構造を提供し、認知の限界を認識する
 * related: thinking-process.ts, aporetic-reasoning.ts, creative-destruction.ts
 * public_api: HyperMetacognitionEngine, MetacognitiveLayer, performHyperMetacognition, MetaMetaState
 * invariants: 無限後退を認識しつつ、実用的な停止点を設定する
 * side_effects: なし
 * failure_modes: 形式化への回帰、無限ループ
 * @abdd.explain
 * overview: 多層的なメタ認知構造により、思考の質を深層から評価・改善する
 * what_it_does: 4層構造のメタ認知、自己参照的評価、形式化リスク検出
 * why_it_exists: 単層のメタ認知では捉えられない認知の限界を可視化するため
 * scope:
 *   in: 思考内容、現在の認知状態
 *   out: 多層メタ認知状態、改善推奨、形式化リスク
 */

import type { Distribution, Evidence } from './belief-updater.js';
import { createPrior, calculateEntropy } from './belief-updater.js';
import type { Premise } from './creative-destruction.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * メタ認知層
 * @summary メタ認知の階層構造
 */
export interface MetacognitiveLayer {
  /** 層番号（0: 直接思考, 1: メタ認知, 2: メタメタ認知, 3: メタメタメタ認知） */
  level: 0 | 1 | 2 | 3;
  /** 層の内容 */
  content: string;
  /** 層での認識 */
  observations: string[];
  /** 層での評価 */
  evaluation: string;
  /** この層での信頼度 */
  confidence: number;
  /** この層の限界 */
  limitations: string[];
  /** この層が除外しているもの */
  exclusions: string[];
  /** タイムスタンプ */
  timestamp: Date;
}

/**
 * 超メタ認知状態
 * @summary 4層構造の完全なメタ認知状態
 */
export interface HyperMetacognitiveState {
  /** セッションID */
  sessionId: string;
  /** 第0層：直接的な思考 */
  layer0: MetacognitiveLayer;
  /** 第1層：思考についての思考（従来のメタ認知） */
  layer1: MetacognitiveLayer;
  /** 第2層：メタ認知についての思考（超メタ認知） */
  layer2: MetacognitiveLayer;
  /** 第3層：超メタ認知の限界認識 */
  layer3: MetacognitiveLayer;
  /** 全体の統合評価 */
  integratedEvaluation: {
    /** 全体的な思考の質（0-1） */
    thinkingQuality: number;
    /** 形式化リスク（0-1、高いほど危険） */
    formalizationRisk: number;
    /** 自己参照の一貫性（0-1） */
    selfReferenceConsistency: number;
    /** 認知の深さ */
    cognitiveDepth: number;
    /** 停止点の理由 */
    stoppingPointRationale: string;
    /** 停止点の恣意性認識 */
    arbitrarinessAcknowledged: boolean;
  };
  /** 検出されたパターン */
  detectedPatterns: CognitivePattern[];
  /** 推奨される改善 */
  recommendedImprovements: ImprovementRecommendation[];
  /** 無限後退の認識 */
  infiniteRegressAwareness: {
    isAware: boolean;
    depth: number;
    practicalLimit: string;
  };
}

/**
 * 認知パターン
 * @summary 検出された認知パターン
 */
export interface CognitivePattern {
  /** パターン名 */
  name: string;
  /** パターンタイプ */
  type: 'formalization' | 'autopilot' | 'confirmation-bias' | 'overconfidence' | 'avoidance' | 'creative';
  /** 検出された層 */
  detectedAt: number[];
  /** パターンの説明 */
  description: string;
  /** 影響度（0-1） */
  impact: number;
  /** 対処方法 */
  mitigation: string;
}

/**
 * 改善推奨
 * @summary 思考改善のための推奨
 */
export interface ImprovementRecommendation {
  /** 推奨の優先度 */
  priority: 'high' | 'medium' | 'low';
  /** 推奨内容 */
  content: string;
  /** 推奨の根拠 */
  rationale: string;
  /** 期待される効果 */
  expectedEffect: string;
  /** 実装の難易度（0-1） */
  difficulty: number;
  /** 関連する層 */
  relatedLayers: number[];
}

/**
 * ベイズ的メタ信念
 * @summary 確率論的な自己評価
 */
export interface BayesianMetaBelief {
  /** 評価対象 */
  target: string;
  /** 現在の信念分布 */
  beliefDistribution: Distribution;
  /** 不確実性（0-1） */
  uncertainty: number;
  /** 学習履歴 */
  learningHistory: Array<{
    evidence: Evidence;
    previousBelief: number;
    updatedBelief: number;
    timestamp: Date;
  }>;
  /** 信念の安定性（0-1） */
  stability: number;
}

/**
 * 超メタ認知エンジン
 * @summary 再帰的なメタ認知システム
 */
export interface HyperMetacognitionEngine {
  /** 現在の状態 */
  currentState: HyperMetacognitiveState | null;
  /** 信念履歴 */
  beliefHistory: BayesianMetaBelief[];
  /** エンジン設定 */
  config: HyperMetacognitionConfig;
  /** 統計情報 */
  statistics: {
    totalSessions: number;
    averageThinkingQuality: number;
    averageFormalizationRisk: number;
    patternsDetected: Record<string, number>;
    improvementsImplemented: number;
  };
}

/**
 * エンジン設定
 */
export interface HyperMetacognitionConfig {
  /** 最大認知深度 */
  maxCognitiveDepth: number;
  /** 形式化リスクの閾値 */
  formalizationRiskThreshold: number;
  /** 自己参照チェックの深さ */
  selfReferenceDepth: number;
  /** 自動改善推奨の有無 */
  autoImprovementRecommendation: boolean;
  /** パターン検出の感度 */
  patternDetectionSensitivity: number;
}

// ============================================================================
// デフォルト設定
// ============================================================================

const DEFAULT_CONFIG: HyperMetacognitionConfig = {
  maxCognitiveDepth: 3,
  formalizationRiskThreshold: 0.6,
  selfReferenceDepth: 3,
  autoImprovementRecommendation: true,
  patternDetectionSensitivity: 0.7
};

// ============================================================================
// 形式化パターンの定義
// ============================================================================

const FORMALIZATION_PATTERNS = [
  { pattern: /前提を確認/, name: '前提確認パターン' },
  { pattern: /二項対立を検出/, name: '二項対立検出パターン' },
  { pattern: /文脈依存性/, name: '文脈依存性パターン' },
  { pattern: /除外されたもの/, name: '除外分析パターン' },
  { pattern: /限界を認識/, name: '限界認識パターン' },
  { pattern: /批判的検討/, name: '批判的検討パターン' },
  { pattern: /メタ認知/, name: 'メタ認知言及パターン' },
  { pattern: /認知バイアス/, name: 'バイアス言及パターン' }
];

// ============================================================================
// コア関数
// ============================================================================

/**
 * @summary 超メタ認知エンジンを作成
 * @param config エンジン設定
 * @returns 作成されたエンジン
 */
export function createHyperMetacognitionEngine(
  config: Partial<HyperMetacognitionConfig> = {}
): HyperMetacognitionEngine {
  return {
    currentState: null,
    beliefHistory: [],
    config: { ...DEFAULT_CONFIG, ...config },
    statistics: {
      totalSessions: 0,
      averageThinkingQuality: 0,
      averageFormalizationRisk: 0,
      patternsDetected: {},
      improvementsImplemented: 0
    }
  };
}

/**
 * @summary 超メタ認知を実行
 * @param engine エンジン
 * @param thought 思考内容
 * @param context コンテキスト
 * @returns 超メタ認知状態
 */
export function performHyperMetacognition(
  engine: HyperMetacognitionEngine,
  thought: string,
  context: string = ''
): HyperMetacognitiveState {
  const sessionId = `meta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 第0層：直接的な思考
  const layer0 = createLayer0(thought, context);

  // 第1層：メタ認知
  const layer1 = createLayer1(layer0);

  // 第2層：超メタ認知
  const layer2 = createLayer2(layer1);

  // 第3層：超メタ認知の限界
  const layer3 = createLayer3(layer2);

  // 統合評価
  const integratedEvaluation = createIntegratedEvaluation(layer0, layer1, layer2, layer3);

  // パターン検出
  const detectedPatterns = detectCognitivePatterns(
    [layer0, layer1, layer2, layer3],
    engine.config.patternDetectionSensitivity
  );

  // 改善推奨
  const recommendedImprovements = engine.config.autoImprovementRecommendation
    ? generateImprovementRecommendations(detectedPatterns, integratedEvaluation)
    : [];

  // 無限後退の認識
  const infiniteRegressAwareness = {
    isAware: true,
    depth: 4,
    practicalLimit: '実用性の閾値：第3層で停止'
  };

  const state: HyperMetacognitiveState = {
    sessionId,
    layer0,
    layer1,
    layer2,
    layer3,
    integratedEvaluation,
    detectedPatterns,
    recommendedImprovements,
    infiniteRegressAwareness
  };

  // 統計を更新
  engine.currentState = state;
  engine.statistics.totalSessions++;
  engine.statistics.averageThinkingQuality =
    (engine.statistics.averageThinkingQuality * (engine.statistics.totalSessions - 1) +
     integratedEvaluation.thinkingQuality) / engine.statistics.totalSessions;
  engine.statistics.averageFormalizationRisk =
    (engine.statistics.averageFormalizationRisk * (engine.statistics.totalSessions - 1) +
     integratedEvaluation.formalizationRisk) / engine.statistics.totalSessions;

  for (const pattern of detectedPatterns) {
    engine.statistics.patternsDetected[pattern.name] =
      (engine.statistics.patternsDetected[pattern.name] || 0) + 1;
  }

  return state;
}

/**
 * @summary メタ認知を深化
 * @param engine エンジン
 * @param additionalInsight 追加の洞察
 * @returns 更新された状態
 */
export function deepenMetacognition(
  engine: HyperMetacognitionEngine,
  additionalInsight: string
): HyperMetacognitiveState | null {
  if (!engine.currentState) return null;

  const previousState = engine.currentState;

  // 第0層に追加洞察を反映
  const newLayer0: MetacognitiveLayer = {
    ...previousState.layer0,
    content: `${previousState.layer0.content}\n\n追加洞察: ${additionalInsight}`,
    timestamp: new Date()
  };

  // 下位層から再構築
  const newLayer1 = createLayer1(newLayer0);
  const newLayer2 = createLayer2(newLayer1);
  const newLayer3 = createLayer3(newLayer2);

  // 統合評価を更新
  const integratedEvaluation = createIntegratedEvaluation(newLayer0, newLayer1, newLayer2, newLayer3);

  return {
    ...previousState,
    layer0: newLayer0,
    layer1: newLayer1,
    layer2: newLayer2,
    layer3: newLayer3,
    integratedEvaluation
  };
}

/**
 * @summary ベイズ的メタ信念を更新
 * @param engine エンジン
 * @param target 評価対象
 * @param evidence 新しい証拠
 * @returns 更新された信念
 */
export function updateMetaBelief(
  engine: HyperMetacognitionEngine,
  target: string,
  evidence: Evidence
): BayesianMetaBelief {
  // 既存の信念を検索
  let belief = engine.beliefHistory.find(b => b.target === target);

  if (!belief) {
    // 新規作成
    belief = {
      target,
      beliefDistribution: createPrior(['高品質', '中品質', '低品質']),
      uncertainty: 0.5,
      learningHistory: [],
      stability: 0.5
    };
    engine.beliefHistory.push(belief);
  }

  // 信念を更新
  const previousBelief = belief.beliefDistribution.probabilities.get('高品質') ?? 0.33;
  const likelihood = evidence.likelihoods?.get('高品質') ?? 0.5;
  const newBelief = previousBelief * likelihood + 0.001;
  const normalizedBelief = newBelief / (newBelief + (1 - previousBelief) * (1 - likelihood) + 0.001);

  // 分布を更新
  const newDistribution = createPrior(
    ['高品質', '中品質', '低品質'],
    new Map([
      ['高品質', normalizedBelief],
      ['中品質', (1 - normalizedBelief) / 2],
      ['低品質', (1 - normalizedBelief) / 2]
    ])
  );

  // 履歴を更新
  belief.learningHistory.push({
    evidence,
    previousBelief,
    updatedBelief: normalizedBelief,
    timestamp: new Date()
  });

  // 不確実性を更新
  const entropy = calculateEntropy(newDistribution);
  belief.uncertainty = entropy / Math.log2(3); // 正規化
  belief.beliefDistribution = newDistribution;
  belief.stability = 1 - Math.abs(normalizedBelief - previousBelief);

  return belief;
}

/**
 * @summary 思考品質の総合評価を取得
 * @param state 超メタ認知状態
 * @returns 評価結果
 */
export function getThinkingQualityAssessment(
  state: HyperMetacognitiveState
): {
  overallScore: number;
  breakdown: {
    depth: number;
    coherence: number;
    selfAwareness: number;
    flexibility: number;
    rigor: number;
  };
  strengths: string[];
  weaknesses: string[];
} {
  const evaluation = state.integratedEvaluation;

  const breakdown = {
    depth: evaluation.cognitiveDepth / 4, // 4層構造なので
    coherence: evaluation.selfReferenceConsistency,
    selfAwareness: 1 - evaluation.formalizationRisk,
    flexibility: calculateFlexibility(state.detectedPatterns),
    rigor: calculateRigor(state.layer1, state.layer2)
  };

  const overallScore = 
    breakdown.depth * 0.2 +
    breakdown.coherence * 0.2 +
    breakdown.selfAwareness * 0.2 +
    breakdown.flexibility * 0.2 +
    breakdown.rigor * 0.2;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (breakdown.depth > 0.7) strengths.push('深い認知的探索');
  if (breakdown.coherence > 0.7) strengths.push('一貫した自己参照');
  if (breakdown.selfAwareness > 0.7) strengths.push('高い自己認識');
  if (breakdown.flexibility > 0.7) strengths.push('柔軟な思考');

  if (breakdown.depth < 0.4) weaknesses.push('浅い認知的探索');
  if (breakdown.coherence < 0.4) weaknesses.push('自己参照の不整合');
  if (breakdown.selfAwareness < 0.4) weaknesses.push('低い自己認識');
  if (evaluation.formalizationRisk > 0.7) weaknesses.push('形式化のリスク');

  return {
    overallScore,
    breakdown,
    strengths,
    weaknesses
  };
}

/**
 * @summary メタ認知レポートを生成
 * @param state 超メタ認知状態
 * @returns レポート文字列
 */
export function generateMetacognitionReport(state: HyperMetacognitiveState): string {
  const assessment = getThinkingQualityAssessment(state);

  const lines: string[] = [
    '# 超メタ認知レポート',
    '',
    `セッションID: ${state.sessionId}`,
    '',
    '## 総合評価',
    `- 思考品質スコア: ${(assessment.overallScore * 100).toFixed(0)}%`,
    `- 形式化リスク: ${(state.integratedEvaluation.formalizationRisk * 100).toFixed(0)}%`,
    `- 認知の深さ: ${state.integratedEvaluation.cognitiveDepth}/4`,
    '',
    '## 内訳',
    `- 深度: ${(assessment.breakdown.depth * 100).toFixed(0)}%`,
    `- 一貫性: ${(assessment.breakdown.coherence * 100).toFixed(0)}%`,
    `- 自己認識: ${(assessment.breakdown.selfAwareness * 100).toFixed(0)}%`,
    `- 柔軟性: ${(assessment.breakdown.flexibility * 100).toFixed(0)}%`,
    `- 厳密性: ${(assessment.breakdown.rigor * 100).toFixed(0)}%`,
    '',
    '## 強み',
    ...assessment.strengths.map(s => `- ${s}`),
    '',
    '## 弱点',
    ...assessment.weaknesses.map(w => `- ${w}`),
    '',
    '## 検出されたパターン'
  ];

  for (const pattern of state.detectedPatterns) {
    lines.push(`- **${pattern.name}** (${pattern.type}): ${pattern.description}`);
    lines.push(`  - 影響度: ${(pattern.impact * 100).toFixed(0)}%`);
    lines.push(`  - 対処: ${pattern.mitigation}`);
  }

  if (state.recommendedImprovements.length > 0) {
    lines.push('');
    lines.push('## 推奨される改善');

    for (const rec of state.recommendedImprovements) {
      lines.push(`- [${rec.priority.toUpperCase()}] ${rec.content}`);
      lines.push(`  - 理由: ${rec.rationale}`);
      lines.push(`  - 期待効果: ${rec.expectedEffect}`);
    }
  }

  lines.push('');
  lines.push('## 無限後退の認識');
  lines.push(`- 認識済み: ${state.infiniteRegressAwareness.isAware ? 'はい' : 'いいえ'}`);
  lines.push(`- 実用的限界: ${state.infiniteRegressAwareness.practicalLimit}`);
  lines.push(`- 停止点の恣意性: ${state.integratedEvaluation.arbitrarinessAcknowledged ? '認識済み' : '未認識'}`);

  return lines.join('\n');
}

// ============================================================================
// 層構築関数
// ============================================================================

/**
 * 第0層を作成
 */
function createLayer0(thought: string, context: string): MetacognitiveLayer {
  const limitations: string[] = [];
  const exclusions: string[] = [];

  // 思考の限界を推測
  if (thought.length < 100) {
    limitations.push('思考が短い - 深い検討がない可能性');
  }
  if (!thought.includes('?') && !thought.includes('か？')) {
    limitations.push('問いがない - 疑問を持っていない可能性');
  }

  // 除外されているものを推測
  if (!thought.includes('感情') && !thought.includes('感覚')) {
    exclusions.push('感情的・感覚的な側面');
  }
  if (!thought.includes('他者') && !thought.includes('対話')) {
    exclusions.push('他者の視点');
  }

  return {
    level: 0,
    content: thought,
    observations: [`直接的な思考内容: "${thought.substring(0, 100)}..."`],
    evaluation: '初期思考の状態',
    confidence: 0.5,
    limitations,
    exclusions,
    timestamp: new Date()
  };
}

/**
 * 第1層を作成（従来のメタ認知）
 */
function createLayer1(layer0: MetacognitiveLayer): MetacognitiveLayer {
  const observations: string[] = [];
  const evaluation: string[] = [];
  const limitations: string[] = [];
  const exclusions: string[] = [];

  // 第0層の分析
  observations.push(`思考の長さ: ${layer0.content.length}文字`);
  observations.push(`第0層の限界: ${layer0.limitations.length}件検出`);
  observations.push(`第0層の除外: ${layer0.exclusions.length}件検出`);

  // メタ認知的評価
  if (layer0.limitations.length > 2) {
    evaluation.push('多くの限界がある - 深い思考が必要');
  } else if (layer0.limitations.length === 0) {
    evaluation.push('限界が検出されていない - それ自体が限界の可能性');
  } else {
    evaluation.push('適度な限界認識がある');
  }

  // 第1層自体の限界
  limitations.push('メタ認知自体が思考の一部 - 完全に客観ではない');
  limitations.push('言語化による情報の損失');

  // 第1層が除外するもの
  exclusions.push('メタ認知不可能な領域');
  exclusions.push('言語化できない認知プロセス');

  // 信頼度の計算
  const confidence = Math.max(0.3, 0.7 - layer0.limitations.length * 0.1);

  return {
    level: 1,
    content: `第0層（${layer0.content.substring(0, 50)}...）についてのメタ認知`,
    observations,
    evaluation: evaluation.join(' / '),
    confidence,
    limitations,
    exclusions,
    timestamp: new Date()
  };
}

/**
 * 第2層を作成（超メタ認知）
 */
function createLayer2(layer1: MetacognitiveLayer): MetacognitiveLayer {
  const observations: string[] = [];
  const limitations: string[] = [];
  const exclusions: string[] = [];

  // 形式化パターンの検出
  let formalizationRisk = 0;
  // layer0の内容も含めて形式化パターンを検索
  const allContent = layer1.observations.join(' ') + ' ' + layer1.evaluation + ' ' + layer1.content;

  for (const { pattern, name } of FORMALIZATION_PATTERNS) {
    if (pattern.test(allContent)) {
      observations.push(`形式化パターン検出: ${name}`);
      formalizationRisk += 0.1;
    }
  }

  // 形式化パターンが検出されなかった場合でも、デフォルトの観察を追加
  if (observations.length === 0) {
    observations.push('メタ認知の分析を実行中');
    observations.push(`第1層の信頼度: ${(layer1.confidence * 100).toFixed(0)}%`);
  }

  // メタ認知の形式化リスク
  if (formalizationRisk > 0.3) {
    observations.push(`形式化リスクが高い (${(formalizationRisk * 100).toFixed(0)}%)`);
  }

  // メタ認知が除外しているもの
  exclusions.push('メタ認知プロセスそのものの心理的・身体的側面');
  exclusions.push('時間経過による思考の変化');
  exclusions.push('無意識的な認知プロセス');

  // 第2層の限界
  limitations.push('この分析自体もまた形式的パターンに陥っている可能性');
  limitations.push('無限後退への入口');

  const confidence = Math.max(0.2, layer1.confidence - formalizationRisk);

  return {
    level: 2,
    content: 'メタ認知についてのメタ認知（超メタ認知）',
    observations,
    evaluation: `形式化リスク: ${(formalizationRisk * 100).toFixed(0)}%`,
    confidence,
    limitations,
    exclusions,
    timestamp: new Date()
  };
}

/**
 * 第3層を作成（超メタ認知の限界）
 */
function createLayer3(layer2: MetacognitiveLayer): MetacognitiveLayer {
  const observations: string[] = [];
  const limitations: string[] = [];
  const exclusions: string[] = [];

  // 無限後退の認識
  observations.push('この分析自体もまた形式的パターンに陥っている可能性がある');
  observations.push('無限後退を避けるためには、どこかで「十分」と判断する必要がある');
  observations.push('その「十分」の判断自体も恣意的である');

  // 停止点の理由
  const stoppingPointRationale = '実用性の閾値：これ以上の深さは実践的な価値を生まない';

  // 第3層の限界
  limitations.push('停止点は実用的な判断に過ぎない');
  limitations.push('停止点を選んだこと自体が一種の逃避かもしれない');
  limitations.push('認知の限界を「認識した」と思うこと自体が限界かもしれない');

  // 第3層が除外するもの
  exclusions.push('停止点以降の可能性');
  exclusions.push('停止点選択の無意識的な動機');

  const confidence = Math.max(0.1, layer2.confidence - 0.2);

  return {
    level: 3,
    content: '超メタ認知の限界認識',
    observations,
    evaluation: stoppingPointRationale,
    confidence,
    limitations,
    exclusions,
    timestamp: new Date()
  };
}

/**
 * 統合評価を作成
 */
function createIntegratedEvaluation(
  layer0: MetacognitiveLayer,
  layer1: MetacognitiveLayer,
  layer2: MetacognitiveLayer,
  layer3: MetacognitiveLayer
): HyperMetacognitiveState['integratedEvaluation'] {
  // 思考の品質
  const thinkingQuality = (
    layer0.confidence * 0.3 +
    layer1.confidence * 0.3 +
    layer2.confidence * 0.2 +
    layer3.confidence * 0.2
  );

  // 形式化リスク
  const formalizationRisk = 1 - layer2.confidence;

  // 自己参照の一貫性
  const selfReferenceConsistency = calculateSelfReferenceConsistency(layer0, layer1, layer2, layer3);

  // 認知の深さ
  const cognitiveDepth = 4; // 4層構造

  return {
    thinkingQuality,
    formalizationRisk,
    selfReferenceConsistency,
    cognitiveDepth,
    stoppingPointRationale: layer3.evaluation,
    arbitrarinessAcknowledged: layer3.observations.some(o => o.includes('恣意的'))
  };
}

/**
 * 認知パターンを検出
 */
function detectCognitivePatterns(
  layers: MetacognitiveLayer[],
  sensitivity: number
): CognitivePattern[] {
  const patterns: CognitivePattern[] = [];
  const allContent = layers.map(l => l.content + ' ' + l.observations.join(' ')).join(' ');

  // オートパイロット検出
  if (allContent.length < 500 && !allContent.includes('?')) {
    patterns.push({
      name: 'オートパイロット',
      type: 'autopilot',
      detectedAt: [0],
      description: '短い出力と問いの欠如から、自動的な応答の可能性',
      impact: 0.6,
      mitigation: '意識的に問いを立て、深く検討する'
    });
  }

  // 確証バイアス検出
  if (allContent.includes('確認') && !allContent.includes('反例')) {
    patterns.push({
      name: '確証バイアス',
      type: 'confirmation-bias',
      detectedAt: [1],
      description: '確認はしているが、反例を探していない',
      impact: 0.5,
      mitigation: '意図的に反例や反証を探す'
    });
  }

  // 過信検出
  if (layers[0].confidence > 0.8 && layers[0].limitations.length === 0) {
    patterns.push({
      name: '過信',
      type: 'overconfidence',
      detectedAt: [0],
      description: '高い信頼度にもかかわらず限界が認識されていない',
      impact: 0.7,
      mitigation: '限界と不確実性を明示的に検討する'
    });
  }

  // 形式化パターン
  let formalizationCount = 0;
  for (const { pattern } of FORMALIZATION_PATTERNS) {
    if (pattern.test(allContent)) {
      formalizationCount++;
    }
  }
  if (formalizationCount > 3) {
    patterns.push({
      name: '過度な形式化',
      type: 'formalization',
      detectedAt: [1, 2],
      description: '多くの形式的パターンが使用されている',
      impact: 0.6,
      mitigation: '直観的・非形式的な思考も試みる'
    });
  }

  // 感度でフィルタリング
  return patterns.filter(p => p.impact >= 1 - sensitivity);
}

/**
 * 改善推奨を生成
 */
function generateImprovementRecommendations(
  patterns: CognitivePattern[],
  evaluation: HyperMetacognitiveState['integratedEvaluation']
): ImprovementRecommendation[] {
  const recommendations: ImprovementRecommendation[] = [];

  // パターンに基づく推奨
  for (const pattern of patterns) {
    if (pattern.impact > 0.6) {
      recommendations.push({
        priority: 'high',
        content: pattern.mitigation,
        rationale: `${pattern.name}が検出されたため（影響度: ${(pattern.impact * 100).toFixed(0)}%）`,
        expectedEffect: `${pattern.name}の軽減`,
        difficulty: 0.3,
        relatedLayers: pattern.detectedAt
      });
    }
  }

  // 形式化リスクに基づく推奨
  if (evaluation.formalizationRisk > 0.5) {
    recommendations.push({
      priority: 'medium',
      content: '非形式的な思考方法を試みる（類推、隠喩、直観）',
      rationale: `形式化リスクが${(evaluation.formalizationRisk * 100).toFixed(0)}%と高い`,
      expectedEffect: 'より創造的な洞察の可能性',
      difficulty: 0.5,
      relatedLayers: [2]
    });
  }

  // 思考品質に基づく推奨
  if (evaluation.thinkingQuality < 0.5) {
    recommendations.push({
      priority: 'high',
      content: '思考を深める（より多くの問い、より多くの視点）',
      rationale: `思考品質が${(evaluation.thinkingQuality * 100).toFixed(0)}%と低い`,
      expectedEffect: '思考品質の向上',
      difficulty: 0.4,
      relatedLayers: [0, 1]
    });
  }

  return recommendations;
}

/**
 * 自己参照の一貫性を計算
 */
function calculateSelfReferenceConsistency(
  layer0: MetacognitiveLayer,
  layer1: MetacognitiveLayer,
  layer2: MetacognitiveLayer,
  layer3: MetacognitiveLayer
): number {
  // 信頼度の減衰が適切かどうか
  const expectedDecay = [1.0, 0.7, 0.5, 0.3];
  const actualConfidences = [layer0.confidence, layer1.confidence, layer2.confidence, layer3.confidence];

  let consistency = 0;
  for (let i = 0; i < 4; i++) {
    const diff = Math.abs(expectedDecay[i] - actualConfidences[i]);
    consistency += 1 - diff;
  }

  return consistency / 4;
}

/**
 * 柔軟性を計算
 */
function calculateFlexibility(patterns: CognitivePattern[]): number {
  // 'creative'以外のパターンは柔軟性を低下させる
  const negativePatterns = patterns.filter(p =>
    p.type !== 'creative'
  );

  if (negativePatterns.length === 0) return 0.8;
  if (negativePatterns.length === 1) return 0.6;
  if (negativePatterns.length === 2) return 0.4;
  return 0.2;
}

/**
 * 厳密性を計算
 */
function calculateRigor(layer1: MetacognitiveLayer, layer2: MetacognitiveLayer): number {
  // 限界認識の多さは厳密性の指標
  const limitationsCount = layer1.limitations.length + layer2.limitations.length;
  return Math.min(1, limitationsCount / 6);
}

/**
 * @summary エンジンレポートを生成
 * @param engine エンジン
 * @returns レポート文字列
 */
export function generateEngineReport(engine: HyperMetacognitionEngine): string {
  const lines: string[] = [
    '# 超メタ認知エンジン レポート',
    '',
    '## 統計情報',
    `- 総セッション数: ${engine.statistics.totalSessions}`,
    `- 平均思考品質: ${(engine.statistics.averageThinkingQuality * 100).toFixed(0)}%`,
    `- 平均形式化リスク: ${(engine.statistics.averageFormalizationRisk * 100).toFixed(0)}%`,
    `- 実装された改善: ${engine.statistics.improvementsImplemented}`,
    '',
    '## 検出されたパターン（頻度順）'
  ];

  const sortedPatterns = Object.entries(engine.statistics.patternsDetected)
    .sort((a, b) => b[1] - a[1]);

  for (const [name, count] of sortedPatterns) {
    lines.push(`- ${name}: ${count}回`);
  }

  if (engine.currentState) {
    lines.push('');
    lines.push('## 現在の状態');
    lines.push(`- セッションID: ${engine.currentState.sessionId}`);
    lines.push(`- 思考品質: ${(engine.currentState.integratedEvaluation.thinkingQuality * 100).toFixed(0)}%`);
    lines.push(`- 認知深度: ${engine.currentState.integratedEvaluation.cognitiveDepth}/4`);
  }

  return lines.join('\n');
}
