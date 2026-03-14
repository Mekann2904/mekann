/**
 * @abdd.meta
 * path: .pi/lib/observability/unified-logger.ts
 * role: 統一ロギング基盤 - 構造化ログとトレース統合
 * why: ログレベル統一、OpenTelemetry互換フォーマット、トレースコンテキスト自動注入を実現するため
 * related: .pi/lib/comprehensive-logger.ts, .pi/lib/observability/trace-context.ts, .pi/lib/observability/async-context.ts
 * public_api: UnifiedLogger, LogLevel, LogRecord, createLogger, getLogger
 * invariants: 全ログにトレースコンテキストが自動付与される（存在する場合）
 * side_effects: ファイルシステムへのログ書き込み、コンソール出力
 * failure_modes: ディスク容量不足による書き込み失敗
 * @abdd.explain
 * overview: OpenTelemetry Logs互換の統一ロガー
 * what_it_does:
 *   - 構造化ログ（JSON）の生成と出力
 *   - ログレベル（TRACE/DEBUG/INFO/WARN/ERROR/FATAL）の統一
 *   - トレースコンテキストの自動注入
 *   - 複数の出力先（ファイル/コンソール/外部）への対応
 *   - 既存comprehensive-loggerとの互換性維持
 * why_it_exists:
 *   - 散在するログ出力を統一フォーマットに集約するため
 *   - トレースとの相関によるデバッグ効率向上のため
 *   - 外部ツール（OpenTelemetry Collector等）との連携を可能にするため
 * scope:
 *   in: ログメッセージ、レベル、属性、トレースコンテキスト
 *   out: 構造化ログファイル、コンソール出力
 */

import { appendFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAsyncContext } from "./async-context.js";
import type { TraceContext } from "./trace-context.js";
import { toTraceParent } from "./trace-context.js";
import { getDateStr, ensureDir } from "./utils.js";

// ============================================================================
// Types
// ============================================================================

/**
 * ログレベル
 * @summary OpenTelemetry Logs互換のログレベル
 */
export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/**
 * ログレベルの数値マッピング
 */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  TRACE: 1,
  DEBUG: 2,
  INFO: 3,
  WARN: 4,
  ERROR: 5,
  FATAL: 6,
};

/**
 * ログレコード
 * @summary OpenTelemetry LogRecord互換の構造
 */
export interface LogRecord {
  /** 観測時刻（ISO 8601形式） */
  time: string;
  /** ログレベル */
  severityNumber: number;
  severityText: LogLevel;
  /** ログ本体 */
  body: string;
  /** 属性（任意のキーバリュー） */
  attributes?: Record<string, unknown>;
  /** トレースコンテキスト */
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
  /** リソース情報（プロセス等） */
  resource?: {
    service: string;
    version?: string;
    pid: number;
    hostname: string;
  };
  /** スコープ（モジュール名等） */
  scope?: {
    name: string;
    version?: string;
  };
  /** 例外情報 */
  exception?: {
    type: string;
    message: string;
    stacktrace?: string;
  };
}

/**
 * ロガー設定
 * @summary 統一ロガーの設定
 */
export interface UnifiedLoggerConfig {
  /** サービス名 */
  serviceName: string;
  /** サービスバージョン */
  serviceVersion?: string;
  /** ログレベル（このレベル以上のみ出力） */
  minLevel: LogLevel;
  /** ログディレクトリ */
  logDir: string;
  /** コンソール出力を有効化 */
  consoleOutput: boolean;
  /** ファイル出力を有効化 */
  fileOutput: boolean;
  /** ファイルローテーションの最大サイズ（MB） */
  maxFileSizeMB: number;
  /** JSON出力を整形（デバッグ用） */
  prettyPrint: boolean;
  /** 自動的にトレースコンテキストを注入 */
  autoInjectTrace: boolean;
}

/**
 * デフォルト設定
 */
export const DEFAULT_LOGGER_CONFIG: UnifiedLoggerConfig = {
  serviceName: "pi-agent",
  serviceVersion: "1.0.0",
  minLevel: "INFO",
  logDir: join(homedir(), ".pi-logs"),
  consoleOutput: true,
  fileOutput: true,
  maxFileSizeMB: 10,
  prettyPrint: false,
  autoInjectTrace: true,
};

// ============================================================================
// Logger Implementation
// ============================================================================

/**
 * 統一ロガー
 * @summary OpenTelemetry Logs互換の統一ロガー
 */
export class UnifiedLogger {
  private config: UnifiedLoggerConfig;
  private logBuffer: LogRecord[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentDate: string;

  /**
   * ロガーを初期化
   * @summary 初期化
   * @param config ロガー設定
   */
  constructor(config: Partial<UnifiedLoggerConfig> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
    this.currentDate = getDateStr();

    if (this.config.fileOutput) {
      ensureDir(this.config.logDir);
      this.startFlushTimer();
    }
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * TRACEレベルでログ出力
   * @summary TRACEログ
   */
  trace(message: string, attributes?: Record<string, unknown>): void {
    this.log("TRACE", message, attributes);
  }

  /**
   * DEBUGレベルでログ出力
   * @summary DEBUGログ
   */
  debug(message: string, attributes?: Record<string, unknown>): void {
    this.log("DEBUG", message, attributes);
  }

  /**
   * INFOレベルでログ出力
   * @summary INFOログ
   */
  info(message: string, attributes?: Record<string, unknown>): void {
    this.log("INFO", message, attributes);
  }

  /**
   * WARNレベルでログ出力
   * @summary WARNログ
   */
  warn(message: string, attributes?: Record<string, unknown>): void {
    this.log("WARN", message, attributes);
  }

  /**
   * ERRORレベルでログ出力
   * @summary ERRORログ
   */
  error(message: string, error?: Error, attributes?: Record<string, unknown>): void {
    this.log("ERROR", message, {
      ...attributes,
      exception: error ? this.formatException(error) : undefined,
    });
  }

  /**
   * FATALレベルでログ出力
   * @summary FATALログ
   */
  fatal(message: string, error?: Error, attributes?: Record<string, unknown>): void {
    this.log("FATAL", message, {
      ...attributes,
      exception: error ? this.formatException(error) : undefined,
    });
  }

  /**
   * 汎用ログ出力
   * @summary ログ出力
   */
  log(level: LogLevel, message: string, attributes?: Record<string, unknown>): void {
    // レベルチェック
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.config.minLevel]) {
      return;
    }

    const record = this.createLogRecord(level, message, attributes);

    // コンソール出力
    if (this.config.consoleOutput) {
      this.outputToConsole(record);
    }

    // ファイル出力（バッファ）
    if (this.config.fileOutput) {
      this.bufferLog(record);
    }
  }

  /**
   * 子ロガーを作成（スコープ付き）
   * @summary 子ロガー作成
   * @param scopeName スコープ名
   * @returns 子ロガー
   */
  child(scopeName: string): ScopedLogger {
    return new ScopedLogger(this, scopeName);
  }

  /**
   * ログをフラッシュ
   * @summary フラッシュ
   */
  flush(): void {
    if (this.logBuffer.length === 0) return;

    const records = [...this.logBuffer];
    this.logBuffer = [];

    const logFile = this.getLogFilePath();

    // ローテーションチェック
    this.rotateIfNeeded(logFile);

    // ファイル出力
    const lines = records.map((r) =>
      this.config.prettyPrint ? JSON.stringify(r, null, 2) : JSON.stringify(r)
    );

    try {
      appendFileSync(logFile, lines.join("\n") + "\n", "utf-8");
    } catch (err) {
      console.error("[unified-logger] Failed to write log file:", err);
    }
  }

  /**
   * ロガーをシャットダウン
   * @summary シャットダウン
   */
  shutdown(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * 設定を更新
   * @summary 設定更新
   */
  updateConfig(config: Partial<UnifiedLoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 現在の設定を取得
   * @summary 設定取得
   */
  getConfig(): UnifiedLoggerConfig {
    return { ...this.config };
  }

  // ============================================
  // Private Methods
  // ============================================

  private createLogRecord(
    level: LogLevel,
    message: string,
    attributes?: Record<string, unknown>
  ): LogRecord {
    const record: LogRecord = {
      time: new Date().toISOString(),
      severityNumber: LOG_LEVEL_VALUES[level],
      severityText: level,
      body: message,
      resource: {
        service: this.config.serviceName,
        version: this.config.serviceVersion,
        pid: process.pid,
        hostname: require("os").hostname(),
      },
    };

    // トレースコンテキスト自動注入
    if (this.config.autoInjectTrace) {
      const context = getAsyncContext();
      if (context.trace) {
        record.traceId = context.trace.traceId;
        record.spanId = context.trace.spanId;
        record.traceFlags = context.trace.traceFlags.sampled ? 1 : 0;
      }
    }

    // 属性マージ
    if (attributes && Object.keys(attributes).length > 0) {
      record.attributes = { ...attributes };
    }

    return record;
  }

  private outputToConsole(record: LogRecord): void {
    const prefix = this.getConsolePrefix(record.severityText);
    const traceSuffix = record.traceId
      ? ` [trace:${record.traceId.slice(0, 8)}]`
      : "";

    const output = `${prefix}${traceSuffix} ${record.body}`;

    if (record.severityText === "ERROR" || record.severityText === "FATAL") {
      console.error(output);
      if (record.attributes?.exception) {
        console.error(record.attributes.exception);
      }
    } else if (record.severityText === "WARN") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  private getConsolePrefix(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      TRACE: "\x1b[90m", // Gray
      DEBUG: "\x1b[36m", // Cyan
      INFO: "\x1b[32m", // Green
      WARN: "\x1b[33m", // Yellow
      ERROR: "\x1b[31m", // Red
      FATAL: "\x1b[35m", // Magenta
    };
    const reset = "\x1b[0m";
    return `${colors[level]}[${level}]${reset}`;
  }

  private bufferLog(record: LogRecord): void {
    this.logBuffer.push(record);

    // 日付が変わったらフラッシュ
    const currentDate = getDateStr();
    if (currentDate !== this.currentDate) {
      this.flush();
      this.currentDate = currentDate;
    }
  }

  private getLogFilePath(): string {
    return join(this.config.logDir, `pi-agent-${this.currentDate}.jsonl`);
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, 5000); // 5秒ごと
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  private rotateIfNeeded(logFile: string): void {
    if (!existsSync(logFile)) return;

    try {
      const stats = statSync(logFile);
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB >= this.config.maxFileSizeMB) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const rotatedFile = logFile.replace(".jsonl", `-${timestamp}.jsonl`);
        require("fs").renameSync(logFile, rotatedFile);
      }
    } catch {
      // 無視
    }
  }

  private formatException(error: Error): { type: string; message: string; stacktrace?: string } {
    return {
      type: error.name,
      message: error.message,
      stacktrace: error.stack,
    };
  }
}

// ============================================================================
// Scoped Logger
// ============================================================================

/**
 * スコープ付きロガー
 * @summary 特定モジュール用のロガー
 */
export class ScopedLogger {
  private logger: UnifiedLogger;
  private scopeName: string;

  constructor(logger: UnifiedLogger, scopeName: string) {
    this.logger = logger;
    this.scopeName = scopeName;
  }

  trace(message: string, attributes?: Record<string, unknown>): void {
    this.logger.trace(message, { ...attributes, scope: this.scopeName });
  }

  debug(message: string, attributes?: Record<string, unknown>): void {
    this.logger.debug(message, { ...attributes, scope: this.scopeName });
  }

  info(message: string, attributes?: Record<string, unknown>): void {
    this.logger.info(message, { ...attributes, scope: this.scopeName });
  }

  warn(message: string, attributes?: Record<string, unknown>): void {
    this.logger.warn(message, { ...attributes, scope: this.scopeName });
  }

  error(message: string, error?: Error, attributes?: Record<string, unknown>): void {
    this.logger.error(message, error, { ...attributes, scope: this.scopeName });
  }

  fatal(message: string, error?: Error, attributes?: Record<string, unknown>): void {
    this.logger.fatal(message, error, { ...attributes, scope: this.scopeName });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalLogger: UnifiedLogger | null = null;

/**
 * グローバルロガーを取得
 * @summary ロガー取得
 * @returns 統一ロガー
 */
export function getLogger(): UnifiedLogger {
  if (!globalLogger) {
    globalLogger = new UnifiedLogger();
  }
  return globalLogger;
}

/**
 * カスタム設定でグローバルロガーを作成
 * @summary ロガー作成
 * @param config ロガー設定
 * @returns 統一ロガー
 */
export function createLogger(config: Partial<UnifiedLoggerConfig>): UnifiedLogger {
  globalLogger = new UnifiedLogger(config);
  return globalLogger;
}

/**
 * グローバルロガーをリセット
 * @summary リセット
 */
export function resetLogger(): void {
  if (globalLogger) {
    globalLogger.shutdown();
  }
  globalLogger = null;
}

/**
 * スコープ付きロガーを作成
 * @summary スコープ付きロガー作成
 * @param scopeName スコープ名
 * @returns スコープ付きロガー
 */
export function createScopedLogger(scopeName: string): ScopedLogger {
  return getLogger().child(scopeName);
}
