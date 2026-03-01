/**
 * @abdd.meta
 * path: .pi/extensions/analytics-api.ts
 * role: LLM行動アナリティクスのREST APIサーバー
 * why: Web UIでリアルタイム監視を可能にするためのAPIを提供
 * related: .pi/lib/analytics/index.ts, .pi/web-ui/
 * public_api: startAnalyticsApiServer, stopAnalyticsApiServer
 * invariants: ポート3457を使用（デフォルト）
 * side_effects: HTTPサーバーの起動
 * failure_modes: ポート使用中、バインドエラー
 * @abdd.explain
 * overview: アナリティクスデータをHTTP APIで提供し、Web UIからのアクセスを可能にする
 * what_it_does:
 *   - GET /api/analytics/stats - ストレージ統計
 *   - GET /api/analytics/records - レコード一覧
 *   - GET /api/analytics/aggregates - 集計データ
 *   - GET /api/analytics/anomalies - 異常一覧
 *   - GET /api/analytics/summary - サマリー
 *   - 静的ファイル配信（Web UI）
 * why_it_exists:
 *   - ブラウザベースのリアルタイム監視を実現するため
 *   - 外部ツールとの連携を可能にするため
 * scope:
 *   in: HTTPリクエスト
 *   out: JSON レスポンス
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  getStorageStats,
  loadRecentRecords,
  getAnalyticsPaths,
} from "../lib/analytics/behavior-storage.js";
import {
  getAggregationSummary,
  loadAggregates,
} from "../lib/analytics/aggregator.js";
import {
  getAnomalySummary,
} from "../lib/analytics/anomaly-detector.js";

// ============================================================================
// Types
// ============================================================================

interface AnalyticsApiConfig {
  port: number;
  host: string;
  webUiPath: string;
}

// ============================================================================
// Server State
// ============================================================================

let server: Server | null = null;
let config: AnalyticsApiConfig = {
  port: 3457,
  host: "localhost",
  webUiPath: ".pi/web-ui",
};

// ============================================================================
// API Server
// ============================================================================

/**
 * アナリティクスAPIサーバーを起動
 * @summary HTTPサーバーを起動し、APIとWeb UIを提供
 * @param options 起動オプション
 * @returns サーバーインスタンス
 */
export async function startAnalyticsApiServer(
  options?: Partial<AnalyticsApiConfig>,
): Promise<Server> {
  if (server) {
    throw new Error("Analytics API server is already running");
  }

  config = { ...config, ...options };

  server = createServer(handleRequest);

  return new Promise((resolve, reject) => {
    server!.listen(config.port, config.host, () => {
      console.log(`Analytics API server running at http://${config.host}:${config.port}`);
      resolve(server!);
    });

    server!.on("error", (error) => {
      server = null;
      reject(error);
    });
  });
}

/**
 * アナリティクスAPIサーバーを停止
 */
export async function stopAnalyticsApiServer(): Promise<void> {
  if (!server) {
    return;
  }

  return new Promise((resolve) => {
    server!.close(() => {
      server = null;
      resolve();
    });
  });
}

/**
 * サーバーが起動中かどうか
 */
export function isAnalyticsApiServerRunning(): boolean {
  return server !== null;
}

// ============================================================================
// Request Handler
// ============================================================================

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || "/";
  const method = req.method || "GET";

  // CORS ヘッダー
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // API ルーティング
    if (url.startsWith("/api/analytics/")) {
      await handleApiRequest(url, req, res);
      return;
    }

    // Web UI 静的ファイル
    if (url === "/" || url.startsWith("/dashboard")) {
      await serveStaticFile("/index.html", res);
      return;
    }

    // その他の静的ファイル
    await serveStaticFile(url, res);
  } catch (error) {
    sendError(res, 500, `Internal server error: ${error}`);
  }
}

/**
 * API リクエストを処理
 */
async function handleApiRequest(
  url: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // GET /api/analytics/stats
  if (url === "/api/analytics/stats") {
    const stats = getStorageStats();
    sendJson(res, stats);
    return;
  }

  // GET /api/analytics/records?limit=N
  if (url.startsWith("/api/analytics/records")) {
    const limit = parseInt(new URL(url, `http://${config.host}`).searchParams.get("limit") || "50", 10);
    const records = loadRecentRecords(limit);
    sendJson(res, records);
    return;
  }

  // GET /api/analytics/aggregates?type=hourly|daily|weekly
  if (url.startsWith("/api/analytics/aggregates")) {
    const params = new URL(url, `http://${config.host}`).searchParams;
    const type = (params.get("type") || "daily") as "hourly" | "daily" | "weekly";

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const aggregates = loadAggregates(type, startDate, endDate);
    sendJson(res, aggregates);
    return;
  }

  // GET /api/analytics/anomalies
  if (url === "/api/analytics/anomalies") {
    const summary = getAnomalySummary();
    sendJson(res, summary);
    return;
  }

  // GET /api/analytics/summary
  if (url === "/api/analytics/summary") {
    const summary = getAggregationSummary();
    sendJson(res, summary);
    return;
  }

  // GET /api/analytics/paths
  if (url === "/api/analytics/paths") {
    const paths = getAnalyticsPaths();
    sendJson(res, paths);
    return;
  }

  // Unknown API endpoint
  sendError(res, 404, "Not found");
}

/**
 * 静的ファイルを配信
 */
async function serveStaticFile(url: string, res: ServerResponse): Promise<void> {
  const filePath = join(process.cwd(), config.webUiPath, url === "/" ? "index.html" : url);

  if (!existsSync(filePath)) {
    sendError(res, 404, "File not found");
    return;
  }

  const ext = extname(filePath);
  const contentTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };

  const contentType = contentTypes[ext] || "application/octet-stream";

  try {
    const content = readFileSync(filePath);
    res.setHeader("Content-Type", contentType);
    res.writeHead(200);
    res.end(content);
  } catch {
    sendError(res, 500, "Failed to read file");
  }
}

/**
 * JSON レスポンスを送信
 */
function sendJson(res: ServerResponse, data: unknown): void {
  res.setHeader("Content-Type", "application/json");
  res.writeHead(200);
  res.end(JSON.stringify(data, null, 2));
}

/**
 * エラーレスポンスを送信
 */
function sendError(res: ServerResponse, code: number, message: string): void {
  res.setHeader("Content-Type", "application/json");
  res.writeHead(code);
  res.end(JSON.stringify({ error: message }));
}

// ============================================================================
// TypeBox Schemas
// ============================================================================

const StartApiParams = Type.Object({
  port: Type.Optional(Type.Number({ description: "Port number (default: 3457)" })),
  host: Type.Optional(Type.String({ description: "Host to bind (default: localhost)" })),
});

const StopApiParams = Type.Object({});

const StatusApiParams = Type.Object({});

// ============================================================================
// Extension Factory
// ============================================================================

export default (pi: ExtensionAPI) => {
  pi.registerTool({
    name: "analytics_api_start",
    label: "Analytics API Start",
    description: "Start the LLM behavior analytics REST API server for web UI dashboard",
    parameters: StartApiParams,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        await startAnalyticsApiServer({
          port: params.port ?? 3457,
          host: params.host ?? "localhost",
        });
        return {
          content: [{
            type: "text",
            text: `Analytics API server started at http://${config.host}:${config.port}`,
          }],
          details: {
            status: "success",
            port: config.port,
            host: config.host,
          },
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
          details: {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  });

  pi.registerTool({
    name: "analytics_api_stop",
    label: "Analytics API Stop",
    description: "Stop the LLM behavior analytics REST API server",
    parameters: StopApiParams,

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      try {
        await stopAnalyticsApiServer();
        return {
          content: [{
            type: "text",
            text: "Analytics API server stopped",
          }],
          details: { status: "success" },
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
          details: {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  });

  pi.registerTool({
    name: "analytics_api_status",
    label: "Analytics API Status",
    description: "Check if the analytics API server is running",
    parameters: StatusApiParams,

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const running = isAnalyticsApiServerRunning();
      return {
        content: [{
          type: "text",
          text: running
            ? `Analytics API server is running at http://${config.host}:${config.port}`
            : "Analytics API server is not running",
        }],
        details: {
          status: "success",
          running,
          port: config.port,
          host: config.host,
          url: running ? `http://${config.host}:${config.port}` : null,
        },
      };
    },
  });

  pi.registerCommand("analytics-dashboard", {
    description: "Open the LLM behavior analytics dashboard in browser",
    handler: async (_args, _ctx) => {
      if (!isAnalyticsApiServerRunning()) {
        await startAnalyticsApiServer();
      }
      console.log(`Dashboard available at: http://${config.host}:${config.port}`);
    },
  });
};
