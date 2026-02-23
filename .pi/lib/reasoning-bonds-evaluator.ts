/**
 * @abdd.meta
 * path: .pi/lib/reasoning-bonds-evaluator.ts
 * role: チームの推論ボンド状態を集計し、構造的健全性と振動パターンを評価するアナライザ
 * why: 多数のエージェント出力からチーム全体の認知的安定性を定量的に判断し、改善策を導出するため
 * related: .pi/lib/reasoning-bonds.ts, .pi/lib/executor.ts
 * public_api: evaluateTeamBonds, BOND_OPTIMAL_RANGES, BondEvaluationResult, TeamMemberResultForBond
 * invariants: evaluateTeamBondsは完了した出力のみを対象にする、安定性スコアは0から1の範囲である
 * side_effects: なし（純粋な計算と集計）
 * failure_modes: 入力が全て失敗（status != completed）の場合、空配列による除算エラーを防ぐためtotalBondsを1として扱う
 * @abdd.explain
 * overview: エージェントの出力テキストと信頼度に基づき、ボンド分布、エントロピー収束、メタ認知振動を分析するモジュール
 * what_it_does:
 *   - チームメンバーの出力をボンドタイプ（深層推論、自己反省等）に分類し、分布を算出する
 *   - 信頼度をエントロピー（不確実性）系列に変換し、収束メトリクスを計算する
 *   - ボンド遷移グラフと過去のグラフを比較し、構造的類似度と安定性スコアを導出する
 *   - 最適範囲（BOND_OPTIMAL_RANGES）との乖離を判定し、全体的評価と推奨事項を生成する
 * why_it_exists:
 *   - 個々のエージェントの状態だけでなく、チームとしての認知的バランスが最適かどうかを可視化する必要があるため
 *   - 認知プロセスが収束しているか、あるいはカオス状態に陥っていないかを検知するため
 * scope:
 *   in: チームメンバーの実行結果リスト（出力、信頼度、ステータス）、オプションの過去遷移グラフ
 *   out: ボンド分布の健全性、構造安定性スコア、振動パターン、全体評価を含む評価結果オブジェクト
 */

import {
  type ReasoningBondType,
  type BondTransitionGraph,
  type EntropyConvergenceMetrics,
  type MetacognitiveOscillation,
  type StructuralChaosDetection,
  inferBondType,
  buildTransitionGraph,
  computeEntropyConvergence,
  analyzeMetacognitiveOscillation,
  analyzeBondDistribution,
  detectStructuralChaos,
  computeGraphSimilarity,
} from "./reasoning-bonds.js";

/**
 * チームメンバーの結果（評価用インターフェース）
 */
export interface TeamMemberResultForBond {
  memberId: string;
  role: string;
  output: string;
  confidence?: number;
  status: string;
}

/**
 * ボンド評価結果
 */
export interface BondEvaluationResult {
  /** ボンド遷移グラフ */
  transitionGraph: BondTransitionGraph;

  /** エントロピー収束メトリクス */
  entropyMetrics: EntropyConvergenceMetrics;

  /** メタ認知振動パターン */
  oscillationPattern: MetacognitiveOscillation;

  /** 構造安定性スコア（0-1） */
  stabilityScore: number;

  /** ボンド分布の健全性 */
  distributionHealth: {
    deepReasoning: { actual: number; optimal: number; status: "ok" | "low" | "high" };
    selfReflection: { actual: number; optimal: number; status: "ok" | "low" | "high" };
    selfExploration: { actual: number; optimal: number; status: "ok" | "low" | "high" };
    normalOperation: { actual: number; optimal: number; status: "ok" | "low" | "high" };
  };

  /** 全体的な評価 */
  overallAssessment: "optimal" | "suboptimal" | "unstable" | "chaotic";

  /** 改善推奨事項 */
  recommendations: string[];
}

/**
 * 最適なボンド分布範囲
 * 論文のFigure 5-8に基づく推定値
 */
export const BOND_OPTIMAL_RANGES = {
  "deep-reasoning": { min: 0.25, max: 0.45, optimal: 0.35 },
  "self-reflection": { min: 0.15, max: 0.35, optimal: 0.25 },
  "self-exploration": { min: 0.10, max: 0.25, optimal: 0.15 },
  "normal-operation": { min: 0.15, max: 0.35, optimal: 0.25 },
};

/**
 * チーム実行結果のボンド評価を行う
 * @summary チームボンド評価
 * @param results - チームメンバーの実行結果
 * @param previousGraph - 過去の遷移グラフ（構造比較用、オプション）
 * @returns ボンド評価結果
 */
export function evaluateTeamBonds(
  results: TeamMemberResultForBond[],
  previousGraph?: BondTransitionGraph
): BondEvaluationResult {
  // 出力テキストを収集
  const outputs = results
    .filter(r => r.status === "completed" && r.output)
    .map(r => r.output);

  // ボンド分析
  const { graph, bondCounts, dominantBond } = analyzeBondDistribution(outputs);

  // エントロピーシリーズ（不確実性スコアから）
  const entropySeries = results
    .filter(r => r.confidence !== undefined)
    .map(r => 1 - (r.confidence || 0.5));  // 信頼度を不確実性に変換

  const entropyMetrics = computeEntropyConvergence(entropySeries);

  // ボンドシーケンスから振動パターンを分析
  const bondSequence = outputs.map(inferBondType);
  const oscillationPattern = analyzeMetacognitiveOscillation(bondSequence, entropySeries);

  // 分布の健全性を評価
  const totalBonds = bondSequence.length || 1;
  const distributionHealth = {
    deepReasoning: evaluateBondHealth(
      (bondCounts.get("deep-reasoning") || 0) / totalBonds,
      BOND_OPTIMAL_RANGES["deep-reasoning"]
    ),
    selfReflection: evaluateBondHealth(
      (bondCounts.get("self-reflection") || 0) / totalBonds,
      BOND_OPTIMAL_RANGES["self-reflection"]
    ),
    selfExploration: evaluateBondHealth(
      (bondCounts.get("self-exploration") || 0) / totalBonds,
      BOND_OPTIMAL_RANGES["self-exploration"]
    ),
    normalOperation: evaluateBondHealth(
      (bondCounts.get("normal-operation") || 0) / totalBonds,
      BOND_OPTIMAL_RANGES["normal-operation"]
    ),
  };

  // 構造安定性スコアを計算
  const stabilityScore = computeStabilityScore(
    graph,
    entropyMetrics,
    distributionHealth,
    previousGraph
  );

  // 全体的な評価
  const overallAssessment = assessOverall(stabilityScore, entropyMetrics, distributionHealth);

  // 推奨事項を生成
  const recommendations = generateRecommendations(
    distributionHealth,
    entropyMetrics,
    oscillationPattern,
    overallAssessment
  );

  return {
    transitionGraph: graph,
    entropyMetrics,
    oscillationPattern,
    stabilityScore,
    distributionHealth,
    overallAssessment,
    recommendations,
  };
}

/**
 * ボンド分布の健全性を評価
 */
function evaluateBondHealth(
  actual: number,
  range: { min: number; max: number; optimal: number }
): { actual: number; optimal: number; status: "ok" | "low" | "high" } {
  let status: "ok" | "low" | "high";
  if (actual < range.min) {
    status = "low";
  } else if (actual > range.max) {
    status = "high";
  } else {
    status = "ok";
  }
  return { actual, optimal: range.optimal, status };
}

/**
 * 構造安定性スコアを計算
 */
function computeStabilityScore(
  graph: BondTransitionGraph,
  entropyMetrics: EntropyConvergenceMetrics,
  distributionHealth: BondEvaluationResult["distributionHealth"],
  previousGraph?: BondTransitionGraph
): number {
  let score = 0;

  // 1. 遷移グラフの安定性（自己ループと反射の割合）
  score += graph.stabilityScore * 0.3;

  // 2. エントロピー収束
  if (entropyMetrics.isConverging) {
    score += 0.2;
  }
  score += Math.min(entropyMetrics.convergenceRate, 1) * 0.1;

  // 3. 分布の健全性
  const healthScores = Object.values(distributionHealth).map(h =>
    h.status === "ok" ? 1 : h.status === "low" ? 0.5 : 0.7
  );
  score += (healthScores.reduce((a, b) => a + b, 0) / healthScores.length) * 0.3;

  // 4. 構造的一貫性（過去との比較）
  if (previousGraph) {
    const similarity = computeGraphSimilarity(graph, previousGraph);
    score += similarity * 0.1;
  } else {
    score += 0.1;  // 比較対象がない場合は満点
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * 全体的な評価を行う
 */
function assessOverall(
  stabilityScore: number,
  entropyMetrics: EntropyConvergenceMetrics,
  distributionHealth: BondEvaluationResult["distributionHealth"]
): "optimal" | "suboptimal" | "unstable" | "chaotic" {
  // 混乱的な状況: 多くのボンドが範囲外
  const unhealthyCount = Object.values(distributionHealth)
    .filter(h => h.status !== "ok").length;

  if (unhealthyCount >= 3 || !entropyMetrics.isConverging && entropyMetrics.oscillationCount > 5) {
    return "chaotic";
  }

  // 不安定: 収束していない、または振動が激しい
  if (!entropyMetrics.isConverging || entropyMetrics.oscillationAmplitude > 0.3) {
    return "unstable";
  }

  // 最適: 高い安定性
  if (stabilityScore >= 0.8 && unhealthyCount === 0) {
    return "optimal";
  }

  // 準最適: その他
  return "suboptimal";
}

/**
 * 推奨事項を生成
 */
function generateRecommendations(
  distributionHealth: BondEvaluationResult["distributionHealth"],
  entropyMetrics: EntropyConvergenceMetrics,
  oscillationPattern: MetacognitiveOscillation,
  assessment: "optimal" | "suboptimal" | "unstable" | "chaotic"
): string[] {
  const recommendations: string[] = [];

  // 分布の不均衡に対する推奨
  if (distributionHealth.deepReasoning.status === "low") {
    recommendations.push(
      "Deep Reasoningが不足しています。より詳細な論理展開を促進するため、" +
      "実行前に明確な制約条件と目標を提示してください。"
    );
  }

  if (distributionHealth.selfReflection.status === "low") {
    recommendations.push(
      "Self-Reflectionが不足しています。メンバー間での相互レビューや、" +
      "結果の検証ステップを追加することを検討してください。"
    );
  }

  if (distributionHealth.selfExploration.status === "high") {
    recommendations.push(
      "Self-Explorationが過多です。収束に向けて、" +
      "communicationRoundsを減らすか、Judgeの重み付けを調整してください。"
    );
  }

  // エントロピー収束に対する推奨
  if (!entropyMetrics.isConverging) {
    recommendations.push(
      "議論が収束していません。最終Judgeの前に、" +
      "明確な合意形成ステップを追加してください。"
    );
  }

  if (entropyMetrics.oscillationCount > 3 && entropyMetrics.oscillationAmplitude > 0.2) {
    recommendations.push(
      "メタ認知振動が激しいです。高エントロピー（探索）と低エントロピー（検証）の" +
      "バランスを取るため、タスクをより明確に分割してください。"
    );
  }

  // 振動パターンに基づく推奨
  if (oscillationPattern.dominantBondInHighEntropy === "self-reflection") {
    recommendations.push(
      "探索フェーズで反射が支配的です。初期段階では" +
      "Self-Explorationを優先するようプロンプトを調整してください。"
    );
  }

  // 評価に基づく一般的な推奨
  if (assessment === "chaotic") {
    recommendations.push(
      "【重要】構造が混乱しています。チーム定義を見直し、" +
      "メンバーの役割をより明確に分離してください。" +
      "論文によると、異なる安定構造を混合するとパフォーマンスが低下します。"
    );
  }

  if (assessment === "unstable") {
    recommendations.push(
      "構造が不安定です。communicationRoundsを調整するか、" +
      "メンバーの不確実性を減らすよう追加コンテキストを提供してください。"
    );
  }

  return recommendations;
}

/**
 * ボンド評価レポートを生成
 * @summary ボンド評価レポート生成
 * @param evaluation - ボンド評価結果
 * @returns Markdown形式のレポート
 */
export function generateBondReport(evaluation: BondEvaluationResult): string {
  const lines: string[] = [
    "# Reasoning Bond Analysis Report",
    "",
    "## Summary",
    "",
    `- **Overall Assessment**: ${evaluation.overallAssessment.toUpperCase()}`,
    `- **Stability Score**: ${(evaluation.stabilityScore * 100).toFixed(1)}%`,
    `- **Entropy Convergence**: ${evaluation.entropyMetrics.isConverging ? "Yes" : "No"}`,
    `- **Convergence Rate**: ${(evaluation.entropyMetrics.convergenceRate * 100).toFixed(1)}%`,
    "",
    "## Bond Distribution",
    "",
    "| Bond Type | Actual | Optimal | Status |",
    "|-----------|--------|---------|--------|",
  ];

  for (const [type, health] of Object.entries(evaluation.distributionHealth)) {
    const statusIcon = health.status === "ok" ? "OK" : health.status === "low" ? "LOW" : "HIGH";
    lines.push(
      `| ${type} | ${(health.actual * 100).toFixed(1)}% | ${(health.optimal * 100).toFixed(1)}% | ${statusIcon} |`
    );
  }

  lines.push("");
  lines.push("## Metacognitive Oscillation");
  lines.push("");
  lines.push(`- **High Entropy Phases**: ${evaluation.oscillationPattern.highEntropyPhases.length}`);
  lines.push(`- **Low Entropy Phases**: ${evaluation.oscillationPattern.lowEntropyPhases.length}`);
  lines.push(`- **Dominant Bond in Exploration**: ${evaluation.oscillationPattern.dominantBondInHighEntropy}`);
  lines.push(`- **Dominant Bond in Validation**: ${evaluation.oscillationPattern.dominantBondInLowEntropy}`);
  lines.push("");

  if (evaluation.recommendations.length > 0) {
    lines.push("## Recommendations");
    lines.push("");
    for (let i = 0; i < evaluation.recommendations.length; i++) {
      lines.push(`${i + 1}. ${evaluation.recommendations[i]}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Based on \"The Molecular Structure of Thought: Mapping the Topology of Long Chain-of-Thought Reasoning\" (arXiv:2601.06002)*");

  return lines.join("\n");
}

/**
 * 複数チーム実行の構造的カオスを検出
 * @summary 構造的カオス検出
 * @param evaluations - 複数の評価結果
 * @returns 構造的カオスの検出結果
 */
export function detectTeamStructuralChaos(
  evaluations: BondEvaluationResult[]
): StructuralChaosDetection & { message: string } {
  if (evaluations.length < 2) {
    return {
      hasChaos: false,
      competingStructures: [],
      conflictScore: 0,
      recommendation: "unify",
      message: "比較対象が不足しています",
    };
  }

  const graphs = evaluations.map(e => e.transitionGraph);
  const chaosDetection = detectStructuralChaos(graphs);

  let message: string;
  if (chaosDetection.hasChaos) {
    message = `【警告】${evaluations.length}件の実行間で構造的競合が検出されました。` +
      `これにより、論文が指摘する「構造的カオス」が発生している可能性があります。` +
      `競合スコア: ${(chaosDetection.conflictScore * 100).toFixed(1)}%`;
  } else {
    message = `${evaluations.length}件の実行は構造的に整合しています。`;
  }

  return {
    ...chaosDetection,
    message,
  };
}
