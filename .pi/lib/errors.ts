/**
 * @abdd.meta
 * path: .pi/lib/errors.ts
 * role: pi-plugin全体で使用する共通エラークラスとエラーコード型定義
 * why: 全拡張機能で統一されたエラー形式を提供し、エラーの分類・処理・デバッグを標準化するため
 * related: lib/agent-errors.ts, lib/runtime.ts, lib/validator.ts, index.ts
 * public_api: PiErrorCode, PiError, RuntimeLimitError, SchemaValidationError
 * invariants: PiError.codeは常にPiErrorCodeの値, PiError.retryableはデフォルトfalse, PiError.timestampはインスタンス生成時刻
 * side_effects: なし（純粋なクラス定義）
 * failure_modes: 不正なエラーコード文字列を渡した場合TypeScriptが型エラーを検出
 * @abdd.explain
 * overview: pi-pluginのエラーハンドリング基盤。標準化されたエラーコードと、構造化されたエラー情報を持つ基底クラスを提供する。
 * what_it_does:
 *   - PiErrorCode型で10種類の標準エラーコードを定義
 *   - PiError基底クラスでcode/retryable/cause/timestampプロパティを提供
 *   - is()メソッドでエラーコード照合
 *   - toJSON()メソッドでエラー情報のシリアライズ
 *   - RuntimeLimitError, SchemaValidationError等の派生クラス定義
 * why_it_exists:
 *   - Errorオブジェクトをそのまま使うとコード分類・再試行可否判定が困難
 *   - 拡張機能間で一貫したエラー形式を保証する必要がある
 *   - ログ解析・監視でのエラー集計を容易にする
 * scope:
 *   in: エラーメッセージ文字列、エラーコード、オプション(再試行可否/原因エラー)
 *   out: 構造化されたエラーオブジェクト、JSONシリアライズ結果
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
  * piエラーの標準化されたエラーコード。
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
  * pi固有エラーの基底クラス。
  * @param message エラーメッセージ
  * @param code エラーコード
  * @param options オプション設定
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
   * エラーコードが一致するか判定する。
   * @param code 比較対象のエラーコード
   * @returns 一致する場合はtrue
   */
  is(code: PiErrorCode): boolean {
    return this.code === code;
  }

   /**
    * エラー情報をJSON形式のオブジェクトに変換する。
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
  * ランタイム容量制限に達したエラー。
  * @param message エラーメッセージ
  * @param options オプション設定
  * @param options.currentCount 現在のランタイム数
  * @param options.maxCount 最大ランタイム数
  * @param options.cause 原因となったエラー
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
 * ランタイムキューでの待機タイムアウトエラー。
 * @param message エラーメッセージ
 * @param options 追加オプション（待機時間、最大待機時間、原因エラー）
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
  * 出力スキーマ検証が失敗したときにスローされるエラー。
  * @param message エラーメッセージ
  * @param options 追加オプション
  * @param options.violations 検証エラーのリスト
  * @param options.field 検証に失敗したフィールド
  * @param options.cause 原因となったエラー
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
    * エラーオブジェクトをJSON形式に変換する。
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
  * 一般的な検証エラーを表すクラス。
  * @param message エラーメッセージ
  * @param options 追加オプション
  * @param options.field 検証に失敗したフィールド
  * @param options.expected 期待される値または形式
  * @param options.actual 実際に受け取った値
  * @param options.cause 原因となったエラー
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
    * 検証エラーをJSON形式に変換
    * @returns エラー情報を含むJSONオブジェクト
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
  * 操作がタイムアウトしたときにスローされるエラー。
  * @param message エラーメッセージ
  * @param options タイムアウト時間や原因エラーを含むオプション
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
    * エラー情報をJSON形式に変換する。
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
 * 操作がキャンセルされたときにスローされるエラー
 * @param message エラーメッセージ
 * @param options オプション設定
 * @param options.reason キャンセルの理由
 * @param options.cause 原因となったエラー
 */
export class CancelledError extends PiError {
  /** キャンセルの理由 */
  public readonly reason?: string;

  constructor(
    message: string,
    options?: {
/**
       * エラー情報をJSON形式でシリアライズする
       *
       * 親クラスのtoJSON結果にreasonプロパティを追加して返します。
       *
       * @returns シリアライズされたエラー情報を含むオブジェクト
       * @example
       * const error = new CancelledError("操作がキャンセルされました", { reason: "user_cancelled" });
       * const json = error.toJSON();
       * // { name: "CancelledError", message: "...", reason: "user_cancelled", ... }
       */
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
    * JSON形式でエラー情報を返す
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
  * レート制限エラー
  * @param message エラーメッセージ
  * @param options オプション
  * @param options.retryAfterMs 推奨待機時間（ミリ秒）
  * @param options.cause 原因となったエラー
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
    * JSON形式でシリアライズする
    * @returns JSONオブジェクト
    */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/**
 * 容量超過エラー
 * @param message エラーメッセージ
 * @param options オプション
 * @param options.resource 容量を超過したリソース
 * @param options.cause 原因となったエラー
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
    * JSON形式で返す
    * @returns JSON形式のエラーオブジェクト
    */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      resource: this.resource,
    };
  }
/**
 * エラー情報をJSON形式で返す
 *
 * 親クラスのJSON出力に加え、コンテンツ（100文字で切り詰め）と
 * パース位置情報を含めます。
 *
 * @returns エラー情報を含むJSONオブジェクト
 * @example
 * const error = new ParsingError("パースエラー", { content: "long text...", position: 10 });
 * const json = error.toJSON();
 * // => { name: "ParsingError", message: "パースエラー", content: "long text...", position: 10, ... }
 */
}

// ============================================================================
// パースエラー
// ============================================================================

 /**
  * パース処理で発生したエラー
  * @param message エラーメッセージ
  * @param options エラーオプション
  * @param options.content パース失敗時のコンテンツ
  * @param options.position パース失敗位置
  * @param options.cause 原因となったエラー
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
    * JSONシリアライズ可能なオブジェクトを返す
    * @returns エラー情報を含むオブジェクト
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
  * エラー重要度レベル。
  */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

 /**
  * エラーハンドリング用の追加コンテキスト。
  * @param operation 失敗した操作
  * @param component エラーが発生したコンポーネント
  * @param metadata 追加のメタデータ
  * @param timestamp タイムスタンプ
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
  * 実行操作中にスローされるエラー。
  * @param message エラーメッセージ
  * @param options オプション設定
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
    * エラー情報をJSON形式に変換します。
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
  * 設定エラーを表すクラス
  * @param message エラーメッセージ
  * @param options エラーの追加情報
  * @param options.key エラーの原因となった設定キー
  * @param options.expected 期待される設定値
  * @param options.cause エラーの原因となったオブジェクト
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
    * JSONシリアライズ可能なオブジェクトを返す
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
  * ストレージ操作に対してスローされるエラー
  * @param message エラーメッセージ
  * @param options オプション設定
  * @param options.path エラーの原因となったストレージパス
  * @param options.operation 失敗した操作（read/write/delete/lock）
  * @param options.cause 原因となったエラー
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
    * エラー情報をJSON形式に変換する
    * @returns JSON形式のエラーデータ
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
  * PiErrorかどうかを判定する
  * @param error 判定対象のエラー
  * @returns PiErrorの場合はtrue
  */
export function isPiError(error: unknown): error is PiError {
  return error instanceof PiError;
}

 /**
  * エラーが特定のエラーコードを持つか確認する。
  * @param error - 検査対象のエラー
  * @param code - 比較するエラーコード
  * @returns エラーコードが一致する場合はtrue
  */
export function hasErrorCode(error: unknown, code: PiErrorCode): boolean {
  return isPiError(error) && error.code === code;
}

 /**
  * エラーが再試行可能か判定する
  * @param error - 判定対象のエラー
  * @returns 再試行可能な場合はtrue、それ以外はfalse
  */
export function isRetryableError(error: unknown): boolean {
  if (isPiError(error)) {
    return error.retryable;
  }
  return false;
}

 /**
  * 任意のエラーをPiErrorに変換する
  * @param error 変換対象のエラー
  * @returns PiErrorインスタンス
  */
export function toPiError(error: unknown): PiError {
  if (isPiError(error)) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new PiError(message, "UNKNOWN_ERROR", {
    cause: error instanceof Error ? error : undefined,
  });
}

 /**
  * エラーからエラーコードを取得する
  * @param error エラーオブジェクト
  * @returns エラーコード（PiError以外はUNKNOWN_ERROR）
  */
export function getErrorCode(error: unknown): PiErrorCode {
  if (isPiError(error)) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

 /**
  * エラーコードが再試行可能か判定する
  * @param code エラーコード
  * @returns 再試行可能な場合はtrue、そうでない場合はfalse
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
