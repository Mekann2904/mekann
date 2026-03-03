/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/server/express-adapter.ts
 * @role HonoアプリをExpressにマウントするアダプター
 * @why 段階的なExpress→Hono移行
 * @related server/app.ts, unified-server.ts
 * @public_api honoToExpress
 * @invariants リクエスト・レスポンスが正しく変換される
 * @side_effects なし
 * @failure_modes なし
 *
 * @abdd.explain
 * @overview HonoアプリケーションをExpressミドルウェアとして使用
 * @what_it_does HonoのRequest/ResponseをExpressのreq/resに変換
 * @why_it_exists 段階的移行のためのブリッジ
 * @scope(in) Express Request/Response
 * @scope(out) Hono Response
 */

import type { Request, Response, NextFunction } from "express";
import type { Hono } from "hono";

/**
 * HonoアプリをExpressミドルウェアに変換
 */
export function honoToExpress(app: Hono) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // リクエストURLを構築
      const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

      // リクエストボディを処理
      let body: string | undefined;
      if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        body = JSON.stringify(req.body);
      }

      // Request オブジェクトを作成
      const request = new Request(url, {
        method: req.method,
        headers: new Headers(req.headers as Record<string, string>),
        body: body,
      });

      // Honoでリクエストを処理（fetchメソッドを使用）
      const response = await app.fetch(request);

      // レスポンスヘッダーを設定
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // ステータスコードを設定
      res.status(response.status);

      // レスポンスボディを送信
      const responseBody = await response.text();
      res.send(responseBody);
    } catch (error) {
      // Honoで処理できなかった場合は次のミドルウェアへ
      next(error);
    }
  };
}

/**
 * 特定パス以下をHonoアプリで処理
 */
export function mountHonoOnExpress(
  expressApp: ReturnType<typeof import("express")>,
  path: string,
  honoApp: Hono
): void {
  const middleware = honoToExpress(honoApp);
  expressApp.use(path, middleware);
}
