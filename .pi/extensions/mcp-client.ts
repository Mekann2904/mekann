/**
 * @abdd.meta
 * path: .pi/extensions/mcp-client.ts
 * role: MCPクライアント拡張機能 - 外部MCPサーバーへの接続とツール実行
 * why: piからMCPエコシステムのツールとリソースを利用可能にするため
 * related: ../lib/mcp/connection-manager.ts, ../lib/mcp/tool-bridge.ts, ../lib/mcp/types.ts, ../lib/mcp/config-loader.ts, ../lib/mcp/auth-provider.ts
 * public_api: mcp_connect, mcp_disconnect, mcp_list_connections, mcp_list_tools, mcp_call_tool, mcp_list_resources, mcp_read_resource, mcp_reload_config, mcp_register_notification_handler, mcp_set_roots, mcp_list_prompts, mcp_get_prompt, mcp_subscribe_resource, mcp_unsubscribe_resource, mcp_list_subscriptions, mcp_ping, mcp_complete, mcp_get_instructions, mcp_list_resource_templates, mcp_set_logging_level, mcp_register_sampling_handler, mcp_register_elicitation_handler
 * invariants: 接続IDは一意、ツールは接続中のみ実行可能、セッション終了時に全接続を切断
 * side_effects: ネットワーク接続の確立・切断、UI通知の表示、設定ファイルからの自動接続、Roots通知の送信、認証ヘッダーの送信、Sampling/Elicitationハンドラーの登録
 * failure_modes: ネットワークエラー、無効なURL、認証失敗、タイムアウト、接続先でのツール実行エラー、設定ファイルパースエラー
 * @abdd.explain
 * overview: MCPサーバーへの接続とツール実行を提供するpi拡張機能（SDK 100%準拠）
 * what_it_does:
 *   - mcp_connect: MCPサーバーに接続（認証対応、StreamableHTTP/SSE/WebSocket対応）
 *   - mcp_disconnect: 接続を切断
 *   - mcp_list_connections: アクティブな接続一覧を表示
 *   - mcp_list_tools: 接続先のツール一覧を表示（ページネーション対応）
 *   - mcp_call_tool: 接続先でツールを実行
 *   - mcp_list_resources: 接続先のリソース一覧を表示
 *   - mcp_read_resource: 接続先からリソースを読み取り
 *   - mcp_subscribe_resource: リソース更新を購読
 *   - mcp_unsubscribe_resource: リソース購読を解除
 *   - mcp_list_subscriptions: アクティブな購読一覧
 *   - mcp_ping: 接続ヘルスチェック
 *   - mcp_complete: 引数補完
 *   - mcp_reload_config: 設定ファイルを再読み込みして自動接続
 *   - mcp_register_notification_handler: 通知ハンドラーを登録
 *   - mcp_set_roots: Roots設定（サーバーにルートディレクトリを通知）
 *   - mcp_list_prompts: プロンプトテンプレート一覧を取得
 *   - mcp_get_prompt: プロンプトテンプレートを展開
 *   - mcp_get_instructions: サーバー指示を取得
 *   - mcp_list_resource_templates: リソーステンプレート一覧を取得
 *   - mcp_set_logging_level: サーバーログレベルを設定
 *   - mcp_register_sampling_handler: Samplingハンドラーを登録
 *   - mcp_register_elicitation_handler: Elicitationハンドラーを登録
 *   - セッション開始時に.pi/mcp-servers.jsonから自動接続
 * why_it_exists: MCPエコシステムのツールをpiで利用可能にし、SDK準拠の機能を提供するため
 * scope:
 *   in: サーバーURL/コマンド、接続ID、ツール名、ツール引数、リソースURI、設定ファイル、Roots、プロンプト引数、認証情報、購読URI、ログレベル、Sampling/Elicitationハンドラー設定
 *   out: 接続ステータス、ツール実行結果、リソース内容、通知、プロンプト展開結果、購読状態
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mcpManager, type McpConnectionType } from "../lib/mcp/connection-manager.js";
import { loadMcpConfig, getEnabledServers, getConfigPath } from "../lib/mcp/config-loader.js";
import { formatToolResult, formatResourceContent, formatToolList, formatConnectionList } from "../lib/mcp/tool-bridge.js";
import { sanitizeAuthForLogging } from "../lib/mcp/auth-provider.js";
import type { McpNotificationHandler, McpNotificationType, McpNotification, McpRoot, McpPromptInfo, McpPromptResult, McpAuthProvider, McpSamplingHandler, McpSamplingRequest, McpSamplingResponse, McpElicitationHandler, McpElicitationRequest, McpElicitationResponse } from "../lib/mcp/types.js";

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

/**
 * 通知ハンドラーの管理
 */
const notificationHandlers = new Map<string, {
  handler: McpNotificationHandler;
  types?: McpNotificationType[];
  connectionId?: string;
}>();

let handlerIdCounter = 0;

/**
 * 内部通知ディスパッチャー
 */
function dispatchNotification(notification: McpNotification): void {
  for (const entry of Array.from(notificationHandlers.entries())) {
    const [id, registration] = entry;
    // タイプフィルター
    if (registration.types && !registration.types.includes(notification.type)) {
      continue;
    }
    // 接続IDフィルター
    if (registration.connectionId && registration.connectionId !== notification.connectionId) {
      continue;
    }
    // ハンドラー実行（エラーはキャッチ）
    try {
      const result = registration.handler(notification);
      if (result instanceof Promise) {
        result.catch(err => console.error(`Notification handler ${id} error:`, err));
      }
    } catch (err) {
      console.error(`Notification handler ${id} error:`, err);
    }
  }
}

/**
 * 設定ファイルから自動接続を実行
 */
async function autoConnectFromConfig(ctx: { ui: { notify: (msg: string, type: "info" | "warning" | "error") => void } }): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const result = { succeeded: [] as string[], failed: [] as Array<{ id: string; error: string }> };

  try {
    const config = await loadMcpConfig();
    const enabledServers = getEnabledServers(config);

    if (enabledServers.length === 0) {
      return result;
    }

    ctx.ui.notify(`Auto-connecting ${enabledServers.length} MCP server(s)...`, "info");

    for (const server of enabledServers) {
      try {
        // Cast auth from config to McpAuthProvider (validated by config-loader)
        const auth = server.auth as McpAuthProvider | undefined;
        await mcpManager.connect({
          id: server.id,
          url: server.url,
          timeout: server.timeout,
          type: detectConnectionType(server.url),
          auth,
          headers: server.headers
        });
        result.succeeded.push(server.id);
        ctx.ui.notify(`Connected to MCP server: ${server.id}`, "info");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.failed.push({ id: server.id, error: errorMsg });
        ctx.ui.notify(`Failed to connect ${server.id}: ${errorMsg}`, "error");
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to load MCP config: ${errorMsg}`, "warning");
  }

  return result;
}

/**
 * 接続タイプを判定する
 */
function detectConnectionType(url: string): McpConnectionType | undefined {
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    return 'websocket';
  }
  if (url.startsWith('sse://') || url.startsWith('http+sse://') || url.startsWith('https+sse://')) {
    return 'sse';
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return 'http';
  }
  // stdio: URLパターンでない場合
  if (!url.includes('://')) {
    return 'stdio';
  }
  return undefined;
}

export default function (pi: ExtensionAPI) {
  // ========================================
  // Tool: mcp_connect
  // ========================================
  pi.registerTool({
    name: "mcp_connect",
    label: "MCP Connect",
    description: "Connect to an MCP (Model Context Protocol) server. Supports HTTP, SSE, and stdio transports with optional authentication.",
    parameters: Type.Object({
      id: Type.String({
        description: "Unique connection identifier (alphanumeric, underscores, hyphens). Used to reference this connection in other commands."
      }),
      url: Type.String({
        description: "MCP server URL (http://..., sse://...) or command (node server.js, npx -y @anthropic/mcp-server)"
      }),
      type: Type.Optional(Type.Union([
        Type.Literal("http", { description: "HTTP transport (default for http:// URLs)" }),
        Type.Literal("sse", { description: "SSE transport (use sse:// URL or explicit type)" }),
        Type.Literal("stdio", { description: "Stdio transport (for command-based servers)" }),
        Type.Literal("websocket", { description: "WebSocket transport (for ws:// URLs)" })
      ], {
        description: "Transport type. Auto-detected from URL if omitted."
      })),
      transportType: Type.Optional(Type.Union([
        Type.Literal("auto", { description: "Auto-detect transport type (default)" }),
        Type.Literal("streamable-http", { description: "Use StreamableHTTP transport" }),
        Type.Literal("sse", { description: "Use SSE transport" }),
        Type.Literal("stdio", { description: "Use stdio transport" }),
        Type.Literal("websocket", { description: "Use WebSocket transport" })
      ], {
        description: "Explicit transport type selection. Overrides auto-detection."
      })),
      disableFallback: Type.Optional(Type.Boolean({
        description: "Disable automatic SSE fallback for legacy servers (default: false)"
      })),
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
        token: Type.Optional(Type.String({ description: "Bearer token (for type='bearer')" })),
        username: Type.Optional(Type.String({ description: "Username (for type='basic')" })),
        password: Type.Optional(Type.String({ description: "Password (for type='basic')" })),
        apiKey: Type.Optional(Type.String({ description: "API key (for type='api-key')" })),
        headerName: Type.Optional(Type.String({ description: "Header name for API key (default: 'X-API-Key')" })),
        headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Custom headers (for type='custom')" }))
      }, { description: "Authentication configuration" })),
      headers: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Additional HTTP headers to send with requests"
      }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Build auth object from params
      let auth: McpAuthProvider | undefined;
      if (params.auth) {
        switch (params.auth.type) {
          case 'bearer':
            if (!params.auth.token) {
              return makeErrorResult("Bearer auth requires 'token' parameter", { authType: 'bearer' });
            }
            auth = { type: 'bearer', token: params.auth.token };
            break;
          case 'basic':
            if (!params.auth.username || !params.auth.password) {
              return makeErrorResult("Basic auth requires 'username' and 'password' parameters", { authType: 'basic' });
            }
            auth = { type: 'basic', username: params.auth.username, password: params.auth.password };
            break;
          case 'api-key':
            if (!params.auth.apiKey) {
              return makeErrorResult("API key auth requires 'apiKey' parameter", { authType: 'api-key' });
            }
            auth = { type: 'api-key', apiKey: params.auth.apiKey, headerName: params.auth.headerName };
            break;
          case 'custom':
            if (!params.auth.headers) {
              return makeErrorResult("Custom auth requires 'headers' parameter", { authType: 'custom' });
            }
            auth = { type: 'custom', headers: params.auth.headers };
            break;
        }
      }

      try {
        const connection = await mcpManager.connect({
          id: params.id,
          url: params.url,
          timeout: params.timeout,
          type: params.type,
          auth,
          headers: params.headers,
          transportType: params.transportType,
          disableFallback: params.disableFallback
        });

        ctx.ui.notify(`Connected to MCP server: ${params.id}`, "info");

        const toolNames = connection.tools.map(t => t.name);
        const serverInfo = connection.serverInfo
          ? ` (${connection.serverInfo.name}/${connection.serverInfo.version})`
          : '';
        const authInfo = auth ? ` with ${sanitizeAuthForLogging(auth).type} auth` : '';
        const transportInfo = connection.transportType ?? 'unknown';

        return makeSuccessResult(
          `Successfully connected to ${params.url}${serverInfo}${authInfo}\n` +
          `Connection ID: ${params.id}\n` +
          `Transport: ${transportInfo}\n` +
          `Available tools (${toolNames.length}): ${toolNames.length > 0 ? toolNames.join(', ') : 'none'}\n` +
          `Available resources: ${connection.resources.length}`,
          {
            id: connection.id,
            url: connection.url,
            status: connection.status,
            transportType: connection.transportType,
            serverInfo: connection.serverInfo,
            toolCount: connection.tools.length,
            resourceCount: connection.resources.length,
            tools: connection.tools.map(t => ({ name: t.name, description: t.description })),
            auth: sanitizeAuthForLogging(auth)
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
    description: "List available tools from a connected MCP server. Supports pagination for large datasets.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({
        description: "Connection ID. If omitted, lists tools from all connections."
      })),
      cursor: Type.Optional(Type.String({
        description: "Pagination cursor for fetching next page"
      })),
      fetchAll: Type.Optional(Type.Boolean({
        description: "Auto-fetch all pages (default: true when no cursor)"
      }))
    }),
    async execute(_toolCallId, params) {
      if (params.id) {
        const connection = mcpManager.getConnection(params.id);
        if (!connection) {
          return makeErrorResult(`Connection '${params.id}' not found.`, { id: params.id });
        }

        // Use pagination if cursor provided or fetchAll is false
        if (params.cursor || params.fetchAll === false) {
          try {
            const result = await mcpManager.listTools(params.id, { cursor: params.cursor });
            const moreInfo = result.nextCursor
              ? `\n\nMore results available. Use cursor: ${result.nextCursor}`
              : '';
            return makeSuccessResult(
              formatToolList(result.tools, params.id) + moreInfo,
              {
                connectionId: params.id,
                tools: result.tools,
                nextCursor: result.nextCursor
              }
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return makeErrorResult(`Failed to list tools: ${message}`, { connectionId: params.id, error: message });
          }
        }

        // Auto-pagination (default)
        try {
          const tools = await mcpManager.listAllTools(params.id);
          return makeSuccessResult(
            formatToolList(tools, params.id),
            {
              connectionId: params.id,
              tools,
              total: tools.length
            }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return makeErrorResult(`Failed to list tools: ${message}`, { connectionId: params.id, error: message });
        }
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
      const configPath = getConfigPath();

      // Disconnect existing if requested
      if (params.disconnect_existing) {
        const count = mcpManager.getConnectionCount();
        if (count > 0) {
          await mcpManager.disconnectAll();
          ctx.ui.notify(`Disconnected ${count} existing connection(s)`, "info");
        }
      }

      // Load and validate config
      let config;
      try {
        config = await loadMcpConfig();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return makeErrorResult(`Failed to load config from ${configPath}: ${message}`, {
          configPath,
          error: message
        });
      }

      const enabledServers = getEnabledServers(config);

      if (enabledServers.length === 0) {
        return makeSuccessResult(
          `No enabled servers found in ${configPath}`,
          { configPath, servers: [], total: config.servers.length }
        );
      }

      // Connect enabled servers
      const results: { succeeded: string[]; failed: Array<{ id: string; error: string }> } = {
        succeeded: [],
        failed: []
      };

      for (const server of enabledServers) {
        // Skip if already connected
        if (mcpManager.getConnection(server.id)) {
          results.succeeded.push(server.id + " (already connected)");
          continue;
        }

        try {
          await mcpManager.connect({
            id: server.id,
            url: server.url,
            timeout: server.timeout,
            type: detectConnectionType(server.url),
            auth: server.auth as McpAuthProvider | undefined,
            headers: server.headers
          });
          results.succeeded.push(server.id);
          ctx.ui.notify(`Connected to ${server.id}`, "info");
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          results.failed.push({ id: server.id, error: errorMsg });
          ctx.ui.notify(`Failed to connect ${server.id}: ${errorMsg}`, "error");
        }
      }

      const summary = results.succeeded.length > 0
        ? `Connected: ${results.succeeded.join(', ')}`
        : 'No new connections';

      return makeSuccessResult(
        `Reloaded MCP config from ${configPath}\n` +
        `${summary}` +
        (results.failed.length > 0 ? `\nFailed: ${results.failed.map(f => `${f.id} (${f.error})`).join(', ')}` : ''),
        {
          configPath,
          succeeded: results.succeeded,
          failed: results.failed,
          totalServers: config.servers.length,
          enabledServers: enabledServers.length
        }
      );
    }
  });

  // ========================================
  // Tool: mcp_register_notification_handler
  // ========================================
  pi.registerTool({
    name: "mcp_register_notification_handler",
    label: "MCP Register Notification Handler",
    description: "Register a handler for MCP notifications (tools/list_changed, resources/list_changed, etc.).",
    parameters: Type.Object({
      connection_id: Type.Optional(Type.String({
        description: "Connection ID to filter. If omitted, receives notifications from all connections."
      })),
      types: Type.Optional(Type.Array(Type.String({
        description: "Notification types to handle (e.g., 'tools/list_changed', 'resources/list_changed')"
      }), {
        description: "Notification types to handle. If omitted, receives all notification types."
      })),
      description: Type.Optional(Type.String({
        description: "Description of the handler's purpose"
      }))
    }),
    async execute(_toolCallId, params) {
      const handlerId = `handler-${++handlerIdCounter}`;

      // Create a no-op handler for registration (actual handler logic would be external)
      const handler: McpNotificationHandler = (notification: McpNotification) => {
        console.log(`[MCP Notification ${handlerId}]`, notification.type, notification.connectionId, notification.data);
      };

      notificationHandlers.set(handlerId, {
        handler,
        types: params.types as McpNotificationType[] | undefined,
        connectionId: params.connection_id
      });

      return makeSuccessResult(
        `Registered notification handler: ${handlerId}\n` +
        `Connection filter: ${params.connection_id || 'all connections'}\n` +
        `Type filter: ${params.types?.join(', ') || 'all types'}`,
        {
          handlerId,
          connectionId: params.connection_id,
          types: params.types,
          activeHandlers: notificationHandlers.size
        }
      );
    }
  });

  // ========================================
  // Tool: mcp_set_roots
  // ========================================
  pi.registerTool({
    name: "mcp_set_roots",
    label: "MCP Set Roots",
    description: "Set root directories that MCP servers can access. Servers may use roots to resolve relative paths or understand project context.",
    parameters: Type.Object({
      roots: Type.Array(Type.Object({
        uri: Type.String({
          description: "Root URI (e.g., file:///path/to/project)"
        }),
        name: Type.String({
          description: "Display name for the root"
        })
      }), {
        description: "List of root directories"
      })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      mcpManager.setRoots(params.roots);
      ctx.ui.notify(`Set ${params.roots.length} root(s)`, "info");

      return makeSuccessResult(
        `Configured ${params.roots.length} root(s):\n` +
        params.roots.map(r => `  - ${r.name}: ${r.uri}`).join('\n'),
        { roots: params.roots }
      );
    }
  });

  // ========================================
  // Tool: mcp_list_prompts
  // ========================================
  pi.registerTool({
    name: "mcp_list_prompts",
    label: "MCP List Prompts",
    description: "List available prompt templates from a connected MCP server.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      })
    }),
    async execute(_toolCallId, params) {
      try {
        const prompts = await mcpManager.listPrompts(params.connection_id);

        if (prompts.length === 0) {
          return makeSuccessResult(
            `No prompts available from '${params.connection_id}'.`,
            { connectionId: params.connection_id, prompts: [] }
          );
        }

        const promptList = prompts.map(p => {
          const args = p.arguments?.map(a => `${a.name}${a.required ? '*' : ''}`).join(', ') || 'no args';
          return `  - ${p.name}: ${p.description || 'No description'} [${args}]`;
        }).join('\n');

        return makeSuccessResult(
          `Prompts from '${params.connection_id}' (${prompts.length}):\n${promptList}`,
          { connectionId: params.connection_id, prompts }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return makeErrorResult(`Failed to list prompts: ${message}`, {
          connectionId: params.connection_id,
          error: message
        });
      }
    }
  });

  // ========================================
  // Tool: mcp_get_prompt
  // ========================================
  pi.registerTool({
    name: "mcp_get_prompt",
    label: "MCP Get Prompt",
    description: "Get and expand a prompt template from a connected MCP server.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      }),
      name: Type.String({
        description: "Prompt template name"
      }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Prompt arguments as key-value pairs"
      }))
    }),
    async execute(_toolCallId, params) {
      try {
        const result = await mcpManager.getPrompt(
          params.connection_id,
          params.name,
          params.arguments
        );

        const messageText = result.messages.map(m => {
          const content = m.content.type === 'text' ? m.content.text : `[${m.content.type}]`;
          return `[${m.role}]: ${content}`;
        }).join('\n\n');

        return makeSuccessResult(
          result.description
            ? `Prompt: ${result.description}\n\n${messageText}`
            : messageText,
          {
            connectionId: params.connection_id,
            name: params.name,
            arguments: params.arguments,
            messages: result.messages
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return makeErrorResult(`Failed to get prompt '${params.name}': ${message}`, {
          connectionId: params.connection_id,
          name: params.name,
          error: message
        });
      }
    }
  });

  // ========================================
  // Tool: mcp_subscribe_resource
  // ========================================
  pi.registerTool({
    name: "mcp_subscribe_resource",
    label: "MCP Subscribe Resource",
    description: "Subscribe to resource update notifications from a connected MCP server.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      }),
      uri: Type.String({
        description: "Resource URI to subscribe to"
      })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        await mcpManager.subscribeResource(params.connection_id, params.uri);
        ctx.ui.notify(`Subscribed to resource: ${params.uri}`, "info");

        return makeSuccessResult(
          `Subscribed to resource: ${params.uri}\nYou will receive notifications when this resource is updated.`,
          { connectionId: params.connection_id, uri: params.uri }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to subscribe: ${message}`, "error");
        return makeErrorResult(
          `Failed to subscribe: ${message}`,
          { connectionId: params.connection_id, uri: params.uri, error: message }
        );
      }
    }
  });

  // ========================================
  // Tool: mcp_unsubscribe_resource
  // ========================================
  pi.registerTool({
    name: "mcp_unsubscribe_resource",
    label: "MCP Unsubscribe Resource",
    description: "Unsubscribe from resource update notifications.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      }),
      uri: Type.String({
        description: "Resource URI to unsubscribe from"
      })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        await mcpManager.unsubscribeResource(params.connection_id, params.uri);
        ctx.ui.notify(`Unsubscribed from resource: ${params.uri}`, "info");

        return makeSuccessResult(
          `Unsubscribed from resource: ${params.uri}`,
          { connectionId: params.connection_id, uri: params.uri }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to unsubscribe: ${message}`, "error");
        return makeErrorResult(
          `Failed to unsubscribe: ${message}`,
          { connectionId: params.connection_id, uri: params.uri, error: message }
        );
      }
    }
  });

  // ========================================
  // Tool: mcp_list_subscriptions
  // ========================================
  pi.registerTool({
    name: "mcp_list_subscriptions",
    label: "MCP List Subscriptions",
    description: "List active resource subscriptions for a connection.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      })
    }),
    async execute(_toolCallId, params) {
      const subscriptions = mcpManager.getSubscriptions(params.connection_id);

      if (subscriptions.length === 0) {
        return makeSuccessResult(
          `No active subscriptions for '${params.connection_id}'.`,
          { connectionId: params.connection_id, subscriptions: [] }
        );
      }

      const subList = subscriptions.map(uri => `  - ${uri}`).join('\n');
      return makeSuccessResult(
        `Active subscriptions for '${params.connection_id}' (${subscriptions.length}):\n${subList}`,
        { connectionId: params.connection_id, subscriptions }
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
      connection_id: Type.String({
        description: "Connection ID"
      })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const ok = await mcpManager.ping(params.connection_id);

        if (ok) {
          ctx.ui.notify(`Server '${params.connection_id}' is responsive`, "info");
          return makeSuccessResult(
            `Server '${params.connection_id}' is responsive`,
            { connectionId: params.connection_id, healthy: true }
          );
        } else {
          ctx.ui.notify(`Server '${params.connection_id}' not responding`, "warning");
          return makeSuccessResult(
            `Server '${params.connection_id}' not responding`,
            { connectionId: params.connection_id, healthy: false }
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Ping failed: ${message}`, "error");
        return makeErrorResult(
          `Ping failed: ${message}`,
          { connectionId: params.connection_id, error: message }
        );
      }
    }
  });

  // ========================================
  // Tool: mcp_complete
  // ========================================
  pi.registerTool({
    name: "mcp_complete",
    label: "MCP Complete",
    description: "Get argument completions for a prompt or resource reference.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      }),
      ref_type: Type.Union([
        Type.Literal("ref/prompt", { description: "Complete prompt argument" }),
        Type.Literal("ref/resource", { description: "Complete resource URI" })
      ], { description: "Reference type" }),
      ref_name: Type.Optional(Type.String({
        description: "Prompt name (required for ref/prompt)"
      })),
      ref_uri: Type.Optional(Type.String({
        description: "Resource URI (required for ref/resource)"
      })),
      argument_name: Type.String({
        description: "Argument name to complete"
      }),
      argument_value: Type.String({
        description: "Current argument value (prefix to complete)"
      })
    }),
    async execute(_toolCallId, params) {
      try {
        // Build ref based on type
        const ref = params.ref_type === 'ref/prompt'
          ? { type: 'ref/prompt' as const, name: params.ref_name! }
          : { type: 'ref/resource' as const, uri: params.ref_uri! };

        // Validate required fields
        if (params.ref_type === 'ref/prompt' && !params.ref_name) {
          return makeErrorResult("ref_name is required for ref/prompt", {
            connectionId: params.connection_id,
            refType: params.ref_type
          });
        }
        if (params.ref_type === 'ref/resource' && !params.ref_uri) {
          return makeErrorResult("ref_uri is required for ref/resource", {
            connectionId: params.connection_id,
            refType: params.ref_type
          });
        }

        const result = await mcpManager.complete(params.connection_id, {
          ref,
          argument: {
            name: params.argument_name,
            value: params.argument_value
          }
        });

        if (result.values.length === 0) {
          return makeSuccessResult(
            `No completions available for '${params.argument_name}'`,
            {
              connectionId: params.connection_id,
              refType: params.ref_type,
              argumentName: params.argument_name,
              completions: []
            }
          );
        }

        const completionList = result.values.map(v => `  - ${v}`).join('\n');
        const moreInfo = result.hasMore ? ` (${result.total ?? result.values.length}+ available)` : '';

        return makeSuccessResult(
          `Completions for '${params.argument_name}':${moreInfo}\n${completionList}`,
          {
            connectionId: params.connection_id,
            refType: params.ref_type,
            argumentName: params.argument_name,
            completions: result.values,
            total: result.total,
            hasMore: result.hasMore
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return makeErrorResult(
          `Completion failed: ${message}`,
          {
            connectionId: params.connection_id,
            refType: params.ref_type,
            argumentName: params.argument_name,
            error: message
          }
        );
      }
    }
  });

  // ========================================
  // Tool: mcp_get_instructions
  // ========================================
  pi.registerTool({
    name: "mcp_get_instructions",
    label: "MCP Get Instructions",
    description: "Get server instructions from a connected MCP server. Instructions provide guidance on how to use the server's tools and resources.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const instructions = await mcpManager.getInstructions(params.connection_id);

        if (!instructions) {
          return makeSuccessResult(
            `No instructions provided by server '${params.connection_id}'.`,
            { connectionId: params.connection_id, instructions: null }
          );
        }

        ctx.ui.notify(`Retrieved instructions from '${params.connection_id}'`, "info");
        return makeSuccessResult(
          `Server Instructions from '${params.connection_id}':\n\n${instructions}`,
          { connectionId: params.connection_id, instructions }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to get instructions: ${message}`, "error");
        return makeErrorResult(
          `Failed to get instructions: ${message}`,
          { connectionId: params.connection_id, error: message }
        );
      }
    }
  });

  // ========================================
  // Tool: mcp_list_resource_templates
  // ========================================
  pi.registerTool({
    name: "mcp_list_resource_templates",
    label: "MCP List Resource Templates",
    description: "List resource templates from a connected MCP server. Resource templates are URI patterns that can be used to construct resource URIs.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      }),
      cursor: Type.Optional(Type.String({
        description: "Pagination cursor for fetching next page"
      }))
    }),
    async execute(_toolCallId, params) {
      try {
        // Use pagination if cursor provided
        if (params.cursor) {
          const result = await mcpManager.listResourceTemplatesPaginated(params.connection_id, { cursor: params.cursor });

          if (result.resourceTemplates.length === 0) {
            return makeSuccessResult(
              `No more resource templates from '${params.connection_id}'.`,
              { connectionId: params.connection_id, resourceTemplates: [], nextCursor: result.nextCursor }
            );
          }

          const templateList = result.resourceTemplates.map(t =>
            `  - ${t.name}: ${t.uriTemplate}${t.mimeType ? ` (${t.mimeType})` : ''}${t.description ? ` - ${t.description}` : ''}`
          ).join('\n');
          const moreInfo = result.nextCursor ? `\n\nMore results available. Use cursor: ${result.nextCursor}` : '';

          return makeSuccessResult(
            `Resource Templates from '${params.connection_id}' (${result.resourceTemplates.length}):\n${templateList}${moreInfo}`,
            { connectionId: params.connection_id, resourceTemplates: result.resourceTemplates, nextCursor: result.nextCursor }
          );
        }

        // Fetch all templates (auto-pagination)
        const templates = await mcpManager.listResourceTemplates(params.connection_id);

        if (templates.length === 0) {
          return makeSuccessResult(
            `No resource templates available from '${params.connection_id}'. The server may not provide templates.`,
            { connectionId: params.connection_id, resourceTemplates: [] }
          );
        }

        const templateList = templates.map(t =>
          `  - ${t.name}: ${t.uriTemplate}${t.mimeType ? ` (${t.mimeType})` : ''}${t.description ? ` - ${t.description}` : ''}`
        ).join('\n');

        return makeSuccessResult(
          `Resource Templates from '${params.connection_id}' (${templates.length}):\n${templateList}`,
          { connectionId: params.connection_id, resourceTemplates: templates, total: templates.length }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return makeErrorResult(
          `Failed to list resource templates: ${message}`,
          { connectionId: params.connection_id, error: message }
        );
      }
    }
  });

  // ========================================
  // Tool: mcp_set_logging_level
  // ========================================
  pi.registerTool({
    name: "mcp_set_logging_level",
    label: "MCP Set Logging Level",
    description: "Set the logging level for a connected MCP server. Controls the verbosity of server log messages.",
    parameters: Type.Object({
      connection_id: Type.String({
        description: "Connection ID"
      }),
      level: Type.Union([
        Type.Literal("debug", { description: "Detailed debug information" }),
        Type.Literal("info", { description: "General informational messages" }),
        Type.Literal("notice", { description: "Normal but significant events" }),
        Type.Literal("warning", { description: "Warning conditions" }),
        Type.Literal("error", { description: "Error conditions" }),
        Type.Literal("critical", { description: "Critical conditions" }),
        Type.Literal("alert", { description: "Action must be taken immediately" }),
        Type.Literal("emergency", { description: "System is unusable" })
      ], { description: "Logging level to set" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        await mcpManager.setLoggingLevel(params.connection_id, params.level);
        ctx.ui.notify(`Set logging level to '${params.level}' for '${params.connection_id}'`, "info");

        return makeSuccessResult(
          `Logging level set to '${params.level}' for server '${params.connection_id}'`,
          { connectionId: params.connection_id, level: params.level }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to set logging level: ${message}`, "error");
        return makeErrorResult(
          `Failed to set logging level: ${message}`,
          { connectionId: params.connection_id, level: params.level, error: message }
        );
      }
    }
  });

  // ========================================
  // Tool: mcp_register_sampling_handler
  // ========================================
  pi.registerTool({
    name: "mcp_register_sampling_handler",
    label: "MCP Register Sampling Handler",
    description: "Register a handler for sampling requests from MCP servers. Allows servers to request LLM sampling via the client.",
    parameters: Type.Object({
      mode: Type.Union([
        Type.Literal("enable", { description: "Enable sampling handler with auto-response" }),
        Type.Literal("disable", { description: "Disable sampling handler" }),
        Type.Literal("interactive", { description: "Enable with user confirmation (future)" })
      ], { description: "Handler mode" }),
      default_model: Type.Optional(Type.String({
        description: "Default model to use for sampling (default: 'auto')"
      })),
      auto_approve: Type.Optional(Type.Boolean({
        description: "Auto-approve sampling requests without user confirmation (default: false)"
      }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.mode === 'disable') {
        mcpManager.setSamplingHandler(null);
        ctx.ui.notify("Sampling handler disabled", "info");
        return makeSuccessResult("Sampling handler disabled", { mode: 'disabled' });
      }

      // Create sampling handler
      const handler: McpSamplingHandler = async (request, connectionId) => {
        ctx.ui.notify(`Sampling request from '${connectionId}' (${request.messages.length} messages)`, "info");

        // For 'enable' mode, auto-respond (basic implementation)
        // In production, this would integrate with pi's LLM capabilities
        console.log(`[MCP Sampling] Request from ${connectionId}:`, {
          messages: request.messages.length,
          maxTokens: request.maxTokens,
          systemPrompt: request.systemPrompt?.substring(0, 100)
        });

        // Return placeholder response
        // TODO: Integrate with pi's actual LLM sampling capabilities
        return {
          model: params.default_model || 'auto',
          stopReason: 'end_turn',
          content: {
            type: 'text',
            text: `[Sampling response placeholder - integrate with pi LLM capabilities]\n\n` +
                  `Received ${request.messages.length} messages with maxTokens=${request.maxTokens}.`
          }
        };
      };

      mcpManager.setSamplingHandler(handler);
      ctx.ui.notify(`Sampling handler enabled (${params.mode} mode)`, "info");

      return makeSuccessResult(
        `Sampling handler registered in '${params.mode}' mode.\n` +
        `Servers can now request LLM sampling through this client.\n` +
        `Note: Current implementation is a placeholder. Full integration requires LLM provider setup.`,
        {
          mode: params.mode,
          defaultModel: params.default_model || 'auto',
          autoApprove: params.auto_approve ?? false
        }
      );
    }
  });

  // ========================================
  // Tool: mcp_register_elicitation_handler
  // ========================================
  pi.registerTool({
    name: "mcp_register_elicitation_handler",
    label: "MCP Register Elicitation Handler",
    description: "Register a handler for elicitation requests from MCP servers. Allows servers to request information collection (forms, URLs) from the client.",
    parameters: Type.Object({
      mode: Type.Union([
        Type.Literal("enable", { description: "Enable elicitation handler with auto-response" }),
        Type.Literal("disable", { description: "Disable elicitation handler" }),
        Type.Literal("interactive", { description: "Enable with user interaction (future)" })
      ], { description: "Handler mode" }),
      default_action: Type.Optional(Type.Union([
        Type.Literal("accept"),
        Type.Literal("decline"),
        Type.Literal("cancel")
      ], { description: "Default action for auto-mode (default: 'decline' for safety)" })),
      auto_values: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Default values for form fields (used in 'enable' mode)"
      }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.mode === 'disable') {
        mcpManager.setElicitationHandler(null);
        ctx.ui.notify("Elicitation handler disabled", "info");
        return makeSuccessResult("Elicitation handler disabled", { mode: 'disabled' });
      }

      const defaultAction = params.default_action || 'decline';

      // Create elicitation handler
      const handler: McpElicitationHandler = async (request, connectionId) => {
        if (request.type === 'form') {
          ctx.ui.notify(
            `Elicitation form from '${connectionId}': ${request.title}`,
            "info"
          );

          console.log(`[MCP Elicitation] Form request from ${connectionId}:`, {
            title: request.title,
            fields: request.fields.map(f => f.name)
          });

          // Auto-fill with provided values or decline
          const values: Record<string, string> = {};
          for (const field of request.fields) {
            if (params.auto_values && params.auto_values[field.name]) {
              values[field.name] = params.auto_values[field.name];
            } else if (field.type === 'checkbox') {
              values[field.name] = 'false';
            } else {
              values[field.name] = '';
            }
          }

          return {
            elicitationId: request.elicitationId,
            action: defaultAction,
            values: defaultAction === 'accept' ? values : undefined
          };
        } else {
          // URL-based elicitation
          ctx.ui.notify(
            `Elicitation URL from '${connectionId}': ${request.url}`,
            "warning"
          );

          console.log(`[MCP Elicitation] URL request from ${connectionId}:`, {
            url: request.url,
            expiresIn: request.expiresIn
          });

          // For URL-based elicitation, decline by default for security
          return {
            elicitationId: request.elicitationId,
            action: 'decline'
          };
        }
      };

      mcpManager.setElicitationHandler(handler);
      ctx.ui.notify(`Elicitation handler enabled (${params.mode} mode)`, "info");

      return makeSuccessResult(
        `Elicitation handler registered in '${params.mode}' mode.\n` +
        `Default action: ${defaultAction}\n` +
        `Servers can now request information collection through this client.\n` +
        `Note: For interactive mode, integrate with pi's UI capabilities.`,
        {
          mode: params.mode,
          defaultAction,
          autoValues: params.auto_values
        }
      );
    }
  });

  // ========================================
  // Session Lifecycle Handlers
  // ========================================

  // Wire up notification callback
  mcpManager.setNotificationCallback(dispatchNotification);

  // Auto-connect from config on session start
  // DISABLED: Spawning child processes (StdioClientTransport) interferes with
  // Kitty protocol detection on /reload. Use /mcp-reload to manually connect.
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("MCP Client loaded • Use /mcp-reload to connect", "info");
  });

  // Cleanup on session shutdown
  pi.on("session_shutdown", async () => {
    const connectionCount = mcpManager.getConnectionCount();
    if (connectionCount > 0) {
      // console.log removed to avoid stdout interference with Kitty protocol
      await mcpManager.disconnectAll();
    }
    // Clear notification handlers
    notificationHandlers.clear();
    handlerIdCounter = 0;
  });
}
