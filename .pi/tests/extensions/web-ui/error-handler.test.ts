/**
 * @file .pi/extensions/web-ui/src/middleware/error-handler.ts のユニットテスト
 * @description 統一エラーハンドリングミドルウェアのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError, z } from "zod";
import { AppError, errorHandler, notFoundHandler, formatZodError } from "../../../extensions/web-ui/src/middleware/error-handler.js";
import type { Context } from "hono";

// モックContext作成ヘルパー
function createMockContext(): {
  ctx: Context;
  jsonMock: ReturnType<typeof vi.fn>;
} {
  const jsonMock = vi.fn();
  const ctx = {
    json: jsonMock,
  } as unknown as Context;
  return { ctx, jsonMock };
}

describe("error-handler middleware", () => {
  describe("AppError", () => {
    it("基本的なAppErrorを作成する", () => {
      const error = new AppError("テストエラー", 500, "TEST_ERROR", "詳細");
      expect(error.message).toBe("テストエラー");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("TEST_ERROR");
      expect(error.details).toBe("詳細");
      expect(error.name).toBe("AppError");
    });

    it("notFound静的メソッドで404エラーを作成する", () => {
      const error = AppError.notFound("ユーザー");
      expect(error.message).toBe("ユーザーが見つかりません");
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("NOT_FOUND");
    });

    it("badRequest静的メソッドで400エラーを作成する", () => {
      const error = AppError.badRequest("無効なパラメータ", "idは数値である必要があります");
      expect(error.message).toBe("無効なパラメータ");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("BAD_REQUEST");
      expect(error.details).toBe("idは数値である必要があります");
    });

    it("badRequest静的メソッドでdetailsなしで作成する", () => {
      const error = AppError.badRequest("無効なリクエスト");
      expect(error.message).toBe("無効なリクエスト");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("BAD_REQUEST");
      expect(error.details).toBeUndefined();
    });

    it("internal静的メソッドで500エラーを作成する", () => {
      const cause = new Error("原因エラー");
      const error = AppError.internal("内部エラー", cause);
      expect(error.message).toBe("内部エラー");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.details).toBe("原因エラー");
    });

    it("internal静的メソッドでcauseなしで作成する", () => {
      const error = AppError.internal("内部エラー");
      expect(error.details).toBeUndefined();
    });
  });

  describe("formatZodError", () => {
    it("ZodErrorを整形する", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
      });

      const result = schema.safeParse({ name: 123, age: -1 });
      if (!result.success) {
        const formatted = formatZodError(result.error);
        expect(formatted).toContain("name");
        expect(formatted).toContain("age");
      }
    });

    it("複数のエラーをセミコロンで区切る", () => {
      const schema = z.object({
        a: z.string(),
        b: z.number(),
        c: z.boolean(),
      });

      const result = schema.safeParse({ a: 1, b: "x", c: 0 });
      if (!result.success) {
        const formatted = formatZodError(result.error);
        expect(formatted).toContain(";");
      }
    });

    it("ネストしたパスをドットで区切る", () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      const result = schema.safeParse({ user: { email: "invalid" } });
      if (!result.success) {
        const formatted = formatZodError(result.error);
        expect(formatted).toContain("user.email");
      }
    });
  });

  describe("errorHandler middleware", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("AppErrorを正しくハンドリングする", async () => {
      const { ctx, jsonMock } = createMockContext();
      const middleware = errorHandler();

      const error = AppError.notFound("リソース");
      const next = vi.fn().mockRejectedValue(error);

      await middleware(ctx, next);

      expect(jsonMock).toHaveBeenCalledWith(
        {
          success: false,
          error: "リソースが見つかりません",
          code: "NOT_FOUND",
          details: undefined,
        },
        expect.any(Number)
      );
    });

    it("AppError.badRequestを正しくハンドリングする", async () => {
      const { ctx, jsonMock } = createMockContext();
      const middleware = errorHandler();

      const error = AppError.badRequest("無効な入力", "詳細情報");
      const next = vi.fn().mockRejectedValue(error);

      await middleware(ctx, next);

      expect(jsonMock).toHaveBeenCalledWith(
        {
          success: false,
          error: "無効な入力",
          code: "BAD_REQUEST",
          details: "詳細情報",
        },
        expect.any(Number)
      );
    });

    it("ZodErrorを正しくハンドリングする", async () => {
      const { ctx, jsonMock } = createMockContext();
      const middleware = errorHandler();

      const schema = z.object({ name: z.string() });
      const result = schema.safeParse({ name: 123 });
      if (!result.success) {
        const next = vi.fn().mockRejectedValue(result.error);

        await middleware(ctx, next);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: "バリデーションエラー",
            code: "VALIDATION_ERROR",
            details: expect.stringContaining("name"),
          }),
          expect.any(Number)
        );
      }
    });

    it("一般的なErrorを正しくハンドリングする", async () => {
      const { ctx, jsonMock } = createMockContext();
      const middleware = errorHandler();

      const error = new Error("一般的なエラー");
      const next = vi.fn().mockRejectedValue(error);

      await middleware(ctx, next);

      expect(jsonMock).toHaveBeenCalledWith(
        {
          success: false,
          error: "一般的なエラー",
          code: "UNKNOWN_ERROR",
        },
        expect.any(Number)
      );
    });

    it("messageなしのErrorをハンドリングする", async () => {
      const { ctx, jsonMock } = createMockContext();
      const middleware = errorHandler();

      const error = new Error("");
      const next = vi.fn().mockRejectedValue(error);

      await middleware(ctx, next);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "予期しないエラーが発生しました",
        }),
        expect.any(Number)
      );
    });

    it("Error以外のthrowをハンドリングする", async () => {
      const { ctx, jsonMock } = createMockContext();
      const middleware = errorHandler();

      const next = vi.fn().mockRejectedValue("文字列エラー");

      await middleware(ctx, next);

      expect(jsonMock).toHaveBeenCalledWith(
        {
          success: false,
          error: "予期しないエラーが発生しました",
          code: "UNKNOWN_ERROR",
        },
        expect.any(Number)
      );
    });

    it("オブジェクトがthrowされた場合をハンドリングする", async () => {
      const { ctx, jsonMock } = createMockContext();
      const middleware = errorHandler();

      const next = vi.fn().mockRejectedValue({ custom: "error" });

      await middleware(ctx, next);

      expect(jsonMock).toHaveBeenCalledWith(
        {
          success: false,
          error: "予期しないエラーが発生しました",
          code: "UNKNOWN_ERROR",
        },
        expect.any(Number)
      );
    });

    it("nullがthrowされた場合をハンドリングする", async () => {
      const { ctx, jsonMock } = createMockContext();
      const middleware = errorHandler();

      const next = vi.fn().mockRejectedValue(null);

      await middleware(ctx, next);

      expect(jsonMock).toHaveBeenCalledWith(
        {
          success: false,
          error: "予期しないエラーが発生しました",
          code: "UNKNOWN_ERROR",
        },
        expect.any(Number)
      );
    });

    it("エラーをコンソールにログ出力する", async () => {
      const { ctx } = createMockContext();
      const middleware = errorHandler();

      const error = new Error("テストエラー");
      const next = vi.fn().mockRejectedValue(error);

      await middleware(ctx, next);

      expect(consoleErrorSpy).toHaveBeenCalledWith("[error-handler]", error);
    });

    it("正常なリクエストはnextを呼ぶ", async () => {
      const { ctx } = createMockContext();
      const middleware = errorHandler();

      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(ctx, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("notFoundHandler", () => {
    it("404レスポンスを返す", () => {
      const jsonMock = vi.fn();
      const ctx = {
        json: jsonMock,
      } as unknown as Context;

      notFoundHandler(ctx);

      expect(jsonMock).toHaveBeenCalledWith(
        {
          success: false,
          error: "リソースが見つかりません",
          code: "NOT_FOUND",
        },
        404
      );
    });
  });
});
