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
  transportType: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * GET /servers - MCPサーバー一覧を取得
 */
mcpRoutes.get("/servers", (c) => {
  try {
    const configPath = getMcpConfigPath();

    if (!fs.existsSync(configPath)) {
      return c.json<SuccessResponse<McpServerConfig[]>>({
        success: true,
        data: [],
      });
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const config: McpConfig = JSON.parse(content);

    const servers = Object.entries(config.mcpServers || {}).map(([id, server]) => ({
      ...server,
      id,
    }));

    return c.json({
      success: true,
      data: servers,
    });
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
