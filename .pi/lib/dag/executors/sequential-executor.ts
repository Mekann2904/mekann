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

import { DAGPlan, DAGTask, ExecutionResult, TaskOutput } from "../types.js";
import { BaseExecutor } from "./base-executor.js";
import { topologicalLayers } from "../topology-router.js";

/**
 * @summary 順次実行エグゼキュータ
 * @description トポロジカル順序でタスクを1つずつ実行。各タスクは前段の累積出力を入力として受け取る。
 */
export class SequentialExecutor extends BaseExecutor {
  async execute(plan: DAGPlan): Promise<ExecutionResult> {
    const validation = this.validate(plan);
    if (!validation.valid) {
      return {
        status: "failed",
        outputs: [],
        error: `Validation failed: ${validation.errors.join("; ")}`,
      };
    }
    
    // トポロジカルソート（レイヤー内は任意順、レイヤー間は順序保持）
    const layers = topologicalLayers(plan.tasks);
    const executionOrder = layers.flat();
    
    const outputs: TaskOutput[] = [];
    const taskMap = new Map(plan.tasks.map(t => [t.id, t]));
    
    for (const task of executionOrder) {
      try {
        // 依存タスクの出力を収集
        const depOutputs = task.dependencies
          .map(depId => outputs.find(o => o.taskId === depId))
          .filter((o): o is TaskOutput => o !== undefined);
        
        // タスク実行
        const output = await this.runTaskWithContext(task, depOutputs, outputs);
        outputs.push(output);
        
        // 失敗チェック
        if (output.status === "failed" && plan.abortOnFirstError !== false) {
          return {
            status: "failed",
            outputs,
            error: `Task ${task.id} failed: ${output.error}`,
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (plan.abortOnFirstError !== false) {
          return {
            status: "failed",
            outputs,
            error: `Task ${task.id} error: ${errorMsg}`,
          };
        }
      }
    }
    
    return {
      status: outputs.every(o => o.status !== "failed") ? "success" : "partial",
      outputs,
      finalOutput: outputs[outputs.length - 1], // 最後の出力を最終成果とする
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
