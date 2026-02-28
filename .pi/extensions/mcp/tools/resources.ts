/**
 * @abdd.meta
 * path: .pi/extensions/mcp/tools/resources.ts
 * role: MCPリソース操作ツールの登録
 * why: リソース関連のツールを分離し、mcp-client.tsの肥大化を防ぐため
 * related: ./shared.ts, ../mcp-client.ts
 * public_api: registerResourceTools
 * invariants: なし
 * side_effects: ネットワーク通信、リソース購読
 * failure_modes: リソースが見つからない、接続エラー
 * @abdd.explain
 * overview: MCPリソース操作ツールの登録モジュール
 * what_it_does:
 *   - mcp_list_resources: リソース一覧
 *   - mcp_read_resource: リソース読み取り
 *   - mcp_subscribe_resource: リソース購読
 *   - mcp_unsubscribe_resource: 購読解除
 *   - mcp_list_subscriptions: 購読一覧
 *   - mcp_list_resource_templates: テンプレート一覧
 * why_it_exists:
 *   - リソース操作ツールを分離して保守性を高めるため
 * scope:
 *   in: ./shared.ts
 *   out: ../mcp-client.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mcpManager } from "../../../lib/mcp/connection-manager.js";
import { formatResourceContent } from "../../../lib/mcp/tool-bridge.js";
import {
  makeSuccessResult,
  makeErrorResult,
} from "./shared.js";

/**
 * リソース操作ツールを登録する
 * @summary リソースツールを登録
 * @param pi 拡張API
 */
export function registerResourceTools(pi: ExtensionAPI): void {
  // ========================================
  // Tool: mcp_list_resources
  // ========================================
  pi.registerTool({
    name: "mcp_list_resources",
    label: "MCP List Resources",
    description: "List available resources from a connected MCP server. Resources are read-only data like files, configurations, or documents.",
    parameters: Type.Object({
      id: Type.String({ description: "Connection ID" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const resources = await mcpManager.listResources(params.id);
        const text = resources.length > 0
          ? `Resources from ${params.id}:\n${resources.map(r => `- ${r.uri}: ${r.name}`).join('\n')}`
          : `No resources available from ${params.id}`;
        return makeSuccessResult(text, { resources });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Failed to list resources: ${errorMsg}`, {
          error: errorMsg,
          connectionId: params.id
        });
      }
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
      connection_id: Type.String({ description: "Connection ID" }),
      uri: Type.String({ description: "Resource URI to read (e.g., file:///path/to/file, config://app)" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const contents = await mcpManager.readResource(params.connection_id, params.uri);
        const text = formatResourceContent(contents);
        return makeSuccessResult(text, { uri: params.uri, contents });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Failed to read resource: ${errorMsg}`, {
          error: errorMsg,
          connectionId: params.connection_id,
          uri: params.uri
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
      connection_id: Type.String({ description: "Connection ID" }),
      uri: Type.String({ description: "Resource URI to subscribe to" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        await mcpManager.subscribeResource(params.connection_id, params.uri);
        return makeSuccessResult(
          `Subscribed to resource: ${params.uri}`,
          { connectionId: params.connection_id, uri: params.uri }
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Failed to subscribe: ${errorMsg}`, {
          error: errorMsg,
          connectionId: params.connection_id,
          uri: params.uri
        });
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
      connection_id: Type.String({ description: "Connection ID" }),
      uri: Type.String({ description: "Resource URI to unsubscribe from" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        await mcpManager.unsubscribeResource(params.connection_id, params.uri);
        return makeSuccessResult(
          `Unsubscribed from resource: ${params.uri}`,
          { connectionId: params.connection_id, uri: params.uri }
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Failed to unsubscribe: ${errorMsg}`, {
          error: errorMsg,
          connectionId: params.connection_id,
          uri: params.uri
        });
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
      connection_id: Type.String({ description: "Connection ID" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const subscriptions = await mcpManager.listSubscriptions(params.connection_id);
        const text = subscriptions.length > 0
          ? `Active subscriptions:\n${subscriptions.map(s => `- ${s}`).join('\n')}`
          : 'No active subscriptions';
        return makeSuccessResult(text, { subscriptions });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Failed to list subscriptions: ${errorMsg}`, {
          error: errorMsg,
          connectionId: params.connection_id
        });
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
      connection_id: Type.String({ description: "Connection ID" }),
      cursor: Type.Optional(Type.String({ description: "Pagination cursor for fetching next page" }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const result = await mcpManager.listResourceTemplates(params.connection_id, params.cursor);
        const templates = result.resourceTemplates || [];
        const text = templates.length > 0
          ? `Resource templates:\n${templates.map(t => `- ${t.uriTemplate}: ${t.name}`).join('\n')}`
          : 'No resource templates available';
        return makeSuccessResult(text, {
          templates,
          nextCursor: result.nextCursor
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`Failed to list resource templates: ${errorMsg}`, {
          error: errorMsg,
          connectionId: params.connection_id
        });
      }
    }
  });
}
