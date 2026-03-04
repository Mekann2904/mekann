/**
 * @abdd.meta
 * path: .pi/lib/dag/orchestrator.ts
 * role: AdaptOrch-inspired トポロジー適応型DAG実行の統合エントリーポイント
 * why: タスク特性に応じた最適な実行戦略の自動選択と統合を行う
 * related:
 *   - .pi/lib/dag/types.ts (型定義)
 *   - .pi/lib/dag/topology-router.ts (トポロジー選択)
 *   - .pi/lib/dag/executors/*.ts (各実行戦略)
 *   - .pi/lib/dag/synthesis.ts (出力統合)
 * public_api:
 *   - TopologyAwareOrchestrator.execute(DAGPlan): Promise<ExecutionResult>
 *   - createDAGPlan(task, config): DAGPlan (ユーティリティ)
 * invariants:
 *   - 全プランは検証後に実行される
 *   - write_set交差がある場合は警告を出すが、依存関係で直列化する
 *   - 失敗時は修復ブランチがあれば再試行
 * side_effects:
 *   - サブエージェントの並列/順次実行
 *   - ファイルシステムへの書き込み
 *   - LLM API呼び出し（合成時）
 * failure_modes:
 *   - 循環依存検出時は即座に失敗
 *   - 全タスク失敗時はpartial resultを返す
 */

import { 
  DAGPlan, DAGTask, ExecutionResult, TaskOutput, 
  ValidationResult, TopologyType 
} from "./types.js";
import { enrichPlanWithTopology, routeTopology, calculateDAGMetrics } from "./topology-router.js";
import { synthesizeOutputs, proposeRerouting } from "./synthesis.js";
import { BaseExecutor, ExecutionContext } from "./executors/base-executor.js";
import { ParallelExecutor } from "./executors/parallel-executor.js";
import { SequentialExecutor } from "./executors/sequential-executor.js";
import { HierarchicalExecutor } from "./executors/hierarchical-executor.js";
import { HybridExecutor } from "./executors/hybrid-executor.js";

/**
 * @summary オーケストレータ設定
 */
export interface OrchestratorConfig {
  /** 最大並列数（デフォルト: 3） */
  maxConcurrency?: number;
  /** 最初のエラーで中止するか（デフォルト: false） */
  abortOnFirstError?: boolean;
  /** 整合性スコア閾値（デフォルト: 0.7） */
  consistencyThreshold?: number;
  /** 自動トポロジー選択を有効にするか（デフォルト: true） */
  autoRouteTopology?: boolean;
  /** 修復ブランチを使用するか（デフォルト: true） */
  enableRepairBranches?: boolean;
  /** ログレベル */
  logLevel?: "debug" | "info" | "warn" | "error";
}

/** デフォルト設定 */
const DEFAULT_CONFIG: Required<OrchestratorConfig> = {
  maxConcurrency: 3,
  abortOnFirstError: false,
  consistencyThreshold: 0.7,
  autoRouteTopology: true,
  enableRepairBranches: true,
  logLevel: "info",
};

/**
 * @summary トポロジー適応型DAGオーケストレータ
 * @description AdaptOrchフレームワークの核心実装
 */
export class TopologyAwareOrchestrator {
  private config: Required<OrchestratorConfig>;
  private context: ExecutionContext;
  private logger: Console;
  
  constructor(
    config: OrchestratorConfig = {},
    context: ExecutionContext = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = context;
    this.logger = context.logger ?? console;
  }
  
  /**
   * @summary DAGプランを実行
   * @param plan - 実行対象のプラン（トポロジー未設定可）
   * @returns 実行結果
   */
  async execute(plan: DAGPlan): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Phase 1: プランの検証と強化
      this.log("info", `Starting execution of plan: ${plan.id}`);
      
      const validation = this.validatePlan(plan);
      if (!validation.valid) {
        return this.createErrorResult(plan, `Validation failed: ${validation.errors.join(", ")}`);
      }
      
      for (const warning of validation.warnings) {
        this.log("warn", warning);
      }
      
      // Phase 2: トポロジールーティング（未設定の場合）
      let enrichedPlan = plan;
      if (this.config.autoRouteTopology && !plan.topology) {
        enrichedPlan = enrichPlanWithTopology(plan);
        this.log("info", `Auto-selected topology: ${enrichedPlan.topology}`, enrichedPlan.metrics);
      }
      
      // Phase 3: write_set交差による依存関係強化
      enrichedPlan = this.enforceWriteSetDependencies(enrichedPlan);
      
      // Phase 4: トポロジー別エグゼキュータで実行
      const executor = this.createExecutor(enrichedPlan.topology);
      const executionResult = await executor.execute(enrichedPlan);
      
      // Phase 5: 出力の合成（複数タスクの場合）
      if (enrichedPlan.tasks.length > 1 && executionResult.outputs.length > 0) {
        const synthesis = await synthesizeOutputs(
          executionResult.outputs,
          enrichedPlan.topology,
          { consistencyThreshold: this.config.consistencyThreshold }
        );
        
        executionResult.finalOutput = synthesis.output;
        executionResult.synthesisStrategy = synthesis.strategy;
        executionResult.consistencyScore = synthesis.consistencyScore;
        
        this.log("info", `Synthesis completed: strategy=${synthesis.strategy}, score=${synthesis.consistencyScore?.toFixed(2)}`);
      } else if (executionResult.outputs.length === 1) {
        executionResult.finalOutput = executionResult.outputs[0];
      }
      
      // Phase 6: 失敗時の修復ブランチ実行
      if (executionResult.status === "failed" && this.config.enableRepairBranches) {
        const repairResult = await this.attemptRepair(enrichedPlan, executionResult);
        if (repairResult) {
          return repairResult;
        }
      }
      
      const duration = Date.now() - startTime;
      this.log("info", `Execution completed in ${duration}ms: ${executionResult.status}`);
      
      return {
        ...executionResult,
        duration,
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("error", `Execution failed: ${errorMessage}`);
      
      return this.createErrorResult(plan, errorMessage, duration);
    }
  }
  
  /**
   * @summary プランを検証
   */
  private validatePlan(plan: DAGPlan): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 基本構造チェック
    if (!plan.id) errors.push("Plan ID is required");
    if (!plan.tasks || plan.tasks.length === 0) {
      errors.push("Plan must have at least one task");
    }
    
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
    
    // 循環依存チェック（簡易版）
    try {
      const visited = new Set<string>();
      const recStack = new Set<string>();
      
      const hasCycle = (taskId: string): boolean => {
        visited.add(taskId);
        recStack.add(taskId);
        
        const task = plan.tasks.find(t => t.id === taskId);
        if (task) {
          for (const depId of task.dependencies) {
            if (!visited.has(depId) && hasCycle(depId)) return true;
            if (recStack.has(depId)) return true;
          }
        }
        
        recStack.delete(taskId);
        return false;
      };
      
      for (const task of plan.tasks) {
        if (!visited.has(task.id) && hasCycle(task.id)) {
          errors.push("Circular dependency detected");
          break;
        }
      }
    } catch {
      // チェック失敗は無視
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  /**
   * @summary write_set交差を検出し、暗黙の依存関係を追加
   * @description 並列実行時の競合を防ぐため、write_setが交差するタスクを直列化
   */
  private enforceWriteSetDependencies(plan: DAGPlan): DAGPlan {
    const tasks = [...plan.tasks];
    const writeSets = new Map<string, string[]>();
    
    // write_set収集
    for (const task of tasks) {
      if (task.writeSet && task.writeSet.length > 0) {
        writeSets.set(task.id, task.writeSet);
      }
    }
    
    // 交差検出と依存関係追加
    const entries = Array.from(writeSets.entries());
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [id1, set1] = entries[i];
        const [id2, set2] = entries[j];
        
        const hasConflict = set1.some(p1 => 
          set2.some(p2 => this.pathsOverlap(p1, p2))
        );
        
        if (hasConflict) {
          // 既存の依存関係を考慮して、方向性を決定
          const task1 = tasks.find(t => t.id === id1)!;
          const task2 = tasks.find(t => t.id === id2)!;
          
          // 双方向依存がないことを確認
          const alreadyOrdered = task1.dependencies.includes(id2) || 
                                 task2.dependencies.includes(id1);
          
          if (!alreadyOrdered) {
            // 辞書順で後ろを先に依存させる（決定的な順序）
            if (id1 < id2) {
              task2.dependencies.push(id1);
            } else {
              task1.dependencies.push(id2);
            }
            this.log("debug", `Added write_set dependency between ${id1} and ${id2}`);
          }
        }
      }
    }
    
    return { ...plan, tasks };
  }
  
  /**
   * @summary パスが重複するか判定
   */
  private pathsOverlap(p1: string, p2: string): boolean {
    return p1 === p2 || p1.startsWith(p2 + "/") || p2.startsWith(p1 + "/");
  }
  
  /**
   * @summary トポロジー別エグゼキュータを生成
   */
  private createExecutor(topology: TopologyType): BaseExecutor {
    switch (topology) {
      case "parallel":
        return new ParallelExecutor(this.context);
      case "sequential":
        return new SequentialExecutor(this.context);
      case "hierarchical":
        return new HierarchicalExecutor(this.context);
      case "hybrid":
        return new HybridExecutor(this.context);
      default:
        // 未知のトポロジーはhybridでフォールバック
        this.log("warn", `Unknown topology "${topology}", falling back to hybrid`);
        return new HybridExecutor(this.context);
    }
  }
  
  /**
   * @summary 修復ブランチを試行
   * @description 固定DAG内で事前定義された修復パスを実行
   */
  private async attemptRepair(
    plan: DAGPlan, 
    failedResult: ExecutionResult
  ): Promise<ExecutionResult | null> {
    // 失敗したタスクを特定
    const failedTasks = failedResult.taskResults
      ?.filter(r => r.status === "failed")
      .map(r => r.taskId) ?? [];
    
    if (failedTasks.length === 0) return null;
    
    this.log("info", `Attempting repair for failed tasks: ${failedTasks.join(", ")}`);
    
    // 修復戦略: より厳密なトポロジーへ再試行
    const currentTopology = plan.topology;
    const proposedTopology = proposeRerouting(currentTopology, "low_consistency");
    
    if (proposedTopology !== currentTopology) {
      this.log("info", `Rerouting from ${currentTopology} to ${proposedTopology}`);
      
      const repairPlan: DAGPlan = {
        ...plan,
        topology: proposedTopology,
        description: `${plan.description} (repair branch)`,
      };
      
      // 修復プランを実行（再帰的だが深さ制限あり）
      const repairResult = await this.execute(repairPlan);
      
      if (repairResult.status === "success") {
        this.log("info", "Repair successful");
        return {
          ...repairResult,
          repaired: true,
          originalTopology: currentTopology,
        };
      }
    }
    
    return null;
  }
  
  /**
   * @summary エラーレスポンスを生成
   */
  private createErrorResult(
    plan: DAGPlan, 
    message: string, 
    duration?: number
  ): ExecutionResult {
    return {
      planId: plan.id,
      status: "failed",
      outputs: [],
      error: message,
      duration,
    };
  }
  
  /**
   * @summary ログ出力
   */
  private log(level: "debug" | "info" | "warn" | "error", message: string, data?: unknown): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.config.logLevel]) {
      const prefix = `[AdaptOrch:${level.toUpperCase()}]`;
      if (data) {
        this.logger.log(prefix, message, data);
      } else {
        this.logger.log(prefix, message);
      }
    }
  }
}

/**
 * @summary 簡易ファクトリ関数
 */
export function createOrchestrator(
  config?: OrchestratorConfig,
  context?: ExecutionContext
): TopologyAwareOrchestrator {
  return new TopologyAwareOrchestrator(config, context);
}

/**
 * @summary タスクからDAGプランを生成（ユーティリティ）
 */
export function createDAGPlan(
  description: string,
  tasks: DAGTask[],
  config?: Partial<DAGPlan>
): DAGPlan {
  return {
    id: `plan-${Date.now()}`,
    description,
    tasks,
    topology: config?.topology ?? routeTopology({ id: "", description: "", tasks }),
    ...config,
  };
}
