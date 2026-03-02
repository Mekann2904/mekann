/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/server.ts
 * @role HTTP server for Web UI extension
 * @why Serve Preact dashboard to browser with multi-instance support and real-time updates
 * @related index.ts, lib/instance-registry.ts, routes/*.ts, middleware/*.ts
 * @public_api startServer, stopServer, isServerRunning, getServerPort, broadcastSSEEvent, getSSEClientCount, addContextHistory
 * @invariants Server must clean up on shutdown, SSE clients must be cleaned up on disconnect
 * @side_effects Opens TCP port, serves HTTP requests, accesses shared storage, maintains SSE connections
 * @failure_modes Port in use, file not found, SSE connection failures
 *
 * @abdd.explain
 * @overview Express server that serves static files, API endpoints, and SSE for real-time updates
 * @what_it_does Hosts built Preact app, provides REST API for pi state and instances, broadcasts SSE events
 * @why_it_exists Allows browser access to pi monitoring/configuration with real-time push notifications
 * @scope(in) ExtensionAPI, ExtensionContext, SSE events
 * @scope(out) HTTP responses, shared storage files, SSE broadcasts
 */

import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server as HttpServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Middleware
import { securityHeaders, corsMiddleware } from "./middleware/cors.js";

// Routes
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerInstanceRoutes } from "./routes/instances.js";
import { registerRuntimeRoutes } from "./routes/runtime.js";
import { registerUlWorkflowRoutes } from "./routes/ul-workflow.js";
import { registerSSERoutes } from "./routes/sse.js";

// Lib
import {
  ServerRegistry,
  ContextHistoryStorage,
  type ContextHistoryEntry,
} from "./lib/instance-registry.js";
import { SSEEventBus, type SSEEvent, type SSEEventType } from "./lib/sse-bus.js";
import { cleanupDeadOwnerUlWorkflowTasks } from "./lib/server-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Re-export types for backward compatibility
export type { SSEEventType, SSEEvent };

const sseEventBus = new SSEEventBus();
let contextCleanupInterval: ReturnType<typeof setInterval> | null = null;
let ulTaskCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * @summary 現在のインスタンス用コンテキスト履歴ストレージ
 */
let contextHistoryStorage: ContextHistoryStorage | null = null;

/**
 * @summary コンテキスト履歴を追加してSSEで通知
 * @param entry - コンテキスト履歴エントリ（pidは省略可能、省略時はprocess.pid）
 */
export function addContextHistory(entry: Omit<ContextHistoryEntry, "pid"> & { pid?: number }): void {
  const pid = entry.pid ?? process.pid;

  if (!contextHistoryStorage || contextHistoryStorage.getPid() !== pid) {
    // 古いインスタンスを解放してから新規作成
    contextHistoryStorage?.dispose();
    contextHistoryStorage = new ContextHistoryStorage(pid);
  }

  contextHistoryStorage.add(entry);

  // SSEでコンテキスト更新を通知
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
  server: HttpServer | null;
  port: number;
  pi: ExtensionAPI | null;
  ctx: ExtensionContext | null;
  unsubscribeSessionEvents: (() => void) | null;
}

const state: ServerState = {
  server: null,
  port: 3456,
  pi: null,
  ctx: null,
  unsubscribeSessionEvents: null,
};

/**
 * @summary Get extension context
 */
export function getContext(): ExtensionContext | null {
  return state.ctx;
}

/**
 * @summary Get extension API
 */
export function getPi(): ExtensionAPI | null {
  return state.pi;
}

/**
 * @summary Start HTTP server for Web UI
 * @param port Port number to listen on
 * @param pi Extension API instance
 * @param ctx Extension context
 * @returns HTTP server instance
 */
export function startServer(
  port: number,
  pi: ExtensionAPI,
  ctx: ExtensionContext
): HttpServer {
  const app: Express = express();
  
  // セキュリティミドルウェアを適用
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(express.json());

  state.pi = pi;
  state.ctx = ctx;

  // Register this server
  ServerRegistry.register(process.pid, port);

  // Cleanup UL tasks owned by inactive instances
  const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
  if (cleanedCount > 0) {
    console.log(`[web-ui] Cleaned up ${cleanedCount} UL task(s) from inactive instances`);
  }

  // ============= Register API Routes =============

  // Instance and status routes
  registerInstanceRoutes(app, () => state.ctx);

  // SSE routes
  registerSSERoutes(app, sseEventBus);

  // MCP routes
  registerMcpRoutes(app);

  // Task routes
  registerTaskRoutes(app);

  // Analytics routes
  registerAnalyticsRoutes(app);

  // UL Workflow routes
  registerUlWorkflowRoutes(app);

  // Runtime routes (returns unsubscribe function)
  state.unsubscribeSessionEvents = registerRuntimeRoutes(app);

  // ============= Static Files =============

  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));

  // ============= SPA Fallback =============

  app.get("*", (req: Request, res: Response) => {
    // Skip API routes
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not found" });
      return;
    }

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

  state.server = createServer(app);
  state.port = port;

  state.server.listen(port, () => {
    // コンテキスト履歴ストレージを初期化
    // 既存インスタンスがあれば解放してから再作成
    contextHistoryStorage?.dispose();
    contextHistoryStorage = new ContextHistoryStorage(process.pid);

    // SSEハートビートを開始
    sseEventBus.startHeartbeat();

    // インスタンス情報の定期ブロードキャストを開始
    // Import InstanceRegistry dynamically to avoid circular dependency
    import("./lib/instance-registry.js").then(({ InstanceRegistry }) => {
      sseEventBus.startInstancesBroadcast(() => InstanceRegistry.getAll());
    });

    // 定期的に古い履歴ファイルをクリーンアップ（5分ごと）
    if (contextCleanupInterval) {
      clearInterval(contextCleanupInterval);
    }
    contextCleanupInterval = setInterval(() => {
      ContextHistoryStorage.cleanup();
    }, 5 * 60 * 1000);

    // 定期的に非アクティブなインスタンスが所有するULタスクをクリーンアップ（5分ごと）
    if (ulTaskCleanupInterval) {
      clearInterval(ulTaskCleanupInterval);
    }
    ulTaskCleanupInterval = setInterval(() => {
      const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
      if (cleanedCount > 0) {
        console.log(`[web-ui] Periodic cleanup: removed ${cleanedCount} UL task(s) from inactive instances`);
      }
    }, 5 * 60 * 1000);

    // MCPサーバー設定ファイルからの自動接続は無効化
    // 理由: MCPサーバーの起動メッセージがTUI入力欄に混入する問題を回避
    // 必要な場合は手動で接続してください
    // loadAndConnectMcpServers();

    // Server start notification is handled by ctx.ui.notify in index.ts
    // to avoid TUI input field overlap
  });

  return state.server;
}

/**
 * @summary Stop the HTTP server
 */
export function stopServer(): void {
  if (state.server) {
    // Unsubscribe from session events
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
    ServerRegistry.unregister();

    // バッファをフラッシュしてイベントリスナーを削除
    if (contextHistoryStorage) {
      contextHistoryStorage.dispose();
      contextHistoryStorage = null;
    }
  }
}

/**
 * @summary Check if server is running
 */
export function isServerRunning(): boolean {
  return state.server !== null;
}

/**
 * @summary Get current server port
 */
export function getServerPort(): number {
  return state.port;
}

/**
 * @summary Broadcast SSE event to all connected clients
 */
export function broadcastSSEEvent(event: SSEEvent): void {
  sseEventBus.broadcast(event);
}

/**
 * @summary Get connected SSE client count
 */
export function getSSEClientCount(): number {
  return sseEventBus.getClientCount();
}
