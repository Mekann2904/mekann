/**
 * @abdd.meta
 * path: .pi/lib/errors.ts
 * role: pi-pluginにおけるエラー定義の基底モジュール
 * why: 拡張機能間で統一されたエラーハンドリングとエラー分類を実装するため
 * related: .pi/lib/agent-errors.ts
 * public_api: PiErrorCode, PiError, RuntimeLimitError, SchemaValidationError
 * invariants: PiErrorのサブクラスはcodeプロパティとtimestampを必ず持つ
 * side_effects: Error.captureStackTraceによるスタックトレースの生成
 * failure_modes: 不正なエラーコードが渡された場合の型安全性の欠如
 * @abdd.explain
 * overview: pi-plugin全体で使用する標準エラークラスとエラーコード型を定義するモジュール
 * what_it_does:
 *   - PiErrorCode型によるエラー種別の定義
 *   - PiError基底クラスによる共通プロパティ（code, retryable, cause, timestamp）の実装
 *   - RuntimeLimitError, SchemaValidationErrorなどの特定ドメインエラーの定義
 *   - エラー情報のJSONシリアライズ機能提供
 * why_it_exists:
 *   - 拡張機能間でエラー構造とハンドリングロジックを統一するため
 *   - プログラム上でのエラー分類と再試行判定を可能にするため
 *   - ランタイム制限やスキーマ検証失敗など、pi固有のエラー状態を明示するため
 * scope:
 *   in: なし
 *   out: 標準化されたエラーオブジェクトインスタンス
 */

/**
 * pi-pluginの共通エラークラス
 * 全拡張機能で統一されたエラーハンドリングを提供する。
 *
 * これらの基本エラークラスは一貫したエラー階層を確立する:
 * - PiError: pi固有エラーの基底クラス
 * - RuntimeLimitError: ランタイム容量制限エラー
 * - SchemaValidationError: 出力スキーマ検証失敗
 *
 * 関連: lib/agent-errors.ts (拡張エラーハンドリング)
 *
 * 使用例:
 * ```typescript
 * import { PiError, RuntimeLimitError, SchemaValidationError } from "./errors.js";
 *
 * // ランタイム制限エラーをスロー
 * throw new RuntimeLimitError("Maximum parallel executions reached");
 *
 * // スキーマ検証エラーをスロー
 * throw new SchemaValidationError("Missing required field: summary");
 * ```
 */

// ============================================================================
// エラーコード
// ============================================================================

/**
 * pi標準エラーコード
 * @summary piエラーコード
 */
export type PiErrorCode =
  | "UNKNOWN_ERROR"
  | "RUNTIME_LIMIT_REACHED"
  | "RUNTIME_QUEUE_WAIT"
  | "SCHEMA_VIOLATION"
  | "VALIDATION_ERROR"
  | "TIMEOUT_ERROR"
  | "CANCELLED_ERROR"
  | "RATE_LIMIT_ERROR"
  | "CAPACITY_ERROR"
  | "PARSING_ERROR";

// ============================================================================
// 基本エラークラス
// ============================================================================

/**
 * pi固有エラーを生成
 * @summary pi固有エラー生成
 */
export class PiError extends Error {
  /** プログラムによる処理のためのエラーコード */
  public readonly code: PiErrorCode;
  /** このエラーを引き起こした操作を再試行できるかどうか */
  public readonly retryable: boolean;
  /** このエラーの原因となった元のエラー */
  public readonly cause?: Error;
  /** エラーが発生した時刻のタイムスタンプ */
  public readonly timestamp: number;

  constructor(
    message: string,
    code: PiErrorCode = "UNKNOWN_ERROR",
    options?: {
      retryable?: boolean;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = "PiError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.cause = options?.cause;
    this.timestamp = Date.now();

    // V8環境で適切なスタックトレースを維持
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * エラーコードを判定
   * @summary エラーコード判定
   * @param code 比較対象のエラーコード
   * @returns 一致する場合はtrue
   */
  is(code: PiErrorCode): boolean {
    return this.code === code;
  }

  /**
   * エラー情報をJSON形式に変換
   * @summary JSON形式に変換
   * @returns エラープロパティを含むオブジェクト
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      retryable: this.retryable,
      timestamp: this.timestamp,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

// ============================================================================
// ランタイムエラー
// ============================================================================

/**
 * ランタイム容量制限エラー
 * @summary ランタイム制限超過
 */
export class RuntimeLimitError extends PiError {
  /** 制限に達した時点の現在のランタイム数 */
  public readonly currentCount?: number;
  /** 許可される最大ランタイム数 */
  public readonly maxCount?: number;

  constructor(
    message: string,
    options?: {
      currentCount?: number;
      maxCount?: number;
      cause?: Error;
    },
  ) {
    super(message, "RUNTIME_LIMIT_REACHED", {
      retryable: false, // ランタイム制限は待機が必要、即時再試行は不可
      cause: options?.cause,
    });
    this.name = "RuntimeLimitError";
    this.currentCount = options?.currentCount;
    this.maxCount = options?.maxCount;
  }

  /**
   * エラー情報をJSON形式でシリアライズする
   * @summary JSON形式でシリアライズ
   * @returns currentCountとmaxCountを含むJSONオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      currentCount: this.currentCount,
      maxCount: this.maxCount,
    };
  }
}

/**
 * キュー待機タイムアウト
 * @summary 待機タイムアウト
 */
export class RuntimeQueueWaitError extends PiError {
  /** 待機時間（ミリ秒） */
  public readonly waitTimeMs?: number;
  /** 許可される最大待機時間 */
  public readonly maxWaitMs?: number;

  constructor(
    message: string,
    options?: {
      waitTimeMs?: number;
      maxWaitMs?: number;
      cause?: Error;
    },
  ) {
    super(message, "RUNTIME_QUEUE_WAIT", {
      retryable: true,
      cause: options?.cause,
    });
    this.name = "RuntimeQueueWaitError";
    this.waitTimeMs = options?.waitTimeMs;
    this.maxWaitMs = options?.maxWaitMs;
  }

  /**
   * エラー情報をJSON形式に変換する
   * @returns JSONオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      waitTimeMs: this.waitTimeMs,
      maxWaitMs: this.maxWaitMs,
    };
  }
}

// ============================================================================
// 検証エラー
// ============================================================================

/**
 * スキーマ検証エラー
 * @summary スキーマ違反発生
 */
export class SchemaValidationError extends PiError {
  /** 検証エラーのリスト */
  public readonly violations: string[];
  /** 検証に失敗したフィールド */
  public readonly field?: string;

  constructor(
    message: string,
    options?: {
      violations?: string[];
      field?: string;
      cause?: Error;
    },
  ) {
    super(message, "SCHEMA_VIOLATION", {
      retryable: true,
      cause: options?.cause,
    });
    this.name = "SchemaValidationError";
    this.violations = options?.violations ?? [];
    this.field = options?.field;
  }

  /**
   * JSONに変換する
   * @summary スキーマ違反取得
   * @returns プロパティを含むオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      violations: this.violations,
      field: this.field,
    };
  }
}

/**
 * 検証エラー
 * @summary 検証エラー発生
 */
export class ValidationError extends PiError {
  /** 検証に失敗したフィールド */
  public readonly field?: string;
  /** 期待される値または形式 */
  public readonly expected?: string;
  /** 実際に受け取った値 */
  public readonly actual?: string;

  constructor(
    message: string,
    options?: {
      field?: string;
      expected?: string;
      actual?: string;
      cause?: Error;
    },
  ) {
    super(message, "VALIDATION_ERROR", {
      retryable: false,
      cause: options?.cause,
    });
    this.name = "ValidationError";
    this.field = options?.field;
    this.expected = options?.expected;
    this.actual = options?.actual;
  }

  /**
   * JSONに変換する
   * @summary 検証エラー取得
   * @returns プロパティを含むオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      field: this.field,
      expected: this.expected,
      actual: this.actual,
    };
  }
}

// ============================================================================
// タイムアウト & キャンセルエラー
// ============================================================================

/**
 * タイムアウトエラー
 * @summary タイムアウト発生
 */
export class TimeoutError extends PiError {
  /** 操作タイムアウト時間（ミリ秒） */
  public readonly timeoutMs?: number;

  constructor(
    message: string,
    options?: {
      timeoutMs?: number;
      cause?: Error;
    },
  ) {
    super(message, "TIMEOUT_ERROR", {
      retryable: true,
      cause: options?.cause,
    });
    this.name = "TimeoutError";
    this.timeoutMs = options?.timeoutMs;
  }

  /**
   * @summary JSON形式へ変換
   * エラー情報をJSON形式に変換する
   * @returns JSON形式のエラーオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      timeoutMs: this.timeoutMs,
    };
  }
}

/**
 * @summary キャンセルエラー
 * 操作がキャンセルされた場合に発生するエラー
 */
export class CancelledError extends PiError {
  /** キャンセルの理由 */
  public readonly reason?: string;

  constructor(
    message: string,
    options?: {
      reason?: string;
      cause?: Error;
    },
  ) {
    super(message, "CANCELLED_ERROR", {
      retryable: false,
      cause: options?.cause,
    });
    this.name = "CancelledError";
    this.reason = options?.reason;
  }

  /**
   * @summary JSON形式へ変換
   * エラー情報をJSON形式に変換する
   * @returns JSON形式のエラーオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      reason: this.reason,
    };
  }
}

// ============================================================================
// レート制限 & 容量エラー
// ============================================================================

/**
 * @summary レート制限エラー
 * レート制限を超えた場合に発生するエラー
 */
export class RateLimitError extends PiError {
  /** 推奨待機時間（ミリ秒） */
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    options?: {
      retryAfterMs?: number;
      cause?: Error;
    },
  ) {
    super(message, "RATE_LIMIT_ERROR", {
      retryable: true,
      cause: options?.cause,
    });
    this.name = "RateLimitError";
    this.retryAfterMs = options?.retryAfterMs;
  }

  /**
   * @summary JSON形式へ変換
   * エラー情報をJSON形式に変換する
   * @returns JSON形式のエラーオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/**
 * キャパシティ超過時のエラーを表すクラス
 * @summary キャパシティエラー生成
 */
export class CapacityError extends PiError {
  /** 容量を超過したリソース */
  public readonly resource?: string;

  constructor(
    message: string,
    options?: {
      resource?: string;
      cause?: Error;
    },
  ) {
    super(message, "CAPACITY_ERROR", {
      retryable: false,
      cause: options?.cause,
    });
    this.name = "CapacityError";
    this.resource = options?.resource;
  }

  /**
   * JSON形式でシリアライズする
   * @summary JSON形式へ変換
   * @returns エラー情報を含むJSONオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      resource: this.resource,
    };
  }
}

// ============================================================================
// パースエラー
// ============================================================================

/**
 * パース処理中に発生したエラーを表すクラス
 * @summary パースエラー生成
 */
export class ParsingError extends PiError {
  /** パースに失敗したコンテンツ */
  public readonly content?: string;
  /** パースに失敗した位置 */
  public readonly position?: number;

  constructor(
    message: string,
    options?: {
      content?: string;
      position?: number;
      cause?: Error;
    },
  ) {
    super(message, "PARSING_ERROR", {
      retryable: true,
      cause: options?.cause,
    });
    this.name = "ParsingError";
    this.content = options?.content;
    this.position = options?.position;
  }

  /**
   * JSON形式でシリアライズする
   * @summary JSON形式へ変換
   * @returns エラー情報を含むJSONオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      content: this.content ? `${this.content.slice(0, 100)}...` : undefined,
      position: this.position,
    };
  }
}

// ============================================================================
// 実行エラー
// ============================================================================

/**
 * エラー深刻度を表す型定義
 * @summary エラー深刻度定義
 * @type {"low" | "medium" | "high" | "critical"}
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * エラーハンドリング用の追加コンテキスト
 * @summary エラーコンテキスト
 */
export interface ErrorContext {
  /** 失敗した操作 */
  operation?: string;
  /** エラーが発生したコンポーネント */
  component?: string;
  /** 追加のメタデータ */
  metadata?: Record<string, unknown>;
  /** タイムスタンプ */
  timestamp?: number;
}

/**
 * 実行エラーを生成
 * @summary 実行エラー生成
 */
export class ExecutionError extends PiError {
  /** エラーの重要度 */
  public readonly severity: ErrorSeverity;
  /** 実行コンテキスト */
  public readonly context?: ErrorContext;

  constructor(
    message: string,
    options?: {
      severity?: ErrorSeverity;
      context?: ErrorContext;
      cause?: Error;
    },
  ) {
    super(message, "UNKNOWN_ERROR", {
      retryable: true,
      cause: options?.cause,
    });
    this.name = "ExecutionError";
    this.severity = options?.severity ?? "medium";
    this.context = options?.context;
  }

  /**
   * JSON形式に変換
   * @summary JSONに変換
   * @returns JSONオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      severity: this.severity,
      context: this.context,
    };
  }
}

/**
 * 設定エラーを表す
 * @summary 設定エラー生成
 * @param message エラーメッセージ
 * @param options エラーの追加情報
 * @param options.key エラーの原因となった設定キー
 * @param options.expected 期待される設定値
 * @param options.cause エラーの原因となったオブジェクト
 * @returns 設定エラーインスタンス
 */
export class ConfigurationError extends PiError {
  /** エラーの原因となった設定キー */
  public readonly key?: string;
  /** 期待される設定値 */
  public readonly expected?: string;

  constructor(
    message: string,
    options?: {
      key?: string;
      expected?: string;
      cause?: Error;
    },
  ) {
    super(message, "VALIDATION_ERROR", {
      retryable: false,
      cause: options?.cause,
    });
    this.name = "ConfigurationError";
    this.key = options?.key;
    this.expected = options?.expected;
  }

  /**
   * JSON形式に変換
   * @summary JSON形式に変換
   * @returns エラー情報を含むオブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      key: this.key,
      expected: this.expected,
    };
  }
}

/**
 * ストレージエラー
 * @summary ストレージエラー生成
 * @param options エラーオプション
 */
export class StorageError extends PiError {
  /** エラーの原因となったストレージパス */
  public readonly path?: string;
  /** 失敗した操作 */
  public readonly operation?: "read" | "write" | "delete" | "lock";

  constructor(
    message: string,
    options?: {
      path?: string;
      operation?: "read" | "write" | "delete" | "lock";
      cause?: Error;
    },
  ) {
    super(message, "UNKNOWN_ERROR", {
      retryable: true,
      cause: options?.cause,
    });
    this.name = "StorageError";
    this.path = options?.path;
    this.operation = options?.operation;
  }

  /**
   * JSON形式に変換
   * @summary JSON形式変換
   * @returns エラー情報オブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      path: this.path,
      operation: this.operation,
    };
  }
}

// ============================================================================
// エラーユーティリティ
// ============================================================================

/**
 * PiErrorか判定
 * @summary PiError型ガード
 * @param error エラー对象
 * @returns PiErrorの場合true
 */
export function isPiError(error: unknown): error is PiError {
  return error instanceof PiError;
}

/**
 * エラーコードを確認
 * @summary エラーコード確認
 * @param error エラー对象
 * @param code エラーコード
 * @returns 一致する場合true
 */
export function hasErrorCode(error: unknown, code: PiErrorCode): boolean {
  return isPiError(error) && error.code === code;
}

// ============================================================================
// チーム定義エラー
// ============================================================================

/**
 * チーム定義エラーの種別
 */
export type TeamDefinitionErrorCode =
  | "TEAM_DEFINITION_NOT_FOUND"
  | "TEAM_DEFINITION_PARSE_ERROR"
  | "TEAM_DEFINITION_VALIDATION_ERROR"
  | "TEAM_MEMBER_VALIDATION_ERROR"
  | "TEAM_PHASE_RESOLUTION_ERROR";

/**
 * チーム定義の検証エラー詳細
 */
export interface TeamValidationDetail {
  /** エラーが発生したフィールド */
  field: string;
  /** エラーメッセージ */
  message: string;
  /** 問題のある値 */
  value?: unknown;
}

/**
 * チーム定義関連エラー
 * @summary チーム定義エラー生成
 */
export class TeamDefinitionError extends PiError {
  /** チームID */
  public readonly teamId?: string;
  /** チーム定義ファイルパス */
  public readonly filePath?: string;
  /** エラー種別 */
  public readonly errorType: TeamDefinitionErrorCode;
  /** 検証エラーの詳細一覧 */
  public readonly validationDetails?: TeamValidationDetail[];

  constructor(
    message: string,
    errorType: TeamDefinitionErrorCode,
    options?: {
      teamId?: string;
      filePath?: string;
      validationDetails?: TeamValidationDetail[];
      cause?: Error;
    },
  ) {
    super(message, "VALIDATION_ERROR", {
      retryable: false,
      cause: options?.cause,
    });
    this.name = "TeamDefinitionError";
    this.errorType = errorType;
    this.teamId = options?.teamId;
    this.filePath = options?.filePath;
    this.validationDetails = options?.validationDetails;
  }

  /**
   * JSON形式に変換
   * @summary JSON形式変換
   * @returns エラー情報オブジェクト
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      errorType: this.errorType,
      teamId: this.teamId,
      filePath: this.filePath,
      validationDetails: this.validationDetails,
    };
  }

  /**
   * 人間が読める形式のエラーメッセージを生成
   * @summary エラーメッセージ生成
   * @returns フォーマット済みエラーメッセージ
   */
  toFormattedMessage(): string {
    const parts = [this.message];

    if (this.teamId) {
      parts.push(`Team ID: ${this.teamId}`);
    }
    if (this.filePath) {
      parts.push(`File: ${this.filePath}`);
    }
    if (this.validationDetails && this.validationDetails.length > 0) {
      parts.push("Validation errors:");
      for (const detail of this.validationDetails) {
        parts.push(`  - ${detail.field}: ${detail.message}`);
        if (detail.value !== undefined) {
          parts.push(`    Value: ${JSON.stringify(detail.value)}`);
        }
      }
    }

    return parts.join("\n");
  }
}

/**
 * チーム定義エラーか判定
 * @summary TeamDefinitionError型ガード
 * @param error エラー对象
 * @returns TeamDefinitionErrorの場合true
 */
export function isTeamDefinitionError(error: unknown): error is TeamDefinitionError {
  return error instanceof TeamDefinitionError;
}

/**
 * PiErrorベースでリトライ可能か判定
 * @summary PiErrorリトライ可否判定
 * @param error エラー对象
 * @returns リトライ可能な場合true
 */
export function isPiErrorRetryable(error: unknown): boolean {
  if (isPiError(error)) {
    return error.retryable;
  }
  return false;
}

export const isRetryableError = isPiErrorRetryable;

/**
 * Piエラー変換
 * @summary Piエラーに変換
 * @param error エラーオブジェクト
 * @returns PiErrorインスタンス
 */
export function toPiError(error: unknown): PiError {
  if (isPiError(error)) {
    return error;
  }
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else {
    try {
      message = String(error);
    } catch {
      message = "[unstringifiable error]";
    }
  }
  return new PiError(message, "UNKNOWN_ERROR", {
    cause: error instanceof Error ? error : undefined,
  });
}

/**
 * エラーコード取得
 * @summary エラーコードを取得
 * @param error エラーオブジェクト
 * @returns PIエラーコード
 */
export function getErrorCode(error: unknown): PiErrorCode {
  if (isPiError(error)) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

/**
 * リトライ可否判定
 * @summary リトライ可能か判定
 * @param code PIエラーコード
 * @returns リトライ可能な場合はtrue
 */
export function isRetryableErrorCode(code: PiErrorCode): boolean {
  const retryableCodes: PiErrorCode[] = [
    "TIMEOUT_ERROR",
    "RATE_LIMIT_ERROR",
    "SCHEMA_VIOLATION",
    "PARSING_ERROR",
    "RUNTIME_QUEUE_WAIT",
  ];
  return retryableCodes.includes(code);
}
