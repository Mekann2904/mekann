/**
 * @abdd.meta
 * path: .pi/lib/nonlinear-thought.ts
 * role: 非線形思考プロセスのデータ構造定義
 * why: 思考シード、連想、連想チェーンの型を厳密に定義し、システム内での不整合を防ぐため
 * related: ./belief-updater.ts, ./insight-generator.ts, ./memory-associator.ts
 * public_api: ThoughtSeed, Association, AssociationChain, ConvergencePoint, SeedType, AssociationType
 * invariants:
 *   - ThoughtSeedのemotionalValenceは-1から1の範囲
 *   - AssociationのstrengthとsemanticDistanceは0から1の範囲
 *   - AssociationChainのdiversityは0から1の範囲
 * side_effects: なし（純粋な型定義）
 * failure_modes: 型定義と実行時データの不一致、数値範囲の制約違反
 * @abdd.explain
 * overview: 非線形思考をモデル化するためのインターフェースと型エイリアスの集合
 * what_it_does:
 *   - 思考の起点となるシード（ThoughtSeed）の構造を定義する
 *   - シードから派生する連想（Association）の属性を規定する
 *   - 連想のシーケンスであるチェーン（AssociationChain）とその収束点（ConvergencePoint）を表現する
 * why_it_exists:
 *   - 人間の連想思考のような非線形なプロセスを構造化されたデータとして扱うため
 *   - 感情価や抽象度、驚き度などの定量的な指標を思考モデルに組み込むため
 * scope:
 *   in: なし
 *   out: ThoughtSeed, Association, AssociationChain, ConvergencePointインターフェースと関連する型
 */

import type { Distribution } from './belief-updater.js';
import { createPrior, normalizeDistribution } from './belief-updater.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 思考の種（シード）
 * @summary 非線形思考の出発点
 */
export interface ThoughtSeed {
  /** シードID */
  id: string;
  /** シードの内容 */
  content: string;
  /** シードのタイプ */
  type: SeedType;
  /** シードの感情価（-1: 否定的, 0: 中立, +1: 肯定的） */
  emotionalValence: number;
  /** シードの抽象度（0: 具体, 1: 抽象） */
  abstractionLevel: number;
  /** 関連する概念 */
  relatedConcepts: string[];
  /** シードの活性化強度 */
  activationStrength: number;
}

/**
 * シードタイプ
 */
export type SeedType =
  | 'concept'      // 概念
  | 'image'        // 画像
  | 'emotion'      // 感情
  | 'question'     // 問い
  | 'paradox'      // パラドックス
  | 'metaphor'     // 隠喩
  | 'memory'       // 記憶
  | 'random';      // ランダム

/**
 * 連想
 * @summary 単一の連想
 */
export interface Association {
  /** 連想ID */
  id: string;
  /** 連想の内容 */
  content: string;
  /** 連想タイプ */
  type: AssociationType;
  /** 連想の強度（0-1） */
  strength: number;
  /** 連想の理由（事後的な合理化） */
  rationale?: string;
  /** 意味的距離（0: 近い, 1: 遠い） */
  semanticDistance: number;
  /** 驚き度（0: 予測可能, 1: 予測困難） */
  surpriseLevel: number;
  /** 活性化時刻 */
  activatedAt: Date;
}

/**
 * 連想タイプ
 */
export type AssociationType =
  | 'semantic'     // 意味的（関連する意味）
  | 'phonetic'     // 音韻的（似た音）
  | 'visual'       // 視覚的（似た形）
  | 'emotional'    // 感情的（似た感情）
  | 'temporal'     // 時間的（同時期の記憶）
  | 'spatial'      // 空間的（似た場所）
  | 'metaphorical' // 隠喩的（比喩的接続）
  | 'random';      // ランダム（明確な接続なし）

/**
 * 連想チェーン
 * @summary 連想のシーケンス
 */
export interface AssociationChain {
  /** チェーンID */
  id: string;
  /** 出発点のシード */
  seed: ThoughtSeed;
  /** 連想のシーケンス */
  associations: Association[];
  /** チェーンの深さ */
  depth: number;
  /** チェーンの多様性（異なるタイプの連想の割合） */
  diversity: number;
  /** 収束点（複数可） */
  convergencePoints: ConvergencePoint[];
  /** チェーンの統計 */
  statistics: {
    totalLength: number;
    averageStrength: number;
    averageSurprise: number;
    typeDistribution: Record<AssociationType, number>;
  };
}

/**
 * 収束点
 * @summary 複数の連想チェーンが収束する点
 */
export interface ConvergencePoint {
  /** 収束点の内容 */
  content: string;
  /** 収束の強度（0-1） */
  convergenceStrength: number;
  /** この点に到達したチェーンの数 */
  chainCount: number;
  /** この点の洞察ポテンシャル */
  insightPotential: number;
  /** 収束の理由 */
  rationale: string;
}

/**
 * 創発的洞察
 * @summary 非線形思考から生まれる洞察
 */
export interface EmergentInsight {
  /** 洞察ID */
  id: string;
  /** 洞察の内容 */
  content: string;
  /** 洞察の種類 */
  kind: InsightKind;
  /** 洞察の新規性（0-1） */
  novelty: number;
  /** 洞察の有用性（0-1） */
  utility: number;
  /** 洞察の確からしさ（0-1） */
  plausibility: number;
  /** 洞察の源となった連想チェーン */
  sourceChains: string[];
  /** 関連する収束点 */
  relatedConvergencePoints: string[];
  /** 洞察の評価 */
  evaluation: InsightEvaluation;
}

/**
 * 洞察の種類
 */
export type InsightKind =
  | 'connection'     // 新しい接続
  | 'pattern'        // パターンの発見
  | 'analogy'        // 類推
  | 'reframe'        // 再フレーミング
  | 'synthesis'      // 総合
  | 'question'       // 新しい問い
  | 'contradiction'; // 矛盾の発見

/**
 * 洞察の評価
 */
export interface InsightEvaluation {
  /** 創造性スコア */
  creativityScore: number;
  /** 実現可能性スコア */
  feasibilityScore: number;
  /** インパクトスコア */
  impactScore: number;
  /** 検証可能性スコア */
  verifiabilityScore: number;
  /** 総合スコア */
  overallScore: number;
}

/**
 * 非線形思考パラメータ
 * @summary 思考生成の制御パラメータ
 */
export interface NonLinearThoughtParameters {
  /** 連想の深さ */
  maxDepth: number;
  /** 連想の幅（各段階での連想数） */
  breadth: number;
  /** ランダム性の強さ（0: 意味的, 1: ランダム） */
  randomnessWeight: number;
  /** 驚きを好む度合い（0: 予測可能, 1: 驚きを求める） */
  surprisePreference: number;
  /** 収束を許容するか */
  allowConvergence: boolean;
  /** 最小連想強度 */
  minAssociationStrength: number;
}

/**
 * 非線形思考エンジン
 * @summary 非線形思考生成システム
 */
export interface NonLinearThoughtEngine {
  /** 登録されたシード */
  seeds: Map<string, ThoughtSeed>;
  /** 生成されたチェーン */
  chains: AssociationChain[];
  /** 検出された収束点 */
  convergencePoints: ConvergencePoint[];
  /** 生成された洞察 */
  insights: EmergentInsight[];
  /** エンジン設定 */
  config: NonLinearThoughtConfig;
  /** 統計情報 */
  statistics: {
    totalChains: number;
    totalInsights: number;
    averageChainDepth: number;
    highNoveltyInsights: number;
    convergenceRate: number;
  };
}

/**
 * エンジン設定
 */
export interface NonLinearThoughtConfig {
  /** デフォルトパラメータ */
  defaultParameters: NonLinearThoughtParameters;
  /** 洞察の最小品質スコア */
  minInsightQuality: number;
  /** 収束点の最小チェーン数 */
  minChainsForConvergence: number;
  /** 並列チェーン数 */
  parallelChains: number;
  /** 自動洞察抽出の有無 */
  autoInsightExtraction: boolean;
}

// ============================================================================
// デフォルト設定
// ============================================================================

const DEFAULT_PARAMETERS: NonLinearThoughtParameters = {
  maxDepth: 5,
  breadth: 3,
  randomnessWeight: 0.3,
  surprisePreference: 0.5,
  allowConvergence: true,
  minAssociationStrength: 0.2
};

const DEFAULT_CONFIG: NonLinearThoughtConfig = {
  defaultParameters: DEFAULT_PARAMETERS,
  minInsightQuality: 0.5,
  minChainsForConvergence: 2,
  parallelChains: 3,
  autoInsightExtraction: true
};

// ============================================================================
// 連想語彙データ（簡易版）
// ============================================================================

const SEMANTIC_NETWORK: Record<string, string[]> = {
  '思考': ['認識', '推論', '判断', '意識', '知性'],
  '創造': ['生成', '発明', '革新', '藝術', '想像'],
  '矛盾': ['対立', '葛藤', 'パラドックス', '緊張', '非一貫性'],
  '存在': ['実在', '本質', '生成', '時間', '空間'],
  '価値': ['善', '美', '真', '意味', '目的'],
  '時間': ['永遠', '瞬間', '歴史', '未来', '過去'],
  '空間': ['場所', '距離', '広がり', '境界', '内部'],
  '感情': ['喜び', '悲しみ', '怒り', '恐れ', '愛'],
  '論理': ['推論', '証明', '前提', '結論', '妥当性'],
  '意味': ['解釈', '記号', '言語', '理解', 'コミュニケーション'],
  '完全性': ['完全', '品質', '正確性', '網羅性', '徹底'],
  '速度': ['効率', '迅速', 'スピード', '即時', '高速'],
  '品質': ['完全性', '正確', '高品質', '優秀', '精緻'],
  '効率': ['速度', '生産性', '最適化', '合理化', '迅速']
};

const PHONETIC_ASSOCIATIONS: Record<string, string[]> = {
  '思考': ['指数', '_sizes', '私考'],
  '創造': '総括 曹操 草創'.split(' '),
  '矛盾': '無頓着 鈍感 とんち'.split(' '),
  '存在': '全滅 禅天 前転'.split(' ')
};

const METAPHORICAL_TEMPLATES = [
  '{target}は{source}のようなものだ',
  '{target}を{source}として捉えると',
  '{target}と{source}の間には共鳴がある',
  '{target}は{source}の変奏である',
  '{target}と{source}は同じ波形を持つ'
];

// ============================================================================
// コア関数
// ============================================================================

/**
 * @summary 非線形思考エンジンを作成
 * @param config エンジン設定
 * @returns 作成されたエンジン
 */
export function createNonLinearThoughtEngine(
  config: Partial<NonLinearThoughtConfig> = {}
): NonLinearThoughtEngine {
  return {
    seeds: new Map(),
    chains: [],
    convergencePoints: [],
    insights: [],
    config: { ...DEFAULT_CONFIG, ...config },
    statistics: {
      totalChains: 0,
      totalInsights: 0,
      averageChainDepth: 0,
      highNoveltyInsights: 0,
      convergenceRate: 0
    }
  };
}

/**
 * @summary 思考シードを登録
 * @param engine エンジン
 * @param content シードの内容
 * @param type シードタイプ
 * @returns 登録されたシード
 */
export function registerSeed(
  engine: NonLinearThoughtEngine,
  content: string,
  type: SeedType = 'concept'
): ThoughtSeed {
  const id = `seed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const seed: ThoughtSeed = {
    id,
    content,
    type,
    emotionalValence: 0,
    abstractionLevel: 0.5,
    relatedConcepts: extractRelatedConcepts(content),
    activationStrength: 1.0
  };

  engine.seeds.set(id, seed);
  return seed;
}

/**
 * @summary 非線形思考を生成
 * @param engine エンジン
 * @param seedId シードID（省略時はランダム選択）
 * @param parameters パラメータ
 * @returns 生成された連想チェーン
 */
export function generateNonLinearThoughts(
  engine: NonLinearThoughtEngine,
  seedId?: string,
  parameters: Partial<NonLinearThoughtParameters> = {}
): AssociationChain {
  const params = { ...engine.config.defaultParameters, ...parameters };

  // シードを選択
  let seed: ThoughtSeed;
  if (seedId && engine.seeds.has(seedId)) {
    seed = engine.seeds.get(seedId)!;
  } else {
    const seeds = Array.from(engine.seeds.values());
    if (seeds.length === 0) {
      // デフォルトシードを作成
      seed = registerSeed(engine, '思考', 'concept');
    } else {
      seed = seeds[Math.floor(Math.random() * seeds.length)];
    }
  }

  // 連想チェーンを生成
  const chain = generateAssociationChain(seed, params);

  // チェーンを保存
  engine.chains.push(chain);
  engine.statistics.totalChains++;
  engine.statistics.averageChainDepth =
    (engine.statistics.averageChainDepth * (engine.statistics.totalChains - 1) + chain.depth) /
    engine.statistics.totalChains;

  // 収束点を検出
  if (params.allowConvergence) {
    detectConvergence(engine, chain);
  }

  // 自動洞察抽出
  if (engine.config.autoInsightExtraction) {
    extractInsights(engine, chain);
  }

  return chain;
}

/**
 * @summary 複数の非線形思考を並列生成
 * @param engine エンジン
 * @param seeds 複数のシードID
 * @param parameters パラメータ
 * @returns 生成された連想チェーンのリスト
 */
export function generateParallelThoughts(
  engine: NonLinearThoughtEngine,
  seeds: string[],
  parameters: Partial<NonLinearThoughtParameters> = {}
): AssociationChain[] {
  const chains: AssociationChain[] = [];

  for (const seedId of seeds) {
    const chain = generateNonLinearThoughts(engine, seedId, parameters);
    chains.push(chain);
  }

  // 収束点を再計算
  recalculateConvergence(engine);

  return chains;
}

/**
 * @summary 連想チェーンを最適化
 * @param engine エンジン
 * @param targetInsightType 目標とする洞察タイプ
 * @returns 最適化されたパラメータ
 */
export function optimizeAssociation(
  engine: NonLinearThoughtEngine,
  targetInsightType: InsightKind = 'connection'
): NonLinearThoughtParameters {
  // 過去の成功した洞察に基づいてパラメータを調整
  const successfulInsights = engine.insights.filter(
    i => i.kind === targetInsightType && i.evaluation.overallScore > 0.7
  );

  if (successfulInsights.length === 0) {
    return { ...DEFAULT_PARAMETERS };
  }

  // 成功した洞察のソースチェーンを分析
  const sourceChainIds = new Set<string>();
  for (const insight of successfulInsights) {
    insight.sourceChains.forEach(id => sourceChainIds.add(id));
  }

  const sourceChains = engine.chains.filter(c => sourceChainIds.has(c.id));

  // パラメータを推定
  const avgDepth = sourceChains.reduce((sum, c) => sum + c.depth, 0) / sourceChains.length;
  const avgDiversity = sourceChains.reduce((sum, c) => sum + c.diversity, 0) / sourceChains.length;
  const avgSurprise = sourceChains.reduce(
    (sum, c) => sum + c.statistics.averageSurprise,
    0
  ) / sourceChains.length;

  return {
    maxDepth: Math.round(avgDepth * 1.2),
    breadth: Math.round(avgDiversity * 5),
    randomnessWeight: avgSurprise * 0.8,
    surprisePreference: avgSurprise,
    allowConvergence: true,
    minAssociationStrength: 0.2
  };
}

/**
 * @summary パレート最適な洞察を取得
 * @param engine エンジン
 * @returns パレートフロント上の洞察
 */
export function getParetoOptimalInsights(
  engine: NonLinearThoughtEngine
): EmergentInsight[] {
  const insights = engine.insights;

  // 新規性と有用性の2軸でパレートフロントを計算
  const paretoOptimal: EmergentInsight[] = [];

  for (const insight of insights) {
    const isDominated = insights.some(other =>
      other !== insight &&
      other.evaluation.creativityScore >= insight.evaluation.creativityScore &&
      other.evaluation.impactScore >= insight.evaluation.impactScore &&
      (other.evaluation.creativityScore > insight.evaluation.creativityScore ||
       other.evaluation.impactScore > insight.evaluation.impactScore)
    );

    if (!isDominated) {
      paretoOptimal.push(insight);
    }
  }

  return paretoOptimal.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);
}

/**
 * @summary 非線形思考レポートを生成
 * @param engine エンジン
 * @returns レポート文字列
 */
export function generateNonLinearThoughtReport(
  engine: NonLinearThoughtEngine
): string {
  const lines: string[] = [
    '# 非線形思考エンジン レポート',
    '',
    '## 統計情報',
    `- 総チェーン数: ${engine.statistics.totalChains}`,
    `- 総洞察数: ${engine.statistics.totalInsights}`,
    `- 平均チェーン深度: ${engine.statistics.averageChainDepth.toFixed(1)}`,
    `- 高新規性洞察: ${engine.statistics.highNoveltyInsights}`,
    `- 収束率: ${(engine.statistics.convergenceRate * 100).toFixed(0)}%`,
    '',
    '## 最近の洞察'
  ];

  const recentInsights = engine.insights.slice(-5);
  for (const insight of recentInsights) {
    lines.push(``);
    lines.push(`### ${insight.content.substring(0, 50)}...`);
    lines.push(`- 種類: ${insight.kind}`);
    lines.push(`- 新規性: ${(insight.novelty * 100).toFixed(0)}%`);
    lines.push(`- 有用性: ${(insight.utility * 100).toFixed(0)}%`);
    lines.push(`- 総合スコア: ${(insight.evaluation.overallScore * 100).toFixed(0)}%`);
  }

  if (engine.convergencePoints.length > 0) {
    lines.push('');
    lines.push('## 収束点');

    for (const point of engine.convergencePoints.slice(0, 3)) {
      lines.push(`- **${point.content}**`);
      lines.push(`  - 収束強度: ${(point.convergenceStrength * 100).toFixed(0)}%`);
      lines.push(`  - チェーン数: ${point.chainCount}`);
    }
  }

  return lines.join('\n');
}

/**
 * @summary エンジンをリセット
 * @param engine エンジン
 * @returns リセットされたエンジン
 */
export function resetEngine(engine: NonLinearThoughtEngine): NonLinearThoughtEngine {
  engine.seeds.clear();
  engine.chains = [];
  engine.convergencePoints = [];
  engine.insights = [];
  engine.statistics = {
    totalChains: 0,
    totalInsights: 0,
    averageChainDepth: 0,
    highNoveltyInsights: 0,
    convergenceRate: 0
  };
  return engine;
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 関連概念を抽出
 */
function extractRelatedConcepts(content: string): string[] {
  const concepts: string[] = [];

  for (const [key, related] of Object.entries(SEMANTIC_NETWORK)) {
    if (content.includes(key)) {
      concepts.push(...related.slice(0, 3));
    }
  }

  return [...new Set(concepts)].slice(0, 5);
}

/**
 * 連想チェーンを生成
 */
function generateAssociationChain(
  seed: ThoughtSeed,
  params: NonLinearThoughtParameters
): AssociationChain {
  const chainId = `chain-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const associations: Association[] = [];
  let currentContent = seed.content;

  const typeDistribution: Record<AssociationType, number> = {
    'semantic': 0,
    'phonetic': 0,
    'visual': 0,
    'emotional': 0,
    'temporal': 0,
    'spatial': 0,
    'metaphorical': 0,
    'random': 0
  };

  for (let depth = 0; depth < params.maxDepth; depth++) {
    // 連想を生成
    const newAssociations = generateAssociations(
      currentContent,
      params.breadth,
      params.randomnessWeight,
      params.surprisePreference,
      params.minAssociationStrength
    );

    // 最も強い連想を選択して次のステップへ
    if (newAssociations.length === 0) break;

    const selectedAssociation = selectAssociation(newAssociations, params);
    associations.push(selectedAssociation);
    typeDistribution[selectedAssociation.type]++;

    currentContent = selectedAssociation.content;
  }

  // 多様性を計算
  const usedTypes = Object.entries(typeDistribution).filter(([_, count]) => count > 0).length;
  const diversity = usedTypes / 8;

  // 統計を計算
  const statistics = {
    totalLength: associations.length,
    averageStrength: associations.reduce((sum, a) => sum + a.strength, 0) / Math.max(associations.length, 1),
    averageSurprise: associations.reduce((sum, a) => sum + a.surpriseLevel, 0) / Math.max(associations.length, 1),
    typeDistribution
  };

  return {
    id: chainId,
    seed,
    associations,
    depth: associations.length,
    diversity,
    convergencePoints: [],
    statistics
  };
}

/**
 * 連想を生成
 */
function generateAssociations(
  content: string,
  count: number,
  randomnessWeight: number,
  surprisePreference: number,
  minStrength: number
): Association[] {
  const associations: Association[] = [];

  // 意味的連想
  const semanticAssocs = generateSemanticAssociations(content);
  associations.push(...semanticAssocs);

  // 音韻的連想
  const phoneticAssocs = generatePhoneticAssociations(content);
  associations.push(...phoneticAssocs);

  // 隠喩的連想
  const metaphoricalAssocs = generateMetaphoricalAssociations(content);
  associations.push(...metaphoricalAssocs);

  // ランダム連想
  if (randomnessWeight > 0.3) {
    const randomAssocs = generateRandomAssociations(content, 2);
    associations.push(...randomAssocs);
  }

  // 強度でフィルタリング
  const filtered = associations.filter(a => a.strength >= minStrength);

  // 驚き好みに基づいてソート
  filtered.sort((a, b) => {
    const scoreA = a.strength * (1 - surprisePreference) + a.surpriseLevel * surprisePreference;
    const scoreB = b.strength * (1 - surprisePreference) + b.surpriseLevel * surprisePreference;
    return scoreB - scoreA;
  });

  return filtered.slice(0, count);
}

/**
 * 意味的連想を生成
 */
function generateSemanticAssociations(content: string): Association[] {
  const associations: Association[] = [];

  for (const [key, related] of Object.entries(SEMANTIC_NETWORK)) {
    if (content.includes(key)) {
      for (const concept of related.slice(0, 2)) {
        associations.push({
          id: `assoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          content: concept,
          type: 'semantic',
          strength: 0.7 + Math.random() * 0.2,
          rationale: `「${key}」と意味的に関連`,
          semanticDistance: 0.3 + Math.random() * 0.3,
          surpriseLevel: 0.2 + Math.random() * 0.3,
          activatedAt: new Date()
        });
      }
    }
  }

  return associations;
}

/**
 * 音韻的連想を生成
 */
function generatePhoneticAssociations(content: string): Association[] {
  const associations: Association[] = [];

  for (const [key, related] of Object.entries(PHONETIC_ASSOCIATIONS)) {
    if (content.includes(key)) {
      for (const phonetic of related.slice(0, 1)) {
        associations.push({
          id: `assoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          content: phonetic,
          type: 'phonetic',
          strength: 0.4 + Math.random() * 0.2,
          rationale: `「${key}」と音が似ている`,
          semanticDistance: 0.7 + Math.random() * 0.2,
          surpriseLevel: 0.5 + Math.random() * 0.3,
          activatedAt: new Date()
        });
      }
    }
  }

  return associations;
}

/**
 * 隠喩的連想を生成
 */
function generateMetaphoricalAssociations(content: string): Association[] {
  const associations: Association[] = [];

  // 抽象的な概念に対して隠喩を生成
  const abstractConcepts = ['思考', '存在', '価値', '時間', '意味'];
  const metaphors = ['海', '山', '旅', '闘い', '庭', '音楽', '川', '光'];

  for (const concept of abstractConcepts) {
    if (content.includes(concept)) {
      const metaphor = metaphors[Math.floor(Math.random() * metaphors.length)];
      const template = METAPHORICAL_TEMPLATES[Math.floor(Math.random() * METAPHORICAL_TEMPLATES.length)];
      const metaphorContent = template.replace('{target}', concept).replace('{source}', metaphor);

      associations.push({
        id: `assoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: metaphorContent,
        type: 'metaphorical',
        strength: 0.5 + Math.random() * 0.3,
        rationale: '隠喩による再フレーミング',
        semanticDistance: 0.6 + Math.random() * 0.3,
        surpriseLevel: 0.6 + Math.random() * 0.3,
        activatedAt: new Date()
      });
    }
  }

  return associations;
}

/**
 * ランダム連想を生成
 */
function generateRandomAssociations(_content: string, count: number): Association[] {
  const randomConcepts = [
    '猫', '雨', '記憶', '夢', '静寂', '風', '鏡', '影',
    '星', '波', '指輪', '鍵', '扉', '窓', '階段', '庭園'
  ];

  const associations: Association[] = [];
  const shuffled = randomConcepts.sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    associations.push({
      id: `assoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: shuffled[i],
      type: 'random',
      strength: 0.2 + Math.random() * 0.3,
      rationale: 'ランダムな連想',
      semanticDistance: 0.8 + Math.random() * 0.2,
      surpriseLevel: 0.7 + Math.random() * 0.3,
      activatedAt: new Date()
    });
  }

  return associations;
}

/**
 * 連想を選択
 */
function selectAssociation(
  associations: Association[],
  params: NonLinearThoughtParameters
): Association {
  // 確率的選択
  const weights = associations.map(a => {
    let weight = a.strength * (1 - params.randomnessWeight);
    weight += a.surpriseLevel * params.surprisePreference * params.randomnessWeight;

    // 多様性のため、使用頻度の低いタイプを優先
    const typeBonus = a.type === 'metaphorical' || a.type === 'random' ? 0.1 : 0;
    weight += typeBonus;

    return weight;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const random = Math.random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < associations.length; i++) {
    cumulative += weights[i];
    if (random <= cumulative) {
      return associations[i];
    }
  }

  return associations[0];
}

/**
 * 収束点を検出
 */
function detectConvergence(
  engine: NonLinearThoughtEngine,
  newChain: AssociationChain
): void {
  // 既存のチェーンと比較して収束点を探す
  for (const existingChain of engine.chains) {
    if (existingChain.id === newChain.id) continue;

    // 共通の連想内容を探す
    const newContents = new Set(newChain.associations.map(a => a.content));
    const existingContents = new Set(existingChain.associations.map(a => a.content));

    for (const content of newContents) {
      if (existingContents.has(content)) {
        // 既存の収束点を更新または新規作成
        const existingPoint = engine.convergencePoints.find(p => p.content === content);

        if (existingPoint) {
          existingPoint.chainCount++;
          existingPoint.convergenceStrength = Math.min(1, existingPoint.chainCount / engine.config.minChainsForConvergence);
        } else {
          engine.convergencePoints.push({
            content,
            convergenceStrength: 1 / engine.config.minChainsForConvergence,
            chainCount: 1,
            insightPotential: 0.5 + Math.random() * 0.5,
            rationale: `${existingChain.id}と${newChain.id}で収束`
          });
        }
      }
    }
  }

  // 収束率を更新
  if (engine.chains.length > 1) {
    engine.statistics.convergenceRate =
      engine.convergencePoints.length / Math.max(engine.chains.length, 1);
  }
}

/**
 * 収束点を再計算
 */
function recalculateConvergence(engine: NonLinearThoughtEngine): void {
  engine.convergencePoints = [];
  engine.chains.forEach(chain => detectConvergence(engine, chain));
}

/**
 * 洞察を抽出
 */
function extractInsights(
  engine: NonLinearThoughtEngine,
  chain: AssociationChain
): void {
  // 連想チェーンから洞察を抽出

  // 1. 接続の洞察
  if (chain.diversity > 0.5) {
    const insight = createConnectionInsight(chain);
    if (insight.evaluation.overallScore >= engine.config.minInsightQuality) {
      engine.insights.push(insight);
      engine.statistics.totalInsights++;
      if (insight.novelty > 0.7) {
        engine.statistics.highNoveltyInsights++;
      }
    }
  }

  // 2. パターンの洞察
  if (chain.depth >= 3 && chain.statistics.averageSurprise > 0.5) {
    const insight = createPatternInsight(chain);
    if (insight.evaluation.overallScore >= engine.config.minInsightQuality) {
      engine.insights.push(insight);
      engine.statistics.totalInsights++;
    }
  }

  // 3. 収束点に基づく洞察
  for (const point of engine.convergencePoints) {
    if (point.chainCount >= engine.config.minChainsForConvergence && point.insightPotential > 0.7) {
      const insight = createConvergenceInsight(point, chain);
      if (insight.evaluation.overallScore >= engine.config.minInsightQuality) {
        engine.insights.push(insight);
        engine.statistics.totalInsights++;
      }
    }
  }
}

/**
 * 接続洞察を作成
 */
function createConnectionInsight(chain: AssociationChain): EmergentInsight {
  const types = new Set(chain.associations.map(a => a.type));
  const content = `「${chain.seed.content}」から「${chain.associations[chain.associations.length - 1]?.content || ''}」への${types.size}種類の連想経路`;

  return {
    id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content,
    kind: 'connection',
    novelty: chain.diversity * 0.8 + chain.statistics.averageSurprise * 0.2,
    utility: 0.4 + chain.statistics.averageStrength * 0.4,
    plausibility: 0.6,
    sourceChains: [chain.id],
    relatedConvergencePoints: [],
    evaluation: {
      creativityScore: chain.diversity,
      feasibilityScore: 0.6,
      impactScore: 0.5 + chain.statistics.averageSurprise * 0.3,
      verifiabilityScore: 0.5,
      overallScore: (chain.diversity + 0.6 + 0.5 + chain.statistics.averageSurprise * 0.3) / 4
    }
  };
}

/**
 * パターン洞察を作成
 */
function createPatternInsight(chain: AssociationChain): EmergentInsight {
  const content = `連想パターン分析: ${chain.seed.content}からの連想は${chain.statistics.averageSurprise > 0.5 ? '予期せぬ' : '予測可能な'}方向へ進展`;

  return {
    id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content,
    kind: 'pattern',
    novelty: chain.statistics.averageSurprise,
    utility: 0.5,
    plausibility: 0.7,
    sourceChains: [chain.id],
    relatedConvergencePoints: [],
    evaluation: {
      creativityScore: chain.statistics.averageSurprise,
      feasibilityScore: 0.7,
      impactScore: 0.5,
      verifiabilityScore: 0.6,
      overallScore: (chain.statistics.averageSurprise + 0.7 + 0.5 + 0.6) / 4
    }
  };
}

/**
 * 収束洞察を作成
 */
function createConvergenceInsight(
  point: ConvergencePoint,
  chain: AssociationChain
): EmergentInsight {
  const content = `収束点発見: 「${point.content}」は${point.chainCount}つの異なる経路から到達可能`;

  return {
    id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content,
    kind: 'synthesis',
    novelty: 0.6 + point.chainCount * 0.1,
    utility: point.insightPotential,
    plausibility: 0.7,
    sourceChains: [chain.id],
    relatedConvergencePoints: [point.content],
    evaluation: {
      creativityScore: 0.6 + point.chainCount * 0.1,
      feasibilityScore: 0.7,
      impactScore: point.insightPotential,
      verifiabilityScore: 0.7,
      overallScore: (0.6 + point.chainCount * 0.1 + 0.7 + point.insightPotential + 0.7) / 4
    }
  };
}

/**
 * @summary 思考シードをテキストから抽出して登録
 * @param engine エンジン
 * @param text テキスト
 * @returns 登録されたシードのリスト
 */
export function extractSeedsFromText(
  engine: NonLinearThoughtEngine,
  text: string
): ThoughtSeed[] {
  const seeds: ThoughtSeed[] = [];
  const concepts = Object.keys(SEMANTIC_NETWORK);

  for (const concept of concepts) {
    if (text.includes(concept)) {
      const seed = registerSeed(engine, concept, 'concept');
      seeds.push(seed);
    }
  }

  // 問いを抽出
  const questionMatches = text.match(/[^。？]*？/g);
  if (questionMatches) {
    for (const question of questionMatches.slice(0, 3)) {
      const seed = registerSeed(engine, question, 'question');
      seeds.push(seed);
    }
  }

  return seeds;
}
