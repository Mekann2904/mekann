/**
 * @abdd.meta
 * path: .pi/lib/mcp/tool-bridge.ts
 * role: MCPスキーマとpiスキーマ間の変換
 * why: MCPサーバーのJSON SchemaをpiのType Builderに変換するため
 * related: types.ts, connection-manager.ts, ../extensions/mcp-client.ts
 * public_api: convertMcpSchemaToPi, formatToolResult, formatResourceContent
 * invariants: 変換は情報を損なわない、未知の型はType.Anyにフォールバック
 * side_effects: なし（純粋関数）
 * failure_modes: 不正なスキーマ、サポートされない型
 * @abdd.explain
 * overview: MCPプロトコルとpi間のデータ変換ユーティリティ
 * what_it_does:
 *   - JSON Schemaをpi Type Builderスキーマに変換
 *   - MCPツール実行結果をテキスト形式にフォーマット
 *   - MCPリソース内容をテキスト形式にフォーマット
 * why_it_exists: 異なるスキーマシステム間の相互運用性を確保するため
 * scope:
 *   in: MCP JSON Schema, ツール実行結果, リソース内容
 *   out: pi Type スキーマ, フォーマット済みテキスト
 */

import { Type } from "@mariozechner/pi-ai";
import type { McpToolInfo, McpConnection } from "./types.js";

/**
 * MCPツール実行結果をテキスト形式にフォーマットする
 * @param result - MCPツール実行結果
 * @returns フォーマット済みテキスト
 */
export function formatToolResult(result: unknown): string {
	if (!result || typeof result !== 'object') {
		return String(result);
	}

	const toolResult = result as {
		content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		isError?: boolean;
		structuredContent?: unknown;
	};

	if (!toolResult.content || !Array.isArray(toolResult.content)) {
		if (toolResult.structuredContent) {
			return JSON.stringify(toolResult.structuredContent, null, 2);
		}
		return JSON.stringify(result, null, 2);
	}

	const lines: string[] = [];

	for (const item of toolResult.content) {
		switch (item.type) {
			case 'text':
				lines.push(item.text ?? '');
				break;
			case 'image':
				lines.push(`[Image: ${item.mimeType ?? 'unknown'}, ${item.data?.length ?? 0} bytes]`);
				break;
			case 'resource':
				lines.push(`[Resource: ${JSON.stringify(item)}]`);
				break;
			case 'resource_link':
				lines.push(`[Resource Link: ${JSON.stringify(item)}]`);
				break;
			default:
				lines.push(JSON.stringify(item));
		}
	}

	return lines.join('\n');
}

/**
 * MCPリソース内容をテキスト形式にフォーマットする
 * @param result - MCPリソース読み取り結果
 * @returns フォーマット済みテキスト
 */
export function formatResourceContent(result: unknown): string {
	if (!result || typeof result !== 'object') {
		return String(result);
	}

	const resourceResult = result as {
		contents?: Array<{
			uri: string;
			text?: string;
			blob?: string;
			mimeType?: string;
		}>;
	};

	if (!resourceResult.contents || !Array.isArray(resourceResult.contents)) {
		return JSON.stringify(result, null, 2);
	}

	const lines: string[] = [];

	for (const item of resourceResult.contents) {
		if (item.text) {
			lines.push(item.text);
		} else if (item.blob) {
			const byteLength = Math.ceil(item.blob.length * 3 / 4);
			lines.push(`[Binary: ${item.uri}, ${item.mimeType ?? 'unknown'}, ${byteLength} bytes]`);
		} else {
			lines.push(`[Resource: ${item.uri}]`);
		}
	}

	return lines.join('\n');
}

/**
 * ツール情報を人間可読形式でフォーマットする
 * @param tools - ツール情報一覧
 * @param connectionId - 接続ID（オプション）
 * @returns フォーマット済みテキスト
 */
export function formatToolList(tools: McpToolInfo[], connectionId?: string): string {
	if (tools.length === 0) {
		return connectionId
			? `No tools available from connection '${connectionId}'.`
			: 'No MCP tools available.';
	}

	const header = connectionId
		? `Tools from '${connectionId}' (${tools.length}):`
		: `Available MCP Tools (${tools.length}):`;

	const lines = tools.map(tool => {
		let line = `  - ${tool.name}`;
		if (tool.description) {
			line += `: ${tool.description}`;
		}
		return line;
	});

	return `${header}\n${lines.join('\n')}`;
}

/**
 * 接続情報を人間可読形式でフォーマットする
 * @param connections - 接続情報一覧
 * @returns フォーマット済みテキスト
 */
export function formatConnectionList(connections: McpConnection[]): string {
	if (connections.length === 0) {
		return 'No active MCP connections.\nUse mcp_connect to connect to an MCP server.';
	}

	const lines = connections.map(conn => {
		let line = `- ${conn.id}: ${conn.url} [${conn.status}]`;
		line += ` (${conn.tools.length} tools)`;
		if (conn.serverInfo) {
			line += ` - ${conn.serverInfo.name}/${conn.serverInfo.version}`;
		}
		return line;
	});

	return `Active MCP Connections (${connections.length}):\n${lines.join('\n')}`;
}
