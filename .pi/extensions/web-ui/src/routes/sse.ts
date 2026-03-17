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
import { randomUUID } from "crypto";

/**
 * グローバルSSEクライアント管理
 */
const sseClients = new Map<string, {
  controller: ReadableStreamDefaultController<Uint8Array>;
  lastHeartbeat: number;
}>();

/**
 * SSEルート
 */
export const sseRoutes = new Hono();

// ハートビート間隔（30秒）- BUG-1修正: 参照を保持してクリーンアップ可能に
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/**
 * ハートビートを開始
 */
function startHeartbeat(): void {
  if (heartbeatInterval) return; // 既に開始済み

  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    const msg = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: now })}\n\n`;
    const encoder = new TextEncoder();

    sseClients.forEach((client, id) => {
      try {
        client.controller.enqueue(encoder.encode(msg));
        client.lastHeartbeat = now;
      } catch {
        // クライアントが切断された
        sseClients.delete(id);
      }
    });
  }, 30000);
}

/**
 * SSEサーバーのクリーンアップ（サーバー停止時に呼び出す）
 */
export function cleanupSSE(): void {
  // シャットダウンイベントをブロードキャスト（クライアントが再接続しないように通知）
  if (sseClients.size > 0) {
    broadcastSSE({
      type: "server_shutdown",
      data: { reason: "server_stopping", timestamp: Date.now() }
    });
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  sseClients.clear();
  console.log("[sse] Cleaned up SSE resources");
}

// モジュール読み込み時にハートビートを開始
startHeartbeat();

/**
 * GET / - SSE接続
 */
sseRoutes.get("/", (c) => {
  const clientId = randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // クライアントを登録
      sseClients.set(clientId, {
        controller,
        lastHeartbeat: Date.now(),
      });

      // 初期接続メッセージ
      const connectMsg = `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`;
      controller.enqueue(encoder.encode(connectMsg));

      console.log(`[sse] Client ${clientId} connected`);
    },
    cancel() {
      // クライアント切断時のクリーンアップ
      sseClients.delete(clientId);
      console.log(`[sse] Client ${clientId} disconnected`);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

/**
 * POST /broadcast - 手動ブロードキャスト（デバッグ用）
 */
sseRoutes.post("/broadcast", async (c) => {
  try {
    const body = await c.req.json();
    const { type, data } = body;

    if (!type || !data) {
      return c.json({ success: false, error: "typeとdataが必要です" }, 400);
    }

    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\nid: ${Date.now()}\n\n`;
    const encoder = new TextEncoder();

    sseClients.forEach((client, id) => {
      try {
        client.controller.enqueue(encoder.encode(msg));
      } catch {
        sseClients.delete(id);
      }
    });

    return c.json({
      success: true,
      data: { broadcastedTo: sseClients.size },
    });
  } catch (error) {
    return c.json({ success: false, error: "Invalid JSON" }, 400);
  }
});

/**
 * GET /clients - 接続クライアント数
 */
sseRoutes.get("/clients", (c) => {
  return c.json({
    success: true,
    data: { clientCount: sseClients.size },
  });
});

/**
 * 外部からのブロードキャスト用
 * BUG-9修正: forEach中のdeleteを回避し、削除対象を配列に収集してから一括削除
 */
export function broadcastSSE(event: { type: string; data: unknown }): void {
  const msg = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${Date.now()}\n\n`;
  const encoder = new TextEncoder();

  // 削除対象を収集
  const toDelete: string[] = [];

  sseClients.forEach((client, id) => {
    try {
      client.controller.enqueue(encoder.encode(msg));
    } catch {
      // 削除対象に追加（forEach中はdeleteしない）
      toDelete.push(id);
    }
  });

  // 一括削除
  for (const id of toDelete) {
    sseClients.delete(id);
  }
}
