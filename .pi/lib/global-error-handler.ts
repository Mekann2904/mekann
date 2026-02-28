/**
 * @abdd.meta
 * path: .pi/lib/global-error-handler.ts
 * role: グローバルエラーハンドラ設定モジュール
 * why: 未処理のPromise拒否や未捕捉例外によるプロセスの異常終了やログ欠落を防ぐため
 * related: .pi/lib/error-utils.ts
 * public_api: setupGlobalErrorHandlers
 * invariants: setupGlobalErrorHandlersは1回のみ実行可能
 * side_effects: process.onによりイベントリスナーを登録、exitOnUncaughtがtrueの場合プロセスを終了する
 * failure_modes: 複数回呼び出し時の二重登録、exitOnUncaught無効化による整合性不能な状態での継続
 * @abdd.explain
 * overview: Node.jsプロセス全体のエラーを捕捉し、ログ出力やプロセス終了を制御する仕組みを提供する
 * what_it_does:
 *   - unhandledRejectionイベントを捕捉し、エラーメッセージとスタックトレースを出力する
 *   - uncaughtExceptionイベントを捕捉し、エラーメッセージとスタックトレースを出力する
 *   - uncaughtException発生時、オプションに基づいてプロセスを終了する
 *   - キャンセル扱いすべきエラーメッセージの場合、処理をスキップする
 *   - 外部からロガー関数を差し替え可能にする
 * why_it_exists:
 *   - すべての非同期処理で個別にcatchを実装する負荷を軽減するため
 *   - 回復不能なエラー発生時のプロセス状態をクリアにするため
 *   - エラー発生場所を特定するための統一的なログ出力を行うため
 * scope:
 *   in: GlobalErrorHandlerOptions（ロガー、終了フラグ、終了コード）
 *   out: 標準エラー出力またはカスタムロガー、プロセス終了シグナル
 */

import { isCancelledErrorMessage, toErrorMessage } from "./core/error-utils.js";

/** グローバルエラーハンドラが設定されているかどうか */
let isSetup = false;

/** 設定されたハンドラの参照（解除用） */
let rejectionHandler: ((reason: unknown, promise: Promise<unknown>) => void) | null = null;
let exceptionHandler: ((error: Error, origin: NodeJS.UncaughtExceptionOrigin) => void) | null = null;

/** ログ出力関数の型 */
type LogFunction = (message: string, ...args: unknown[]) => void;

/** デフォルトのログ出力（コンソール） */
const defaultLog: LogFunction = (message, ...args) => {
  console.error(`[GlobalErrorHandler] ${message}`, ...args);
};

/** カスタムロガー（必要に応じて差し替え可能） */
let logger: LogFunction = defaultLog;

/**
 * グローバルエラーハンドラの設定オプション
 */
export interface GlobalErrorHandlerOptions {
  /** カスタムロガー（デフォルトはconsole.error） */
  logger?: LogFunction;
  /** uncaughtException時にプロセスを終了するか（デフォルト: true） */
  exitOnUncaught?: boolean;
  /** 終了コード（デフォルト: 1） */
  exitCode?: number;
}

/**
 * unhandledRejectionハンドラ
 * @summary 未処理のPromise拒否を捕捉する
 */
function handleUnhandledRejection(reason: unknown, _promise: Promise<unknown>): void {
  if (isCancelledErrorMessage(reason)) {
    logger("Unhandled Promise Rejection detected but ignored as cancellation: %s", toErrorMessage(reason));
    return;
  }

  const errorMessage = toErrorMessage(reason);
  logger("Unhandled Promise Rejection detected: %s", errorMessage);

  // スタックトレースがあれば出力
  if (reason instanceof Error && reason.stack) {
    logger("Stack trace:\n%s", reason.stack);
  }

  // 重要: プロセスは終了しない（安定性確保）
  // 本来は全てのPromiseで適切にcatchすべきだが、
  // 安全網としてここで捕捉する
}

/**
 * uncaughtExceptionハンドラ
 * @summary 未捕捉の例外を捕捉する
 */
function handleUncaughtException(error: Error, origin: NodeJS.UncaughtExceptionOrigin): void {
  if (isCancelledErrorMessage(error)) {
    logger("Uncaught Exception detected but ignored as cancellation (origin: %s): %s", origin, toErrorMessage(error));
    return;
  }

  const errorMessage = toErrorMessage(error);
  logger("Uncaught Exception detected (origin: %s): %s", origin, errorMessage);

  // スタックトレースがあれば出力
  if (error.stack) {
    logger("Stack trace:\n%s", error.stack);
  }

  // uncaughtExceptionは回復不可能な可能性が高いため、
  // デフォルトではプロセスを終了する
  // ただし、設定で無効化可能
}

/**
 * グローバルエラーハンドラを設定する
 * @summary プロセスレベルのエラーハンドラを登録
 * @param options 設定オプション
 * @returns 既に設定されている場合はfalse、新規設定の場合はtrue
 */
export function setupGlobalErrorHandlers(options: GlobalErrorHandlerOptions = {}): boolean {
  if (isSetup) {
    logger("Global error handlers already setup, skipping.");
    return false;
  }

  const { logger: customLogger, exitOnUncaught = true, exitCode = 1 } = options;

  if (customLogger) {
    logger = customLogger;
  }

  // unhandledRejectionハンドラを設定
  rejectionHandler = handleUnhandledRejection;
  process.on("unhandledRejection", rejectionHandler);

  // uncaughtExceptionハンドラを設定
  exceptionHandler = (error, origin) => {
    if (isCancelledErrorMessage(error)) {
      handleUncaughtException(error, origin);
      return;
    }
    handleUncaughtException(error, origin);
    if (exitOnUncaught) {
      logger("Exiting due to uncaught exception with code %d", exitCode);
      process.exit(exitCode);
    }
  };
  process.on("uncaughtException", exceptionHandler);

  isSetup = true;
  logger("Global error handlers setup complete.");

  return true;
}

/**
 * グローバルエラーハンドラを解除する
 * @summary テストやクリーンアップ用
 */
export function teardownGlobalErrorHandlers(): void {
  if (!isSetup) {
    return;
  }

  if (rejectionHandler) {
    process.off("unhandledRejection", rejectionHandler);
    rejectionHandler = null;
  }

  if (exceptionHandler) {
    process.off("uncaughtException", exceptionHandler);
    exceptionHandler = null;
  }

  isSetup = false;
  logger = defaultLog;
}

/**
 * グローバルエラーハンドラが設定されているか確認
 * @summary 現在の状態を返す
 */
export function isGlobalErrorHandlerSetup(): boolean {
  return isSetup;
}
