/**
 * @abdd.meta
 * path: .pi/lib/structured-logger.ts
 * role: ログ出力の統一フォーマット管理
 * why: ログレベル、コンテキスト、操作名を含む一貫性のあるログ生成をシステム全体に提供するため
 * related: .pi/lib/subagents.ts, .pi/lib/scheduler.ts, .pi/lib/storage.ts
 * public_api: LogLevel, LogContext, StructuredLogEntry, StructuredLoggerOptions, StructuredLogger class
 * invariants: 出力レベルは現在の最小ログレベル以上であること、タイムスタンプはISO8601形式であること
 * side_effects: コンソールへの出力、標準出力/標準エラーへの書き込み
 * failure_modes: 指定された出力先への書き込み失敗、無効なログレベル指定時の振る舞い未定義
 * @abdd.explain
 * overview: 構造化されたログエントリを生成・出力するユーティリティ実装。
 * what_it_does:
 *   - LogLevel、LogContext、StructuredLogEntry、StructuredLoggerOptionsの型定義を提供する
 *   - 機能フラグ（PI_LOG_LEVEL）に基づき出力する最小ログレベルを動的に決定する
 *   - ログメッセージにタイムスタンプ、コンテキスト、相関ID、エラー情報等を付与して構造化する
 * why_it_exists:
 *   - デバッグおよび監視のために、システム全体で統一されたフォーマットにより可視性を確保するため
 *   - JSONフォーマット選択や出力先切り替えなど、ログ出力の柔軟性を確保するため
 * scope:
 *   in: 機能フラグ（PI_LOG_LEVEL）、ログレベル、コンテキスト、メタデータ、出力先設定
 *   out: 標準出力、標準エラー出力、コンソールへのフォーマット済みログ文字列
 */

/**
 * 構造化ログユーティリティ
 *
 * 統一フォーマットによるログ出力を提供する。
 * ログレベル、コンテキスト、操作名、メタデータを含む
 * 一貫した構造化されたログを生成する。
 *
 * Feature Flag: PI_LOG_LEVEL
 * - "debug": 全レベル出力
 * - "info": INFO以上を出力 (default)
 * - "warn": WARN以上を出力
 * - "error": ERRORのみ出力
 */

// ============================================================================
// Types
// ============================================================================

/**
 * ログレベルの種別
 * @summary ログレベル種別
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * ログコンテキストの種別
 * @summary コンテキスト種別
 */
export type LogContext =
  | "subagents"
  | "agent-teams"
  | "scheduler"
  | "storage"
  | "metrics"
  | "checkpoint"
  | "embedding"
  | "memory"
  | "skills"
  | "tools"
  | "extensions"
  | "general";

/**
 * 構造化ログエントリ
 * @summary ログエントリを定義
 * @param timestamp タイムスタンプ
 * @param level ログレベル
 * @param context コンテキスト
 * @param operation 操作名
 * @param message メッセージ
 */
export interface StructuredLogEntry {
  /** ISO8601形式のタイムスタンプ */
  timestamp: string;
  /** ログレベル */
  level: LogLevel;
  /** コンテキスト（モジュール名） */
  context: LogContext | string;
  /** 操作名（関数名など） */
  operation: string;
  /** ログメッセージ */
  message: string;
  /** 追加のメタデータ */
  metadata?: Record<string, unknown>;
  /** 相関ID（トレース用） */
  correlationId?: string;
  /** 実行時間（ミリ秒） */
  durationMs?: number;
  /** エラー情報 */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * ロガー設定オプション
 * @summary ロガー設定を定義
 * @param minLevel 最小ログレベル
 * @param context ログコンテキスト
 * @param correlationId 相関ID
 * @param output 出力先
 * @param json JSON形式フラグ
 */
export interface StructuredLoggerOptions {
  /** 最小ログレベル */
  minLevel?: LogLevel;
  /** コンテキスト（デフォルト） */
  context?: LogContext | string;
  /** 相関ID */
  correlationId?: string;
  /** 出力先（デフォルト: console） */
  output?: "console" | "stdout" | "stderr";
  /** JSONフォーマットで出力するか */
  json?: boolean;
  /** タイムスタンプを含めるか */
  includeTimestamp?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const DEFAULT_MIN_LEVEL: LogLevel = "INFO";

// ============================================================================
// Feature Flag Management
// ============================================================================

let cachedMinLevel: LogLevel | undefined;

/**
 * 最小ログレベルを取得
 * @summary 最小ログレベル取得
 * @returns 取得されたログレベル
 */
export function getMinLogLevel(): LogLevel {
  if (cachedMinLevel !== undefined) {
    return cachedMinLevel;
  }

  const envLevel = process.env.PI_LOG_LEVEL?.toUpperCase();
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    cachedMinLevel = envLevel as LogLevel;
  } else {
    cachedMinLevel = DEFAULT_MIN_LEVEL;
  }

  return cachedMinLevel;
}

/**
 * 最小ログレベルキャッシュをリセット
 * @summary キャッシュリセット
 * @param なし
 * @returns なし
 */
export function resetMinLogLevelCache(): void {
  cachedMinLevel = undefined;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 日付をISO8601形式に変換
 * @summary 日付変換
 * @param date 対象の日付
 * @returns ISO8601形式のタイムスタンプ
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * @summary ログ出力判定
 * 指定されたログレベルが出力対象か判定する
 * @param level 判定対象のログレベル
 * @param minLevel 最小ログレベル
 * @returns 出力対象の場合はtrue
 */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

/**
 * エラーを構造化形式に変換
 * @summary エラー構造化
 * @param error 変換対象のエラーオブジェクト
 * @returns 構造化されたエラー情報
 */
export function formatError(error: Error | unknown): StructuredLogEntry["error"] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}

/**
 * エントリをシリアライズ
 * @summary エントリシリアライズ
 * @param {StructuredLogEntry} entry - ログエントリ
 * @returns {string} JSON文字列
 */
export function serializeLogEntry(entry: StructuredLogEntry): string {
  return JSON.stringify(entry);
}

/**
 * エントリを整形
 * @summary エントリ整形
 * @param {StructuredLogEntry} entry - ログエントリ
 * @returns {string} 整形された文字列
 */
export function formatReadableEntry(entry: StructuredLogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level}]`,
    `[${entry.context}]`,
    `[${entry.operation}]`,
    entry.message,
  ];

  if (entry.correlationId) {
    parts.push(`(correlationId: ${entry.correlationId})`);
  }

  if (entry.durationMs !== undefined) {
    parts.push(`(${entry.durationMs}ms)`);
  }

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    parts.push(JSON.stringify(entry.metadata));
  }

  if (entry.error) {
    parts.push(`\n  Error: ${entry.error.name}: ${entry.error.message}`);
    if (entry.error.stack) {
      parts.push(`\n  Stack: ${entry.error.stack.split("\n").slice(0, 3).join("\n  ")}`);
    }
  }

  return parts.join(" ");
}

// ============================================================================
// Logger Class
// ============================================================================

/**
 * 構造化ロガークラス
 * @summary 構造化ロガー
 * @param {StructuredLoggerOptions} options - ロガー設定オプション
 * @returns {StructuredLogger} ロガーインスタンス
 */
export class StructuredLogger {
  private readonly minLevel: LogLevel;
  private readonly context: LogContext | string;
  private readonly correlationId?: string;
  private readonly output: "console" | "stdout" | "stderr";
  private readonly json: boolean;
  private readonly includeTimestamp: boolean;

  constructor(options: StructuredLoggerOptions = {}) {
    this.minLevel = options.minLevel ?? getMinLogLevel();
    this.context = options.context ?? "general";
    this.correlationId = options.correlationId;
    this.output = options.output ?? "console";
    this.json = options.json ?? true;
    this.includeTimestamp = options.includeTimestamp ?? true;
  }

  /**
   * 子ロガーを生成
   * @summary 子ロガー生成
   * @param {string} operation - 操作名
   * @param {Record<string, unknown>} [additionalContext] - 追加コンテキスト
   * @returns {ChildLogger} 生成された子ロガー
   */
  child(
    operation: string,
    additionalContext?: LogContext | string
  ): ChildLogger {
    return new ChildLogger(this, operation, additionalContext);
  }

  /**
   * ログエントリを出力する
   */
  private log(
    level: LogLevel,
    operation: string,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error | unknown,
    durationMs?: number
  ): void {
    if (!shouldLog(level, this.minLevel)) {
      return;
    }

    const entry: StructuredLogEntry = {
      timestamp: this.includeTimestamp ? formatTimestamp() : "",
      level,
      context: this.context,
      operation,
      message,
      metadata,
      correlationId: this.correlationId,
      durationMs,
    };

    if (error) {
      entry.error = formatError(error);
    }

    this.outputEntry(entry, level);
  }

  /**
   * ログエントリを出力先に書き込む
   */
  private outputEntry(entry: StructuredLogEntry, level: LogLevel): void {
    const output = this.json ? serializeLogEntry(entry) : formatReadableEntry(entry);

    if (this.output === "console") {
      if (level === "ERROR") {
        console.error(output);
      } else if (level === "WARN") {
        console.warn(output);
      } else {
        console.log(output);
      }
    } else if (this.output === "stderr") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }

  // ========================================================================
  // Public Logging Methods
  // ========================================================================

  /**
   * DEBUGレベルログを出力
   * @summary DEBUGログ出力
   * @param {string} operation - 操作名
   * @param {string} message - ログメッセージ
   * @param {Record<string, unknown>} [metadata] - 追加メタデータ
   * @returns {void}
   */
  debug(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log("DEBUG", operation, message, metadata);
  }

  /**
   * INFOレベルのログを出力
   * @summary 情報出力
   * @param operation 操作名
   * @param message ログメッセージ
   * @param metadata 追加のメタデータ
   * @returns void
   */
  info(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log("INFO", operation, message, metadata);
  }

  /**
   * WARNレベルのログを出力
   * @summary 警告出力
   * @param operation 操作名
   * @param message ログメッセージ
   * @param metadata 追加のメタデータ
   * @returns void
   */
  warn(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log("WARN", operation, message, metadata);
  }

  /**
   * ERRORレベルのログを出力
   * @summary エラー出力
   * @param operation 操作名
   * @param message ログメッセージ
   * @param error エラーオブジェクト
   * @param metadata 追加のメタデータ
   * @returns void
   */
  error(
    operation: string,
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, unknown>
  ): void {
    this.log("ERROR", operation, message, metadata, error);
  }

  /**
   * 非同期処理を測定してログ
   * @summary 非同期処理測定
   * @param operation 操作名
   * @param message ログメッセージ
   * @param fn 測定対象の非同期関数
   * @param metadata 追加のメタデータ
   * @returns 関数の実行結果を含むPromise
   */
  async withTiming<T>(
    operation: string,
    message: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - startTime;
      this.log("INFO", operation, message, metadata, undefined, durationMs);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.log("ERROR", operation, `${message} (failed)`, metadata, error, durationMs);
      throw error;
    }
  }

  /**
   * 同期処理を測定してログ
   * @summary 同期処理測定
   * @param operation 操作名
   * @param message ログメッセージ
   * @param fn 測定対象の同期関数
   * @param metadata 追加のメタデータ
   * @returns 関数の実行結果
   */
  withTimingSync<T>(
    operation: string,
    message: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T {
    const startTime = Date.now();
    try {
      const result = fn();
      const durationMs = Date.now() - startTime;
      this.log("INFO", operation, message, metadata, undefined, durationMs);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.log("ERROR", operation, `${message} (failed)`, metadata, error, durationMs);
      throw error;
    }
  }
}

// ============================================================================
// Child Logger Class
// ============================================================================

/**
 * 子ロガークラス
 * @summary 子ロガー生成
 * @returns void
 */
export class ChildLogger {
  constructor(
    private readonly parent: StructuredLogger,
    private readonly operation: string,
    private readonly additionalContext?: LogContext | string
  ) {}

  /**
   * デバッグログを出力する
   * @summary デバッグログを出力
   * @param message ログメッセージ
   * @param metadata 追加のメタデータ
   * @returns void
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.parent.debug(this.operation, message, this.withContext(metadata));
  }

  /**
   * 通常ログを出力する
   * @summary 通常ログを出力
   * @param message ログメッセージ
   * @param metadata 追加のメタデータ
   * @returns void
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.parent.info(this.operation, message, this.withContext(metadata));
  }

  /**
   * 警告ログを出力する
   * @summary 警告ログを出力
   * @param message ログメッセージ
   * @param metadata 追加のメタデータ
   * @returns void
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.parent.warn(this.operation, message, this.withContext(metadata));
  }

  /**
   * エラーログを出力する
   * @summary エラーログを出力
   * @param message ログメッセージ
   * @param error エラーオブジェクト
   * @param metadata 追加のメタデータ
   * @returns void
   */
  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    this.parent.error(this.operation, message, error, this.withContext(metadata));
  }

  /**
   * 実行時間を測定
   * @summary 実行時間測定
   * @param message ログメッセージ
   * @param fn 測定対象関数
   * @param metadata メタデータ
   * @returns 処理結果
   */
  async withTiming<T>(
    message: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    return this.parent.withTiming(this.operation, message, fn, this.withContext(metadata));
  }

  /**
   * 追加コンテキストをメタデータにマージ
   */
  private withContext(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!this.additionalContext) return metadata;
    return { ...metadata, subContext: this.additionalContext };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let defaultLogger: StructuredLogger | undefined;

/**
 * デフォルトロガー取得
 * @summary デフォルトロガー取得
 * @returns 構造化ロガー
 */
export function getDefaultLogger(): StructuredLogger {
  if (!defaultLogger) {
    defaultLogger = new StructuredLogger();
  }
  return defaultLogger;
}

/**
 * デフォルトロガー初期化
 * @summary デフォルトロガー初期化
 * @returns void
 */
export function resetDefaultLogger(): void {
  defaultLogger = undefined;
}

 /**
  * 指定されたコンテキストでロガーを作成
  * @param context ログコンテキストまたはコンテキスト名
  * @param options ロガーオプション（contextは除く）
  * @returns 作成されたロガーインスタンス
  */
export function createLogger(
  context: LogContext | string,
  options?: Omit<StructuredLoggerOptions, "context">
): StructuredLogger {
  return new StructuredLogger({ ...options, context });
}

/**
 * サブロガー生成
 * @summary サブロガー生成
 * @param context ログコンテキスト
 * @param options オプション設定
 * @returns 構造化ロガー
 */
export function getSubagentLogger(): StructuredLogger {
  return createLogger("subagents");
}

/**
 * AgentTeamsロガー取得
 * @summary ロガー取得
 * @returns 構造化ロガーインスタンス
 */
export function getAgentTeamsLogger(): StructuredLogger {
  return createLogger("agent-teams");
}

/**
 * ストレージロガー取得
 * @summary ロガー取得
 * @returns 構造化ロガーインスタンス
 */
export function getStorageLogger(): StructuredLogger {
  return createLogger("storage");
}

// ============================================================================
// Quick Logging Functions
// ============================================================================

 /**
  * INFOレベルのログを出力
  * @param context ログコンテキストまたは名前
  * @param operation 操作名
  * @param message ログメッセージ
  * @param metadata 追加のメタデータ
  * @returns なし
  */
export function logInfo(
  context: LogContext | string,
  operation: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  createLogger(context).info(operation, message, metadata);
}

 /**
  * クイックWARNログ
  * @param context コンテキストまたは文字列
  * @param operation 操作名
  * @param message メッセージ
  * @param metadata メタデータ
  * @returns 戻り値なし
  */
export function logWarn(
  context: LogContext | string,
  operation: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  createLogger(context).warn(operation, message, metadata);
}

 /**
  * クイックERRORログ
  * @param context コンテキスト（LogContextまたは文字列）
  * @param operation 操作名
  * @param message メッセージ
  * @param error エラーオブジェクトまたは不明なエラー
  * @param metadata メタデータ
  * @returns 戻り値なし
  */
export function logError(
  context: LogContext | string,
  operation: string,
  message: string,
  error?: Error | unknown,
  metadata?: Record<string, unknown>
): void {
  createLogger(context).error(operation, message, error, metadata);
}

 /**
  * DEBUGレベルのログを出力
  * @param context - ログコンテキストまたはコンテキストID
  * @param operation - 操作名
  * @param message - ログメッセージ
  * @param metadata - 追加のメタデータ
  * @returns なし
  */
export function logDebug(
  context: LogContext | string,
  operation: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  createLogger(context).debug(operation, message, metadata);
}
