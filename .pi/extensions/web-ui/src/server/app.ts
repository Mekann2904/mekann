/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/server/app.ts
 * @role Hono アプリケーション定義
 * @why ルート統合とミドルウェア設定
 * @related server/index.ts, routes/*.ts
 * @public_api createApp, AppContext
 * @invariants すべてのルートはバリデーション済み
 * @side_effects なし
 * @failure_modes なし
 *
 * @abdd.explain
 * @overview Hono アプリケーションのファクトリ関数
 * @what_it_does ミドルウェア設定、ルート登録、エラーハンドリング
 * @why_it_exists アプリケーション設定の一元管理
 * @scope(in) なし
 * @scope(out) Hono アプリケーション
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { errorHandler, notFoundHandler } from "../middleware/error-handler.js";
import { taskRoutes } from "../routes/tasks.js";
import { instanceRoutes } from "../routes/instances.js";
import { sseRoutes } from "../routes/sse.js";
import { analyticsRoutes } from "../routes/analytics.js";
import { themeRoutes } from "../routes/theme.js";
import { agentUsageRoutes } from "../routes/agent-usage.js";
import { contextHistoryRoutes } from "../routes/context-history.js";
import { mcpRoutes } from "../routes/mcp.js";

/**
 * アプリケーションコンテキスト型
 */
export interface AppContext {
  Variables: {
    validatedBody: unknown;
    validatedQuery: unknown;
    validatedParams: unknown;
  };
}

/**
 * Hono アプリケーションを作成
 */
export function createApp(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  // グローバルミドルウェア
  app.use("*", logger());
  app.use("*", secureHeaders());
  
  // CORS（localhostのみ許可）
  app.use("*", cors({
    origin: ["http://localhost:*", "http://127.0.0.1:*"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  // エラーハンドラー
  app.use("*", errorHandler());

  // ヘルスチェック
  app.get("/api/health", (c) => {
    return c.json({
      success: true,
      data: {
        status: "ok",
        timestamp: new Date().toISOString(),
        pid: process.pid,
      },
    });
  });

  // API ルート登録
  app.route("/api/tasks", taskRoutes);
  app.route("/api/instances", instanceRoutes);
  app.route("/api/sse", sseRoutes);
  app.route("/api/analytics", analyticsRoutes);
  app.route("/api/theme", themeRoutes);
  app.route("/api/agent-usage", agentUsageRoutes);
  app.route("/api/context-history", contextHistoryRoutes);
  app.route("/api/mcp", mcpRoutes);

  // TODO: 他のルートを追加
  // app.route("/api/ul-workflow", ulWorkflowRoutes);

  // 404 ハンドラー
  app.notFound(notFoundHandler);

  return app;
}

/**
 * 型エクスポート
 */
export type App = Hono<AppContext>;
