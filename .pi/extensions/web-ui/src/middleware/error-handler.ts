/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/middleware/error-handler.ts
 * @role 統一エラーハンドリングミドルウェア
 * @why エラーレスポンスの一貫性とロギング
 * @related server/app.ts, middleware/validator.ts
 * @public_api errorHandler, handleError, AppError, notFoundHandler, formatZodError
 * @invariants すべてのエラーはErrorResponse形式で返却、non-Error thrown valuesはdetailsに文字列化して含める
 * @side_effects エラーログの出力
 * @failure_modes JSONシリアライズ失敗時はフォールバック応答を返す
 *
 * @abdd.explain
 * @overview 例外をキャッチして統一形式のエラーレスポンスに変換
 * @what_it_does エラー分類、ログ出力、レスポンス生成、循環参照保護
 * @why_it_exists エラーハンドリングの一元化とデバッグ情報の保持
 * @scope(in) Error オブジェクト、non-Error thrown values
 * @scope(out) JSON エラーレスポンス
 */

import type { Context } from "hono";
import type { ErrorResponse } from "../schemas/common.schema.js";
import { ZodError } from "zod";

/**
 * アプリケーションエラー
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = "AppError";
  }

  /**
   * Not Found エラー
   */
  static notFound(resource: string): AppError {
    return new AppError(`${resource}が見つかりません`, 404, "NOT_FOUND");
  }

  /**
   * Bad Request エラー
   */
  static badRequest(message: string, details?: string): AppError {
    return new AppError(message, 400, "BAD_REQUEST", details);
  }

  /**
   * Internal Server Error
   */
  static internal(message: string, error?: Error): AppError {
    return new AppError(
      message,
      500,
      "INTERNAL_ERROR",
      error?.message
    );
  }
}

/**
 * Zod バリデーションエラーを整形
 */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join("; ");
}

/**
 * 安全なJSONシリアライズ（循環参照対応）
 * 循環参照やシリアライズ不可能な値を含むオブジェクトを安全に文字列化
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === "bigint") {
        return val.toString() + "n";
      }
      if (typeof val === "function") {
        return "[Function]";
      }
      if (typeof val === "symbol") {
        return val.toString();
      }
      return val;
    });
  } catch {
    return String(value);
  }
}

/**
 * 安全なJSON応答送信
 * 循環参照エラー等のシリアライズ失敗時にフォールバック応答を返す
 */
function safeJsonResponse(
  c: Context,
  response: ErrorResponse,
  statusCode: 400 | 404 | 500
): Response {
  try {
    return c.json(response, statusCode);
  } catch (jsonError) {
    // JSON シリアライズ失敗時は詳細を削除して再試行
    console.error("[error-handler] JSON serialization failed:", jsonError);
    const fallbackResponse: ErrorResponse = {
      success: false,
      error: response.error,
      code: response.code,
      details: response.details
        ? "[詳細のシリアライズに失敗しました]"
        : undefined,
    };
    return c.json(fallbackResponse, statusCode);
  }
}

/**
 * エラーからErrorResponseを生成
 */
function buildErrorResponse(error: unknown): {
  statusCode: 400 | 404 | 500;
  response: ErrorResponse;
} {
  let statusCode: 400 | 404 | 500 = 500;
  let response: ErrorResponse;

  if (error instanceof AppError) {
    statusCode = error.statusCode as 400 | 404 | 500;
    response = {
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    };
  } else if (error instanceof ZodError) {
    statusCode = 400;
    response = {
      success: false,
      error: "バリデーションエラー",
      code: "VALIDATION_ERROR",
      details: formatZodError(error),
    };
  } else if (error instanceof Error) {
    response = {
      success: false,
      error: error.message || "予期しないエラーが発生しました",
      code: "UNKNOWN_ERROR",
    };
  } else {
    // Non-Error thrown values: 文脈を失わないよう文字列化してdetailsに含める
    const stringifiedError = safeStringify(error);
    console.error(
      "[error-handler] Non-Error value thrown:",
      stringifiedError
    );
    response = {
      success: false,
      error: "予期しないエラーが発生しました",
      code: "UNKNOWN_ERROR",
      details: `非Error値がthrowされました: ${stringifiedError}`,
    };
  }

  return { statusCode, response };
}

/**
 * Hono onError用エラーハンドラー
 * app.onError(handleError) として使用
 */
export function handleError(err: Error, c: Context): Response {
  // エラーログ
  console.error("[error-handler]", err);

  const { statusCode, response } = buildErrorResponse(err);
  return safeJsonResponse(c, response, statusCode);
}

/**
 * エラーハンドラーミドルウェア
 * app.use('*', errorHandler()) として使用
 * 注: Honoでは app.onError() の使用を推奨
 */
export function errorHandler() {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      return await next();
    } catch (error) {
      // エラーログ
      console.error("[error-handler]", error);

      const { statusCode, response } = buildErrorResponse(error);
      return safeJsonResponse(c, response, statusCode);
    }
  };
}

/**
 * 404 Not Found ハンドラー
 */
export function notFoundHandler(c: Context) {
  return c.json<ErrorResponse>(
    {
      success: false,
      error: "リソースが見つかりません",
      code: "NOT_FOUND",
    },
    404
  );
}
