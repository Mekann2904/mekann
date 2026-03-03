/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/mcp.ts
 * @role MCPサーバー管理APIルート
 * @why HonoベースのAPI
 * @related routes/mcp.ts (Express版)
 * @public_api mcpRoutes
 * @invariants なし
 * @side_effects MCP設定ファイル読み込み
 * @failure_modes ファイルシステムエラー
 */

import { Hono } from "hono";
import fs from "fs";
import path from "path";
import type { SuccessResponse } from "../schemas/common.schema.js";

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
mcpRoutes.get("/servers", (c) => {
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

    // フロントエンドが期待する形式に変換
    const response = {
      success: true,
      servers: servers.map(s => ({
        id: s.id,
        name: s.name || s.id,
        url: s.url || "",
        description: s.description,
        enabled: s.enabled ?? !s.disabled,
        status: "disconnected" as const,
        toolsCount: 0,
        resourcesCount: 0,
      })),
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
