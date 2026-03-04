/**
 * @abdd.meta
 * path: .pi/lib/dag/executors/parallel-executor.ts
 * role: 完全並列実行エグゼキュータ（τ_P）
 * why: 依存関係のないタスクを最大限並列化し、レイテンシを最小化
 * related:
 *   - .pi/lib/dag/executors/base-executor.ts
 *   - .pi/lib/dag/topology-router.ts（parallel選択時に使用）
 * public_api:
 *   - ParallelExecutor.execute(DAGPlan): ExecutionResult
 * invariants:
 *   - 全タスクは独立したコンテキストで同時実行される
 *   - write_set交差がある場合は警告を出力（実行は継続）
 * side_effects:
 *   - maxConcurrency個のサブエージェントを同時起動
 * failure_modes:
 *   - 一部タスク失敗時も他タスクは継続
 *   - 全失敗時はexecutionResult.status = "failed"
 */

import { BaseExecutor, ExecutionContext } from "./base-executor.js";
import { DAGPlan, DAGTask, ExecutionResult, TaskOutput } from "../types.js";

/**
 * @summary 並列エグゼキュータ（τ_P: Parallel Topology）
 * @description Claude Code Agent Teams方式：各サブエージェントを独立して同時起動
 */
export class ParallelExecutor extends BaseExecutor {
  async execute(plan: DAGPlan): Promise<ExecutionResult> {
    const validation = this.validate(plan);
    if (!validation.valid) {
      return {
        status: "failed",
        outputs: [],
        errors: validation.errors,
        metrics: { durationMs: 0, taskCount: plan.tasks.length },
      };
    }
    
    const startTime = Date.now();
    const maxConcurrency = plan.maxConcurrency || 3;
    
    // write_set警告をログ出力
    if (validation.warnings.length > 0) {
      this.context.logger?.warn("Parallel execution warnings:", validation.warnings);
    }
    
    // 全タスクを同時に起動（制限付き）
    const executing = new Map<string, Promise<TaskOutput>>();
    const results = new Map<string, TaskOutput>();
    const errors = new Map<string, Error>();
    
    // 依存関係を無視して全タスクを並列実行（前提：routerが適切に選択）
    for (const task of plan.tasks) {
      while (executing.size >= maxConcurrency) {
        // スロットが空くまで待機
        await Promise.race(executing.values());
      }
      
      const promise = this.runTask(task, []);
      executing.set(task.id, promise);
      
      promise
        .then(output => {
          results.set(task.id, output);
        })
        .catch(err => {
          errors.set(task.id, err as Error);
        })
        .finally(() => {
          executing.delete(task.id);
        });
    }
    
    // 残りのタスクを待機
    await Promise.all(executing.values());
    
    const durationMs = Date.now() - startTime;
    
    // 結果集約
    const outputs: TaskOutput[] = plan.tasks
      .map(t => results.get(t.id))
      .filter((o): o is TaskOutput => o !== undefined);
    
    const errorList = Array.from(errors.entries()).map(([id, err]) => 
      `${id}: ${err.message}`
    );
    
    return {
      status: errors.size === 0 ? "success" : (errors.size < plan.tasks.length ? "partial" : "failed"),
      outputs,
      errors: errorList,
      metrics: {
        durationMs,
        taskCount: plan.tasks.length,
        successCount: results.size,
        failureCount: errors.size,
      },
    };
  }
  
  /**
   * @summary 単一タスク実行（ラッパー）
   */
  private async runTask(task: DAGTask, inputs: TaskOutput[]): Promise<TaskOutput> {
    if (this.context.executeTaskFn) {
      return this.context.executeTaskFn(task, inputs);
    }
    return super.executeTask(task, inputs);
  }
}
