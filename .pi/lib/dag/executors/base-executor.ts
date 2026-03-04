/**
 * @abdd.meta
 * path: .pi/lib/dag/executors/base-executor.ts
 * role: 全トポロジーエグゼキュータの共通インターフェースと基底機能
 * why: 実行戦略の抽象化により、トポロジー別実装の統一的な扱いを可能にする
 * related:
 *   - .pi/lib/dag/types.ts (型定義)
 *   - .pi/lib/dag/orchestrator.ts (オーケストレーター)
 * public_api:
 *   - Executor.execute(DAGPlan): Promise<ExecutionResult>
 *   - Executor.validate(DAGPlan): ValidationResult
 * invariants:
 *   - 全エグゼキュータはBaseExecutorを継承すること
 *   - execute()は必ずExecutionResultを返すこと
 * side_effects:
 *   - サブエージェントの実行（委譲）
 *   - ファイルシステムへの書き込み（タスク成果物）
 * failure_modes:
 *   - 依存タスク失敗時は後続タスクをスキップ
 *   - タイムアウト時はpartial resultを返す
 */

import { DAGPlan, DAGTask, ExecutionResult, TaskOutput, ValidationResult } from "../types.js";

/**
 * @summary エグゼキュータの抽象基底クラス
 */
export abstract class BaseExecutor {
  protected context: ExecutionContext;
  
  constructor(context: ExecutionContext = {}) {
    this.context = context;
  }
  
  /**
   * @summary プランを実行
   * @param plan - 実行対象のDAGプラン
   * @returns 実行結果
   */
  abstract execute(plan: DAGPlan): Promise<ExecutionResult>;
  
  /**
   * @summary プランの検証
   * @param plan - 検証対象のプラン
   * @returns 検証結果
   */
  validate(plan: DAGPlan): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // タスクIDの重複チェック
    const ids = plan.tasks.map(t => t.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      errors.push(`Duplicate task IDs: ${[...new Set(duplicates)].join(", ")}`);
    }
    
    // 依存関係の存在チェック
    for (const task of plan.tasks) {
      for (const depId of task.dependencies) {
        if (!ids.includes(depId)) {
          errors.push(`Task ${task.id} has unknown dependency: ${depId}`);
        }
      }
    }
    
    // write_set交差チェック（並列実行時の安全性）
    const writeSetConflicts = this.detectWriteSetConflicts(plan);
    if (writeSetConflicts.length > 0) {
      warnings.push(`Write set conflicts detected: ${writeSetConflicts.join("; ")}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * @summary write_setの交差を検出
   * @description 並列実行時のファイル競合を事前に検出
   */
  private detectWriteSetConflicts(plan: DAGPlan): string[] {
    const conflicts: string[] = [];
    const writeSets = new Map<string, string[]>();
    
    for (const task of plan.tasks) {
      if (task.writeSet && task.writeSet.length > 0) {
        writeSets.set(task.id, task.writeSet);
      }
    }
    
    // 単純な交差検出（より高度なパターンマッチングも可能）
    const entries = Array.from(writeSets.entries());
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [id1, set1] = entries[i];
        const [id2, set2] = entries[j];
        
        const intersection = set1.filter(p1 => 
          set2.some(p2 => this.pathsOverlap(p1, p2))
        );
        
        if (intersection.length > 0) {
          conflicts.push(`${id1} vs ${id2}: ${intersection.join(", ")}`);
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * @summary 2つのパスが重複するか判定
   */
  private pathsOverlap(p1: string, p2: string): boolean {
    // 完全一致または包含関係
    return p1 === p2 || p1.startsWith(p2 + "/") || p2.startsWith(p1 + "/");
  }
  
  /**
   * @summary 単一タスクを実行（サブエージェント委譲）
   * @protected
   */
  protected async executeTask(task: DAGTask, inputs: TaskOutput[]): Promise<TaskOutput> {
    // 実際の実装ではsubagent_runなどを呼び出す
    // ここではインターフェースのみ定義
    throw new Error("executeTask must be implemented by subclass or provided via context");
  }
}

/**
 * @summary 実行コンテキスト
 */
export interface ExecutionContext {
  /** サブエージェント実行関数（注入可能） */
  executeTaskFn?: (task: DAGTask, inputs: TaskOutput[]) => Promise<TaskOutput>;
  /** グローバル設定 */
  config?: Record<string, unknown>;
  /** ログ出力先 */
  logger?: Console;
}
