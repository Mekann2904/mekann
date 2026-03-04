/**
 * @abdd.meta
 * path: .pi/lib/dag/adaptorch-adapter.ts
 * role: 既存subagent_run_dagとの統合アダプター
 * why: AdaptOrchトポロジー適応型実行を既存APIから透過的に利用可能にする
 * related:
 *   - .pi/lib/dag/orchestrator.ts (新オーケストレータ)
 *   - .pi/extensions/subagents.ts (既存subagent_run_dag)
 *   - .pi/lib/dag-executor.ts (既存DagExecutor)
 * public_api:
 *   - executeWithAdaptOrch(task, plan, options): Promise<DagResult>
 * invariants:
 *   - 既存API互換性を維持
 *   - 自動トポロジー選択はopt-in（後方互換）
 * side_effects:
 *   - サブエージェント実行
 * failure_modes:
 *   - フォールバックして従来のexecuteDagを使用
 */

import { TaskPlan, TaskNode, DagResult, DagExecutorOptions } from "../dag-executor.js";
import { executeDag } from "../dag-executor.js";
import { 
  DAGPlan, DAGTask, ExecutionResult, TopologyType 
} from "./types.js";
import { TopologyAwareOrchestrator, OrchestratorConfig } from "./orchestrator.js";
import { enrichPlanWithTopology } from "./topology-router.js";

/**
 * @summary 既存TaskPlanを新DAGPlanに変換
 */
function convertToNewPlan(oldPlan: TaskPlan, topology?: TopologyType): DAGPlan {
  const tasks: DAGTask[] = oldPlan.tasks.map(t => ({
    id: t.id,
    description: t.description,
    assignedAgent: t.assignedAgent,
    dependencies: t.dependencies,
    // 推論によるデフォルト値
    taskType: inferTaskType(t.description),
    coupling: "weak", // デフォルト
  }));

  const newPlan: DAGPlan = {
    id: oldPlan.id,
    description: oldPlan.description || `Plan ${oldPlan.id}`,
    tasks,
    topology,
    maxConcurrency: 3,
    abortOnFirstError: false,
  };

  return topology ? enrichPlanWithTopology(newPlan) : newPlan;
}

/**
 * @summary タスク説明から種別を推論
 */
function inferTaskType(description: string): DAGTask["taskType"] {
  const d = description.toLowerCase();
  if (d.includes("test") || d.includes("verify") || d.includes("check")) {
    return "verification";
  }
  if (d.includes("review") || d.includes("audit")) {
    return "verification";
  }
  if (d.includes("implement") || d.includes("code") || d.includes("write")) {
    return "implementation";
  }
  if (d.includes("design") || d.includes("spec") || d.includes("define")) {
    return "contract";
  }
  if (d.includes("integrate") || d.includes("merge") || d.includes("combine")) {
    return "integration";
  }
  return "implementation";
}

/**
 * @summary 新ExecutionResultを旧DagResultに変換
 */
function convertToOldResult<T>(newResult: ExecutionResult): DagResult<T> {
  const taskResults = new Map<string, { status: "completed" | "failed"; output?: T; error?: Error }>();
  
  for (const tr of newResult.taskResults) {
    taskResults.set(tr.taskId, {
      status: tr.status === "success" ? "completed" : "failed",
      output: tr.outputs as T,
      error: tr.error ? new Error(tr.error) : undefined,
    });
  }

  const completedTaskIds = newResult.taskResults
    .filter(r => r.status === "success")
    .map(r => r.taskId);
  
  const failedTaskIds = newResult.taskResults
    .filter(r => r.status === "failure")
    .map(r => r.taskId);

  const skippedTaskIds = newResult.taskResults
    .filter(r => r.status === "skipped")
    .map(r => r.taskId);

  let overallStatus: "completed" | "partial" | "failed";
  if (failedTaskIds.length === 0) {
    overallStatus = "completed";
  } else if (completedTaskIds.length > 0) {
    overallStatus = "partial";
  } else {
    overallStatus = "failed";
  }

  return {
    overallStatus,
    taskResults,
    completedTaskIds,
    failedTaskIds,
    skippedTaskIds,
    totalDurationMs: newResult.durationMs,
  };
}

/**
 * @summary AdaptOrch統合実行オプション
 */
export interface AdaptOrchOptions extends DagExecutorOptions {
  /** AdaptOrchを有効化（デフォルト: false - 後方互換） */
  enableAdaptOrch?: boolean;
  /** 強制トポロジー（未指定時は自動選択） */
  forceTopology?: TopologyType;
  /** 整合性スコア閾値 */
  consistencyThreshold?: number;
}

/**
 * @summary subagent_run_dag用のAdaptOrch統合実行
 * @description 既存API互換性を保ちつつ、トポロジー適応型実行を提供
 * 
 * @param plan - タスクプラン（既存形式）
 * @param executor - タスク実行関数
 * @param options - 実行オプション（AdaptOrch拡張含む）
 * @returns DAG実行結果（既存形式）
 */
export async function executeWithAdaptOrch<T = unknown>(
  plan: TaskPlan,
  executor: (task: TaskNode, context: string) => Promise<T>,
  options: AdaptOrchOptions = {}
): Promise<DagResult<T>> {
  const { enableAdaptOrch, forceTopology, consistencyThreshold, ...legacyOptions } = options;

  // AdaptOrch無効時は従来通り
  if (!enableAdaptOrch) {
    return executeDag(plan, executor, legacyOptions);
  }

  try {
    // プラン変換
    const newPlan = convertToNewPlan(plan, forceTopology);
    
    // オーケストレータ設定
    const orchConfig: OrchestratorConfig = {
      maxConcurrency: options.maxConcurrency ?? 3,
      abortOnFirstError: options.abortOnFirstError ?? false,
      consistencyThreshold: consistencyThreshold ?? 0.7,
      autoRouteTopology: !forceTopology,
      enableRepairBranches: true,
    };

    // コンテキスト構築
    const context = {
      executeTaskFn: async (task: DAGTask, inputs: any[]) => {
        // 依存タスクの出力をコンテキスト文字列に変換
        const contextStr = inputs.map((inp, i) => 
          `## Input from ${inp.taskId || `task-${i}`}\n${inp.summary || ""}`
        ).join("\n\n");

        // 旧形式のTaskNodeに変換してexecutorを呼び出し
        const oldTask: TaskNode = {
          id: task.id,
          description: task.description,
          assignedAgent: task.assignedAgent,
          dependencies: task.dependencies,
        };

        const result = await executor(oldTask, contextStr);
        
        // 結果を新TaskOutput形式に変換
        return {
          taskId: task.id,
          summary: typeof result === "string" ? result : JSON.stringify(result),
          files: [],
          artifacts: [],
        };
      },
    };

    // 実行
    const orchestrator = new TopologyAwareOrchestrator(orchConfig, context);
    const newResult = await orchestrator.execute(newPlan);

    // 結果を旧形式に変換して返す
    return convertToOldResult<T>(newResult);

  } catch (error) {
    // 失敗時は従来のexecuteDagにフォールバック
    console.warn(`[AdaptOrch] Failed, falling back to legacy executor: ${error}`);
    return executeDag(plan, executor, legacyOptions);
  }
}

/**
 * @summary グローバル設定でAdaptOrchを有効化
 * @description 全てのsubagent_run_dagで自動的にAdaptOrchを使用
 */
let globalAdaptOrchEnabled = false;

export function setGlobalAdaptOrchEnabled(enabled: boolean): void {
  globalAdaptOrchEnabled = enabled;
  console.log(`[AdaptOrch] Globally ${enabled ? "enabled" : "disabled"}`);
}

export function isGlobalAdaptOrchEnabled(): boolean {
  return globalAdaptOrchEnabled;
}

/**
 * @summary 後方互換性のあるラッパー
 * @description グローバル設定に基づき自動的にAdaptOrchを使用
 */
export async function executeDagWithFallback<T = unknown>(
  plan: TaskPlan,
  executor: (task: TaskNode, context: string) => Promise<T>,
  options: AdaptOrchOptions = {}
): Promise<DagResult<T>> {
  const effectiveEnable = options.enableAdaptOrch ?? globalAdaptOrchEnabled;
  return executeWithAdaptOrch(plan, executor, {
    ...options,
    enableAdaptOrch: effectiveEnable,
  });
}
