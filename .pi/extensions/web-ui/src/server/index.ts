/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/server/index.ts
 * @role サーバーエントリーポイント
 * @why Unix Socket でのHTTPサーバー起動
 * @related server/app.ts, server/socket.ts
 * @public_api startServer, stopServer
 * @invariants サーバーは正常にシャットダウン
 * @side_effects Unix Socket ファイルの作成・削除、TCPポートのリッスン
 * @failure_modes Socket ファイル作成失敗、ポート使用中
 *
 * @abdd.explain
 * @overview Unix Socket または TCP でサーバーを起動
 * @what_it_does サーバー起動・停止、シグナルハンドリング
 * @why_it_exists 安全なローカルアクセスの提供
 * @scope(in) 設定オプション
 * @scope(out) HTTP サーバー
 */

import { createServer } from "http";
import { createServer as createSecureServer } from "https";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

/**
 * サーバー設定
 */
export interface ServerConfig {
  /** Unix Socket パス（指定時はTCPより優先） */
  socketPath?: string;
  /** TCP ポート（socketPath未指定時使用） */
  port?: number;
  /** ホスト */
  host?: string;
  /** 静的ファイルのディレクトリ */
  staticDir?: string;
}

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: Required<Omit<ServerConfig, "socketPath">> & { socketPath?: string } = {
  port: 3000,
  host: "127.0.0.1",
  staticDir: join(process.cwd(), ".pi", "extensions", "web-ui", "web", "dist"),
};

/**
 * 共有ディレクトリ
 */
const SHARED_DIR = join(homedir(), ".pi-shared");

/**
 * サーバーインスタンス
 */
let server: ReturnType<typeof serve> | null = null;

/**
 * Unix Socket サーバーを起動
 */
export function startServer(config: ServerConfig = {}): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const app = createApp();

  // Unix Socket 使用時
  if (cfg.socketPath) {
    const socketPath = cfg.socketPath;
    
    // 既存のソケットファイルを削除
    if (existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch (error) {
        console.error(`[server] Failed to remove existing socket: ${error}`);
      }
    }

    // Unix Socket でリッスン
    const httpServer = createServer(app.fetch.bind(app));
    
    httpServer.listen(socketPath, () => {
      console.log(`[server] Listening on Unix Socket: ${socketPath}`);
    });

    server = httpServer as unknown as ReturnType<typeof serve>;

    // シャットダウンハンドラー
    setupShutdownHandlers(socketPath);
  } else {
    // TCP でリッスン
    server = serve({
      fetch: app.fetch,
      port: cfg.port,
      hostname: cfg.host,
    });

    console.log(`[server] Listening on http://${cfg.host}:${cfg.port}`);

    // シャットダウンハンドラー
    setupShutdownHandlers();
  }
}

/**
 * サーバーを停止
 */
export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
    console.log("[server] Server stopped");
  }
}

/**
 * サーバーが実行中か確認
 */
export function isServerRunning(): boolean {
  return server !== null;
}

/**
 * シャットダウンハンドラーを設定
 */
function setupShutdownHandlers(socketPath?: string): void {
  const shutdown = (signal: string) => {
    console.log(`[server] Received ${signal}, shutting down...`);
    
    if (socketPath && existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch {
        // 無視
      }
    }
    
    stopServer();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * CLI エントリーポイント
 */
if (process.argv[1]?.includes("server/index.ts") || process.argv[1]?.includes("server/index.js")) {
  const socketPath = join(SHARED_DIR, "web-ui.sock");
  startServer({ socketPath });
}
