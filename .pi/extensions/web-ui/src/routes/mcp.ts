/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/mcp.ts
 * @role MCPサーバー管理APIルート
 * @why HonoベースのAPI
 * @related routes/mcp.ts (Express版)
 * @public_api mcpRoutes
 * @invariants なし
 * @side_effects MCP設定ファイル読み込み、MCP接続の確立/切断
 * @failure_modes ファイルシステムエラー、MCP接続エラー
 */

import { Hono } from "hono";
import fs from "fs";
import path from "path";
import type { SuccessResponse } from "../schemas/common.schema.js";

// MCP接続マネージャーをインポート
import { mcpManager } from "../../../../lib/mcp/connection-manager.js";
import { loadMcpConfig, getEnabledServers } from "../../../../lib/mcp/config-loader.js";

/**
 * MCPルート
 */
export const mcpRoutes = new Hono();

/**
 * MCP設定ファイルのパス
 */
function getMcpConfigPath(): string {
  return path.join(process.cwd(), ".pi", "mcp-servers.json");
}

/**
 * MCPサーバー設定の型
 */
interface McpServerConfig {
  id: string;
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  enabled?: boolean;
  disabled?: boolean;
}

interface McpConfig {
  servers?: McpServerConfig[];
  mcpServers?: Record<string, McpServerConfig>;  // 旧形式（後方互換性）
}

/**
 * GET /servers - MCPサーバー一覧を取得
 */
mcpRoutes.get("/servers", async (c) => {
  try {
    const configPath = getMcpConfigPath();

    if (!fs.existsSync(configPath)) {
      return c.json({
        success: true,
        servers: [],
        count: 0,
      });
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const config: McpConfig = JSON.parse(content);

    let servers: McpServerConfig[] = [];

    // 新形式: { servers: [...] }
    if (config.servers && Array.isArray(config.servers)) {
      servers = config.servers;
    }
    // 旧形式: { mcpServers: { ... } }
    else if (config.mcpServers) {
      servers = Object.entries(config.mcpServers).map(([id, server]) => ({
        ...server,
        id,
      }));
    }

    // 接続状態を取得
    const connections = mcpManager.listConnections();
    const connectionMap = new Map(connections.map(c => [c.id, c]));

    // フロントエンドが期待する形式に変換
    const response = {
      success: true,
      servers: servers.map(s => {
        const conn = connectionMap.get(s.id);
        return {
          id: s.id,
          name: s.name || s.id,
          url: s.url || "",
          description: s.description,
          enabled: s.enabled ?? !s.disabled,
          status: conn ? "connected" as const : "disconnected" as const,
          toolsCount: conn?.tools?.length || 0,
          resourcesCount: conn?.resources?.length || 0,
        };
      }),
      count: servers.length,
    };

    return c.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get MCP servers", details: message }, 500);
  }
});

/**
 * GET /servers/:id - 特定のMCPサーバーを取得
 */
mcpRoutes.get("/servers/:id", (c) => {
  try {
    const serverId = c.req.param("id");
    const configPath = getMcpConfigPath();

    if (!fs.existsSync(configPath)) {
      return c.json({ success: false, error: "MCP config not found" }, 404);
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const config: McpConfig = JSON.parse(content);

    // 新形式
    if (config.servers) {
      const server = config.servers.find(s => s.id === serverId);
      if (!server) {
        return c.json({ success: false, error: "Server not found" }, 404);
      }
      return c.json({ success: true, data: server });
    }

    // 旧形式
    const server = config.mcpServers?.[serverId];
    if (!server) {
      return c.json({ success: false, error: "Server not found" }, 404);
    }

    return c.json({
      success: true,
      data: { id: serverId, ...server },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get MCP server", details: message }, 500);
  }
});

/**
 * POST /connect/:id - MCPサーバーに接続
 */
mcpRoutes.post("/connect/:id", async (c) => {
  const serverId = c.req.param("id");

  try {
    // 既に接続済みの場合は成功を返す
    const existingConnection = mcpManager.getConnection(serverId);
    if (existingConnection) {
      return c.json({ success: true, message: `Already connected to ${serverId}` });
    }

    const configPath = getMcpConfigPath();

    if (!fs.existsSync(configPath)) {
      return c.json({ success: false, error: "MCP config not found" }, 404);
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const config: McpConfig = JSON.parse(content);

    let server: McpServerConfig | undefined;

    // 新形式
    if (config.servers) {
      server = config.servers.find(s => s.id === serverId);
    }
    // 旧形式
    if (!server && config.mcpServers) {
      server = config.mcpServers[serverId] ? { ...config.mcpServers[serverId], id: serverId } : undefined;
    }

    if (!server) {
      return c.json({ success: false, error: "Server not found" }, 404);
    }

    // MCP接続を試行
    await mcpManager.connect({
      id: serverId,
      url: server.url,
      type: server.url?.startsWith("http") ? "http" : "stdio",
      command: server.command,
      args: server.args,
      env: server.env,
    });

    return c.json({ success: true, message: `Connected to ${serverId}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mcp] Connect error for ${serverId}:`, error);
    return c.json({ success: false, error: "Failed to connect", details: message }, 500);
  }
});

/**
 * POST /disconnect/:id - MCPサーバーから切断
 */
mcpRoutes.post("/disconnect/:id", async (c) => {
  const serverId = c.req.param("id");

  try {
    await mcpManager.disconnect(serverId);
    return c.json({ success: true, message: `Disconnected from ${serverId}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to disconnect", details: message }, 500);
  }
});

/**
 * GET /tools/:id - MCPサーバーのツール一覧を取得
 */
mcpRoutes.get("/tools/:id", async (c) => {
  const serverId = c.req.param("id");

  try {
    const connection = mcpManager.getConnection(serverId);

    if (!connection) {
      return c.json({ success: true, tools: [] });
    }

    let tools: any[] = [];
    try {
      tools = await mcpManager.listAllTools(serverId) || [];
    } catch (e) {
      console.warn(`[mcp] Failed to list tools for ${serverId}:`, e);
    }

    return c.json({ success: true, tools });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get tools", details: message }, 500);
  }
});

/**
 * GET /resources/:id - MCPサーバーのリソース一覧を取得
 */
mcpRoutes.get("/resources/:id", async (c) => {
  const serverId = c.req.param("id");

  try {
    const connection = mcpManager.getConnection(serverId);

    if (!connection) {
      return c.json({ success: true, resources: [] });
    }

    let resources: any[] = [];
    try {
      resources = await mcpManager.listAllResources(serverId) || [];
    } catch (e) {
      console.warn(`[mcp] Failed to list resources for ${serverId}:`, e);
    }

    return c.json({ success: true, resources });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get resources", details: message }, 500);
  }
});

/**
 * GET /connection/:id - MCPサーバーの接続詳細を取得
 */
mcpRoutes.get("/connection/:id", async (c) => {
  const serverId = c.req.param("id");

  try {
    const connection = mcpManager.getConnection(serverId);

    if (!connection) {
      return c.json({
        success: true,
        data: {
          id: serverId,
          name: serverId,
          url: "",
          status: "disconnected",
          tools: [],
          resources: [],
          subscriptions: [],
        },
      });
    }

    // ツールとリソースを取得（エラー時は空配列）
    let tools: any[] = [];
    let resources: any[] = [];

    try {
      tools = await mcpManager.listAllTools(serverId) || [];
    } catch (e) {
      console.warn(`[mcp] Failed to list tools for ${serverId}:`, e);
    }

    try {
      resources = await mcpManager.listAllResources(serverId) || [];
    } catch (e) {
      console.warn(`[mcp] Failed to list resources for ${serverId}:`, e);
    }

    return c.json({
      success: true,
      data: {
        id: serverId,
        name: connection.name || serverId,
        url: connection.url || "",
        status: "connected",
        tools,
        resources,
        subscriptions: [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get connection details", details: message }, 500);
  }
});
