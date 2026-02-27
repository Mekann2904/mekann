/**
 * @abdd.meta
 * path: .pi/extensions/mcp-client.ts
 * role: MCPクライアント拡張機能 - 外部MCPサーバーへの接続とツール実行
 * why: piからMCPエコシステムのツールとリソースを利用可能にするため
 * related: ../lib/mcp/connection-manager.ts, ../lib/mcp/tool-bridge.ts, ../lib/mcp/types.ts
 * public_api: mcp_connect, mcp_disconnect, mcp_list_connections, mcp_list_tools, mcp_call_tool, mcp_list_resources, mcp_read_resource
 * invariants: 接続IDは一意、ツールは接続中のみ実行可能、セッション終了時に全接続を切断
 * side_effects: ネットワーク接続の確立・切断、UI通知の表示
 * failure_modes: ネットワークエラー、無効なURL、認証失敗、タイムアウト、接続先でのツール実行エラー
 * @abdd.explain
 * overview: MCPサーバーへの接続とツール実行を提供するpi拡張機能
 * what_it_does:
 *   - mcp_connect: MCPサーバーに接続しツール・リソースを検出
 *   - mcp_disconnect: 接続を切断
 *   - mcp_list_connections: アクティブな接続一覧を表示
 *   - mcp_list_tools: 接続先のツール一覧を表示
 *   - mcp_call_tool: 接続先でツールを実行
 *   - mcp_list_resources: 接続先のリソース一覧を表示
 *   - mcp_read_resource: 接続先からリソースを読み取り
 * why_it_exists: MCPエコシステムのツールをpiで利用可能にし、相互運用性を確保するため
 * scope:
 *   in: サーバーURL、接続ID、ツール名、ツール引数、リソースURI
 *   out: 接続ステータス、ツール実行結果、リソース内容
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mcpManager } from "../lib/mcp/connection-manager.js";
import { formatToolResult, formatResourceContent, formatToolList, formatConnectionList } from "../lib/mcp/tool-bridge.js";

/**
 * 結果作成ヘルパー関数
 */
function makeSuccessResult(text: string, details: Record<string, unknown>): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details
  };
}

/**
 * エラー結果作成ヘルパー関数
 */
function makeErrorResult(text: string, details: Record<string, unknown> = {}): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown>; isError: boolean } {
  return {
    content: [{ type: "text", text }],
    details,
    isError: true
  };
}

export default function (pi: ExtensionAPI) {
  // ========================================
  // Tool: mcp_connect
  // ========================================
  pi.registerTool({
    name: "mcp_connect",
    label: "MCP Connect",
    description: "Connect to an MCP (Model Context Protocol) server. This allows you to use tools and resources from external MCP servers.",
    parameters: Type.Object({
      id: Type.String({
        description: "Unique connection identifier (alphanumeric, underscores, hyphens). Used to reference this connection in other commands."
      }),
      url: Type.String({
        description: "MCP server URL (e.g., http://localhost:3000/mcp)"
      }),
      timeout: Type.Optional(Type.Number({
        description: "Connection timeout in milliseconds (default: 30000)"
      }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const connection = await mcpManager.connect({
          id: params.id,
          url: params.url,
          timeout: params.timeout
        });

        ctx.ui.notify(`Connected to MCP server: ${params.id}`, "success");

        const toolNames = connection.tools.map(t => t.name);
        const serverInfo = connection.serverInfo
          ? ` (${connection.serverInfo.name}/${connection.serverInfo.version})`
          : '';

        return makeSuccessResult(
          `Successfully connected to ${params.url}${serverInfo}\n` +
          `Connection ID: ${params.id}\n` +
          `Available tools (${toolNames.length}): ${toolNames.length > 0 ? toolNames.join(', ') : 'none'}\n` +
          `Available resources: ${connection.resources.length}`,
          {
            id: connection.id,
            url: connection.url,
            status: connection.status,
            serverInfo: connection.serverInfo,
            toolCount: connection.tools.length,
            resourceCount: connection.resources.length,
            tools: connection.tools.map(t => ({ name: t.name, description: t.description }))
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to connect: ${message}`, "error");
        return makeErrorResult(`Connection failed: ${message}`, { url: params.url, error: message });
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
      id: Type.String({
        description: "Connection ID to disconnect"
      })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const connection = mcpManager.getConnection(params.id);
      if (!connection) {
        return makeErrorResult(`Connection '${params.id}' not found. No action taken.`, { id: params.id });
      }

      await mcpManager.disconnect(params.id);
      ctx.ui.notify(`Disconnected from MCP server: ${params.id}`, "info");

      return makeSuccessResult(
        `Disconnected from '${params.id}' (${connection.url})`,
        { id: params.id, url: connection.url }
      );
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
    async execute() {
      const connections = mcpManager.listConnections();

      const details = connections.map(c => ({
        id: c.id,
        url: c.url,
        status: c.status,
        toolCount: c.tools.length,
        resourceCount: c.resources.length,
        serverInfo: c.serverInfo
      }));

      return makeSuccessResult(
        formatConnectionList(connections),
        { connections: details, count: connections.length }
      );
    }
  });

  // ========================================
  // Tool: mcp_list_tools
  // ========================================
  pi.registerTool({
    name: "mcp_list_tools",
    label: "MCP List Tools",
    description: "List available tools from a connected MCP server.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({
        description: "Connection ID. If omitted, lists tools from all connections."
      }))
    }),
    async execute(_toolCallId, params) {
      if (params.id) {
        const connection = mcpManager.getConnection(params.id);
        if (!connection) {
          return makeErrorResult(`Connection '${params.id}' not found.`, { id: params.id });
        }

        return makeSuccessResult(
          formatToolList(connection.tools, params.id),
          {
            connectionId: params.id,
            tools: connection.tools
          }
        );
      }

      // List all tools from all connections
      const connections = mcpManager.listConnections();
      if (connections.length === 0) {
        return makeSuccessResult(
          "No active MCP connections. Use mcp_connect to connect to a server.",
          { tools: [], total: 0 }
        );
      }

      const lines: string[] = [];
      const allTools: Array<{ connectionId: string; name: string; description?: string }> = [];

      for (const conn of connections) {
        lines.push(`\n[${conn.id}] - ${conn.tools.length} tools`);
        for (const tool of conn.tools) {
          lines.push(`  - ${tool.name}: ${tool.description || 'No description'}`);
          allTools.push({
            connectionId: conn.id,
            name: tool.name,
            description: tool.description
          });
        }
      }

      return makeSuccessResult(
        "Available MCP Tools:" + lines.join('\n'),
        { tools: allTools, total: allTools.length }
      );
    }
  });

  // ========================================
  // Tool: mcp_call_tool
  // ========================================
  pi.registerTool({
    name: "mcp_call_tool",
    label: "MCP Call Tool",
    description: "Execute a tool on a connected MCP server. The tool must be available on the specified connection.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID (use mcp_list_connections to see available connections)"
      }),
      tool_name: Type.String({
        description: "Name of the tool to call (use mcp_list_tools to see available tools)"
      }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Any(), {
        description: "Tool arguments as key-value pairs. Check the tool's input schema for required parameters."
      }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await mcpManager.callTool(
          params.connection_id,
          params.tool_name,
          params.arguments || {}
        );

        const formattedResult = formatToolResult(result);

        // Check for tool-level errors
        const toolResult = result as { isError?: boolean };
        if (toolResult.isError) {
          ctx.ui.notify(`Tool '${params.tool_name}' reported an error`, "warning");
          return makeErrorResult(formattedResult || "Tool reported an error", {
            connectionId: params.connection_id,
            toolName: params.tool_name,
            arguments: params.arguments,
            result
          });
        }

        return makeSuccessResult(
          formattedResult || "Tool executed successfully (no output)",
          {
            connectionId: params.connection_id,
            toolName: params.tool_name,
            arguments: params.arguments,
            result
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Tool execution failed: ${message}`, "error");
        return makeErrorResult(`Error: ${message}`, {
          connectionId: params.connection_id,
          toolName: params.tool_name,
          error: message
        });
      }
    }
  });

  // ========================================
  // Tool: mcp_list_resources
  // ========================================
  pi.registerTool({
    name: "mcp_list_resources",
    label: "MCP List Resources",
    description: "List available resources from a connected MCP server. Resources are read-only data like files, configurations, or documents.",
    parameters: Type.Object({
      id: Type.String({
        description: "Connection ID"
      })
    }),
    async execute(_toolCallId, params) {
      const connection = mcpManager.getConnection(params.id);
      if (!connection) {
        return makeErrorResult(`Connection '${params.id}' not found.`, { id: params.id });
      }

      if (connection.resources.length === 0) {
        // Try to refresh resources
        try {
          const resources = await mcpManager.refreshResources(params.id);
          if (resources.length === 0) {
            return makeSuccessResult(
              `No resources available from '${params.id}'. The server may not provide resources.`,
              { connectionId: params.id, resources: [] }
            );
          }
        } catch (error) {
          return makeErrorResult(
            `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`,
            { connectionId: params.id, error: String(error) }
          );
        }
      }

      const resourceList = connection.resources.map(r =>
        `  - ${r.uri}: ${r.name}${r.mimeType ? ` (${r.mimeType})` : ''}`
      ).join('\n');

      return makeSuccessResult(
        `Resources from '${params.id}' (${connection.resources.length}):\n${resourceList}`,
        {
          connectionId: params.id,
          resources: connection.resources
        }
      );
    }
  });

  // ========================================
  // Tool: mcp_read_resource
  // ========================================
  pi.registerTool({
    name: "mcp_read_resource",
    label: "MCP Read Resource",
    description: "Read a resource from a connected MCP server. Use mcp_list_resources to discover available resource URIs.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      }),
      uri: Type.String({
        description: "Resource URI to read (e.g., file:///path/to/file, config://app)"
      })
    }),
    async execute(_toolCallId, params) {
      const connection = mcpManager.getConnection(params.connection_id);
      if (!connection) {
        return makeErrorResult(`Connection '${params.connection_id}' not found.`, {
          connectionId: params.connection_id,
          uri: params.uri
        });
      }

      try {
        const result = await mcpManager.readResource(params.connection_id, params.uri);
        const formattedContent = formatResourceContent(result);

        return makeSuccessResult(
          formattedContent || "Resource read successfully (no content)",
          {
            connectionId: params.connection_id,
            uri: params.uri,
            result
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return makeErrorResult(`Failed to read resource '${params.uri}': ${message}`, {
          connectionId: params.connection_id,
          uri: params.uri,
          error: message
        });
      }
    }
  });

  // ========================================
  // Session Lifecycle Handlers
  // ========================================

  // Cleanup on session end
  pi.on("session_end", async () => {
    const connectionCount = mcpManager.getConnectionCount();
    if (connectionCount > 0) {
      console.log(`Cleaning up ${connectionCount} MCP connection(s)...`);
      await mcpManager.disconnectAll();
    }
  });

  // Notify on load
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("MCP Client extension loaded • Use mcp_connect to connect to MCP servers", "info");
  });
}
