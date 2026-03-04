/**
 * @abdd.meta
 * path: .pi/lib/dag/index.ts
 * role: DAGモジュールの公開APIエントリーポイント
 * why: トポロジー適応型オーケストレーション機能を一元的に提供
 * related:
 *   - .pi/lib/dag/orchestrator.ts (主要実装)
 *   - .pi/lib/dag/types.ts (型定義)
 * public_api: すべての公開メンバが外部API
 */

// 型定義
export type {
  DAGPlan,
  DAGTask,
  DAGMetrics,
  TopologyType,
  ExecutionResult,
  TaskOutput,
  ValidationResult,
  TaskResult,
} from "./types.js";

// オーケストレータ
export {
  TopologyAwareOrchestrator,
  createOrchestrator,
  createDAGPlan,
  type OrchestratorConfig,
} from "./orchestrator.js";

// トポロジールーター
export {
  routeTopology,
  calculateDAGMetrics,
  topologicalLayers,
  enrichPlanWithTopology,
  THRESHOLDS,
} from "./topology-router.js";

// 合成プロトコル
export {
  calculateConsistencyScore,
  synthesizeOutputs,
  llmMergeOutputs,
  llmArbitrateOutputs,
  proposeRerouting,
  type SynthesisResult,
  type ConsistencyConfig,
} from "./synthesis.js";

// エグゼキュータ（必要に応じて）
export { BaseExecutor, type ExecutionContext } from "./executors/base-executor.js";
export { ParallelExecutor } from "./executors/parallel-executor.js";
export { SequentialExecutor } from "./executors/sequential-executor.js";
export { HierarchicalExecutor } from "./executors/hierarchical-executor.js";
export { HybridExecutor } from "./executors/hybrid-executor.js";
