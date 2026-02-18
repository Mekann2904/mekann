/**
 * @abdd.meta
 * path: .pi/lib/structured-logger.ts
 * role: 構造化ログ出力ユーティリティ
 * why: 統一フォーマットによるログ出力で、デバッグ、監査、トレース時の可読性と検索性を確保するため
 * related: .pi/lib/config.ts, .pi/lib/storage.ts, .pi/lib/agent-manager.ts
 * public_api: LogLevel, LogContext, StructuredLogEntry, StructuredLoggerOptions
 * invariants: LOG_LEVEL_PRIORITY順序は変更不可、timestampは常にISO8601形式、未設定時のminLevelはINFO
 * side_effects: console/stdout/stderrへの書き込み、環境変数PI_LOG_LEVELの読み取り
 * failure_modes: 無効なLogLevel指定時はDEBUG扱い、metadataシリアライズ失敗時は文字列表現を出力
 * @abdd.explain
 * overview: 統一フォーマットによる構造化ログ出力機能を提供する。ログレベル、コンテキスト、操作名、メタデータを含む一貫したログエントリを生成する。
 * what_it_does:
 *   - DEBUG/INFO/WARN/ERRORの4段階ログレベルを定義し、優先度に基づくフィルタリングを行う
 *   - 12種類の定義済みLogContextと任意文字列によるコンテキスト指定をサポートする
 *   - StructuredLogEntryインターフェースに基づくログエントリを生成する
 *   - 環境変数PI_LOG_LEVELによる実行時ログレベル制御を提供する
 *   - console/stdout/stderrの出力先選択、JSON/プレーンテキスト形式の切り替えをサポートする
 * why_it_exists:
 *   - 分散システムにおけるログ相関追跡を可能にするため（correlationId）
 *   - モジュール別・操作別のログフィルタリングを実現するため
 *   - 実行時間計測とエラー情報を含むリッチなデバッグ情報を提供するため
 *   - 本番/開発環境でのログ出力制御を一元管理するため
 * scope:
 *   in: ログメッセージ、メタデータ、ログレベル、コンテキスト、correlationId
 *   out: 構造化されたログエントリ（JSONまたはフォーマット済みテキスト）
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
  * ログレベルの種別を定義
  */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

 /**
  * ログコンテキスト定義
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
  * @param timestamp ISO8601形式のタイムスタンプ
  * @param level ログレベル
  * @param context コンテキスト（モジュール名）
  * @param operation 操作名（関数名など）
  * @param message ログメッセージ
  * @param metadata 追加のメタデータ
  * @param correlationId 相関ID（トレース用）
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
  * @param minLevel 最小ログレベル
  * @param context コンテキスト（デフォルト）
  * @param correlationId 相関ID
  * @param output 出力先（デフォルト: console）
  * @param json JSONフォーマットで出力するか
  * @param includeTimestamp タイムスタンプを含めるか
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
  * 最小ログレベルを取得する
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
 * キャッシュされた最小ログレベルをリセット（テスト用）
 */
export function resetMinLogLevelCache(): void {
  cachedMinLevel = undefined;
}

// ============================================================================
// Utility Functions
// ============================================================================

 /**
  * 日付をISO8601形式の文字列に変換する
  * @param date 対象の日付
  * @returns ISO8601形式のタイムスタンプ
  */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

 /**
  * 指定されたログレベルが出力対象か判定する
  * @param level 判定対象のログレベル
  * @param minLevel 最小ログレベル
  * @returns 出力対象の場合はtrue
  */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

 /**
  * エラーオブジェクトを構造化された形式に変換する
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
  * ログエントリをJSON文字列に変換する
  * @param entry 変換対象のログエントリ
  * @returns JSON形式の文字列
  */
export function serializeLogEntry(entry: StructuredLogEntry): string {
  return JSON.stringify(entry);
}

 /**
  * ログエントリを読み取り可能な形式でフォーマットする
  * @param entry 構造化されたログエントリ
  * @returns フォーマットされた文字列
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
  * @param options ロガー設定オプション
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
    * @param operation 操作名
    * @param additionalContext 追加コンテキスト
    * @returns 子ロガー
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
    * @param operation 操作名
    * @param message ログメッセージ
    * @param metadata 追加のメタデータ
    * @returns なし
    */
  debug(
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log("DEBUG", operation, message, metadata);
  }

   /**
    * INFOレベルのログを出力します
    * @param operation 操作名
    * @param message ログメッセージ
    * @param metadata 追加のメタデータ
    * @returns なし
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
    * @param operation 操作名
    * @param message メッセージ
    * @param metadata メタデータ
    * @returns なし
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
    * @param operation 操作名
    * @param message ログメッセージ
    * @param error エラーオブジェクト
    * @param metadata 追加のメタデータ
    * @returns 戻り値なし
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
    * 実行時間を測定してログ出力
    * @param operation 操作名
    * @param message メッセージ
    * @param fn 実行する非同期関数
    * @param metadata 追加のメタデータ
    * @returns 関数の実行結果
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
    * @param operation 操作名
    * @param message メッセージ
    * @param fn 実行する関数
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
  * 子ロガー - 操作名が固定されたロガー
  * @param parent 親ロガー
  * @param operation 固定の操作名
  * @param additionalContext 追加のコンテキスト
  */
export class ChildLogger {
  constructor(
    private readonly parent: StructuredLogger,
    private readonly operation: string,
    private readonly additionalContext?: LogContext | string
  ) {}

   /**
    * DEBUGレベルのログを出力する
    * @param message ログメッセージ
    * @param metadata 追加のメタデータ
    * @returns なし
    */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.parent.debug(this.operation, message, this.withContext(metadata));
  }

   /**
    * INFOレベルのログを出力
    * @param message ログメッセージ
    * @param metadata 追加のメタデータ
    * @returns なし
    */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.parent.info(this.operation, message, this.withContext(metadata));
  }

   /**
    * WARNレベルのログを出力
    * @param message ログメッセージ
    * @param metadata 追加のメタデータ
    * @returns なし
    */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.parent.warn(this.operation, message, this.withContext(metadata));
  }

   /**
    * ERRORレベルのログを出力
    * @param message ログメッセージ
    * @param error エラーオブジェクト
    * @param metadata 追加のメタデータ
    * @returns なし
    */
  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    this.parent.error(this.operation, message, error, this.withContext(metadata));
  }

   /**
    * 操作の実行時間を測定
    * @param message ログメッセージ
    * @param fn 測定対象の非同期関数
    * @param metadata 追加のメタデータ
    * @returns 非同期関数の実行結果
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
  * @returns StructuredLogger インスタンス
  */
export function getDefaultLogger(): StructuredLogger {
  if (!defaultLogger) {
    defaultLogger = new StructuredLogger();
  }
  return defaultLogger;
}

 /**
  * デフォルトロガーをリセットする
  * @returns {void}
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
  * subagentsコンテキストのロガーを取得する
  * @returns 構造化ロガー
  */
export function getSubagentLogger(): StructuredLogger {
  return createLogger("subagents");
}

 /**
  * agent-teamsコンテキストのロガーを取得
  * @returns ロガーインスタンス
  */
export function getAgentTeamsLogger(): StructuredLogger {
  return createLogger("agent-teams");
}

 /**
  * storageコンテキストのロガーを取得
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
