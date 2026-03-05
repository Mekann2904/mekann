/**
 * @abdd.meta
 * path: .pi/lib/dag/executors/hybrid-executor.ts
 * role: ハイブリッドトポロジーエグゼキュータ（τ_X）
 * why: レイヤー内並列・層間順次の実行で、依存関係を保ちつつ並列幅を最大化
 * related:
 *   - .pi/lib/dag/types.ts
 *   - .pi/lib/dag/topology-router.ts (レイヤー分割)
 *   - .pi/lib/dag/executors/base-executor.ts
 *   - .pi/lib/coordination/cross-instance-coordinator.ts（動的並列数制御）
 * public_api:
 *   - HybridExecutor.execute(DAGPlan): Promise<ExecutionResult>
 * invariants:
 *   - 同一レイヤー内のタスクは並列実行
 *   - レイヤー間は依存関係に従って順次実行
 *   - 前レイヤーの出力が後続レイヤーの入力として渡される
 *   - 並列数はクロスインスタンスコーディネータから動的に取得される
 * side_effects:
 *   - サブエージェントの並列・順次実行
 *   - コンテキストの累積伝播
 * failure_modes:
 *   - レイヤー内の一部失敗は設定に応じて継続または中止
 *   - クリティカルパス失敗時は全体を中止
 */

import { DAGPlan, DAGTask, ExecutionResult, TaskOutput } from "../types.js";
import { BaseExecutor, ExecutionContext } from "./base-executor.js";
import { topologicalLayers } from "../topology-router.js";
import { getDynamicParallelLimit } from "../../coordination/cross-instance-coordinator.js";

/**
 * @summary ハイブリッドエグゼキュータ（τ_X）
 * @description トポロジカルレイヤー内では並列、レイヤー間では順次実行
 * 並列数はクロスインスタンスコーディネータから動的に取得され、
 * インスタンス間の負荷分散とレート制限に自動的に適応する。
 */
export class HybridExecutor extends BaseExecutor {
  private outputs = new Map<string, TaskOutput>();
  
  constructor(context: ExecutionContext = {}) {
    super(context);
  }
  
  /**
   * @summary ハイブリッド実行: レイヤー内並列、層間順次
   */
  async execute(plan: DAGPlan): Promise<ExecutionResult> {
    const startTime = Date.now();
    const validation = this.validate(plan);
    
    if (!validation.valid) {
      return {
        planId: plan.id,
        status: "failure",
        taskResults: [],
        outputs: [],
        durationMs: 0,
      };
    }
    
    // レイヤー情報がなければ計算
    const layers = plan.layers || topologicalLayers(plan.tasks);
    
    this.context.logger?.log(`[HybridExecutor] Executing ${plan.tasks.length} tasks in ${layers.length} layers`);
    
    try {
      // レイヤー順に実行
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const layer = layers[layerIndex];
        const layerStart = Date.now();
        
        this.context.logger?.log(`[HybridExecutor] Layer ${layerIndex + 1}/${layers.length}: ${layer.length} tasks`);
        
        // レイヤー内並列実行
        const layerResults = await this.executeLayer(layer, layerIndex, plan);
        
        // 結果を記録
        for (const result of layerResults) {
          if (result.output) {
            this.outputs.set(result.taskId, result.output);
          }
        }
        
        const layerDuration = Date.now() - layerStart;
        this.context.logger?.log(`[HybridExecutor] Layer ${layerIndex + 1} completed in ${layerDuration}ms`);
        
        // 失敗チェック
        const failures = layerResults.filter(r => r.status === "failure");
        if (failures.length > 0 && plan.abortOnFirstError !== false) {
          return {
            planId: plan.id,
            status: "failure",
            taskResults: layerResults.map(r => ({
              taskId: r.taskId,
              status: r.status,
              error: r.error,
              durationMs: 0,
            })),
            outputs: Array.from(this.outputs.values()),
            durationMs: Date.now() - startTime,
          };
        }
      }
      
      // 最終出力の特定（シンクノードまたは最後のレイヤー）
      const finalOutput = this.identifyFinalOutput(plan, layers);
      
      return {
        planId: plan.id,
        status: "success",
        taskResults: plan.tasks.map(t => ({
          taskId: t.id,
          status: "success" as const,
          durationMs: 0,
        })),
        outputs: Array.from(this.outputs.values()),
        finalOutput,
        durationMs: Date.now() - startTime,
      };
      
    } catch (error) {
      return {
        planId: plan.id,
        status: "failure",
        taskResults: [],
        outputs: Array.from(this.outputs.values()),
        durationMs: Date.now() - startTime,
      };
    }
  }
  
  /**
   * @summary 単一レイヤーを並列実行
   * @description 動的並列数制御を使用してバッチ処理
   */
  private async executeLayer(
    layer: DAGTask[],
    layerIndex: number,
    plan: DAGPlan
  ): Promise<Array<{ taskId: string; status: "success" | "failure"; output?: TaskOutput; error?: string }>> {
    
    const fallbackConcurrency = plan.maxConcurrency || 3;
    
    // バッチ処理（動的並列度制限）
    const results: Array<{ taskId: string; status: "success" | "failure"; output?: TaskOutput; error?: string }> = [];
    
    let i = 0;
    while (i < layer.length) {
      // リアルタイムで並列数を取得
      const currentLimit = this.getDynamicConcurrency(fallbackConcurrency);
      
      const batchSize = Math.min(currentLimit, layer.length - i);
      const batch = layer.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async task => {
        try {
          // 依存タスクの出力を収集
          const inputs = task.dependencies
            .map(depId => this.outputs.get(depId))
            .filter((o): o is TaskOutput => o !== undefined);
          
          const output = await this.executeSingleTask(task, inputs);
          
          return {
            taskId: task.id,
            status: "success" as const,
            output,
          };
        } catch (error) {
          return {
            taskId: task.id,
            status: "failure" as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      i += batchSize;
    }
    
    return results;
  }
  
  /**
   * @summary 動的並列数を取得
   * @description クロスインスタンスコーディネータから現在の並列上限を取得。
   * コーディネータが初期化されていない場合はフォールバック値を使用。
   * @param fallback - コーディネータ未初期化時のフォールバック値
   * @returns 現在の並列実行上限
   */
  private getDynamicConcurrency(fallback: number): number {
    try {
      // 保留中のタスク数を考慮して動的に並列数を計算
      const dynamicLimit = getDynamicParallelLimit(0);
      return Math.max(1, Math.min(dynamicLimit, fallback));
    } catch {
      // コーディネータが初期化されていない場合はフォールバック
      return fallback;
    }
  }
  
  /**
   * @summary 単一タスクを実行
   */
  private async executeSingleTask(task: DAGTask, inputs: TaskOutput[]): Promise<TaskOutput> {
    if (this.context.executeTaskFn) {
      return this.context.executeTaskFn(task, inputs);
    }
    
    // デフォルト実装（プレースホルダー）
    return {
      taskId: task.id,
      status: "success",
      summary: `Executed: ${task.description}`,
      artifacts: [],
    };
  }
  
  /**
   * @summary 最終出力を特定（シンクノードまたは最後のレイヤー）
   */
  private identifyFinalOutput(plan: DAGPlan, layers: DAGTask[][]): TaskOutput | undefined {
    // シンクノード（他から参照されないタスク）を特定
    const allDepIds = new Set(plan.tasks.flatMap(t => t.dependencies));
    const sinkTaskIds = plan.tasks
      .filter(t => !allDepIds.has(t.id))
      .map(t => t.id);
    
    // シンクノードの出力を返す（最初の1つ）
    const outputs = sinkTaskIds
      .map(id => this.outputs.get(id))
      .filter((o): o is TaskOutput => o !== undefined);
    
    return outputs[0];
  }
}
