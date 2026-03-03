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

import { existsSync, readFileSync } from "fs";
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

  // 静的ファイル配信用ディレクトリ（絶対パス）
  const distPath = path.resolve(__dirname, "dist");
  console.log(`[web-ui] Static files directory: ${distPath}`);
  console.log(`[web-ui] Dist exists: ${existsSync(distPath)}`);

  // 死んだオーナーのULタスクをクリーンアップ
  const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
  if (cleanedCount > 0) {
    console.log(`[web-ui] Cleaned up ${cleanedCount} UL task(s) from inactive instances`);
  }

  // ============= Hono App =============
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

  // ============= API Routes =============
  // createApp() は src/server/app.ts で定義されたすべてのルートを含む
  const apiApp = createApp();
  
  // デバッグ: APIルートをログ出力
  console.log("[web-ui] API app created, routes:");
  try {
    apiApp.showRoutes();
  } catch {
    console.log("[web-ui] Could not show routes (expected in production)");
  }

  // フロントエンドは /api/v2/* を使用
  app.route("/api/v2", apiApp);
  console.log("[web-ui] API routes mounted at /api/v2");

  // 後方互換性のため /api/* もサポート（一時的）
  app.route("/api", apiApp);
  console.log("[web-ui] API routes also mounted at /api (for backward compatibility)");

  // デバッグ: 登録されたルートをログ出力
  console.log("[web-ui] Routes registered:");
  app.showRoutes();

  // ============= SSE Events =============
  // SSEイベントをJotai atomsに統合するためのエンドポイント
  app.get("/api/v2/events", (c) => {
    // SSEヘッダー設定
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    const stream = new ReadableStream({
      start(controller) {
        const connectMsg = `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`;
        controller.enqueue(new TextEncoder().encode(connectMsg));

        const heartbeatInterval = setInterval(() => {
          try {
            const heartbeatMsg = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
            controller.enqueue(new TextEncoder().encode(heartbeatMsg));
          } catch {
            clearInterval(heartbeatInterval);
          }
        }, 30000);
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

  // ============= Static Files =============
  // 静的ファイル配信
  app.use("/*", serveStatic({ root: distPath }));

  // SPA フォールバック（index.htmlを返す）
  app.get("*", (c) => {
    const indexPath = path.join(distPath, "index.html");
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html, 200, { "Content-Type": "text/html; charset=utf-8" });
    }
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
