/**
 * @abdd.meta
 * path: .pi/lib/reasoning-bonds.ts
 * role: 推論プロセスの構造的状態を表現する型定義と、テキストからの状態推論を行うユーティリティ
 * why: 推論の動的変化（探索と検証の振動など）を論理的結合モデルとして形式化し、システムの制御や分析に利用するため
 * related: .pi/lib/bond-metrics.ts, .pi/core/reasoning-engine.ts
 * public_api: ReasoningBondType, ReasoningBond, BondTransitionGraph, EntropyConvergenceMetrics, StructuralChaosDetection, DEFAULT_BONDS, inferBondType
 * invariants: energyは低いほど強い結合を表す、distanceは意味空間上的な距離を表す、推論結果は定義された4つの型のいずれかにマッピングされる
 * side_effects: なし（純粋な型定義とテキスト解析関数）
 * failure_modes: キーワード辞書に含まれないテキスト入力に対して意図しないボンドタイプを返す可能性
 * @abdd.explain
 * overview: 論文の分子構造モデルに基づき、AIの推論プロセスを「ボンド（結合）」として抽象化したデータモデルを定義するモジュール
 * what_it_does:
 *   - 推論の状態を4つの種類（deep-reasoning, self-reflection, self-exploration, normal-operation）で定義する
 *   - 各状態の物理的特性（エネルギー、距離）を定数として管理する
 *   - 出力テキストのキーワードパターンに基づき、現在の推論状態（ボンドタイプ）を推論する
 * why_it_exists:
 *   - 推論のメタ認知状態を可視化し、プロセスの安定性や収束性を評価するため
 *   - 構造的カオスや振動パターンを検出し、システム制御のフックとするため
 * scope:
 *   in: 推論出力テキスト（文字列）
 *   out: 推論されたボンド型、または定義された構造的インターフェース
 */

/**
 * 推論ボンドの種類
 * 論文の分子構造モデルに基づく
 */
export type ReasoningBondType =
  | "deep-reasoning"    // 共有結合的: 論理の骨格、密な局所クラスター
  | "self-reflection"   // 水素結合的: 過去ステップへのフィードバック、安定化
  | "self-exploration"  // ファンデルワールス力的: 遠距離クラスタ間の弱い橋渡し
  | "normal-operation"; // 通常操作: 直接的な計算・実行

/**
 * 推論ボンド定義
 */
export interface ReasoningBond {
  type: ReasoningBondType;
  energy: number;        // 注意エネルギー（論文では低いほど強い結合）
  distance: number;      // 意味空間での距離
  label: string;         // ボンドの説明
}

/**
 * ボンド遷移
 */
export interface BondTransition {
  from: ReasoningBondType;
  to: ReasoningBondType;
  count: number;
  probability: number;
}

/**
 * 遷移確率グラフ
 */
export interface BondTransitionGraph {
  transitions: Map<string, BondTransition>;
  marginalDistribution: Map<ReasoningBondType, number>;
  sampleCount: number;
  stabilityScore: number;  // 0-1、1が最も安定
}

/**
 * エントロピー収束メトリクス
 */
export interface EntropyConvergenceMetrics {
  initialEntropy: number;
  finalEntropy: number;
  convergenceRate: number;    // 収束速度（高いほど高速）
  oscillationCount: number;   // メタ認知振動の回数
  oscillationAmplitude: number; // 振動の振幅
  isConverging: boolean;      // 収束傾向があるか
}

/**
 * 構造的カオスの検出結果
 */
export interface StructuralChaosDetection {
  hasChaos: boolean;
  competingStructures: string[];  // 競合する構造のID
  conflictScore: number;          // 0-1、1が最大の競合
  recommendation: "unify" | "separate" | "investigate";
}

/**
 * メタ認知振動パターン
 */
export interface MetacognitiveOscillation {
  highEntropyPhases: number[];   // 高エントロピー（探索）フェーズのインデックス
  lowEntropyPhases: number[];    // 低エントロピー（検証）フェーズのインデックス
  dominantBondInHighEntropy: ReasoningBondType;
  dominantBondInLowEntropy: ReasoningBondType;
}

/**
 * デフォルトのボンド定義
 * 論文のFigure 7に基づく
 */
export const DEFAULT_BONDS: Record<ReasoningBondType, ReasoningBond> = {
  "deep-reasoning": {
    type: "deep-reasoning",
    energy: 0.3,  // 最も低いエネルギー（最も強い結合）
    distance: 1,  // 局所的
    label: "Deep Reasoning (Covalent)",
  },
  "self-reflection": {
    type: "self-reflection",
    energy: 0.5,
    distance: 3,  // 中距離
    label: "Self-Reflection (Hydrogen Bond)",
  },
  "self-exploration": {
    type: "self-exploration",
    energy: 0.8,  // 最も高いエネルギー（最も弱い結合）
    distance: 5,  // 長距離
    label: "Self-Exploration (Van der Waals)",
  },
  "normal-operation": {
    type: "normal-operation",
    energy: 0.4,
    distance: 0,
    label: "Normal Operation",
  },
};

/**
 * 出力テキストからボンドタイプを推論
 * @summary 出力からボンドタイプ推論
 * @param output - 分析対象の出力テキスト
 * @returns 推論されたボンドタイプ
 */
export function inferBondType(output: string): ReasoningBondType {
  const text = output.toLowerCase();

  // Self-Reflection パターン
  const reflectionKeywords = [
    "wait", "but", "however", "reflect", "verify", "double-check",
    "reconsider", "i might be wrong", "let me check", "alternatively",
    "振り返る", "再検討", "確認", "待って", "しかし"
  ];
  if (reflectionKeywords.some(k => text.includes(k))) {
    return "self-reflection";
  }

  // Self-Exploration パターン
  const explorationKeywords = [
    "maybe", "perhaps", "let's", "explore", "consider", "assume",
    "if", "what if", "suppose", "try", "attempt",
    "試してみる", "仮定", "探索", "もしかすると"
  ];
  if (explorationKeywords.some(k => text.includes(k))) {
    return "self-exploration";
  }

  // Deep Reasoning パターン
  const deepReasoningKeywords = [
    "therefore", "because", "thus", "hence", "implies", "consequently",
    "step by step", "logically", "rigorously", "break it down",
    "したがって", "なぜなら", "論理的に", "分解"
  ];
  if (deepReasoningKeywords.some(k => text.includes(k))) {
    return "deep-reasoning";
  }

  return "normal-operation";
}

/**
 * ボンド遷移グラフを構築
 * @summary ボンド遷移グラフを構築
 * @param bondSequence - ボンドタイプのシーケンス
 * @returns 構築された遷移グラフ
 */
export function buildTransitionGraph(bondSequence: ReasoningBondType[]): BondTransitionGraph {
  const transitions = new Map<string, BondTransition>();
  const marginalCount = new Map<ReasoningBondType, number>();
  const transitionCount = new Map<string, number>();

  // 境界チェック
  if (bondSequence.length === 0) {
    return {
      transitions: new Map(),
      marginalDistribution: new Map(),
      sampleCount: 0,
      stabilityScore: 0,
    };
  }

  // カウント
  for (let i = 0; i < bondSequence.length - 1; i++) {
    const from = bondSequence[i];
    const to = bondSequence[i + 1];
    const key = `${from}->${to}`;

    transitionCount.set(key, (transitionCount.get(key) || 0) + 1);
    marginalCount.set(from, (marginalCount.get(from) || 0) + 1);
  }

  // 最後の要素の周辺分布
  const last = bondSequence[bondSequence.length - 1];
  marginalCount.set(last, (marginalCount.get(last) || 0) + 1);

  // 確率計算
  const totalTransitions = bondSequence.length - 1;
  for (const [key, count] of transitionCount) {
    const [from] = key.split("->") as [ReasoningBondType, ReasoningBondType];
    const fromCount = marginalCount.get(from) || 1;
    transitions.set(key, {
      from: key.split("->")[0] as ReasoningBondType,
      to: key.split("->")[1] as ReasoningBondType,
      count,
      probability: count / fromCount,
    });
  }

  // 周辺分布の正規化
  const total = bondSequence.length;
  const marginalDistribution = new Map<ReasoningBondType, number>();
  for (const [bond, count] of marginalCount) {
    marginalDistribution.set(bond, count / total);
  }

  // 安定性スコア計算（自己ループ + 反射の割合）
  const stabilityTransitions = ["self-reflection->self-reflection", "deep-reasoning->deep-reasoning"];
  let stabilityCount = 0;
  for (const key of stabilityTransitions) {
    const t = transitions.get(key);
    if (t) stabilityCount += t.count;
  }
  const stabilityScore = totalTransitions > 0 ? stabilityCount / totalTransitions : 0;

  return {
    transitions,
    marginalDistribution,
    sampleCount: bondSequence.length,
    stabilityScore,
  };
}

/**
 * 2つの遷移グラフ間の類似度を計算
 * 論文ではPearson相関を使用
 * @summary 遷移グラフの類似度計算
 * @param graph1 - 第1のグラフ
 * @param graph2 - 第2のグラフ
 * @returns 類似度（0-1）
 */
export function computeGraphSimilarity(
  graph1: BondTransitionGraph,
  graph2: BondTransitionGraph
): number {
  const allKeys = new Set([
    ...graph1.transitions.keys(),
    ...graph2.transitions.keys(),
  ]);

  if (allKeys.size === 0) return 1;

  const values1: number[] = [];
  const values2: number[] = [];

  for (const key of allKeys) {
    values1.push(graph1.transitions.get(key)?.probability || 0);
    values2.push(graph2.transitions.get(key)?.probability || 0);
  }

  // Pearson相関の簡易版
  const n = values1.length;
  if (n === 0) return 1;

  const mean1 = values1.reduce((a, b) => a + b, 0) / n;
  const mean2 = values2.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < n; i++) {
    const d1 = values1[i] - mean1;
    const d2 = values2[i] - mean2;
    numerator += d1 * d2;
    denom1 += d1 * d1;
    denom2 += d2 * d2;
  }

  const denominator = Math.sqrt(denom1 * denom2);
  if (denominator === 0) return 1;

  // 相関を0-1の範囲に正規化
  const correlation = numerator / denominator;
  return (correlation + 1) / 2;
}

/**
 * エントロピー収束メトリクスを計算
 * @summary エントロピー収束を計算
 * @param entropySeries - エントロピー値の系列
 * @returns 収束メトリクス
 */
export function computeEntropyConvergence(entropySeries: number[]): EntropyConvergenceMetrics {
  if (entropySeries.length === 0) {
    return {
      initialEntropy: 0,
      finalEntropy: 0,
      convergenceRate: 0,
      oscillationCount: 0,
      oscillationAmplitude: 0,
      isConverging: false,
    };
  }

  const initialEntropy = entropySeries[0];
  const finalEntropy = entropySeries[entropySeries.length - 1];

  // 収束率: 初期エントロピーから最終エントロピーへの変化率
  const convergenceRate = initialEntropy > 0
    ? (initialEntropy - finalEntropy) / initialEntropy
    : 0;

  // 振動検出
  let oscillationCount = 0;
  let maxAmplitude = 0;
  let prevDelta = 0;

  for (let i = 1; i < entropySeries.length; i++) {
    const delta = entropySeries[i] - entropySeries[i - 1];
    if (prevDelta * delta < 0) {  // 符号が変わった = 振動
      oscillationCount++;
      maxAmplitude = Math.max(maxAmplitude, Math.abs(delta));
    }
    prevDelta = delta;
  }

  const isConverging = convergenceRate > 0.1 && oscillationCount < entropySeries.length / 2;

  return {
    initialEntropy,
    finalEntropy,
    convergenceRate,
    oscillationCount,
    oscillationAmplitude: maxAmplitude,
    isConverging,
  };
}

/**
 * 構造的カオスを検出
 * 論文では、異なる安定構造を混合するとパフォーマンスが低下することを示している
 * @summary 構造的カオスを検出
 * @param graphs - 比較対象の遷移グラフ配列
 * @param threshold - 類似度の閾値
 * @returns カオス検出結果
 */
export function detectStructuralChaos(
  graphs: BondTransitionGraph[],
  threshold: number = 0.85
): StructuralChaosDetection {
  if (graphs.length < 2) {
    return {
      hasChaos: false,
      competingStructures: [],
      conflictScore: 0,
      recommendation: "unify",
    };
  }

  // 全ペアの類似度を計算
  const similarities: number[] = [];
  for (let i = 0; i < graphs.length; i++) {
    for (let j = i + 1; j < graphs.length; j++) {
      similarities.push(computeGraphSimilarity(graphs[i], graphs[j]));
    }
  }

  // 平均類似度
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  // 類似度が閾値未満のペア = 構造的競合
  const lowSimilarityPairs = similarities.filter(s => s < threshold);
  const conflictScore = lowSimilarityPairs.length / similarities.length;
  const hasChaos = conflictScore > 0.3 || avgSimilarity < threshold;

  let recommendation: "unify" | "separate" | "investigate";
  if (conflictScore > 0.5) {
    recommendation = "separate";
  } else if (conflictScore > 0.2) {
    recommendation = "investigate";
  } else {
    recommendation = "unify";
  }

  return {
    hasChaos,
    competingStructures: hasChaos ? graphs.map((_, i) => `structure-${i}`) : [],
    conflictScore,
    recommendation,
  };
}

/**
 * メタ認知振動パターンを分析
 * @summary メタ認知振動パターン分析
 * @param bondSequence - ボンドタイプのシーケンス
 * @param entropySeries - エントロピー値の系列
 * @returns 振動パターン分析結果
 */
export function analyzeMetacognitiveOscillation(
  bondSequence: ReasoningBondType[],
  entropySeries: number[]
): MetacognitiveOscillation {
  const highEntropyPhases: number[] = [];
  const lowEntropyPhases: number[] = [];

  // エントロピーの中央値を計算
  const sortedEntropy = [...entropySeries].sort((a, b) => a - b);
  const median = sortedEntropy[Math.floor(sortedEntropy.length / 2)] || 0.5;

  // 高/低エントロピーフェーズを特定
  for (let i = 0; i < entropySeries.length; i++) {
    if (entropySeries[i] > median) {
      highEntropyPhases.push(i);
    } else {
      lowEntropyPhases.push(i);
    }
  }

  // 各フェーズでの支配的ボンドを特定
  const bondCounts = {
    highEntropy: new Map<ReasoningBondType, number>(),
    lowEntropy: new Map<ReasoningBondType, number>(),
  };

  for (const i of highEntropyPhases) {
    if (i < bondSequence.length) {
      const bond = bondSequence[i];
      bondCounts.highEntropy.set(bond, (bondCounts.highEntropy.get(bond) || 0) + 1);
    }
  }

  for (const i of lowEntropyPhases) {
    if (i < bondSequence.length) {
      const bond = bondSequence[i];
      bondCounts.lowEntropy.set(bond, (bondCounts.lowEntropy.get(bond) || 0) + 1);
    }
  }

  // 支配的ボンドを特定
  let dominantInHigh: ReasoningBondType = "self-exploration";
  let maxHigh = 0;
  for (const [bond, count] of bondCounts.highEntropy) {
    if (count > maxHigh) {
      maxHigh = count;
      dominantInHigh = bond;
    }
  }

  let dominantInLow: ReasoningBondType = "self-reflection";
  let maxLow = 0;
  for (const [bond, count] of bondCounts.lowEntropy) {
    if (count > maxLow) {
      maxLow = count;
      dominantInLow = bond;
    }
  }

  return {
    highEntropyPhases,
    lowEntropyPhases,
    dominantBondInHighEntropy: dominantInHigh,
    dominantBondInLowEntropy: dominantInLow,
  };
}

/**
 * ボンド分布の分析
 * @summary ボンド分布を分析
 * @param outputs - 出力テキストの配列
 * @returns 分析結果
 */
export function analyzeBondDistribution(outputs: string[]): {
  graph: BondTransitionGraph;
  bondCounts: Map<ReasoningBondType, number>;
  dominantBond: ReasoningBondType;
} {
  const bondSequence: ReasoningBondType[] = outputs.map(inferBondType);
  const graph = buildTransitionGraph(bondSequence);

  const bondCounts = new Map<ReasoningBondType, number>();
  for (const bond of bondSequence) {
    bondCounts.set(bond, (bondCounts.get(bond) || 0) + 1);
  }

  let dominantBond: ReasoningBondType = "normal-operation";
  let maxCount = 0;
  for (const [bond, count] of bondCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantBond = bond;
    }
  }

  return { graph, bondCounts, dominantBond };
}

/**
 * Semantic Isomers（意味異性体）の検出
 * 同じタスクに対して異なる推論構造を持つ軌跡を特定
 * @summary 意味異性体を検出
 * @param outputs1 - 第1の出力セット
 * @param outputs2 - 第2の出力セット
 * @returns 異性体かどうか、および類似度
 */
export function detectSemanticIsomers(
  outputs1: string[],
  outputs2: string[]
): {
  isIsomer: boolean;
  structuralSimilarity: number;
  distributionSimilarity: number;
} {
  const analysis1 = analyzeBondDistribution(outputs1);
  const analysis2 = analyzeBondDistribution(outputs2);

  const structuralSimilarity = computeGraphSimilarity(analysis1.graph, analysis2.graph);

  // 周辺分布の比較
  const allBonds: ReasoningBondType[] = [
    "deep-reasoning", "self-reflection", "self-exploration", "normal-operation"
  ];
  let distributionDiff = 0;
  for (const bond of allBonds) {
    const p1 = analysis1.graph.marginalDistribution.get(bond) || 0;
    const p2 = analysis2.graph.marginalDistribution.get(bond) || 0;
    distributionDiff += Math.abs(p1 - p2);
  }
  const distributionSimilarity = 1 - distributionDiff / 2;

  // 異性体 = 構造は類似しているが分布が異なる
  const isIsomer = structuralSimilarity > 0.7 && distributionSimilarity < 0.9;

  return {
    isIsomer,
    structuralSimilarity,
    distributionSimilarity,
  };
}
