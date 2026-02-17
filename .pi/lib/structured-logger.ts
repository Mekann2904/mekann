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
 * ログレベル定義
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * ログコンテキスト定義
 * モジュールやコンポーネントを識別するために使用
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
 * 構造化ログエントリのインターフェース
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
 * 環境変数から最小ログレベルを取得する
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
 * キャッシュされた最小ログレベルをリセット（テスト用）
 */
export function resetMinLogLevelCache(): void {
  cachedMinLevel = undefined;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * ISO8601形式のタイムスタンプを生成する
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * ログレベルが最小レベル以上かどうかを判定する
 */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

/**
 * エラーオブジェクトを構造化された形式に変換する
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
 * ログエントリをJSON文字列に変換する
 */
export function serializeLogEntry(entry: StructuredLogEntry): string {
  return JSON.stringify(entry);
}

/**
 * ログエントリを読み取り可能な形式でフォーマットする
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
   * 子ロガーを作成する（コンテキストを継承）
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
   * DEBUGレベルのログを出力
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
   * 操作の実行時間を測定してログを出力
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
   * 同期操作の実行時間を測定してログを出力
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
 * 子ロガー - 操作名が固定されたロガー
 */
export class ChildLogger {
  constructor(
    private readonly parent: StructuredLogger,
    private readonly operation: string,
    private readonly additionalContext?: LogContext | string
  ) {}

  /**
   * DEBUGレベルのログを出力
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.parent.debug(this.operation, message, this.withContext(metadata));
  }

  /**
   * INFOレベルのログを出力
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.parent.info(this.operation, message, this.withContext(metadata));
  }

  /**
   * WARNレベルのログを出力
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.parent.warn(this.operation, message, this.withContext(metadata));
  }

  /**
   * ERRORレベルのログを出力
   */
  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    this.parent.error(this.operation, message, error, this.withContext(metadata));
  }

  /**
   * 操作の実行時間を測定
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
 * デフォルトロガーを取得する
 */
export function getDefaultLogger(): StructuredLogger {
  if (!defaultLogger) {
    defaultLogger = new StructuredLogger();
  }
  return defaultLogger;
}

/**
 * デフォルトロガーをリセット（テスト用）
 */
export function resetDefaultLogger(): void {
  defaultLogger = undefined;
}

/**
 * 指定されたコンテキストでロガーを作成する
 */
export function createLogger(
  context: LogContext | string,
  options?: Omit<StructuredLoggerOptions, "context">
): StructuredLogger {
  return new StructuredLogger({ ...options, context });
}

/**
 * subagentsコンテキストのロガーを取得
 */
export function getSubagentLogger(): StructuredLogger {
  return createLogger("subagents");
}

/**
 * agent-teamsコンテキストのロガーを取得
 */
export function getAgentTeamsLogger(): StructuredLogger {
  return createLogger("agent-teams");
}

/**
 * storageコンテキストのロガーを取得
 */
export function getStorageLogger(): StructuredLogger {
  return createLogger("storage");
}

// ============================================================================
// Quick Logging Functions
// ============================================================================

/**
 * クイックINFOログ
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
 * クイックDEBUGログ
 */
export function logDebug(
  context: LogContext | string,
  operation: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  createLogger(context).debug(operation, message, metadata);
}
