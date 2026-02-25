/**
 * @abdd.meta
 * path: .pi/lib/dag-weight-calculator.ts
 * role: DTGG重み計算式の実装
 * why: タスク依存エッジの重みを計算し、最適な実行順序を決定するため
 * related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts, .pi/lib/priority-scheduler.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams/extension.ts
 * public_api: calculateEdgeWeight, calculateTaskPriority, calculateComplexity, calculateDependencyImportance, WeightConfig, getAgentSpecializationWeight, calculateTeamWeight, TeamMemberForWeight, TeamDefinitionForWeight
 * invariants: 重みは常に非負値を返す
 * side_effects: なし（純粋関数）
 * failure_modes: 無効な入力値（負の推定時間等）
 * @abdd.explain
 * overview: DynTaskMAS論文のDTGG（Dynamic Task Graph Generator）の重み計算式を実装
 * what_it_does:
 *   - タスク複雑性スコア C(v_j) を計算
 *   - 依存関係重要度 I(v_i, v_j) を計算
 *   - エッジ重み W(v_i, v_j) = α·C(v_j) + β·I(v_i, v_j) を計算
 *   - タスク優先度 P(v_i) を計算
 *   - エージェント専門化重み getAgentSpecializationWeight を提供
 *   - チーム重み calculateTeamWeight を提供
 * why_it_exists:
 *   - タスクDAGの最適な実行順序を決定するため
 *   - クリティカルパスを優先し、実行効率を向上させるため
 *   - subagent_run_parallelとagent_team_run_parallelでの優先度スケジューリングを可能にするため
 * scope:
 *   in: TaskNode型のタスク情報、エージェントID、チーム定義
 *   out: エッジ重み、タスク優先度、エージェント/チーム重みの数値
 */

// File: .pi/lib/dag-weight-calculator.ts
// Description: Weight calculation formulas for DTGG (Dynamic Task Graph Generator).
// Why: Implements DynTaskMAS paper's weight calculation for optimal task execution order.
// Related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts, .pi/lib/priority-scheduler.ts

import type { TaskNode, TaskNodePriority } from "./dag-types.js";

/**
 * 重み計算の設定
 * @summary 重み計算設定
 * @param alpha - 複雑性係数（default: 0.6）
 * @param beta - 依存性係数（default: 0.4）
 */
export interface WeightConfig {
  /** 複雑性係数（default: 0.6） */
  alpha: number;
  /** 依存性係数（default: 0.4） */
  beta: number;
}

/**
 * デフォルトの重み設定
 * @summary デフォルト重み設定
 */
export const DEFAULT_WEIGHT_CONFIG: WeightConfig = {
  alpha: 0.6,
  beta: 0.4,
};

/**
 * エージェントの専門化係数マップ
 * 各エージェントタイプの処理難易度を表す
 * @internal
 */
const AGENT_SPECIALIZATION_FACTORS: Record<string, number> = {
  researcher: 0.5,
  implementer: 1.0,
  reviewer: 0.7,
  architect: 1.2,
  tester: 0.8,
};

/**
 * エージェントの専門化係数を取得（内部用）
 * @summary エージェント専門化係数取得
 * @param agentId - エージェントID
 * @returns 専門化係数（0.5〜1.2）
 * @internal
 */
function getAgentSpecializationFactor(agentId: string | undefined): number {
  if (!agentId) return 1.0;
  return AGENT_SPECIALIZATION_FACTORS[agentId] ?? 1.0;
}

/**
 * エージェントの専門化重みを取得（公開API）
 * DynTaskMAS統合用: subagent_run_parallelとagent_team_run_parallelで使用
 * @summary エージェント専門化重み取得
 * @param agentId - エージェントID
 * @returns 専門化重み（0.5〜1.2）
 * @example
 * const weight = getAgentSpecializationWeight('researcher'); // 0.5
 * const weight2 = getAgentSpecializationWeight('architect'); // 1.2
 */
export function getAgentSpecializationWeight(agentId: string): number {
  return getAgentSpecializationFactor(agentId);
}

/**
 * チームメンバー定義の最小インターフェース
 * チーム重み計算に必要なプロパティのみを定義
 */
export interface TeamMemberForWeight {
  id: string;
}

/**
 * チーム定義の最小インターフェース
 * チーム重み計算に必要なプロパティのみを定義
 */
export interface TeamDefinitionForWeight {
  id: string;
  members: TeamMemberForWeight[];
}

/**
 * チームの重みを計算（メンバー構成ベース）
 * メンバーの専門性の平均から算出
 * DynTaskMAS統合用: agent_team_run_parallelで使用
 * @summary チーム重み計算
 * @param team - チーム定義
 * @returns チーム重み（0.5〜1.2の平均値）
 * @example
 * const weight = calculateTeamWeight({
 *   id: 'core-team',
 *   members: [{ id: 'researcher' }, { id: 'implementer' }]
 * }); // (0.5 + 1.0) / 2 = 0.75
 */
export function calculateTeamWeight(team: TeamDefinitionForWeight): number {
  if (!team.members || team.members.length === 0) {
    return 1.0;
  }
  const memberWeights = team.members.map((m) => getAgentSpecializationWeight(m.id));
  return memberWeights.reduce((a, b) => a + b, 0) / memberWeights.length;
}

/**
 * タスク間の推定データ転送量を計算
 * @summary データ転送量推定
 * @param _source - 依存元タスク
 * @param _target - 依存先タスク
 * @returns データ量係数（0.1〜1.0）
 * @internal
 */
function estimateDataVolume(_source: TaskNode, _target: TaskNode): number {
  // 簡易実装: 入力コンテキスト数に基づく推定
  const contextCount = _target.inputContext?.length ?? 0;
  return Math.min(1.0, 0.1 + contextCount * 0.2);
}

/**
 * タスクの複雑性スコアを計算
 * C(v_j) = log(estimatedDurationMs / 1000) + agentSpecializationFactor
 * @summary タスク複雑性計算
 * @param task - 対象タスクノード
 * @returns 複雑性スコア（非負値）
 */
export function calculateComplexity(task: TaskNode): number {
  const durationMs = task.estimatedDurationMs ?? 60000;
  const durationScore = Math.log10(Math.max(1, durationMs / 1000));
  const agentFactor = getAgentSpecializationFactor(task.assignedAgent);
  return Math.max(0, durationScore + agentFactor);
}

/**
 * 依存関係の重要度スコアを計算
 * I(v_i, v_j) = dataVolumeFactor * criticalityFactor
 * @summary 依存重要度計算
 * @param source - 依存元タスク
 * @param target - 依存先タスク
 * @returns 重要度スコア（非負値）
 */
export function calculateDependencyImportance(
  source: TaskNode,
  target: TaskNode
): number {
  const dataVolume = estimateDataVolume(source, target);

  const criticalityFactor = getCriticalityFactor(target.priority);

  return dataVolume * criticalityFactor;
}

/**
 * 優先度から重要度係数を取得
 * @summary 重要度係数取得
 * @param priority - タスク優先度
 * @returns 重要度係数
 * @internal
 */
function getCriticalityFactor(priority: TaskNodePriority | undefined): number {
  switch (priority) {
    case "critical":
      return 2.0;
    case "high":
      return 1.5;
    case "low":
      return 0.7;
    case "normal":
    default:
      return 1.0;
  }
}

/**
 * エッジ重みを計算
 * W(v_i, v_j) = α·C(v_j) + β·I(v_i, v_j)
 * @summary エッジ重み計算
 * @param source - 依存元タスク
 * @param target - 依存先タスク
 * @param config - 重み設定（省略時はデフォルト）
 * @returns エッジ重み（非負値）
 */
export function calculateEdgeWeight(
  source: TaskNode,
  target: TaskNode,
  config: WeightConfig = DEFAULT_WEIGHT_CONFIG
): number {
  const complexity = calculateComplexity(target);
  const importance = calculateDependencyImportance(source, target);
  return config.alpha * complexity + config.beta * importance;
}

/**
 * タスク優先度を計算
 * P(v_i) = basePriority + criticalPathBonus - dependencyPenalty
 * @summary タスク優先度計算
 * @param task - 対象タスク
 * @param criticalPathLength - クリティカルパス長
 * @returns 優先度スコア（非負値）
 */
export function calculateTaskPriority(
  task: TaskNode,
  criticalPathLength: number
): number {
  const baseMap: Record<TaskNodePriority, number> = {
    critical: 100,
    high: 75,
    normal: 50,
    low: 25,
  };

  const basePriority = baseMap[task.priority ?? "normal"];
  const criticalBonus = criticalPathLength * 10;
  const depPenalty = task.dependencies.length * 5;

  return Math.max(0, basePriority + criticalBonus - depPenalty);
}

/**
 * タスクの総合重みを計算
 * すべての依存エッジの重みを合計
 * @summary 総合重み計算
 * @param task - 対象タスク
 * @param allTasks - 全タスクマップ
 * @param config - 重み設定
 * @returns 総合重み
 */
export function calculateTotalTaskWeight(
  task: TaskNode,
  allTasks: Map<string, TaskNode>,
  config: WeightConfig = DEFAULT_WEIGHT_CONFIG
): number {
  let totalWeight = 0;

  for (const depId of task.dependencies) {
    const depTask = allTasks.get(depId);
    if (depTask) {
      totalWeight += calculateEdgeWeight(depTask, task, config);
    }
  }

  // 依存がない場合は自身の複雑性を使用
  if (task.dependencies.length === 0) {
    totalWeight = calculateComplexity(task);
  }

  return totalWeight;
}
