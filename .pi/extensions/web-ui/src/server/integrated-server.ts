/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/server/integrated-server.ts
 * @role Express + Hono 統合サーバー
 * @why 段階的な移行のための統合エントリーポイント
 * @related express-adapter.ts, app.ts, unified-server.ts
 * @public_api startIntegratedServer, stopIntegratedServer
 * @invariants 既存APIとの後方互換性を維持
 * @side_effects HTTPサーバー起動
 * @failure_modes ポート競合
 *
 * @abdd.explain
 * @overview Expressベースの統合サーバーにHono APIをマウント
 * @what_it_does 新APIはHono、旧APIはExpressで提供
 * @why_it_exists ゼロダウンタイムでの移行
 * @scope(in) なし
 * @scope(out) HTTPサーバー
 */

import express from "express";
import type { Express, Request, Response } from "express";
import { createServer, type Server as HttpServer } from "http";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import type { Hono } from "hono";
import { mountHonoOnExpress } from "./express-adapter.js";
import { createApp } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 既存のExpressミドルウェア
import { securityHeaders, corsMiddleware } from "../../middleware/cors.js";
import { errorHandler, notFoundHandler } from "../../middleware/error-handler.js";

// 既存のExpressルート
import { registerTaskRoutes } from "../../routes/tasks.js";
import { registerMcpRoutes } from "../../routes/mcp.js";
import { registerAnalyticsRoutes } from "../../routes/analytics.js";
import { registerInstanceRoutes } from "../../routes/instances.js";
import { registerRuntimeRoutes } from "../../routes/runtime.js";
import { registerUlWorkflowRoutes } from "../../routes/ul-workflow.js";
import { registerSSERoutes } from "../../routes/sse.js";

// Lib
import {
  ContextHistoryStorage,
  type ContextHistoryEntry,
} from "../../lib/instance-registry.js";
import { SSEEventBus, type SSEEvent, type SSEEventType } from "../../lib/sse-bus.js";
import { cleanupDeadOwnerUlWorkflowTasks } from "../../lib/server-utils.js";
import { getConfig } from "../../config.js";

// Re-export types
export type { SSEEventType, SSEEvent };

// Global instances
const sseEventBus = new SSEEventBus();
let contextCleanupInterval: ReturnType<typeof setInterval> | null = null;
let ulTaskCleanupInterval: ReturnType<typeof setInterval> | null = null;
let contextHistoryStorage: ContextHistoryStorage | null = null;

interface ServerState {
  server: HttpServer | null;
  port: number;
  unsubscribeSessionEvents: (() => void) | null;
}

const state: ServerState = {
  server: null,
  port: 3000,
  unsubscribeSessionEvents: null,
};

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

/**
 * 統合サーバーを起動
 */
export function startIntegratedServer(): HttpServer {
  const config = getConfig();
  const app: Express = express();

  // セキュリティミドルウェア
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(express.json());

  // ============= 新しい Hono API =============
  // /api/v2/* 以下は新しいHono APIで処理
  const honoApp = createApp() as unknown as Hono;
  mountHonoOnExpress(app, "/api/v2", honoApp);

  // ============= 既存の Express API（後方互換性） =============

  // インスタンスルート
  registerInstanceRoutes(app, () => null);

  // SSEルート
  registerSSERoutes(app, sseEventBus);

  // MCPルート
  registerMcpRoutes(app);

  // タスクルート
  registerTaskRoutes(app);

  // 分析ルート
  registerAnalyticsRoutes(app);

  // ULワークフロールート
  registerUlWorkflowRoutes(app);

  // ============= サーバーレジストリ =============
  import("../../lib/instance-registry.js").then(({ ServerRegistry }) => {
    ServerRegistry.register(process.pid, config.port);
  });

  // ============= 静的ファイル =============
  const distPath = path.join(__dirname, "../../dist");
  app.use(express.static(distPath));

  // ============= エラーハンドラー =============
  app.use("/api/*", notFoundHandler);

  // SPA フォールバック
  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, "index.html"), (err) => {
      if (err) {
        res.status(404).send(`
          <html>
            <body style="background:#0d1117;color:#f0f6fc;font-family:sans-serif;padding:2rem;">
              <h1>Build Required</h1>
              <p>Run <code style="background:#21262d;padding:0.25rem 0.5rem;border-radius:4px;">npm run build</code> in the web-ui directory first.</p>
            </body>
          </html>
        `);
      }
    });
  });

  app.use(errorHandler);

  // ============= サーバー起動 =============
  state.server = createServer(app);
  state.port = config.port;

  state.server.listen(config.port, () => {
    // コンテキスト履歴ストレージ初期化
    contextHistoryStorage?.dispose();
    contextHistoryStorage = new ContextHistoryStorage(process.pid);

    // SSEハートビート開始
    sseEventBus.startHeartbeat();

    // インスタンスブロードキャスト開始
    import("../../lib/instance-registry.js").then(({ InstanceRegistry }) => {
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

    console.log(`[web-ui] Integrated server started on port ${config.port}`);
    console.log(`[web-ui] New API available at http://localhost:${config.port}/api/v2/`);
  });

  return state.server;
}

/**
 * サーバーを停止
 */
export function stopIntegratedServer(): void {
  if (state.server) {
    if (state.unsubscribeSessionEvents) {
      state.unsubscribeSessionEvents();
      state.unsubscribeSessionEvents = null;
    }

    sseEventBus.stopHeartbeat();

    if (contextCleanupInterval) {
      clearInterval(contextCleanupInterval);
      contextCleanupInterval = null;
    }
    if (ulTaskCleanupInterval) {
      clearInterval(ulTaskCleanupInterval);
      ulTaskCleanupInterval = null;
    }
    state.server.close();
    state.server = null;

    if (contextHistoryStorage) {
      contextHistoryStorage.dispose();
      contextHistoryStorage = null;
    }

    import("../../lib/instance-registry.js").then(({ ServerRegistry }) => {
      ServerRegistry.unregister();
    });

    console.log("[web-ui] Integrated server stopped");
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

// ============= シグナルハンドラー =============
function setupSignalHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`[web-ui] Received ${signal}, shutting down...`);
    stopIntegratedServer();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ============= CLI エントリーポイント =============
// 統合サーバーは unified-server.ts から起動されるため、
// ここでは直接起動のチェックをスキップ
