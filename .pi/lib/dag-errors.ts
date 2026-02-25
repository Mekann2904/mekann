/**
 * @abdd.meta
 * path: .pi/lib/dag-errors.ts
 * role: DAG実行に関連するエラー型定義
 * why: DAG実行時のエラーを型安全に分類・処理するため
 * related: .pi/lib/dag-executor.ts, .pi/lib/dag-validator.ts
 * public_api: DagExecutionError, TaskValidationError, DagErrorCode
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: DAG実行プロセスで発生するエラーを分類するカスタムエラー型
 * what_it_does:
 *   - DagExecutionError: DAG実行全般のエラー
 *   - TaskValidationError: タスク検証時のエラー
 *   - エラーコードによる分類
 * why_it_exists:
 *   - エラーの種類に応じた適切な処理を可能にするため
 *   - デバッグとエラーレポートの品質向上
 * scope:
 *   in: なし
 *   out: DAG実行エラー型
 */

// File: .pi/lib/dag-errors.ts
// Description: Error types for DAG execution.
// Why: Provides typed error handling for DAG execution failures.
// Related: .pi/lib/dag-executor.ts, .pi/lib/dag-validator.ts

/**
 * DAG実行エラーコード
 * @summary エラーコード
 */
export type DagErrorCode =
  | "CYCLE_DETECTED"
  | "VALIDATION_FAILED"
  | "TASK_FAILED"
  | "ABORTED"
  | "MISSING_DEPENDENCY"
  | "DUPLICATE_TASK_ID";

/**
 * DAG実行エラー
 * @summary DAG実行エラー
 * @param code - エラーコード
 * @param taskId - 関連タスクID（該当する場合）
 */
export class DagExecutionError extends Error {
  /** エラーコード */
  public readonly code: DagErrorCode;
  /** 関連タスクID */
  public readonly taskId?: string;

  /**
   * DAG実行エラーを作成
   * @param message - エラーメッセージ
   * @param code - エラーコード
   * @param taskId - 関連タスクID（省略可）
   */
  constructor(message: string, code: DagErrorCode, taskId?: string) {
    super(message);
    this.name = "DagExecutionError";
    this.code = code;
    this.taskId = taskId;
  }

  /**
   * エラー情報を文字列表現で返す
   * @summary エラー文字列
   * @returns フォーマットされたエラー文字列
   */
  override toString(): string {
    const taskInfo = this.taskId ? ` (task: ${this.taskId})` : "";
    return `${this.name}[${this.code}]${taskInfo}: ${this.message}`;
  }

  /**
   * JSON表現を返す
   * @summary JSON表現
   * @returns エラーのJSON表現
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      taskId: this.taskId,
    };
  }
}

/**
 * タスク検証エラー
 * @summary タスク検証エラー
 * @param taskId - 検証に失敗したタスクID
 * @param reason - 失敗理由
 */
export class TaskValidationError extends Error {
  /** 検証に失敗したタスクID */
  public readonly taskId: string;
  /** 失敗理由 */
  public readonly reason: string;

  /**
   * タスク検証エラーを作成
   * @param taskId - 検証に失敗したタスクID
   * @param reason - 失敗理由
   */
  constructor(taskId: string, reason: string) {
    super(`Task "${taskId}" validation failed: ${reason}`);
    this.name = "TaskValidationError";
    this.taskId = taskId;
    this.reason = reason;
  }

  /**
   * エラー情報を文字列表現で返す
   * @summary エラー文字列
   * @returns フォーマットされたエラー文字列
   */
  override toString(): string {
    return `${this.name} (task: ${this.taskId}): ${this.reason}`;
  }

  /**
   * JSON表現を返す
   * @summary JSON表現
   * @returns エラーのJSON表現
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      taskId: this.taskId,
      reason: this.reason,
      message: this.message,
    };
  }
}

/**
 * DAG検証エラー（複数エラー集約用）
 * @summary 検証エラー集約
 * @param errors - 個別の検証エラー
 */
export class DagValidationError extends Error {
  /** 個別の検証エラー */
  public readonly errors: TaskValidationError[];

  /**
   * DAG検証エラーを作成
   * @param errors - 個別の検証エラー
   */
  constructor(errors: TaskValidationError[]) {
    const errorCount = errors.length;
    const errorSummary = errors
      .slice(0, 3)
      .map((e) => e.message)
      .join("; ");
    const moreInfo = errorCount > 3 ? ` (and ${errorCount - 3} more)` : "";
    super(`DAG validation failed with ${errorCount} error(s): ${errorSummary}${moreInfo}`);
    this.name = "DagValidationError";
    this.errors = errors;
  }

  /**
   * JSON表現を返す
   * @summary JSON表現
   * @returns エラーのJSON表現
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      errorCount: this.errors.length,
      errors: this.errors.map((e) => e.toJSON()),
      message: this.message,
    };
  }
}

/**
 * エラーコードから適切なエラーメッセージを生成
 * @summary エラーメッセージ生成
 * @param code - エラーコード
 * @param context - コンテキスト情報
 * @returns エラーメッセージ
 */
export function getDagErrorMessage(
  code: DagErrorCode,
  context?: Record<string, unknown>,
): string {
  const messages: Record<DagErrorCode, string> = {
    CYCLE_DETECTED: `Cycle detected in task graph: ${context?.cyclePath ?? "unknown path"}`,
    VALIDATION_FAILED: `Task plan validation failed: ${context?.reason ?? "unknown reason"}`,
    TASK_FAILED: `Task execution failed: ${context?.taskId ?? "unknown task"}`,
    ABORTED: "DAG execution was aborted",
    MISSING_DEPENDENCY: `Task "${context?.taskId}" depends on non-existent task "${context?.dependency}"`,
    DUPLICATE_TASK_ID: `Duplicate task ID: ${context?.taskId}`,
  };

  return messages[code];
}

/**
 * エラーがDAG関連エラーかどうかを判定
 * @summary DAGエラー判定
 * @param error - 判定対象のエラー
 * @returns DAG関連エラーの場合true
 */
export function isDagError(error: unknown): error is DagExecutionError {
  return error instanceof DagExecutionError;
}

/**
 * エラーが検証エラーかどうかを判定
 * @summary 検証エラー判定
 * @param error - 判定対象のエラー
 * @returns 検証エラーの場合true
 */
export function isValidationError(error: unknown): error is TaskValidationError {
  return error instanceof TaskValidationError;
}
