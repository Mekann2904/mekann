/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/schemas/common.schema.ts
 * @role 共通Zodスキーマ定義
 * @why API全体で一貫したバリデーションと型安全性を提供
 * @related task.schema.ts, routes/*.ts
 * @public_api SuccessResponseSchema, ErrorResponseSchema, PaginationSchema
 * @invariants すべてのAPIレスポンスはSuccessResponseSchemaまたはErrorResponseSchemaに準拠
 * @side_effects なし
 * @failure_modes バリデーション失敗時はZodError
 *
 * @abdd.explain
 * @overview API共通レスポンス形式とページネーションスキーマ
 * @what_it_does 成功/エラーレスポンス、ページネーションの型定義
 * @why_it_exists レスポンス形式の統一と型安全性
 * @scope(in) なし
 * @scope(out) Zod スキーマ
 */

import { z } from "zod";

/**
 * 成功レスポンスのベーススキーマ
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

/**
 * エラーレスポンススキーマ
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.string().optional(),
  code: z.string().optional(),
});

/**
 * ページネーションパラメータスキーマ
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * ページネーション付きレスポンススキーマ
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  SuccessResponseSchema(z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }));

/**
 * タイムスタンプスキーマ（ISO 8601形式）
 */
export const TimestampSchema = z.string().datetime();

/**
 * IDスキーマ（文字列形式）
 */
export const IdSchema = z.string().min(1);

/**
 * 型エクスポート
 */
export type SuccessResponse<T> = {
  success: true;
  data: T;
};

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export type Pagination = z.infer<typeof PaginationSchema>;

export type ApiResult<T> = SuccessResponse<T> | ErrorResponse;
