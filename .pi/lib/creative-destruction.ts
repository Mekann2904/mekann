/**
 * @abdd.meta
 * path: .pi/lib/creative-destruction.ts
 * role: 前提の破壊と再構築プロセスを定義するモジュール
 * why: 既存の思考や前提を哲学的に解体し、新たな視点を創出するため
 * related: ./belief-updater.ts
 * public_api: Premise, DestructionMethod, DestructionResult, ReconstructedView, DestructionChain
 * invariants: solidityは0-1の範囲である、depthは0-1の範囲である
 * side_effects: なし（純粋な型定義とロジックの記述）
 * failure_modes: 破壊条件が適用されない場合、再構築不能な状態
 * @abdd.explain
 * overview: 思考の前提を破壊し再構築するメカニズムの型定義とインターフェース
 * what_it_does:
 *   - 前提の構造と信頼度を定義する
 *   - 破壊の方法と結果のデータ構造を規定する
 *   - 破壊後の視点再構築とチェーンの履歴を管理する
 * why_it_exists:
 *   - 暗黙的な前提を可視化し分析するため
 *   - 論理的な飛躍やクリエイティブな発想を生成するため
 * scope:
 *   in: belief-updaterからのDistribution型
 *   out: 前提破壊および再構築に関するすべての型定義
 */

import type { Distribution } from './philosophy/belief-updater.js';
import { createPrior, normalizeDistribution } from './philosophy/belief-updater.js';
import { parsePremiseAnalysisJson, PROMPT_PREMISE_FORMAT } from './structured-analysis-output.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 前提
 * @summary 思考の基盤となる前提
 */
export interface Premise {
  /** 前提の一意識別子 */
  id: string;
  /** 前提の内容 */
  content: string;
  /** 前提のタイプ */
  type: PremiseType;
  /** 前提の強固さ（0-1、高いほど破壊困難） */
  solidity: number;
  /** この前提が依存している他の前提 */
  dependencies: string[];
  /** この前提から導出される結論 */
  derivedConclusions: string[];
  /** 前提の信頼度（0-1） */
  confidence: number;
  /** 作成時刻 */
  createdAt: Date;
  /** 更新回数 */
  updateCount: number;
}

/**
 * 前提タイプ
 */
export type PremiseType =
  | 'epistemic'      // 認識論的前提（「我思う、ゆえに我あり」）
  | 'normative'      // 規範的前提（「すべき」「べき」）
  | 'ontological'    // 存在論的前提（「世界は実在する」）
  | 'methodological' // 方法論的前提（「論理は有効である」）
  | 'contextual'     // 文脈的前提（「このタスクでは...」）
  | 'implicit';      // 暗黙的前提（言語化されていない）

/**
 * 破壊方法
 * @summary 前提を破壊する方法
 */
export interface DestructionMethod {
  /** メソッド名 */
  name: string;
  /** 説明 */
  description: string;
  /** 哲学的基盤 */
  philosophicalBasis: 'nietzschean' | 'deleuzian' | 'derridean' | 'heideggerian' | 'buddhist';
  /** 適用条件 */
  applicableWhen: (premise: Premise) => boolean;
  /** 破壊の実行 */
  apply: (premise: Premise) => DestructionResult;
  /** 再構築方法 */
  reconstruct: (result: DestructionResult) => ReconstructedView[];
}

/**
 * 破壊結果
 * @summary 前提の破壊結果
 */
export interface DestructionResult {
  /** 破壊された前提 */
  originalPremise: Premise;
  /** 使用された破壊方法 */
  method: DestructionMethod;
  /** 破壊の残骸（何が残ったか） */
  remnants: string[];
  /** 破壊によって露呈したもの */
  exposed: string[];
  /** 破壊の深さ（0-1） */
  depth: number;
  /** 破壊の完全性（0-1、1で完全破壊） */
  completeness: number;
  /** 次の破壊候補 */
  nextTargets: string[];
  /** 破壊のタイムスタンプ */
  timestamp: Date;
}

/**
 * 再構築された視点
 * @summary 破壊後の新たな視点
 */
export interface ReconstructedView {
  /** 視点の説明 */
  description: string;
  /** 基礎となる残骸 */
  basedOn: string[];
  /** 視点の不安定性（0-1、高いほど脆い） */
  instability: number;
  /** 創造性スコア（0-1、高いほど革新的） */
  creativityScore: number;
  /** この視点から導出可能な洞察 */
  potentialInsights: string[];
}

/**
 * 破壊チェーン
 * @summary 連鎖的な破壊の記録
 */
export interface DestructionChain {
  /** チェーンID */
  id: string;
  /** 破壊のシーケンス */
  sequence: DestructionResult[];
  /** 最終的な再構築 */
  finalReconstruction: ReconstructedView[];
  /** チェーンの統計 */
  statistics: {
    totalPremisesDestroyed: number;
    totalViewsReconstructed: number;
    averageDepth: number;
    maxDepth: number;
  };
}

/**
 * パレート最適破壊
 * @summary 多目的最適化による破壊戦略
 */
export interface ParetoOptimalDestruction {
  /** 破壊対象の前提 */
  targetPremises: Premise[];
  /** 破壊方法の組み合わせ */
  methodCombination: Map<string, DestructionMethod>;
  /** 期待される効果 */
  expectedEffects: {
    creativityIncrease: number;
    stabilityDecrease: number;
    insightPotential: number;
    cognitiveLoad: number;
  };
  /** パレートフロント上の位置 */
  paretoPosition: { x: number; y: number };
}

/**
 * 創造的破壊エンジン
 * @summary 自己前提破壊システム
 */
export interface CreativeDestructionEngine {
  /** 現在の前提セット */
  premises: Map<string, Premise>;
  /** 利用可能な破壊方法 */
  destructionMethods: DestructionMethod[];
  /** 破壊履歴 */
  destructionHistory: DestructionChain[];
  /** エンジン設定 */
  config: CreativeDestructionConfig;
  /** 統計情報 */
  statistics: {
    totalDestructions: number;
    successfulReconstructions: number;
    averageCreativityGain: number;
    premisesCurrentlyHeld: number;
  };
}

/**
 * エンジン設定
 */
export interface CreativeDestructionConfig {
  /** 最大破壊深度 */
  maxDestructionDepth: number;
  /** 再構築の最小品質 */
  minReconstructionQuality: number;
  /** 同時破壊可能な前提数 */
  maxSimultaneousDestructions: number;
  /** 破壊の激しさ（0-1） */
  destructionIntensity: number;
  /** 自動再構築の有無 */
  autoReconstruction: boolean;
}

// ============================================================================
// 破壊方法の定義
// ============================================================================

/**
 * ニーチェ的転倒
 * @summary 「善悪の彼岸」による価値の転倒
 * @description
 * 判定基準: premise.type === 'normative'
 * 呼び出し元はLLM構造化出力からpremise.typeを設定すること。
 */
const NIETZSCHEAN_INVERSION: DestructionMethod = {
  name: 'nietzschean-inversion',
  description: '価値の転倒：善を悪に、悪を善に反転させる',
  philosophicalBasis: 'nietzschean',
  applicableWhen: (premise) => {
    return premise.type === 'normative';
  },
  apply: (premise) => {
    const inverted = premise.content
      .replace(/べき/, 'べきでない')
      .replace(/正し/, '誤り')
      .replace(/善/, '悪')
      .replace(/良い/, '悪い')
      .replace(/すべき/, 'すべきでない');

    return {
      originalPremise: premise,
      method: NIETZSCHEAN_INVERSION,
      remnants: [`${premise.content}の逆もまた真なり得る`],
      exposed: [
        '価値判断の恣意性',
        '道徳の歴史的構成性',
        '力への意志の隠蔽'
      ],
      depth: 0.7,
      completeness: 0.6,
      nextTargets: ['価値の根拠', '道徳の源泉'],
      timestamp: new Date()
    };
  },
  reconstruct: (result) => {
    return [{
      description: '価値の創造：自らの価値を創造する能動的な姿勢',
      basedOn: result.remnants,
      instability: 0.6,
      creativityScore: 0.8,
      potentialInsights: [
        '既存の価値体系からの脱却',
        '自己超克の可能性',
        '運命愛（Amor Fati）への道'
      ]
    }];
  }
};

/**
 * ドゥルーズ的差異化
 * @summary 「差異と反復」による同一性の解体
 * @description
 * 判定基準: premise.solidity > 0.8
 * 同一性への強い確信がある場合に適用。
 */
const DELEUZIAN_DIFFERENTIATION: DestructionMethod = {
  name: 'deleuzian-differentiation',
  description: '差異化：同一性を差異へと分解する',
  philosophicalBasis: 'deleuzian',
  applicableWhen: (premise) => {
    return premise.solidity > 0.8;
  },
  apply: (premise) => {
    return {
      originalPremise: premise,
      method: DELEUZIAN_DIFFERENTIATION,
      remnants: [
        `${premise.content}は反復の中で差異を生み出す`,
        '同一性は差異の効果に過ぎない'
      ],
      exposed: [
        '同一性の二次的性質',
        '差異の一次的生産性',
        '反復における創造'
      ],
      depth: 0.8,
      completeness: 0.7,
      nextTargets: ['同一性の根拠', '本質の概念'],
      timestamp: new Date()
    };
  },
  reconstruct: (result) => {
    return [{
      description: '生成の視点：存在ではなく生成、同一ではなく差異から見る',
      basedOn: result.remnants,
      instability: 0.7,
      creativityScore: 0.9,
      potentialInsights: [
        '過程としての世界',
        '多様性の肯定',
        'リゾーム的思考'
      ]
    }];
  }
};

/**
 * デリダ的脱構築
 * @summary 二項対立の解体と拡散
 * @description
 * 判定基準: premise.dependencies.length > 2
 * 多くの依存関係を持つ前提に適用。
 */
const DERRIDEAN_DECONSTRUCTION: DestructionMethod = {
  name: 'derridean-deconstruction',
  description: '脱構築：二項対立を解体し、拡散（différance）を trace する',
  philosophicalBasis: 'derridean',
  applicableWhen: (premise) => {
    return premise.dependencies.length > 2;
  },
  apply: (premise) => {
    return {
      originalPremise: premise,
      method: DERRIDEAN_DECONSTRUCTION,
      remnants: [
        `${premise.content}は何を排除しているか`,
        '周縁に追いやられたもの'
      ],
      exposed: [
        '二項対立の恣意性',
        '中心の不在',
        '意味の無限遅延'
      ],
      depth: 0.9,
      completeness: 0.5,
      nextTargets: ['対立項', '中心的概念'],
      timestamp: new Date()
    };
  },
  reconstruct: (result) => {
    return [{
      description: '拡散の視点：決定不可能性を生きる',
      basedOn: result.remnants,
      instability: 0.8,
      creativityScore: 0.85,
      potentialInsights: [
        '周縁の声を聞く',
        'テクスト性の認識',
        '正義の決定不可能性'
      ]
    }];
  }
};

/**
 * ハイデガー的存在論的差異
 * @summary 存在と存在者の差異への回帰
 * @description
 * 判定基準: premise.type === 'ontological'
 * 呼び出し元はLLM構造化出力からpremise.typeを設定すること。
 */
const HEIDEGGERIAN_ONTOLOGICAL_DIFFERENCE: DestructionMethod = {
  name: 'heideggerian-ontological-difference',
  description: '存在論的差異：存在と存在者の根本的差異を開示する',
  philosophicalBasis: 'heideggerian',
  applicableWhen: (premise) => {
    return premise.type === 'ontological';
  },
  apply: (premise) => {
    return {
      originalPremise: premise,
      method: HEIDEGGERIAN_ONTOLOGICAL_DIFFERENCE,
      remnants: [
        `${premise.content}は存在者についての記述に過ぎない`,
        '存在そのものは隠されている'
      ],
      exposed: [
        '存在忘却',
        '形而上学の歴史',
        '技術の本質'
      ],
      depth: 0.85,
      completeness: 0.6,
      nextTargets: ['形而上学的前提', '技術的思考'],
      timestamp: new Date()
    };
  },
  reconstruct: (result) => {
    return [{
      description: '存在への聴従：存在の開示を待つ思考',
      basedOn: result.remnants,
      instability: 0.7,
      creativityScore: 0.75,
      potentialInsights: [
        '詩的な思考の可能性',
        '技術を超えた関係',
        '死への存在'
      ]
    }];
  }
};

/**
 * 仏教的空性
 * @summary 自性の否定による空性の開示
 * @description
 * 判定基準: premise.solidity > 0.9
 * 絶対的確信がある場合に適用。
 */
const BUDDHIST_EMPTINESS: DestructionMethod = {
  name: 'buddhist-emptiness',
  description: '空性：すべての現象は自性を持たない（縁起）',
  philosophicalBasis: 'buddhist',
  applicableWhen: (premise) => {
    return premise.solidity > 0.9;
  },
  apply: (premise) => {
    return {
      originalPremise: premise,
      method: BUDDHIST_EMPTINESS,
      remnants: [
        `${premise.content}は縁起によって成り立つ`,
        '自性は存在しない'
      ],
      exposed: [
        '固定性の幻想',
        '縁起の相互依存性',
        '中道の智慧'
      ],
      depth: 0.9,
      completeness: 0.8,
      nextTargets: ['実体の概念', '永続性の信念'],
      timestamp: new Date()
    };
  },
  reconstruct: (result) => {
    return [{
      description: '空性の視点：固定することなく流れる',
      basedOn: result.remnants,
      instability: 0.9,
      creativityScore: 0.95,
      potentialInsights: [
        '執着からの解放',
        '慈悲の基盤',
        '無我の理解'
      ]
    }];
  }
};

// ============================================================================
// デフォルト設定とメソッドリスト
// ============================================================================

const DEFAULT_CONFIG: CreativeDestructionConfig = {
  maxDestructionDepth: 3,
  minReconstructionQuality: 0.5,
  maxSimultaneousDestructions: 3,
  destructionIntensity: 0.7,
  autoReconstruction: true
};

const DESTRUCTION_METHODS: DestructionMethod[] = [
  NIETZSCHEAN_INVERSION,
  DELEUZIAN_DIFFERENTIATION,
  DERRIDEAN_DECONSTRUCTION,
  HEIDEGGERIAN_ONTOLOGICAL_DIFFERENCE,
  BUDDHIST_EMPTINESS
];

// ============================================================================
// コア関数
// ============================================================================

/**
 * @summary 創造的破壊エンジンを作成
 * @param config エンジン設定
 * @returns 作成されたエンジン
 */
export function createCreativeDestructionEngine(
  config: Partial<CreativeDestructionConfig> = {}
): CreativeDestructionEngine {
  return {
    premises: new Map(),
    destructionMethods: [...DESTRUCTION_METHODS],
    destructionHistory: [],
    config: { ...DEFAULT_CONFIG, ...config },
    statistics: {
      totalDestructions: 0,
      successfulReconstructions: 0,
      averageCreativityGain: 0,
      premisesCurrentlyHeld: 0
    }
  };
}

/**
 * @summary 前提をエンジンに登録
 * @param engine エンジン
 * @param content 前提の内容
 * @param type 前提タイプ
 * @param solidity 前提の強固さ
 * @returns 登録された前提
 */
export function registerPremise(
  engine: CreativeDestructionEngine,
  content: string,
  type: PremiseType = 'contextual',
  solidity: number = 0.5
): Premise {
  const id = `premise-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const premise: Premise = {
    id,
    content,
    type,
    solidity: Number.isNaN(solidity) ? 0.5 : Math.max(0, Math.min(1, solidity)),
    dependencies: [],
    derivedConclusions: [],
    confidence: 0.5,
    createdAt: new Date(),
    updateCount: 0
  };

  engine.premises.set(id, premise);
  engine.statistics.premisesCurrentlyHeld = engine.premises.size;

  return premise;
}

/**
 * @summary 前提に対する破壊を実行
 * @param engine エンジン
 * @param premiseId 破壊対象の前提ID
 * @param method 破壊方法（省略時は自動選択）
 * @returns 破壊結果
 */
export function performDestruction(
  engine: CreativeDestructionEngine,
  premiseId: string,
  method?: DestructionMethod
): DestructionResult | null {
  const premise = engine.premises.get(premiseId);
  if (!premise) return null;

  // 破壊方法を選択
  const selectedMethod = method ?? selectDestructionMethod(premise, engine.destructionMethods);
  if (!selectedMethod) return null;

  // 破壊を実行
  const result = selectedMethod.apply(premise);
  engine.statistics.totalDestructions++;

  // 自動再構築
  if (engine.config.autoReconstruction) {
    const reconstructions = selectedMethod.reconstruct(result);
    if (reconstructions.length > 0 && reconstructions[0].creativityScore >= engine.config.minReconstructionQuality) {
      engine.statistics.successfulReconstructions++;
      engine.statistics.averageCreativityGain =
        (engine.statistics.averageCreativityGain * (engine.statistics.totalDestructions - 1) +
         reconstructions[0].creativityScore) / engine.statistics.totalDestructions;
    }
  }

  return result;
}

/**
 * @summary 連鎖破壊を実行
 * @param engine エンジン
 * @param startingPremiseId 開始前提ID
 * @param depth 破壊の深さ
 * @returns 破壊チェーン
 */
export function performChainDestruction(
  engine: CreativeDestructionEngine,
  startingPremiseId: string,
  depth: number = 1
): DestructionChain {
  const chainId = `chain-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const sequence: DestructionResult[] = [];
  const allReconstructions: ReconstructedView[] = [];

  let currentTargetId = startingPremiseId;
  let currentDepth = 0;

  while (currentTargetId && currentDepth < depth && currentDepth < engine.config.maxDestructionDepth) {
    const result = performDestruction(engine, currentTargetId);
    if (!result) break;

    sequence.push(result);

    if (engine.config.autoReconstruction) {
      const reconstructions = result.method.reconstruct(result);
      allReconstructions.push(...reconstructions);
    }

    // 次のターゲットを選択
    const nextTarget = result.nextTargets[0];
    if (nextTarget) {
      // 次のターゲットを仮想的な前提として作成
      const newPremise = registerPremise(
        engine,
        nextTarget,
        'implicit',
        result.originalPremise.solidity * 0.8
      );
      currentTargetId = newPremise.id;
    } else {
      currentTargetId = '';
    }

    currentDepth++;
  }

  const chain: DestructionChain = {
    id: chainId,
    sequence,
    finalReconstruction: allReconstructions,
    statistics: {
      totalPremisesDestroyed: sequence.length,
      totalViewsReconstructed: allReconstructions.length,
      averageDepth: sequence.reduce((sum, r) => sum + r.depth, 0) / Math.max(sequence.length, 1),
      maxDepth: Math.max(...sequence.map(r => r.depth), 0)
    }
  };

  engine.destructionHistory.push(chain);
  return chain;
}

/**
 * @summary パレート最適破壊戦略を計算
 * @param engine エンジン
 * @returns パレート最適破壊戦略のリスト
 */
export function optimizeDestruction(
  engine: CreativeDestructionEngine
): ParetoOptimalDestruction[] {
  const strategies: ParetoOptimalDestruction[] = [];

  // すべての前提と破壊方法の組み合わせを評価
  const premiseArray = Array.from(engine.premises.values());

  for (const premise of premiseArray) {
    const applicableMethods = engine.destructionMethods.filter(m => m.applicableWhen(premise));

    for (const method of applicableMethods) {
      // 期待される効果を推定
      const effects = estimateEffects(premise, method);

      strategies.push({
        targetPremises: [premise],
        methodCombination: new Map([[premise.id, method]]),
        expectedEffects: effects,
        paretoPosition: {
          x: effects.creativityIncrease,
          y: effects.stabilityDecrease
        }
      });
    }
  }

  // 複数前提の同時破壊戦略も生成
  if (premiseArray.length >= 2) {
    for (let i = 0; i < Math.min(premiseArray.length, engine.config.maxSimultaneousDestructions); i++) {
      const combination = premiseArray.slice(0, i + 1);
      const methods = new Map<string, DestructionMethod>();

      for (const p of combination) {
        const method = selectDestructionMethod(p, engine.destructionMethods);
        if (method) methods.set(p.id, method);
      }

      if (methods.size > 0) {
        const combinedEffects = estimateCombinedEffects(combination, methods);
        strategies.push({
          targetPremises: combination,
          methodCombination: methods,
          expectedEffects: combinedEffects,
          paretoPosition: {
            x: combinedEffects.creativityIncrease,
            y: combinedEffects.stabilityDecrease
          }
        });
      }
    }
  }

  // パレートフロントを抽出
  return filterParetoOptimalStrategies(strategies);
}

/**
 * @summary エンジンの状態をリセット
 * @param engine エンジン
 * @returns リセットされたエンジン
 */
export function resetEngine(engine: CreativeDestructionEngine): CreativeDestructionEngine {
  engine.premises.clear();
  engine.destructionHistory = [];
  engine.statistics = {
    totalDestructions: 0,
    successfulReconstructions: 0,
    averageCreativityGain: 0,
    premisesCurrentlyHeld: 0
  };
  return engine;
}

/**
 * @summary 破壊レポートを生成
 * @param engine エンジン
 * @returns レポート文字列
 */
export function generateDestructionReport(engine: CreativeDestructionEngine): string {
  const lines: string[] = [
    '# 創造的破壊エンジン レポート',
    '',
    '## 統計情報',
    `- 総破壊回数: ${engine.statistics.totalDestructions}`,
    `- 成功した再構築: ${engine.statistics.successfulReconstructions}`,
    `- 平均創造性向上: ${(engine.statistics.averageCreativityGain * 100).toFixed(0)}%`,
    `- 現在保持している前提: ${engine.statistics.premisesCurrentlyHeld}`,
    '',
    '## 保持している前提'
  ];

  engine.premises.forEach((premise, _id) => {
    lines.push(`- [${premise.type}] ${premise.content} (強度: ${(premise.solidity * 100).toFixed(0)}%)`);
  });

  if (engine.destructionHistory.length > 0) {
    lines.push('');
    lines.push('## 最近の破壊チェーン');

    const recent = engine.destructionHistory.slice(-3);
    for (const chain of recent) {
      lines.push(``);
      lines.push(`### チェーン ${chain.id}`);
      lines.push(`- 破壊された前提数: ${chain.statistics.totalPremisesDestroyed}`);
      lines.push(`- 再構築された視点数: ${chain.statistics.totalViewsReconstructed}`);
      lines.push(`- 平均深度: ${chain.statistics.averageDepth.toFixed(2)}`);

      for (const reconstruction of chain.finalReconstruction.slice(0, 2)) {
        lines.push(`  - 視点: ${reconstruction.description}`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 破壊方法を選択
 */
function selectDestructionMethod(
  premise: Premise,
  methods: DestructionMethod[]
): DestructionMethod | null {
  const applicable = methods.filter(m => m.applicableWhen(premise));

  if (applicable.length === 0) {
    // デフォルトは脱構築
    return methods.find(m => m.name === 'derridean-deconstruction') ?? methods[0];
  }

  // 最も適切な方法を選択（強度に基づく）
  return applicable.reduce((best, current) => {
    const bestScore = best.philosophicalBasis === 'buddhist' ? 0.9 : 0.7;
    const currentScore = current.philosophicalBasis === 'buddhist' ? 0.9 : 0.7;
    return currentScore > bestScore ? current : best;
  });
}

/**
 * 破壊の効果を推定
 */
function estimateEffects(
  premise: Premise,
  method: DestructionMethod
): ParetoOptimalDestruction['expectedEffects'] {
  // 前提の強度が高いほど、破壊による創造性向上が大きい
  const creativityIncrease = premise.solidity * 0.8 + 0.2;

  // 破壊深度が深いほど、安定性の低下が大きい
  const stabilityDecrease = method.name.includes('nietzschean') ? 0.6 :
                            method.name.includes('deleuzian') ? 0.7 :
                            method.name.includes('derridean') ? 0.5 :
                            method.name.includes('heideggerian') ? 0.6 :
                            0.8;

  // 洞察ポテンシャル
  const insightPotential = creativityIncrease * 0.8;

  // 認知負荷
  const cognitiveLoad = stabilityDecrease * 0.5 + creativityIncrease * 0.3;

  return {
    creativityIncrease,
    stabilityDecrease,
    insightPotential,
    cognitiveLoad
  };
}

/**
 * 複合破壊の効果を推定
 */
function estimateCombinedEffects(
  premises: Premise[],
  methods: Map<string, DestructionMethod>
): ParetoOptimalDestruction['expectedEffects'] {
  let totalCreativity = 0;
  let totalStabilityLoss = 0;
  let totalInsight = 0;
  let totalLoad = 0;

  for (const premise of premises) {
    const method = methods.get(premise.id);
    if (method) {
      const effects = estimateEffects(premise, method);
      totalCreativity += effects.creativityIncrease;
      totalStabilityLoss += effects.stabilityDecrease;
      totalInsight += effects.insightPotential;
      totalLoad += effects.cognitiveLoad;
    }
  }

  const count = premises.length;
  return {
    creativityIncrease: Math.min(1, totalCreativity / count * 1.2), // 相乗効果
    stabilityDecrease: Math.min(1, totalStabilityLoss / count * 1.1),
    insightPotential: Math.min(1, totalInsight / count * 1.3),
    cognitiveLoad: Math.min(1, totalLoad / count * 1.5)
  };
}

/**
 * パレート最適戦略を抽出
 */
function filterParetoOptimalStrategies(
  strategies: ParetoOptimalDestruction[]
): ParetoOptimalDestruction[] {
  const paretoOptimal: ParetoOptimalDestruction[] = [];

  for (const strategy of strategies) {
    const isDominated = strategies.some(other =>
      other !== strategy &&
      other.expectedEffects.creativityIncrease >= strategy.expectedEffects.creativityIncrease &&
      other.expectedEffects.stabilityDecrease <= strategy.expectedEffects.stabilityDecrease &&
      (other.expectedEffects.creativityIncrease > strategy.expectedEffects.creativityIncrease ||
       other.expectedEffects.stabilityDecrease < strategy.expectedEffects.stabilityDecrease)
    );

    if (!isDominated) {
      paretoOptimal.push(strategy);
    }
  }

  return paretoOptimal.sort((a, b) =>
    b.expectedEffects.creativityIncrease - a.expectedEffects.creativityIncrease
  );
}

/**
 * @summary デフォルトの破壊方法リストを取得
 * @returns 破壊方法のリスト
 */
export function getDestructionMethods(): DestructionMethod[] {
  return [...DESTRUCTION_METHODS];
}

/**
 * @summary 前提タイプごとの破壊推奨度を取得
 * @param type 前提タイプ
 * @returns 推奨される破壊方法
 */
export function getRecommendedMethod(type: PremiseType): DestructionMethod {
  const recommendations: Record<PremiseType, DestructionMethod> = {
    'epistemic': DERRIDEAN_DECONSTRUCTION,
    'normative': NIETZSCHEAN_INVERSION,
    'ontological': HEIDEGGERIAN_ONTOLOGICAL_DIFFERENCE,
    'methodological': DELEUZIAN_DIFFERENTIATION,
    'contextual': DERRIDEAN_DECONSTRUCTION,
    'implicit': BUDDHIST_EMPTINESS
  };

  return recommendations[type] ?? DERRIDEAN_DECONSTRUCTION;
}
