/**
 * @abdd.meta
 * path: .pi/lib/dag/executors/hierarchical-executor.ts
 * role: 階層型トポロジー（τ_H）の実行エンジン
 * why: 大規模・高結合タスクでリードエージェントによる統合的調整が必要な場合に使用
 * related:
 *   - .pi/lib/dag/executors/base-executor.ts
 *   - docs/research/adaptorch.md (hierarchical executor仕様)
 * public_api:
 *   - HierarchicalExecutor.execute(DAGPlan): Promise<ExecutionResult>
 * invariants:
 *   - リードエージェントが常に存在し、進行状況を監視すること
 *   - サブエージェントはリードへの報告義務を持つこと
 * side_effects:
 *   - リードエージェントによる動的タスク割り当て
 *   - 中間成果物の集約と再配布
 * failure_modes:
 *   - サブタスク失敗時はリードが判断（再試行/スキップ/中止）
 *   - リード自身の失敗は致命的
 */

import { DAGPlan, DAGTask, ExecutionResult, TaskOutput } from "../types.js";
import { BaseExecutor, ExecutionContext } from "./base-executor.js";
import { topologicalLayers } from "../topology-router.js";

/**
 * @summary リードエージェントの状態管理
 */
interface LeadAgentState {
  completed: Map<string, TaskOutput>;
  failed: Set<string>;
  inProgress: Set<string>;
  pending: Set<string>;
}

/**
 * @summary 階層型エグゼキュータ
 * @description リードエージェントが分解→割り当て→監視→統合を行う
 */
export class HierarchicalExecutor extends BaseExecutor {
  private state: LeadAgentState;
  
  constructor(context: ExecutionContext = {}) {
    super(context);
    this.state = {
      completed: new Map(),
      failed: new Set(),
      inProgress: new Set(),
      pending: new Set(),
    };
  }
  
  /**
   * @summary 階層型実行のメインフロー
   * @param plan - 実行対象プラン
   * @returns 最終的な実行結果
   */
  async execute(plan: DAGPlan): Promise<ExecutionResult> {
    const startTime = Date.now();
    const taskMap = new Map(plan.tasks.map(t => [t.id, t]));
    
    // 初期化: すべてをpendingに
    for (const task of plan.tasks) {
      this.state.pending.add(task.id);
    }
    
    try {
      // Phase 1: リードエージェントによる初期分解と戦略決定
      const strategy = await this.leadDecompose(plan);
      
      // Phase 2: 依存関係を考慮した波状実行
      while (this.state.pending.size > 0 || this.state.inProgress.size > 0) {
        // 実行可能なタスクを特定（依存がすべて完了済み）
        const readyTasks = this.findReadyTasks(taskMap);
        
        if (readyTasks.length === 0 && this.state.inProgress.size === 0) {
          // デッドロック検出
          throw new Error("Deadlock detected: no ready tasks but pending remains");
        }
        
        // 並列度制限（maxConcurrency考慮）
        const slots = (plan.maxConcurrency || 3) - this.state.inProgress.size;
        const toExecute = readyTasks.slice(0, Math.max(0, slots));
        
        // サブエージェントへの委譲（並列実行）
        const executions = toExecute.map(task => this.delegateToSubAgent(task));
        
        // 完了待ち
        if (executions.length > 0) {
          await Promise.all(executions);
        }
        
        // 進捗がない場合は短い待機
        if (toExecute.length === 0) {
          await this.sleep(100);
        }
      }
      
      // Phase 3: 最終統合
      const finalOutput = await this.leadSynthesize(plan);
      const outputs = Array.from(this.state.completed.values());
      
      return {
        planId: plan.id,
        status: this.state.failed.size > 0 ? "partial" : "success",
        taskResults: outputs.map(o => ({ taskId: o.taskId, status: "success" as const, durationMs: 0 })),
        outputs,
        finalOutput,
        durationMs: Date.now() - startTime,
      };
      
    } catch (error) {
      const outputs = Array.from(this.state.completed.values());
      return {
        planId: plan.id,
        status: "failure",
        taskResults: outputs.map(o => ({ taskId: o.taskId, status: "success" as const, durationMs: 0 })),
        outputs,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }
  
  /**
   * @summary リードエージェントによる初期分解
   * @description 実際にはLLM呼び出しで戦略を決定
   */
  private async leadDecompose(plan: DAGPlan): Promise<ExecutionStrategy> {
    // MVP: 単純な戦略（全タスク実行）
    return {
      type: "execute-all",
      priorityOrder: plan.tasks.map(t => t.id),
    };
  }
  
  /**
   * @summary 実行可能なタスクを特定
   */
  private findReadyTasks(taskMap: Map<string, DAGTask>): DAGTask[] {
    const ready: DAGTask[] = [];
    
    for (const taskId of this.state.pending) {
      const task = taskMap.get(taskId)!;
      
      // すべての依存が完了済みかチェック
      const depsSatisfied = task.dependencies.every(depId => 
        this.state.completed.has(depId)
      );
      
      if (depsSatisfied) {
        ready.push(task);
      }
    }
    
    // 優先度順にソート
    return ready.sort((a, b) => {
      const prio = { high: 3, medium: 2, low: 1 };
      return (prio[b.priority || "medium"] || 2) - (prio[a.priority || "medium"] || 2);
    });
  }
  
  /**
   * @summary サブエージェントへの委譲
   */
  private async delegateToSubAgent(task: DAGTask): Promise<void> {
    this.state.pending.delete(task.id);
    this.state.inProgress.add(task.id);
    
    try {
      // 入力収集（依存タスクの出力）
      const inputs: TaskOutput[] = task.dependencies
        .map(depId => this.state.completed.get(depId))
        .filter((output): output is TaskOutput => output !== undefined);
      
      // サブエージェント実行
      const output = await this.executeSubTask(task, inputs);
      
      this.state.inProgress.delete(task.id);
      this.state.completed.set(task.id, output);
      
    } catch (error) {
      this.state.inProgress.delete(task.id);
      this.state.failed.add(task.id);
      
      // リードエージェントに判断を委ねる（MVPでは単純に記録）
      this.context.logger?.error(`Sub-agent failed for ${task.id}:`, error);
    }
  }
  
  /**
   * @summary サブタスク実行（実際のサブエージェント呼び出し）
   */
  private async executeSubTask(task: DAGTask, inputs: TaskOutput[]): Promise<TaskOutput> {
    if (this.context.executeTaskFn) {
      return await this.context.executeTaskFn(task, inputs);
    }
    
    // フォールバック: ダミー実装
    return {
      taskId: task.id,
      summary: `Executed ${task.id}`,
      timestamp: Date.now(),
    };
  }
  
  /**
   * @summary リードエージェントによる最終統合
   */
  private async leadSynthesize(plan: DAGPlan): Promise<TaskOutput> {
    const allOutputs = Array.from(this.state.completed.values());
    
    if (allOutputs.length === 0) {
      throw new Error("No successful outputs to synthesize");
    }
    
    if (allOutputs.length === 1) {
      return allOutputs[0];
    }
    
    // 実際にはLLMによる統合合成
    return {
      taskId: "synthesis",
      summary: `Synthesized ${allOutputs.length} sub-task results`,
      artifacts: allOutputs.flatMap(o => o.artifacts || []),
      timestamp: Date.now(),
    };
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * @summary 実行戦略
 */
interface ExecutionStrategy {
  type: "execute-all" | "selective" | "iterative";
  priorityOrder: string[];
}
