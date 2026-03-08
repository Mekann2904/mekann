/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/middleware/error-handler.ts
 * @role 統一エラーハンドリングミドルウェア
 * @why エラーレスポンスの一貫性とロギング
 * @related server/app.ts, middleware/validator.ts
 * @public_api errorHandler, AppError
 * @invariants すべてのエラーはErrorResponse形式で返却
 * @side_effects エラーログの出力
 * @failure_modes なし
 *
 * @abdd.explain
 * @overview 例外をキャッチして統一形式のエラーレスポンスに変換
 * @what_it_does エラー分類、ログ出力、レスポンス生成
 * @why_it_exists エラーハンドリングの一元化
 * @scope(in) Error オブジェクト
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
function formatZodError(error: ZodError): string {
  return error.issues
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join("; ");
}

/**
 * エラーハンドラーミドルウェア
 */
export function errorHandler() {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      return await next();
    } catch (error) {
      // エラーログ
      console.error("[error-handler]", error);

      let statusCode = 500;
      let response: ErrorResponse;

      if (error instanceof AppError) {
        statusCode = error.statusCode;
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
        response = {
          success: false,
          error: "予期しないエラーが発生しました",
          code: "UNKNOWN_ERROR",
        };
      }

      return c.json(response, statusCode as 400 | 404 | 500);
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
