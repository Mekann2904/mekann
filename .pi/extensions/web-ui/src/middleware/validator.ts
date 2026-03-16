/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/middleware/validator.ts
 * @role Zodバリデーションミドルウェア
 * @why リクエストデータのランタイム検証
 * @related routes/*.ts, middleware/error-handler.ts
 * @public_api validateBody, validateQuery, validateParams
 * @invariants バリデーション失敗時は400エラー
 * @side_effects なし
 * @failure_modes ZodError（ミドルウェア内で処理、構造化ログ出力）
 *
 * @abdd.explain
 * @overview Honoミドルウェアとしてリクエストをバリデーション
 * @what_it_does body/query/paramsの検証と型推論
 * @why_it_exists 型安全なルートハンドラの実現
 * @scope(in) HTTPリクエスト
 * @scope(out) 検証済みデータ（c.req.valid）
 */

import type { Context, MiddlewareHandler } from "hono";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";

/**
 * バリデーションエラー情報（observability統合用）
 */
interface ValidationErrorLog {
  timestamp: string;
  type: "validation_error";
  source: "body" | "query" | "params";
  issues: Array<{ path: string; message: string }>;
  requestPath: string;
  requestMethod: string;
}

/**
 * バリデーションエラーのレスポンス生成
 *
 * @remarks
 * エラーをobservabilityパイプラインに送信せずに400レスポンスを返す。
 * 将来的な統合のため、console.errorで構造化ログを出力。
 */
function validationError(
  c: Context,
  error: ZodError,
  source: "body" | "query" | "params"
) {
  // Observability統合ポイント: 構造化ログ出力
  const logEntry: ValidationErrorLog = {
    timestamp: new Date().toISOString(),
    type: "validation_error",
    source,
    issues: error.issues.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
    requestPath: c.req.path,
    requestMethod: c.req.method,
  };

  // TODO: observabilityモジュールへの統合（現在はconsole.error）
  console.error("[validator:validation_error]", JSON.stringify(logEntry));

  return c.json(
    {
      success: false,
      error: "バリデーションエラー",
      code: "VALIDATION_ERROR",
      details: error.issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    },
    400
  );
}

/**
 * リクエストボディをバリデーション
 * 
 * @example
 * ```ts
 * app.post("/tasks", validateBody(CreateTaskSchema), (c) => {
 *   const body = c.req.valid("body"); // 型安全
 * });
 * ```
 */
export function validateBody<T>(schema: ZodSchema<T>): MiddlewareHandler {
  return async (c, next) => {
    try {
      const body = await c.req.json();
      const parsed = schema.parse(body);
      c.set("validatedBody", parsed);
      return await next();
    } catch (error) {
      if (error instanceof ZodError) {
        return validationError(c, error, "body");
      }
      throw error;
    }
  };
}

/**
 * クエリパラメータをバリデーション
 * 
 * @example
 * ```ts
 * app.get("/tasks", validateQuery(TaskFilterSchema), (c) => {
 *   const query = c.get("validatedQuery");
 * });
 * ```
 */
export function validateQuery<T>(schema: ZodSchema<T>): MiddlewareHandler {
  return async (c, next) => {
    try {
      const query = c.req.query();
      // クエリは文字列のRecordなので変換が必要な場合がある
      const parsed = schema.parse(query);
      c.set("validatedQuery", parsed);
      return await next();
    } catch (error) {
      if (error instanceof ZodError) {
        return validationError(c, error, "query");
      }
      throw error;
    }
  };
}

/**
 * ルートパラメータをバリデーション
 * 
 * @example
 * ```ts
 * app.get("/tasks/:id", validateParams(IdParamSchema), (c) => {
 *   const { id } = c.get("validatedParams");
 * });
 * ```
 */
export function validateParams<T>(schema: ZodSchema<T>): MiddlewareHandler {
  return async (c, next) => {
    try {
      const params = c.req.param();
      const parsed = schema.parse(params);
      c.set("validatedParams", parsed);
      return await next();
    } catch (error) {
      if (error instanceof ZodError) {
        return validationError(c, error, "params");
      }
      throw error;
    }
  };
}

/**
 * 型ヘルパー: バリデーション済みボディを取得
 */
export function getValidatedBody<T>(c: Context): T {
  return c.get("validatedBody") as T;
}

/**
 * 型ヘルパー: バリデーション済みクエリを取得
 */
export function getValidatedQuery<T>(c: Context): T {
  return c.get("validatedQuery") as T;
}

/**
 * 型ヘルパー: バリデーション済みパラメータを取得
 */
export function getValidatedParams<T>(c: Context): T {
  return c.get("validatedParams") as T;
}

/**
 * IDパラメータスキーマ（共通）
 */
import { z } from "zod";

export const IdParamSchema = z.object({
  id: z.string().min(1, "IDは必須です"),
});
