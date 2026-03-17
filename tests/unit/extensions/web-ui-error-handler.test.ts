/**
 * @fileoverview errorHandler middlewareのユニットテスト
 * 以下のエッジケースをテスト:
 * - Non-Error thrown values
 * - 循環参照を含むエラー詳細
 * - 各種ステータスコード
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  errorHandler,
  handleError,
  AppError,
  formatZodError,
} from "../../../.pi/extensions/web-ui/src/middleware/error-handler.js";
import { ZodError, z } from "zod";

/**
 * テスト用アプリセットアップ
 * 本番と同じパターン: middleware + onError の両方を使用
 */
function setupTestApp(): Hono {
  const app = new Hono();
  // middlewareパターン: non-Error thrown values をキャッチ
  app.use("*", errorHandler());
  // onErrorパターン: Error オブジェクトをキャッチ
  app.onError(handleError);
  return app;
}

describe("errorHandler middleware", () => {
  let app: Hono;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = setupTestApp();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("AppError handling", () => {
    it("AppErrorを正しくハンドリングする", async () => {
      app.get("/test", () => {
        throw new AppError("テストエラー", 400, "TEST_ERROR", "詳細情報");
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body).toEqual({
        success: false,
        error: "テストエラー",
        code: "TEST_ERROR",
        details: "詳細情報",
      });
    });

    it("AppError.notFound()を正しくハンドリングする", async () => {
      app.get("/test", () => {
        throw AppError.notFound("リソース");
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("AppError.badRequest()を正しくハンドリングする", async () => {
      app.get("/test", () => {
        throw AppError.badRequest("不正なリクエスト", "フィールドが不足");
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe("BAD_REQUEST");
      expect(body.details).toBe("フィールドが不足");
    });

    it("AppError.internal()を正しくハンドリングする", async () => {
      app.get("/test", () => {
        throw AppError.internal("内部エラー", new Error("原因"));
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.code).toBe("INTERNAL_ERROR");
      expect(body.details).toBe("原因");
    });
  });

  describe("ZodError handling", () => {
    it("ZodErrorを正しくハンドリングする", async () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().min(0),
      });

      app.get("/test", () => {
        try {
          schema.parse({ name: "", age: -1 });
        } catch (e) {
          throw e;
        }
        return new Response("ok");
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.success).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("通常のErrorを正しくハンドリングする", async () => {
      app.get("/test", () => {
        throw new Error("通常のエラー");
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body).toEqual({
        success: false,
        error: "通常のエラー",
        code: "UNKNOWN_ERROR",
      });
    });

    it("メッセージなしのErrorを正しくハンドリングする", async () => {
      app.get("/test", () => {
        throw new Error();
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toBe("予期しないエラーが発生しました");
    });
  });

  describe("Non-Error thrown values", () => {
    it("文字列がthrowされた場合、detailsに含める", async () => {
      app.get("/test", () => {
        throw "文字列エラー";
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.code).toBe("UNKNOWN_ERROR");
      expect(body.details).toContain("文字列エラー");
      expect(body.details).toContain("非Error値がthrowされました");
    });

    it("オブジェクトがthrowされた場合、detailsに含める", async () => {
      app.get("/test", () => {
        throw { custom: "error", code: 123 };
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.details).toContain('"custom":"error"');
      expect(body.details).toContain('"code":123');
    });

    it("numberがthrowされた場合、detailsに含める", async () => {
      app.get("/test", () => {
        throw 42;
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.details).toContain("42");
    });

    it("nullがthrowされた場合、detailsに含める", async () => {
      app.get("/test", () => {
        throw null;
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.details).toContain("null");
    });

    it("undefinedがthrowされた場合、detailsに含める", async () => {
      app.get("/test", () => {
        throw undefined;
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.details).toContain("undefined");
    });
  });

  describe("Circular reference handling", () => {
    it("AppErrorのdetailsに循環参照がある場合、安全に処理する", async () => {
      app.get("/test", () => {
        const obj: Record<string, unknown> = { name: "test" };
        obj.self = obj; // 循環参照
        throw new AppError("循環参照エラー", 500, "CIRCULAR", obj as string);
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      // フォールバックメッセージが返されることを確認
      expect(body.details).toBeDefined();
    });

    it("response.detailsに循環参照を含むオブジェクトがある場合、フォールバックする", async () => {
      app.get("/test", () => {
        const circular: Record<string, unknown> = { value: 1 };
        circular.myself = circular;
        throw new AppError(
          "テスト",
          500,
          "TEST",
          circular as unknown as string
        );
      });

      const res = await app.request("/test");
      const body = await res.json();

      expect(res.status).toBe(500);
      // シリアライズ失敗時はフォールバックメッセージ
      expect(body.details).toBeDefined();
    });
  });

  describe("Logging", () => {
    it("エラー発生時にconsole.errorでログ出力する", async () => {
      app.get("/test", () => {
        throw new Error("ログテスト");
      });

      await app.request("/test");

      expect(consoleErrorSpy).toHaveBeenCalled();
      // ログの最初の引数が "[error-handler]" であることを確認
      const loggedMessages = consoleErrorSpy.mock.calls.map((call) => call[0]);
      expect(loggedMessages.some((msg) => msg === "[error-handler]")).toBe(true);
    });
  });
});

describe("formatZodError", () => {
  it("ZodErrorを整形する", () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });

    try {
      schema.parse({ name: "", age: -1 });
    } catch (e) {
      if (e instanceof ZodError) {
        const formatted = formatZodError(e);
        expect(formatted).toContain("name");
        expect(formatted).toContain("age");
      }
    }
  });
});

describe("AppError static methods", () => {
  it("notFoundが正しいプロパティを持つ", () => {
    const error = AppError.notFound("ユーザー");
    expect(error.message).toBe("ユーザーが見つかりません");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("badRequestが正しいプロパティを持つ", () => {
    const error = AppError.badRequest("無効な入力", "name is required");
    expect(error.message).toBe("無効な入力");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.details).toBe("name is required");
  });

  it("internalが正しいプロパティを持つ", () => {
    const cause = new Error("DB connection failed");
    const error = AppError.internal("サーバーエラー", cause);
    expect(error.message).toBe("サーバーエラー");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.details).toBe("DB connection failed");
  });
});

describe("formatZodError", () => {
  it("ZodErrorを整形する", () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });

    try {
      schema.parse({ name: "", age: -1 });
    } catch (e) {
      if (e instanceof ZodError) {
        const formatted = formatZodError(e);
        expect(formatted).toContain("name");
        expect(formatted).toContain("age");
      }
    }
  });
});

describe("AppError static methods", () => {
  it("notFoundが正しいプロパティを持つ", () => {
    const error = AppError.notFound("ユーザー");
    expect(error.message).toBe("ユーザーが見つかりません");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("badRequestが正しいプロパティを持つ", () => {
    const error = AppError.badRequest("無効な入力", "name is required");
    expect(error.message).toBe("無効な入力");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.details).toBe("name is required");
  });

  it("internalが正しいプロパティを持つ", () => {
    const cause = new Error("DB connection failed");
    const error = AppError.internal("サーバーエラー", cause);
    expect(error.message).toBe("サーバーエラー");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.details).toBe("DB connection failed");
  });
});