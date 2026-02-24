/**
 * @abdd.meta
 * path: .pi/lib/tool-executor.ts
 * role: 融合操作の分解・実行・結果統合を行う実行エンジン
 * why: ToolFuserで生成された融合操作を実際に実行し、並列/順次実行を制御して結果を元のツール呼び出しに対応付けるため
 * related: .pi/lib/tool-compiler-types.ts, .pi/lib/tool-fuser.ts, .pi/lib/concurrency.ts
 * public_api: ToolExecutor, executeCompiled, executeFusedOperation
 * invariants: 実行中のツール数はmaxParallelismを超えない、エラー時は適切にロールバック情報を保持する
 * side_effects: 外部ツールの実行、AbortSignalの監視、進捗コールバックの呼び出し
 * failure_modes: タイムアウト、ツール実行エラー、中断シグナル、依存関係の未解決
 * @abdd.explain
 * overview: CompilationResultを受け取り、融合操作を実際に実行してExecutionResultを生成する
 * what_it_does:
 *   - 融合操作を依存関係順に実行する（並列実行可能なものは並列化）
 *   - 各ツールの実行結果を収集し、元のツールIDに対応付ける
 *   - AbortSignalによるキャンセルをサポートする
 *   - 進捗コールバックで実行状況を通知する
 *   - エラー時も部分結果を保持し、デバッグ情報を提供する
 * why_it_exists:
 *   - 融合された操作を実際のツール呼び出しに分解して実行するため
 *   - 並列実行による高速化とリソース管理を統合するため
 * scope:
 *   in: CompilationResult、ツール実行関数、AbortSignal、進捗コールバック
 *   out: ExecutionResult（全ツールの実行結果、統計情報）
 */

// File: .pi/lib/tool-executor.ts
// Description: Executes fused operations from ToolFuser with parallel/sequential control.
// Why: Decomposes and executes fused operations, mapping results back to original tool calls.
// Related: .pi/lib/tool-compiler-types.ts, .pi/lib/tool-fuser.ts, .pi/lib/concurrency.ts

import { randomBytes } from "node:crypto";
import {
  type ToolCall,
  type FusedOperation,
  type CompilationResult,
  type ToolExecutionResult,
  type FusedExecutionResult,
  type ExecutionResult,
  type ToolExecutorFn,
  type ProgressCallback,
  type FusionConfig,
  DEFAULT_FUSION_CONFIG,
} from "./tool-compiler-types.js";
import { runWithConcurrencyLimit } from "./concurrency.js";
import { createChildAbortController } from "./abort-utils.js";

/**
 * ツール実行エンジン
 * 融合操作の分解・実行・結果統合を行う
 * @summary ツール実行エンジン
 */
export class ToolExecutor {
  private config: FusionConfig;
  private debug: (message: string) => void;

  /**
   * ToolExecutorインスタンスを作成
   * @param config - 実行設定
   * @summary ToolExecutorコンストラクタ
   */
  constructor(config: Partial<FusionConfig> = {}) {
    this.config = { ...DEFAULT_FUSION_CONFIG, ...config };
    this.debug = this.config.debugMode
      ? (msg) => console.debug(`[ToolExecutor] ${msg}`)
      : () => {};
  }

  /**
   * コンパイル結果を実行
   * @param compilation - コンパイル結果
   * @param executorFn - ツール実行関数
   * @param signal - 中止シグナル（オプション）
   * @param onProgress - 進捗コールバック（オプション）
   * @returns 実行結果
   * @summary コンパイル結果実行
   */
  async execute(
    compilation: CompilationResult,
    executorFn: ToolExecutorFn,
    signal?: AbortSignal,
    onProgress?: ProgressCallback
  ): Promise<ExecutionResult> {
    const executionId = this.generateId("exec");
    const startTime = Date.now();

    // 入力検証
    if (!compilation.success) {
      return this.createErrorResult(
        executionId,
        compilation,
        0,
        `コンパイルが失敗しています: ${compilation.error || "不明なエラー"}`
      );
    }

    if (compilation.fusedOperations.length === 0) {
      return this.createEmptyResult(executionId, compilation, 0);
    }

    // 中止チェック
    if (signal?.aborted) {
      return this.createErrorResult(
        executionId,
        compilation,
        0,
        "実行開始前に中止されました"
      );
    }

    // 子AbortControllerを作成
    const { controller: childController, cleanup } = createChildAbortController(signal);
    const effectiveSignal = childController.signal;

    try {
      const fusedResults: FusedExecutionResult[] = [];
      const allToolResults = new Map<string, ToolExecutionResult>();
      let totalParallelTime = 0;

      // 依存関係に基づいて段階的に実行
      const executed = new Set<string>();
      const remaining = [...compilation.fusedOperations];

      while (remaining.length > 0) {
        // 中止チェック
        if (effectiveSignal.aborted) {
          throw new Error("実行が中止されました");
        }

        // 実行可能な操作を収集（依存関係が全て解決済み）
        const readyOps = remaining.filter((op) =>
          op.dependsOnFusedIds.every((depId) => executed.has(depId))
        );

        if (readyOps.length === 0) {
          // デッドロック検出
          const remainingIds = remaining.map((op) => op.fusedId).join(", ");
          throw new Error(`デッドロック検出: 残り操作 [${remainingIds}] の依存関係を解決できません`);
        }

        // 並列実行可能な操作を実行
        const parallelOps = readyOps.filter((op) => op.canExecuteInParallel);
        const sequentialOps = readyOps.filter((op) => !op.canExecuteInParallel);

        // 並列実行
        if (parallelOps.length > 0) {
          const parallelResults = await this.executeOperationsParallel(
            parallelOps,
            executorFn,
            effectiveSignal,
            onProgress,
            allToolResults
          );
          fusedResults.push(...parallelResults);

          for (const op of parallelOps) {
            executed.add(op.fusedId);
            const idx = remaining.findIndex((r) => r.fusedId === op.fusedId);
            if (idx >= 0) remaining.splice(idx, 1);
          }
        }

        // 順次実行（並列実行可能な操作がない場合）
        if (sequentialOps.length > 0 && parallelOps.length === 0) {
          const seqResult = await this.executeOperationSequential(
            sequentialOps[0], // 1つずつ実行
            executorFn,
            effectiveSignal,
            onProgress,
            allToolResults
          );
          fusedResults.push(seqResult);

          executed.add(sequentialOps[0].fusedId);
          const idx = remaining.findIndex((r) => r.fusedId === sequentialOps[0].fusedId);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      }

      const totalExecutionTimeMs = Date.now() - startTime;

      // 成功判定
      const allSuccess = fusedResults.every((r) => r.success);

      // 節約時間の推定（並列実行分）
      const savedTimeMs = this.calculateSavedTime(
        fusedResults,
        compilation.originalToolCount
      );

      const result: ExecutionResult = {
        executionId,
        compilation,
        fusedResults,
        allToolResults,
        success: allSuccess,
        totalExecutionTimeMs,
        savedTokens: compilation.totalTokenSavings,
        savedTimeMs,
        errorSummary: allSuccess ? undefined : this.buildErrorSummary(fusedResults),
      };

      this.debug(
        `実行完了: ${compilation.originalToolCount}ツール, ${totalExecutionTimeMs}ms, 節約: ${savedTimeMs}ms`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.debug(`実行エラー: ${errorMessage}`);
      return this.createErrorResult(
        executionId,
        compilation,
        Date.now() - startTime,
        errorMessage
      );
    } finally {
      cleanup();
    }
  }

  /**
   * 融合操作を並列実行
   * @param operations - 実行する融合操作配列
   * @param executorFn - ツール実行関数
   * @param signal - 中止シグナル
   * @param onProgress - 進捗コールバック
   * @param allResults - 全結果を格納するマップ
   * @returns 融合実行結果配列
   * @summary 並列実行
   */
  private async executeOperationsParallel(
    operations: FusedOperation[],
    executorFn: ToolExecutorFn,
    signal: AbortSignal,
    onProgress: ProgressCallback | undefined,
    allResults: Map<string, ToolExecutionResult>
  ): Promise<FusedExecutionResult[]> {
    // 進捗通知
    for (const op of operations) {
      onProgress?.(op.fusedId, "starting", `${op.toolIds.length}ツールを並列実行`);
    }

    // 並列実行制限を適用
    const limit = Math.min(this.config.maxParallelism, operations.length);

    const results = await runWithConcurrencyLimit(
      operations,
      limit,
      async (op) => {
        return this.executeFusedOperation(op, executorFn, signal, onProgress, allResults);
      },
      { signal, abortOnError: false }
    );

    return results;
  }

  /**
   * 融合操作を順次実行
   * @param operation - 実行する融合操作
   * @param executorFn - ツール実行関数
   * @param signal - 中止シグナル
   * @param onProgress - 進捗コールバック
   * @param allResults - 全結果を格納するマップ
   * @returns 融合実行結果
   * @summary 順次実行
   */
  private async executeOperationSequential(
    operation: FusedOperation,
    executorFn: ToolExecutorFn,
    signal: AbortSignal,
    onProgress: ProgressCallback | undefined,
    allResults: Map<string, ToolExecutionResult>
  ): Promise<FusedExecutionResult> {
    onProgress?.(operation.fusedId, "starting", `${operation.toolIds.length}ツールを順次実行`);

    const result = await this.executeFusedOperation(
      operation,
      executorFn,
      signal,
      onProgress,
      allResults
    );

    return result;
  }

  /**
   * 単一の融合操作を実行
   * @param operation - 融合操作
   * @param executorFn - ツール実行関数
   * @param signal - 中止シグナル
   * @param onProgress - 進捗コールバック
   * @param allResults - 全結果を格納するマップ
   * @returns 融合実行結果
   * @summary 融合操作実行
   */
  private async executeFusedOperation(
    operation: FusedOperation,
    executorFn: ToolExecutorFn,
    signal: AbortSignal,
    onProgress: ProgressCallback | undefined,
    allResults: Map<string, ToolExecutionResult>
  ): Promise<FusedExecutionResult> {
    const startTime = Date.now();
    const toolResults = new Map<string, ToolExecutionResult>();
    const failedToolIds: string[] = [];

    // 実行戦略に基づいてツールを実行
    if (operation.executionStrategy === "parallel" && operation.toolCalls.length > 1) {
      // 並列実行
      const results = await runWithConcurrencyLimit(
        operation.toolCalls,
        Math.min(this.config.maxParallelism, operation.toolCalls.length),
        async (call) => {
          return this.executeSingleTool(call, executorFn, signal);
        },
        { signal, abortOnError: false }
      );

      for (let i = 0; i < operation.toolCalls.length; i++) {
        const call = operation.toolCalls[i];
        const result = results[i];
        toolResults.set(call.id, result);
        allResults.set(call.id, result);
        if (!result.success) {
          failedToolIds.push(call.id);
        }
      }
    } else {
      // 順次実行（batch含む）
      for (const call of operation.toolCalls) {
        if (signal.aborted) {
          const errorResult: ToolExecutionResult = {
            toolId: call.id,
            toolName: call.name,
            success: false,
            error: "実行が中止されました",
            errorObject: new Error("実行が中止されました"),
            executionTimeMs: 0,
          };
          toolResults.set(call.id, errorResult);
          allResults.set(call.id, errorResult);
          failedToolIds.push(call.id);
          continue;
        }

        const result = await this.executeSingleTool(call, executorFn, signal);
        toolResults.set(call.id, result);
        allResults.set(call.id, result);
        if (!result.success) {
          failedToolIds.push(call.id);
        }
      }
    }

    const totalExecutionTimeMs = Date.now() - startTime;
    const success = failedToolIds.length === 0;

    // 進捗通知
    onProgress?.(
      operation.fusedId,
      success ? "completed" : "failed",
      success
        ? `${operation.toolIds.length}ツール完了`
        : `${failedToolIds.length}ツール失敗`
    );

    return {
      fusedId: operation.fusedId,
      toolResults,
      success,
      totalExecutionTimeMs,
      wasParallel: operation.executionStrategy === "parallel" && operation.toolCalls.length > 1,
      failedToolIds,
    };
  }

  /**
   * 単一のツールを実行
   * @param call - ツール呼び出し
   * @param executorFn - ツール実行関数
   * @param signal - 中止シグナル
   * @returns ツール実行結果
   * @summary 単一ツール実行
   */
  private async executeSingleTool(
    call: ToolCall,
    executorFn: ToolExecutorFn,
    signal: AbortSignal
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (signal.aborted) {
        return {
          toolId: call.id,
          toolName: call.name,
          success: false,
          error: "実行が中止されました",
          errorObject: new Error("実行が中止されました"),
          executionTimeMs: 0,
        };
      }

      const result = await executorFn(call.name, call.arguments, signal);
      const executionTimeMs = Date.now() - startTime;

      return {
        toolId: call.id,
        toolName: call.name,
        success: true,
        result,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.debug(`ツール実行エラー: ${call.name} - ${errorMessage}`);

      return {
        toolId: call.id,
        toolName: call.name,
        success: false,
        error: errorMessage,
        errorObject: error instanceof Error ? error : new Error(errorMessage),
        executionTimeMs,
      };
    }
  }

  /**
   * 節約時間を計算
   * @param fusedResults - 融合実行結果配列
   * @param originalToolCount - 元のツール数
   * @returns 節約時間（ミリ秒）
   * @summary 節約時間計算
   */
  private calculateSavedTime(
    fusedResults: FusedExecutionResult[],
    originalToolCount: number
  ): number {
    // 並列実行された融合操作から節約時間を計算
    let savedTimeMs = 0;

    for (const result of fusedResults) {
      if (result.wasParallel && result.toolResults.size > 1) {
        // 並列実行の場合、順次実行時間 - 実際の実行時間 = 節約時間
        const sequentialTime = Array.from(result.toolResults.values()).reduce(
          (sum, r) => sum + r.executionTimeMs,
          0
        );
        savedTimeMs += Math.max(0, sequentialTime - result.totalExecutionTimeMs);
      }
    }

    return savedTimeMs;
  }

  /**
   * エラーサマリーを構築
   * @param fusedResults - 融合実行結果配列
   * @returns エラーサマリー
   * @summary エラーサマリー構築
   */
  private buildErrorSummary(fusedResults: FusedExecutionResult[]): string {
    const errors: string[] = [];

    for (const result of fusedResults) {
      if (!result.success) {
        for (const [toolId, toolResult] of result.toolResults) {
          if (!toolResult.success) {
            errors.push(`${toolResult.toolName}(${toolId}): ${toolResult.error}`);
          }
        }
      }
    }

    if (errors.length === 0) {
      return "不明なエラー";
    }

    if (errors.length <= 3) {
      return errors.join("; ");
    }

    return `${errors.slice(0, 3).join("; ")} 他${errors.length - 3}件`;
  }

  /**
   * 空の結果を作成
   * @summary 空結果作成
   */
  private createEmptyResult(
    executionId: string,
    compilation: CompilationResult,
    executionTimeMs: number
  ): ExecutionResult {
    return {
      executionId,
      compilation,
      fusedResults: [],
      allToolResults: new Map(),
      success: true,
      totalExecutionTimeMs: executionTimeMs,
      savedTokens: 0,
      savedTimeMs: 0,
    };
  }

  /**
   * エラー結果を作成
   * @summary エラー結果作成
   */
  private createErrorResult(
    executionId: string,
    compilation: CompilationResult,
    executionTimeMs: number,
    errorMessage: string
  ): ExecutionResult {
    return {
      executionId,
      compilation,
      fusedResults: [],
      allToolResults: new Map(),
      success: false,
      totalExecutionTimeMs: executionTimeMs,
      savedTokens: 0,
      savedTimeMs: 0,
      errorSummary: errorMessage,
    };
  }

  /**
   * 一意識別子を生成
   * @param prefix - IDプレフィックス
   * @returns 一意識別子
   * @summary ID生成
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString("hex");
    return `${prefix}_${timestamp}_${random}`;
  }
}

/**
 * コンパイル結果を実行する便利関数
 * @param compilation - コンパイル結果
 * @param executorFn - ツール実行関数
 * @param signal - 中止シグナル（オプション）
 * @param onProgress - 進捗コールバック（オプション）
 * @param config - 実行設定（オプション）
 * @returns 実行結果
 * @summary コンパイル実行便利関数
 */
export async function executeCompiled(
  compilation: CompilationResult,
  executorFn: ToolExecutorFn,
  signal?: AbortSignal,
  onProgress?: ProgressCallback,
  config?: Partial<FusionConfig>
): Promise<ExecutionResult> {
  const executor = new ToolExecutor(config);
  return executor.execute(compilation, executorFn, signal, onProgress);
}

/**
 * 単一の融合操作を実行する便利関数
 * @param operation - 融合操作
 * @param executorFn - ツール実行関数
 * @param signal - 中止シグナル（オプション）
 * @param onProgress - 進捗コールバック（オプション）
 * @param config - 実行設定（オプション）
 * @returns 融合実行結果
 * @summary 融合操作実行便利関数
 */
export async function executeFusedOperation(
  operation: FusedOperation,
  executorFn: ToolExecutorFn,
  signal?: AbortSignal,
  onProgress?: ProgressCallback,
  config?: Partial<FusionConfig>
): Promise<FusedExecutionResult> {
  const executor = new ToolExecutor(config);
  const allResults = new Map<string, ToolExecutionResult>();
  const effectiveSignal = signal || new AbortController().signal;

  return executor["executeFusedOperation"](
    operation,
    executorFn,
    effectiveSignal,
    onProgress,
    allResults
  );
}
