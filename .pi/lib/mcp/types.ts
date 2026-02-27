/**
 * @abdd.meta
 * path: .pi/lib/mcp/types.ts
 * role: MCPクライアント統合の型定義
 * why: MCPサーバー接続、ツール、リソースの型安全性を確保するため
 * related: connection-manager.ts, tool-bridge.ts, ../extensions/mcp-client.ts
 * public_api: McpConnection, McpToolInfo, McpResourceInfo, McpConnectionState, McpConnectionStatus
 * invariants: 接続IDは一意、ステータスは4状態のみ
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: MCP統合のための共有型定義モジュール
 * what_it_does:
 *   - MCP接続の状態と情報を表現する型を定義
 *   - MCPツール・リソースのメタデータ型を提供
 *   - 接続管理の状態型を定義
 * why_it_exists: 型安全性とコードの一貫性を維持するため
 * scope:
 *   in: なし
 *   out: McpConnection, McpToolInfo, McpResourceInfo, McpConnectionState
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * MCP接続のステータス
 */
export type McpConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * MCPツールの情報
 */
export interface McpToolInfo {
	/** ツール名 */
	name: string;
	/** ツールの説明 */
	description?: string;
	/** 入力スキーマ（JSON Schema形式） */
	inputSchema: Record<string, unknown>;
	/** 出力スキーマ（JSON Schema形式、オプション） */
	outputSchema?: Record<string, unknown>;
}

/**
 * MCPリソースの情報
 */
export interface McpResourceInfo {
	/** リソースURI */
	uri: string;
	/** リソース名 */
	name: string;
	/** MIMEタイプ */
	mimeType?: string;
	/** 説明 */
	description?: string;
}

/**
 * MCPサーバーへの接続情報
 */
export interface McpConnection {
	/** 一意の接続識別子 */
	id: string;
	/** 接続の表示名 */
	name: string;
	/** MCPサーバーのURL */
	url: string;
	/** MCPクライアントインスタンス */
	client: Client;
	/** トランスポートインスタンス */
	transport: Transport;
	/** 接続ステータス */
	status: McpConnectionStatus;
	/** 利用可能なツール一覧 */
	tools: McpToolInfo[];
	/** 利用可能なリソース一覧 */
	resources: McpResourceInfo[];
	/** エラーメッセージ（エラー時のみ） */
	error?: string;
	/** 接続時刻 */
	connectedAt?: Date;
	/** サーバー情報 */
	serverInfo?: {
		name: string;
		version: string;
	};
}

/**
 * MCP接続管理の状態
 */
export interface McpConnectionState {
	/** 接続ID → 接続情報のマップ */
	connections: Map<string, McpConnection>;
}

/**
 * MCP接続の作成パラメータ
 */
export interface McpConnectParams {
	/** 一意の接続識別子 */
	id: string;
	/** MCPサーバーのURL */
	url: string;
	/** 接続タイムアウト（ミリ秒、デフォルト: 30000） */
	timeout?: number;
}

/**
 * MCPツール実行パラメータ
 */
export interface McpCallToolParams {
	/** 接続ID */
	connectionId: string;
	/** ツール名 */
	toolName: string;
	/** ツール引数 */
	arguments?: Record<string, unknown>;
	/** タイムアウト（ミリ秒） */
	timeout?: number;
}

/**
 * MCPリソース読み取りパラメータ
 */
export interface McpReadResourceParams {
	/** 接続ID */
	connectionId: string;
	/** リソースURI */
	uri: string;
}
