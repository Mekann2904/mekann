/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/unified-server.ts
 * @role Unified HTTP server for Web UI (Hono-only architecture)
 * @why Express依存を削除してHonoのみで構成
 * @related config.ts, src/server/app.ts, src/routes/*.ts
 * @public_api startUnifiedServer, stopUnifiedServer, isServerRunning, getServerPort, broadcastSSEEvent
 * @invariants Server must clean up on shutdown, SSE clients must be cleaned up on disconnect
 * @side_effects Opens TCP port, serves HTTP requests, accesses shared storage, maintains SSE connections
 * @failure_modes Port in use, file not found, SSE connection failures
 *
 * @abdd.explain
 * @overview Hono-only server that serves static files, API endpoints, and SSE
 * @what_it_does Hosts built Preact app, provides REST API, broadcasts SSE events, manages instances
 * @why_it_exists Express依存を削除してシンプルに
 * @scope(in) ExtensionAPI, ExtensionContext, SSE events, shared storage
 * @scope(out) HTTP responses, SSE broadcasts, shared storage updates
 */

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import path from "path";
import { fileURLToPath } from "url";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Hono routes
import { createApp } from "./src/server/app.js";

// Lib
import {
  ContextHistoryStorage,
  type ContextHistoryEntry,
} from "./lib/instance-registry.js";
import { SSEEventBus, type SSEEvent, type SSEEventType } from "./lib/sse-bus.js";
import { cleanupDeadOwnerUlWorkflowTasks } from "./lib/server-utils.js";
import { getConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Re-export types for backward compatibility
export type { SSEEventType, SSEEvent };

// Global instances
const sseEventBus = new SSEEventBus();
let contextCleanupInterval: ReturnType<typeof setInterval> | null = null;
let ulTaskCleanupInterval: ReturnType<typeof setInterval> | null = null;
let contextHistoryStorage: ContextHistoryStorage | null = null;

/**
 * コンテキスト履歴を追加してSSEでブロードキャスト
 */
export function addContextHistory(
  entry: Omit<ContextHistoryEntry, "pid"> & { pid?: number }
): void {
  const pid = entry.pid ?? process.pid;

  if (!contextHistoryStorage || contextHistoryStorage.getPid() !== pid) {
    contextHistoryStorage?.dispose();
    contextHistoryStorage = new ContextHistoryStorage(pid);
  }

  contextHistoryStorage.add(entry);

  sseEventBus.broadcast({
    type: "context-update",
    data: {
      pid,
      timestamp: entry.timestamp,
      input: entry.input,
      output: entry.output,
    },
    timestamp: Date.now(),
  });
}

interface ServerState {
  server: ReturnType<typeof serve> | null;
  port: number;
  pi: ExtensionAPI | null;
  ctx: ExtensionContext | null;
}

const state: ServerState = {
  server: null,
  port: 3000,
  pi: null,
  ctx: null,
};

/**
 * 拡張機能コンテキストを取得
 */
export function getContext(): ExtensionContext | null {
  return state.ctx;
}

/**
 * 拡張機能APIを取得
 */
export function getPi(): ExtensionAPI | null {
  return state.pi;
}

/**
 * 統合サーバーを起動
 */
export function startUnifiedServer(
  pi?: ExtensionAPI,
  ctx?: ExtensionContext
): ReturnType<typeof serve> {
  const config = getConfig();

  // API参照を保存（内部モード）
  if (pi && ctx) {
    state.pi = pi;
    state.ctx = ctx;
  }

  // 静的ファイル配信用ディレクトリ
  const distPath = path.join(__dirname, "dist");

  // Honoアプリを作成
  const app = new Hono();

  // グローバルミドルウェア
  app.use("*", logger());
  app.use("*", secureHeaders());
  app.use("*", cors({
    origin: ["http://localhost:*", "http://127.0.0.1:*"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  // 死んだオーナーのULタスクをクリーンアップ
  const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
  if (cleanedCount > 0) {
    console.log(`[web-ui] Cleaned up ${cleanedCount} UL task(s) from inactive instances`);
  }

  // ============= API Routes (Hono) =============
  // フロントエンドは /api/v2/* を使用
  const apiApp = createApp();
  app.route("/api/v2", apiApp);

  // 後方互換性のため /api/* もサポート（一時的）
  app.route("/api", apiApp);

  // ============= SSE Events =============
  // SSEイベントをJotai atomsに統合するためのエンドポイント
  app.get("/api/events", (c) => {
    // SSEヘッダー設定
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

    // EventSourceの実装はクライアント側で行う
    // ここでは接続IDを返す
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // ReadableStreamを使用してSSEを実装
    const stream = new ReadableStream({
      async start(controller) {
        // 初期接続メッセージ
        const connectMsg = `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`;
        controller.enqueue(new TextEncoder().encode(connectMsg));

        // ハートビート
        const heartbeatInterval = setInterval(() => {
          const heartbeatMsg = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(heartbeatMsg));
        }, 30000);

        // クリーンアップ用に保存
        // Note: 実際の実装ではSSEEventBusを使用
      },
    });

    return new Response(stream, {
      headers: c.res.headers,
    });
  });

  // ============= Static Files =============
  // 静的ファイル配信
  app.use("/*", serveStatic({ root: distPath }));

  // SPA フォールバック
  app.get("*", (c) => {
    return c.html(`
      <html>
        <body style="background:#0d1117;color:#f0f6fc;font-family:sans-serif;padding:2rem;">
          <h1>Build Required</h1>
          <p>Run <code style="background:#21262d;padding:0.25rem 0.5rem;border-radius:4px;">npm run build</code> in the web-ui directory first.</p>
        </body>
      </html>
    `, 404);
  });

  // ============= Server Registry =============
  import("./lib/instance-registry.js").then(({ ServerRegistry }) => {
    ServerRegistry.register(process.pid, config.port);
  });

  // ============= Start Server =============
  state.port = config.port;

  state.server = serve({
    fetch: app.fetch,
    port: config.port,
    hostname: "127.0.0.1",
  });

  // 初期化
  contextHistoryStorage?.dispose();
  contextHistoryStorage = new ContextHistoryStorage(process.pid);

  // SSEハートビート開始
  sseEventBus.startHeartbeat();

  // インスタンスブロードキャスト開始
  import("./lib/instance-registry.js").then(({ InstanceRegistry }) => {
    sseEventBus.startInstancesBroadcast(() => InstanceRegistry.getAll());
  });

  // 定期クリーンアップ
  if (contextCleanupInterval) {
    clearInterval(contextCleanupInterval);
  }
  contextCleanupInterval = setInterval(() => {
    ContextHistoryStorage.cleanup();
  }, config.cleanupInterval);

  if (ulTaskCleanupInterval) {
    clearInterval(ulTaskCleanupInterval);
  }
  ulTaskCleanupInterval = setInterval(() => {
    const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
    if (cleanedCount > 0) {
      console.log(`[web-ui] Periodic cleanup: removed ${cleanedCount} UL task(s)`);
    }
  }, config.ulTaskCleanupInterval);

  console.log(`[web-ui] Unified server started on port ${config.port}`);

  return state.server;
}

/**
 * サーバーを停止
 */
export function stopUnifiedServer(): void {
  if (state.server) {
    sseEventBus.stopHeartbeat();

    if (contextCleanupInterval) {
      clearInterval(contextCleanupInterval);
      contextCleanupInterval = null;
    }
    if (ulTaskCleanupInterval) {
      clearInterval(ulTaskCleanupInterval);
      ulTaskCleanupInterval = null;
    }

    // Node.jsのサーバーを閉じる
    state.server.close();
    state.server = null;

    if (contextHistoryStorage) {
      contextHistoryStorage.dispose();
      contextHistoryStorage = null;
    }

    import("./lib/instance-registry.js").then(({ ServerRegistry }) => {
      ServerRegistry.unregister();
    });

    console.log("[web-ui] Unified server stopped");
  }
}

/**
 * サーバーが実行中か確認
 */
export function isServerRunning(): boolean {
  return state.server !== null;
}

/**
 * 現在のポートを取得
 */
export function getServerPort(): number {
  return state.port;
}

/**
 * SSEイベントをブロードキャスト
 */
export function broadcastSSEEvent(event: SSEEvent): void {
  sseEventBus.broadcast(event);
}

/**
 * 接続中のSSEクライアント数を取得
 */
export function getSSEClientCount(): number {
  return sseEventBus.getClientCount();
}

// ============= Signal Handlers =============
function setupSignalHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`[web-ui] Received ${signal}, shutting down...`);
    stopUnifiedServer();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ============= CLI Entry Point =============
if (import.meta.url === `file://${process.argv[1]}`) {
  setupSignalHandlers();
  startUnifiedServer();
}
