/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/sse.ts
 * @role SSEルート定義
 * @why リアルタイムイベントストリームの提供
 * @related services/sse-service.ts
 * @public_api sseRoutes
 * @invariants 接続は自動的にクリーンアップされる
 * @side_effects 長時間のHTTP接続維持
 * @failure_modes クライアント切断
 *
 * @abdd.explain
 * @overview Server-Sent Events エンドポイント
 * @what_it_does SSE接続の確立と管理
 * @why_it_exists リアルタイム更新の実現
 * @scope(in) HTTPリクエスト
 * @scope(out) SSEストリーム
 */

import { Hono } from "hono";
import { getSSEService } from "../services/sse-service.js";
import { getInstanceService } from "../services/instance-service.js";
import type { ServerResponse } from "http";
import { randomUUID } from "crypto";

/**
 * SSEルート
 */
export const sseRoutes = new Hono();

/**
 * GET /api/sse - SSE接続
 */
sseRoutes.get("/", async (c) => {
  const sseService = getSSEService();
  const instanceService = getInstanceService();

  // SSEヘッダー設定
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no"); // Nginx対策

  // クライアントID生成
  const clientId = randomUUID();

  // レスポンスオブジェクトを取得
  // Honoの仕組み上、Node.jsのServerResponseを直接操作する必要がある
  const res = c.res as unknown as ServerResponse;

  // クライアントを登録
  sseService.addClient(clientId, res);

  // 初期接続メッセージ
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  // 切断時のクリーンアップ
  res.on("close", () => {
    sseService.removeClient(clientId);
  });

  // 接続を維持
  return new Promise<void>((resolve) => {
    res.on("close", () => {
      resolve();
    });
  });
});

/**
 * POST /api/sse/broadcast - 手動ブロードキャスト（デバッグ用）
 */
sseRoutes.post("/broadcast", async (c) => {
  const body = await c.req.json();
  const { type, data } = body;

  if (!type || !data) {
    return c.json({ success: false, error: "typeとdataが必要です" }, 400);
  }

  const sseService = getSSEService();
  const clientCount = sseService.getClientCount();

  sseService.broadcast({
    type,
    data,
    timestamp: Date.now(),
  });

  return c.json({
    success: true,
    data: { broadcastedTo: clientCount },
  });
});

/**
 * GET /api/sse/clients - 接続クライアント数
 */
sseRoutes.get("/clients", (c) => {
  const sseService = getSSEService();
  const count = sseService.getClientCount();

  return c.json({
    success: true,
    data: { clientCount: count },
  });
});
