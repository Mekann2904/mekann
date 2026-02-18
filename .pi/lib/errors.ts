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
 * プログラムによるエラーハンドリングとロギングに使用する。
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
 * コードと再試行ヒントを含む構造化されたエラー情報を提供する。
 *
 * 機能:
 * - プログラムによる処理のためのエラーコード
 * - 再試行ロジックのための再試行可能フラグ
 * - エラー追跡のための原因チェーン
 * - デバッグ用タイムスタンプ
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
   * このエラーが特定のエラーコードと一致するか確認する。
   */
  is(code: PiErrorCode): boolean {
    return this.code === code;
  }

  /**
   * ログ/シリアライズ用のプレーンオブジェクトに変換する。
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
 * ランタイム容量制限に達したときにスローされるエラー。
 * システムがこれ以上同時実行を受け入れられない場合に使用する。
 *
 * このエラーは通常、即座には再試行できない -
 * 呼び出し元は容量が利用可能になるまで待つ必要がある。
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
   * /**
   * * エラー情報をJSON形式でシリアライズする
   * *
   * * 親クラスのJSON情報に加えて、現在のカウント値と最大カウント値を含める。
   * *
   * * @returns currentCountとmaxCountを含むJSONオブジェクト
   * * @example
   * * const error = new RuntimeLimitError("制限に達しました", { currentCount: 100, maxCount: 100 });
   * * const json = error.toJSON();
   * * // {
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
 * ランタイムキューでの待機がタイムアウトしたときにスローされるエラー。
 * 容量予約に時間がかかりすぎた場合に使用する。
 *
 * このエラーは再試行可能 - キュー待機タイムアウトは一時的である可能性がある。
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
 * エージェント出力が期待される形式に準拠していない場合に使用する。
 *
 * このエラーは再試行可能 - 異なるプロンプトで有効な出力が得られる可能性がある。
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

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      violations: this.violations,
      field: this.field,
    };
  }
}

/**
 * 一般的な検証が失敗したときにスローされるエラー。
 * 入力検証と事前条件チェックに使用する。
 *
 * このエラーは再試行不可 - 入力を修正する必要がある。
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
 *
 * このエラーは再試行可能 - タイムアウトは一時的である可能性がある。
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

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      timeoutMs: this.timeoutMs,
    };
  }
}

/**
 * 操作がキャンセルされたときにスローされるエラー。
 *
 * このエラーは再試行不可 - キャンセルは意図的である。
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
 * レート制限に達したときにスローされるエラー。
 *
 * 待機後に再試行可能である可能性がある。
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

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/**
 * CapacityError - システム容量を超過したときにスローされるエラー
 *
 * このエラーは即座には再試行不可。
 *
 * @example
 * const error = new CapacityError("容量超過", { resource: "storage" });
 * const json = error.toJSON();
 * // { name: "CapacityError", message: "容量超過", resource: "storage", ... }
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
 * パースが失敗したときにスローされるエラー。
 *
 * このエラーは再試行可能 - 異なる出力ならパースに成功する可能性がある。
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
 * エラー重要度レベル（分類用）。
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * エラーハンドリング用の追加コンテキスト。
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
 * ランタイム実行の失敗に使用する。
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

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      severity: this.severity,
      context: this.context,
    };
  }
}

/**
 * 設定問題に対してスローされるエラー。
 * 設定が無効または不足している場合に使用する。
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

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      key: this.key,
      expected: this.expected,
    };
  }
}

/**
 * ストレージ操作に対してスローされるエラー。
 * ファイルI/Oまたは永続化操作の失敗に使用する。
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
 * エラーがPiErrorまたはそのサブクラスかどうかを確認する。
 */
export function isPiError(error: unknown): error is PiError {
  return error instanceof PiError;
}

/**
 * エラーが特定のエラーコードを持っているかどうかを確認する。
 */
export function hasErrorCode(error: unknown, code: PiErrorCode): boolean {
  return isPiError(error) && error.code === code;
}

/**
 * エラーが再試行可能かどうかを確認する。
 * PiErrorでretryable=trueの場合はtrue、それ以外はfalseを返す。
 */
export function isRetryableError(error: unknown): boolean {
  if (isPiError(error)) {
    return error.retryable;
  }
  return false;
}

/**
 * 任意のエラーをPiErrorに変換する。
 * PiErrorインスタンスはそのまま保持し、それ以外は汎用PiErrorでラップする。
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
 * エラーからエラーコードを取得する。
 * PiError以外のエラーの場合はUNKNOWN_ERRORを返す。
 */
export function getErrorCode(error: unknown): PiErrorCode {
  if (isPiError(error)) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

/**
 * エラーコードが再試行可能な状態を示しているかどうかを確認する。
 * エラーコードに基づくプログラム的な再試行判断に使用する。
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
