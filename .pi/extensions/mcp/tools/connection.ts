/**
 * @abdd.meta
 * path: .pi/extensions/mcp/tools/connection.ts
 * role: MCP接続管理ツールの登録
 * why: 接続関連のツールを分離し、mcp-client.tsの肥大化を防ぐため
 * related: ./shared.ts, ../mcp-client.ts
 * public_api: registerConnectionTools
 * invariants: なし
 * side_effects: ツール登録、ネットワーク接続
 * failure_modes: 接続エラー、タイムアウト
 * @abdd.explain
 * overview: MCP接続管理ツールの登録モジュール
 * what_it_does:
 *   - mcp_connect: サーバー接続
 *   - mcp_disconnect: 接続切断
 *   - mcp_list_connections: 接続一覧
 *   - mcp_reload_config: 設定再読み込み
 *   - mcp_ping: 接続ヘルスチェック
 * why_it_exists:
 *   - 接続管理ツールを分離して保守性を高めるため
 * scope:
 *   in: ./shared.ts
 *   out: ../mcp-client.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mcpManager } from "../../../lib/mcp/connection-manager.js";
import { formatConnectionList } from "../../../lib/mcp/tool-bridge.js";
import { sanitizeAuthForLogging } from "../../../lib/mcp/auth-provider.js";
import type { McpAuthProvider } from "../../../lib/mcp/types.js";
import {
  makeSuccessResult,
  makeErrorResult,
  detectConnectionType,
  autoConnectFromConfig,
} from "./shared.js";

/**
 * ツールパラメータの認証設定をMcpAuthProviderに変換する
 * @summary 認証パラメータを変換
 * @param auth - ツールパラメータの認証設定
 * @returns McpAuthProvider、または検証失敗時はundefined
 */
function toMcpAuthProvider(auth: {
  type?: "bearer" | "basic" | "api-key" | "custom";
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  headerName?: string;
  headers?: Record<string, string>;
} | undefined): McpAuthProvider | undefined {
  if (!auth || !auth.type) return undefined;

  switch (auth.type) {
    case "bearer":
      if (auth.token) return { type: "bearer", token: auth.token };
      return undefined;
    case "basic":
      if (auth.username && auth.password) {
        return { type: "basic", username: auth.username, password: auth.password };
      }
      return undefined;
    case "api-key":
      if (auth.apiKey) {
        return { type: "api-key", apiKey: auth.apiKey, headerName: auth.headerName };
      }
      return undefined;
    case "custom":
      if (auth.headers) {
        return { type: "custom", headers: auth.headers };
      }
      return undefined;
    default:
      return undefined;
  }
}

/**
 * 接続管理ツールを登録する
 * @summary 接続ツールを登録
 * @param pi 拡張API
 */
export function registerConnectionTools(pi: ExtensionAPI): void {
  // ========================================
  // Tool: mcp_connect
  // ========================================
  pi.registerTool({
    name: "mcp_connect",
    label: "MCP Connect",
    description: "Connect to an MCP (Model Context Protocol) server. Supports HTTP, SSE, and stdio transports with optional authentication.",
    parameters: Type.Object({
      id: Type.String({
        description: "Unique connection identifier (alphanumeric, underscores, hyphens)"
      }),
      url: Type.String({
        description: "MCP server URL (http://..., sse://...) or command (node server.js)"
      }),
      type: Type.Optional(Type.Union([
        Type.Literal("http"),
        Type.Literal("sse"),
        Type.Literal("stdio"),
        Type.Literal("websocket")
      ], { description: "Transport type. Auto-detected from URL if omitted." })),
      timeout: Type.Optional(Type.Number({
        description: "Connection timeout in milliseconds (default: 30000)"
      })),
      auth: Type.Optional(Type.Object({
        type: Type.Union([
          Type.Literal("bearer"),
          Type.Literal("basic"),
          Type.Literal("api-key"),
          Type.Literal("custom")
        ], { description: "Authentication type" }),
        token: Type.Optional(Type.String({ description: "Bearer token" })),
        username: Type.Optional(Type.String({ description: "Username (basic)" })),
        password: Type.Optional(Type.String({ description: "Password (basic)" })),
        apiKey: Type.Optional(Type.String({ description: "API key" })),
        headerName: Type.Optional(Type.String({ description: "Header name for API key" })),
        headers: Type.Optional(Type.Record(Type.String(), Type.String(), {
          description: "Custom headers"
        }))
      }, { description: "Authentication configuration" })),
      headers: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Additional HTTP headers"
      })),
      disableFallback: Type.Optional(Type.Boolean({
        description: "Disable automatic SSE fallback (default: false)"
      }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const connectionType = params.type ?? detectConnectionType(params.url);
        
        await mcpManager.connect({
          id: params.id,
          url: params.url,
          type: connectionType,
          timeout: params.timeout,
          auth: toMcpAuthProvider(params.auth),
          headers: params.headers,
          disableFallback: params.disableFallback
        });

        const logAuth = params.auth ? sanitizeAuthForLogging(toMcpAuthProvider(params.auth)!) : undefined;
        ctx.ui.notify(`Connected to MCP server: ${params.id}`, "info");

        return makeSuccessResult(
          `Successfully connected to MCP server: ${params.id}\nTransport: ${connectionType ?? 'auto-detected'}\nURL: ${params.url}`,
          {
            connectionId: params.id,
            type: connectionType,
            url: params.url,
            auth: logAuth ? 'configured' : 'none'
          }
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Failed to connect: ${errorMsg}`, {
          error: errorMsg,
          url: params.url
        });
      }
    }
  });

  // ========================================
  // Tool: mcp_disconnect
  // ========================================
  pi.registerTool({
    name: "mcp_disconnect",
    label: "MCP Disconnect",
    description: "Disconnect from an MCP server. This releases the connection and frees resources.",
    parameters: Type.Object({
      id: Type.String({ description: "Connection ID to disconnect" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        await mcpManager.disconnect(params.id);
        ctx.ui.notify(`Disconnected from MCP server: ${params.id}`, "info");
        return makeSuccessResult(
          `Successfully disconnected from MCP server: ${params.id}`,
          { connectionId: params.id }
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Failed to disconnect: ${errorMsg}`, {
          error: errorMsg,
          connectionId: params.id
        });
      }
    }
  });

  // ========================================
  // Tool: mcp_list_connections
  // ========================================
  pi.registerTool({
    name: "mcp_list_connections",
    label: "MCP List Connections",
    description: "List all active MCP server connections and their status.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const connections = mcpManager.listConnections();
      const text = formatConnectionList(connections);
      return makeSuccessResult(text, { connections });
    }
  });

  // ========================================
  // Tool: mcp_reload_config
  // ========================================
  pi.registerTool({
    name: "mcp_reload_config",
    label: "MCP Reload Config",
    description: "Reload MCP server configuration from .pi/mcp-servers.json and auto-connect enabled servers.",
    parameters: Type.Object({
      disconnect_existing: Type.Optional(Type.Boolean({
        description: "Disconnect all existing connections before reloading (default: false)"
      }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // 既存接続を切断
      if (params.disconnect_existing) {
        const existing = mcpManager.listConnections();
        for (const conn of existing) {
          try {
            await mcpManager.disconnect(conn.id);
          } catch {
            // ignore
          }
        }
      }

      // 自動接続
      const result = await autoConnectFromConfig(ctx);

      return makeSuccessResult(
        `Configuration reloaded.\nConnected: ${result.succeeded.length}\nFailed: ${result.failed.length}`,
        {
          succeeded: result.succeeded,
          failed: result.failed
        }
      );
    }
  });

  // ========================================
  // Tool: mcp_ping
  // ========================================
  pi.registerTool({
    name: "mcp_ping",
    label: "MCP Ping",
    description: "Check connection health by pinging the MCP server.",
    parameters: Type.Object({
      connection_id: Type.String({ description: "Connection ID" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const start = Date.now();
        await mcpManager.ping(params.connection_id);
        const latency = Date.now() - start;

        return makeSuccessResult(
          `Ping successful: ${params.connection_id} (${latency}ms)`,
          { connectionId: params.connection_id, latency }
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Ping failed: ${errorMsg}`, {
          error: errorMsg,
          connectionId: params.connection_id
        });
      }
    }
  });
}
