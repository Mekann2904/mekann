/**
 * @abdd.meta
 * path: .pi/extensions/mcp-client.ts
 * role: MCPクライアント拡張機能 - 外部MCPサーバーへの接続とツール実行
 * why: piからMCPエコシステムのツールとリソースを利用可能にするため
 * related: ../lib/mcp/connection-manager.ts, ../lib/mcp/tool-bridge.ts, ../lib/mcp/types.ts, ../lib/mcp/config-loader.ts
 * public_api: mcp_connect, mcp_disconnect, mcp_list_connections, mcp_list_tools, mcp_call_tool, mcp_list_resources, mcp_read_resource, mcp_reload_config, mcp_register_notification_handler, mcp_set_roots, mcp_list_prompts, mcp_get_prompt
 * invariants: 接続IDは一意、ツールは接続中のみ実行可能、セッション終了時に全接続を切断
 * side_effects: ネットワーク接続の確立・切断、UI通知の表示、設定ファイルからの自動接続、Roots通知の送信
 * failure_modes: ネットワークエラー、無効なURL、認証失敗、タイムアウト、接続先でのツール実行エラー、設定ファイルパースエラー
 * @abdd.explain
 * overview: MCPサーバーへの接続とツール実行を提供するpi拡張機能（SDK準拠）
 * what_it_does:
 *   - mcp_connect: MCPサーバーに接続（StreamableHTTP/SSE自動フォールバック対応）
 *   - mcp_disconnect: 接続を切断
 *   - mcp_list_connections: アクティブな接続一覧を表示
 *   - mcp_list_tools: 接続先のツール一覧を表示
 *   - mcp_call_tool: 接続先でツールを実行
 *   - mcp_list_resources: 接続先のリソース一覧を表示
 *   - mcp_read_resource: 接続先からリソースを読み取り
 *   - mcp_reload_config: 設定ファイルを再読み込みして自動接続
 *   - mcp_register_notification_handler: 通知ハンドラーを登録
 *   - mcp_set_roots: Roots設定（サーバーにルートディレクトリを通知）
 *   - mcp_list_prompts: プロンプトテンプレート一覧を取得
 *   - mcp_get_prompt: プロンプトテンプレートを展開
 *   - セッション開始時に.pi/mcp-servers.jsonから自動接続
 * why_it_exists: MCPエコシステムのツールをpiで利用可能にし、SDK準拠の機能を提供するため
 * scope:
 *   in: サーバーURL/コマンド、接続ID、ツール名、ツール引数、リソースURI、設定ファイル、Roots、プロンプト引数
 *   out: 接続ステータス、ツール実行結果、リソース内容、通知、プロンプト展開結果
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mcpManager, type McpConnectionType } from "../lib/mcp/connection-manager.js";
import { loadMcpConfig, getEnabledServers, getConfigPath } from "../lib/mcp/config-loader.js";
import { formatToolResult, formatResourceContent, formatToolList, formatConnectionList } from "../lib/mcp/tool-bridge.js";
import type { McpNotificationHandler, McpNotificationType, McpNotification, McpRoot, McpPromptInfo, McpPromptResult } from "../lib/mcp/types.js";

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
        await mcpManager.connect({
          id: server.id,
          url: server.url,
          timeout: server.timeout,
          type: detectConnectionType(server.url)
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
    description: "Connect to an MCP (Model Context Protocol) server. Supports HTTP, SSE, and stdio transports.",
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
        Type.Literal("stdio", { description: "Stdio transport (for command-based servers)" })
      ], {
        description: "Transport type. Auto-detected from URL if omitted."
      })),
      timeout: Type.Optional(Type.Number({
        description: "Connection timeout in milliseconds (default: 30000)"
      }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const connection = await mcpManager.connect({
          id: params.id,
          url: params.url,
          timeout: params.timeout,
          type: params.type
        });

        ctx.ui.notify(`Connected to MCP server: ${params.id}`, "info");

        const toolNames = connection.tools.map(t => t.name);
        const serverInfo = connection.serverInfo
          ? ` (${connection.serverInfo.name}/${connection.serverInfo.version})`
          : '';

        return makeSuccessResult(
          `Successfully connected to ${params.url}${serverInfo}\n` +
          `Connection ID: ${params.id}\n` +
          `Transport: ${connection.url.startsWith('http') ? 'HTTP' : 'stdio'}\n` +
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
            type: detectConnectionType(server.url)
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
  // Session Lifecycle Handlers
  // ========================================

  // Wire up notification callback
  mcpManager.setNotificationCallback(dispatchNotification);

  // Auto-connect from config on session start
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("MCP Client extension loaded • Checking for auto-connect servers...", "info");

    const result = await autoConnectFromConfig(ctx);

    if (result.succeeded.length > 0 || result.failed.length > 0) {
      const msg = result.succeeded.length > 0
        ? `Auto-connected: ${result.succeeded.join(', ')}`
        : '';
      const failedMsg = result.failed.length > 0
        ? ` Failed: ${result.failed.map(f => f.id).join(', ')}`
        : '';
      ctx.ui.notify(`MCP: ${msg}${failedMsg}`, result.failed.length > 0 ? "warning" : "info");
    }
  });

  // Cleanup on session shutdown
  pi.on("session_shutdown", async () => {
    const connectionCount = mcpManager.getConnectionCount();
    if (connectionCount > 0) {
      console.log(`Cleaning up ${connectionCount} MCP connection(s)...`);
      await mcpManager.disconnectAll();
    }
    // Clear notification handlers
    notificationHandlers.clear();
    handlerIdCounter = 0;
  });
}
