/**
 * @abdd.meta
 * path: .pi/lib/dag/topology-router.ts
 * role: DAG構造分析とトポロジー選択の核心モジュール
 * why: AdaptOrch論文のAlgorithm 1を実装し、タスク特性に応じた最適な実行戦略を決定する
 * related:
 *   - .pi/lib/dag/types.ts (型定義)
 *   - .pi/lib/dag/orchestrator.ts (統合オーケストレーター)
 *   - docs/research/adaptorch.md (設計根拠)
 * public_api:
 *   - routeTopology(DAGPlan): TopologyType
 *   - calculateDAGMetrics(DAGPlan): DAGMetrics
 *   - topologicalLayers(DAGTask[]): DAGTask[][]
 * invariants:
 *   - 入力DAGは有向非巡回グラフ（acyclic）であること
 *   - 全てのトポロジー選択はO(|V|+|E|)で完了すること
 * side_effects: なし（純粋関数）
 * failure_modes:
 *   - 循環依存検出時はErrorを投げる
 *   - 空のタスクリストには"sequential"を返す（デフォルト安全）
 */

import { DAGPlan, DAGTask, DAGMetrics, TopologyType } from "./types.js";

/**
 * @summary 閾値定数（AdaptOrch論文準拠・調整可能）
 */
export const THRESHOLDS = {
  /** 並列化率閾値: ω/|V| > 0.5 でparallelを検討 */
  OMEGA_RATIO: 0.5,
  /** 高結合閾値: γ > 0.6 でhierarchicalを検討 */
  COUPLING_DENSITY: 0.6,
  /** 階層化最小サブタスク数: |V| > 5 でhierarchicalを検討 */
  MIN_SUBTASKS_FOR_HIERARCHY: 5,
} as const;

/**
 * @summary coupling文字列を数値に変換
 * @param coupling - 結合強度の文字列表現
 * @returns 0.0〜1.0の数値
 */
function couplingToNumber(coupling: string): number {
  const map: Record<string, number> = {
    none: 0.0,
    weak: 0.3,
    strong: 0.7,
    critical: 1.0,
  };
  return map[coupling] ?? 0.3; // デフォルトはweak
}

/**
 * @summary DAGの構造メトリクスを計算
 * @param plan - 分析対象のDAGプラン
 * @returns 並列幅、クリティカルパス深さ、結合密度などのメトリクス
 * @throws 循環依存が検出された場合
 */
export function calculateDAGMetrics(plan: DAGPlan): DAGMetrics {
  const tasks = plan.tasks;
  
  if (tasks.length === 0) {
    return {
      parallelismWidth: 0,
      criticalPathDepth: 0,
      couplingDensity: 0,
      nodeCount: 0,
      edgeCount: 0,
    };
  }

  // 1. トポロジカルレイヤリング（並列幅の近似計算）
  const layers = topologicalLayers(tasks);
  const width = Math.max(...layers.map(l => l.length));
  
  // 2. クリティカルパス深さ（estimatedTokensを重みとして）
  const depth = calculateCriticalPath(tasks);
  
  // 3. エッジ数と結合密度の計算
  let edgeCount = 0;
  let totalCoupling = 0;
  
  for (const task of tasks) {
    for (const depId of task.dependencies) {
      edgeCount++;
      const depTask = tasks.find(t => t.id === depId);
      if (depTask) {
        // 依存元→依存先の結合強度を使用
        totalCoupling += couplingToNumber(task.coupling || "weak");
      }
    }
  }
  
  const density = edgeCount > 0 ? totalCoupling / edgeCount : 0;
  
  return {
    parallelismWidth: width,
    criticalPathDepth: depth,
    couplingDensity: density,
    nodeCount: tasks.length,
    edgeCount,
  };
}

/**
 * @summary トポロジカルレイヤリング（Kahn's algorithm）
 * @description DAGを「同時に実行可能なタスク」のレイヤーに分割
 * @param tasks - DAGタスクの配列
 * @returns レイヤーごとのタスク配列（層の順序は実行順）
 * @throws 循環依存が検出された場合
 */
export function topologicalLayers(tasks: DAGTask[]): DAGTask[][] {
  if (tasks.length === 0) return [];
  
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  
  // 初期化
  for (const task of tasks) {
    inDegree.set(task.id, task.dependencies.length);
    if (!adj.has(task.id)) adj.set(task.id, []);
    
    for (const depId of task.dependencies) {
      if (!taskMap.has(depId)) {
        throw new Error(`Unknown dependency: ${depId} (referenced by ${task.id})`);
      }
      if (!adj.has(depId)) adj.set(depId, []);
      adj.get(depId)!.push(task.id);
    }
  }
  
  const layers: DAGTask[][] = [];
  let currentLayer = tasks.filter(t => inDegree.get(t.id) === 0);
  const processed = new Set<string>();
  
  while (currentLayer.length > 0) {
    // 現在のレイヤーを記録
    layers.push([...currentLayer]);
    currentLayer.forEach(t => processed.add(t.id));
    
    // 次のレイヤーを構築
    const nextLayer: DAGTask[] = [];
    
    for (const task of currentLayer) {
      for (const childId of adj.get(task.id) || []) {
        const newDeg = (inDegree.get(childId) || 0) - 1;
        inDegree.set(childId, newDeg);
        
        if (newDeg === 0) {
          const childTask = taskMap.get(childId)!;
          nextLayer.push(childTask);
        }
      }
    }
    
    currentLayer = nextLayer;
  }
  
  // 循環依存チェック
  if (processed.size !== tasks.length) {
    const unprocessed = tasks.filter(t => !processed.has(t.id)).map(t => t.id);
    throw new Error(`Circular dependency detected. Unprocessed tasks: ${unprocessed.join(", ")}`);
  }
  
  return layers;
}

/**
 * @summary クリティカルパス深さを計算（動的計画法）
 * @param tasks - DAGタスクの配列
 * @returns 重み付き最長パスの長さ
 */
function calculateCriticalPath(tasks: DAGTask[]): number {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const memo = new Map<string, number>();
  
  function getDepth(taskId: string): number {
    if (memo.has(taskId)) return memo.get(taskId)!;
    
    const task = taskMap.get(taskId);
    if (!task) return 0;
    
    const weight = task.estimatedTokens || 1000; // デフォルト重み
    
    if (task.dependencies.length === 0) {
      memo.set(taskId, weight);
      return weight;
    }
    
    const maxPredDepth = Math.max(
      ...task.dependencies.map(depId => getDepth(depId))
    );
    
    const depth = maxPredDepth + weight;
    memo.set(taskId, depth);
    return depth;
  }
  
  // すべてのタスクについて計算
  let maxDepth = 0;
  for (const task of tasks) {
    maxDepth = Math.max(maxDepth, getDepth(task.id));
  }
  
  return maxDepth;
}

/**
 * @summary DAG構造に基づき最適なトポロジーを選択（Algorithm 1相当）
 * @description AdaptOrch論文のトポロジールーティングアルゴリズムを実装
 * @param plan - 分析対象のDAGプラン
 * @returns 選択されたトポロジー型
 */
export function routeTopology(plan: DAGPlan): TopologyType {
  const metrics = calculateDAGMetrics(plan);
  const { OMEGA_RATIO, COUPLING_DENSITY, MIN_SUBTASKS_FOR_HIERARCHY } = THRESHOLDS;
  
  // 空または単一タスク
  if (metrics.nodeCount <= 1) return "sequential";
  
  // 依存なし（完全並列）
  if (metrics.edgeCount === 0) return "parallel";
  
  // 並列化率
  const r = metrics.parallelismWidth / metrics.nodeCount;
  
  // 高結合かつ大規模 → 階層型（優先度: 高結合の管理が必要な場合）
  if (metrics.couplingDensity > COUPLING_DENSITY && metrics.nodeCount > MIN_SUBTASKS_FOR_HIERARCHY) {
    return "hierarchical";
  }
  
  // 完全順次（並列性なし）
  if (metrics.parallelismWidth === 1) return "sequential";
  
  // 広い並列性かつ低結合 → 並列型
  if (r > OMEGA_RATIO && metrics.couplingDensity <= COUPLING_DENSITY) {
    return "parallel";
  }
  
  // その他 → ハイブリッド（デフォルト）
  return "hybrid";
}

/**
 * @summary プランにトポロジー情報を付与
 * @param plan - 元のDAGプラン（topology未設定または上書き可）
 * @returns トポロジー情報が付与されたプラン
 */
export function enrichPlanWithTopology(plan: DAGPlan): DAGPlan {
  const topology = routeTopology(plan);
  const metrics = calculateDAGMetrics(plan);
  
  const enriched: DAGPlan = {
    ...plan,
    topology,
    metrics,
  };
  
  // hybridの場合はレイヤー情報も付与
  if (topology === "hybrid") {
    enriched.layers = topologicalLayers(plan.tasks);
  }
  
  return enriched;
}
