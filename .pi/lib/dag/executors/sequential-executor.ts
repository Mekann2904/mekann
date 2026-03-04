/**
 * @abdd.meta
 * path: .pi/lib/dag/executors/sequential-executor.ts
 * role: 順次実行エグゼキュータ（τ_S）
 * why: 高結合タスクのため、依存関係を保ちつつ逐次実行する
 * related:
 *   - .pi/lib/dag/executors/base-executor.ts
 *   - .pi/lib/dag/topology-router.ts (sequential選択ロジック)
 * public_api:
 *   - SequentialExecutor.execute(DAGPlan): Promise<ExecutionResult>
 * invariants:
 *   - トポロジカル順序で厳密に実行すること
 *   - 各タスクは前段の全出力をコンテキストとして受け取ること
 * side_effects:
 *   - サブエージェントの順次実行
 * failure_modes:
 *   - いずれかのタスク失敗時は即座に中止（abortOnFirstError=true時）
 *   - 失敗しても継続するモードも提供（abortOnFirstError=false時）
 */

import { DAGPlan, DAGTask, ExecutionResult, TaskOutput, TaskResult } from "../types.js";
import { BaseExecutor } from "./base-executor.js";
import { topologicalLayers } from "../topology-router.js";

/**
 * @summary 順次実行エグゼキュータ
 * @description トポロジカル順序でタスクを1つずつ実行。各タスクは前段の累積出力を入力として受け取る。
 */
export class SequentialExecutor extends BaseExecutor {
  async execute(plan: DAGPlan): Promise<ExecutionResult> {
    const startTime = Date.now();
    const validation = this.validate(plan);
    if (!validation.valid) {
      return {
        planId: plan.id,
        status: "failure",
        taskResults: [],
        outputs: [],
        error: `Validation failed: ${validation.errors.join("; ")}`,
        durationMs: 0,
      };
    }
    
    // トポロジカルソート（レイヤー内は任意順、レイヤー間は順序保持）
    const layers = topologicalLayers(plan.tasks);
    const executionOrder = layers.flat();
    
    const outputs: TaskOutput[] = [];
    const taskResults: TaskResult[] = [];
    
    for (const task of executionOrder) {
      const taskStart = Date.now();
      try {
        // 依存タスクの出力を収集
        const depOutputs = task.dependencies
          .map(depId => outputs.find(o => o.taskId === depId))
          .filter((o): o is TaskOutput => o !== undefined);
        
        // タスク実行
        const output = await this.runTaskWithContext(task, depOutputs, outputs);
        outputs.push(output);
        taskResults.push({
          taskId: task.id,
          status: output.status === "failure" ? "failure" : "success",
          durationMs: Date.now() - taskStart,
        });
        
        // 失敗チェック
        if (output.status === "failure" && plan.abortOnFirstError !== false) {
          return {
            planId: plan.id,
            status: "failure",
            taskResults,
            outputs,
            error: `Task ${task.id} failed: ${output.error}`,
            durationMs: Date.now() - startTime,
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        taskResults.push({
          taskId: task.id,
          status: "failure",
          error: errorMsg,
          durationMs: Date.now() - taskStart,
        });
        if (plan.abortOnFirstError !== false) {
          return {
            planId: plan.id,
            status: "failure",
            taskResults,
            outputs,
            error: `Task ${task.id} error: ${errorMsg}`,
            durationMs: Date.now() - startTime,
          };
        }
      }
    }
    
    const allSuccess = outputs.every(o => o.status !== "failure");
    return {
      planId: plan.id,
      status: allSuccess ? "success" : "partial",
      taskResults,
      outputs,
      finalOutput: outputs[outputs.length - 1],
      durationMs: Date.now() - startTime,
    };
  }
  
  /**
   * @summary タスクを実行（累積コンテキスト付き）
   * @private
   */
  private async runTaskWithContext(
    task: DAGTask,
    depOutputs: TaskOutput[],
    allOutputs: TaskOutput[]
  ): Promise<TaskOutput> {
    // コンテキスト構築：依存タスクの出力 + これまでの全出力から関連情報を抽出
    const context = this.buildContext(task, depOutputs, allOutputs);
    
    // 実際の実行（context経由で注入された関数を使用）
    if (this.context.executeTaskFn) {
      return await this.context.executeTaskFn(task, context);
    }
    
    // フォールバック：モック実装
    return {
      taskId: task.id,
      status: "success",
      summary: `Executed ${task.id} with ${context.length} context inputs`,
      timestamp: Date.now(),
    };
  }
  
  /**
   * @summary 実行コンテキストを構築
   * @private
   */
  private buildContext(
    task: DAGTask,
    depOutputs: TaskOutput[],
    allOutputs: TaskOutput[]
  ): TaskOutput[] {
    // 戦略：直接依存 + 強い結合を持つタスクの出力を含める
    const context = [...depOutputs];
    
    // couplingがstrong/criticalの場合、追加のコンテキストを検討
    if ((task.coupling === "strong" || task.coupling === "critical") && task.readSet) {
      for (const readPath of task.readSet) {
        // readSetに関連する過去の出力を検索
        const related = allOutputs.filter(o => 
          o.artifacts?.some(a => a.includes(readPath)) ||
          o.files?.some(f => f.includes(readPath))
        );
        
        for (const r of related) {
          if (!context.find(c => c.taskId === r.taskId)) {
            context.push(r);
          }
        }
      }
    }
    
    return context;
  }
}
