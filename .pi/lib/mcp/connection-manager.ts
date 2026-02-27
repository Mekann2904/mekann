/**
 * @abdd.meta
 * path: .pi/lib/mcp/connection-manager.ts
 * role: MCPサーバー接続のライフサイクル管理
 * why: 複数のMCPサーバーへの接続を一元管理し、状態を追跡するため
 * related: types.ts, tool-bridge.ts, ../extensions/mcp-client.ts
 * public_api: McpConnectionManager, mcpManager
 * invariants: 接続IDは一意、最大接続数は10、切断時にリソースを解放
 * side_effects: ネットワーク接続の確立・切断
 * failure_modes: ネットワークエラー、無効なURL、認証失敗、タイムアウト
 * @abdd.explain
 * overview: MCPサーバー接続のシングルトン管理クラス
 * what_it_does:
 *   - MCPサーバーへの接続を確立・管理・切断
 *   - 接続ごとのツール・リソース一覧をキャッシュ
 *   - エラーハンドリングとステータス追跡
 * why_it_exists: 複数接続の状態を一元管理し、拡張機能から簡単にアクセス可能にするため
 * scope:
 *   in: 接続パラメータ（id, url）
 *   out: McpConnection, ツール一覧, リソース一覧
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpConnection, McpConnectionState, McpToolInfo, McpResourceInfo } from "./types.js";

/**
 * デフォルト設定
 */
const DEFAULT_TIMEOUT = 30000; // 30秒
const MAX_CONNECTIONS = 10;

/**
 * MCP接続管理クラス
 * シングルトンパターンで実装
 */
export class McpConnectionManager {
	private state: McpConnectionState = {
		connections: new Map()
	};

	/**
	 * MCPサーバーに接続する
	 * @param params - 接続パラメータ
	 * @returns 接続情報
	 * @throws ネットワークエラー、無効なURL、タイムアウト等
	 */
	async connect(params: { id: string; url: string; timeout?: number }): Promise<McpConnection> {
		const { id, url, timeout = DEFAULT_TIMEOUT } = params;

		// 既存接続のチェック
		if (this.state.connections.has(id)) {
			throw new Error(`Connection '${id}' already exists. Use a different ID or disconnect first.`);
		}

		// 最大接続数チェック
		if (this.state.connections.size >= MAX_CONNECTIONS) {
			throw new Error(`Maximum connections (${MAX_CONNECTIONS}) reached. Disconnect a server first.`);
		}

		// URL検証
		try {
			const parsedUrl = new URL(url);
			if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
				throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Only http and https are allowed.`);
			}
		} catch (error) {
			throw new Error(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`);
		}

		// クライアントとトランスポートの作成
		const client = new Client(
			{ name: "pi-mcp-client", version: "1.0.0" },
			{ capabilities: {} }
		);

		const transport = new StreamableHTTPClientTransport(new URL(url));

		// 接続情報の初期化
		const connection: McpConnection = {
			id,
			name: id,
			url,
			client,
			transport,
			status: 'connecting',
			tools: [],
			resources: [],
			connectedAt: new Date()
		};

		this.state.connections.set(id, connection);

		try {
			// タイムアウト付きで接続
			const connectPromise = client.connect(transport);
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error(`Connection timeout after ${timeout}ms`)), timeout);
			});

			await Promise.race([connectPromise, timeoutPromise]);

			connection.status = 'connected';

			// サーバー情報の取得
			const serverCapabilities = client.getServerCapabilities();
			const serverVersion = client.getServerVersion();
			if (serverVersion) {
				connection.serverInfo = {
					name: serverVersion.name,
					version: serverVersion.version
				};
			}

			// ツール一覧の取得（capabilityがある場合）
			if (serverCapabilities?.tools) {
				try {
					const { tools } = await client.listTools();
					connection.tools = tools.map(t => ({
						name: t.name,
						description: t.description,
						inputSchema: t.inputSchema as Record<string, unknown>,
						outputSchema: t.outputSchema as Record<string, unknown> | undefined
					}));
				} catch (error) {
					console.warn(`Failed to list tools for ${id}:`, error);
				}
			}

			// リソース一覧の取得（capabilityがある場合）
			if (serverCapabilities?.resources) {
				try {
					const { resources } = await client.listResources();
					connection.resources = resources.map(r => ({
						uri: r.uri,
						name: r.name,
						mimeType: r.mimeType,
						description: r.description
					}));
				} catch (error) {
					console.warn(`Failed to list resources for ${id}:`, error);
				}
			}

			return connection;
		} catch (error) {
			connection.status = 'error';
			connection.error = error instanceof Error ? error.message : String(error);
			this.state.connections.delete(id);

			// トランスポートのクリーンアップ
			try {
				await transport.close();
			} catch {
				// クリーンアップエラーは無視
			}

			throw error;
		}
	}

	/**
	 * MCPサーバーから切断する
	 * @param id - 接続ID
	 */
	async disconnect(id: string): Promise<void> {
		const connection = this.state.connections.get(id);
		if (!connection) {
			return;
		}

		try {
			await connection.client.close();
		} catch (error) {
			console.warn(`Error closing connection ${id}:`, error);
		} finally {
			this.state.connections.delete(id);
		}
	}

	/**
	 * すべての接続を切断する
	 */
	async disconnectAll(): Promise<void> {
		const disconnectPromises = Array.from(this.state.connections.keys()).map(id => this.disconnect(id));
		await Promise.allSettled(disconnectPromises);
	}

	/**
	 * MCPツールを実行する
	 * @param connectionId - 接続ID
	 * @param toolName - ツール名
	 * @param args - ツール引数
	 * @returns ツール実行結果
	 */
	async callTool(connectionId: string, toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
		const connection = this.getConnectionOrFail(connectionId);

		const result = await connection.client.callTool({
			name: toolName,
			arguments: args
		});

		return result;
	}

	/**
	 * MCPリソースを読み取る
	 * @param connectionId - 接続ID
	 * @param uri - リソースURI
	 * @returns リソース内容
	 */
	async readResource(connectionId: string, uri: string): Promise<unknown> {
		const connection = this.getConnectionOrFail(connectionId);

		const result = await connection.client.readResource({ uri });
		return result;
	}

	/**
	 * MCPリソース一覧を更新する
	 * @param connectionId - 接続ID
	 */
	async refreshResources(connectionId: string): Promise<McpResourceInfo[]> {
		const connection = this.getConnectionOrFail(connectionId);

		const { resources } = await connection.client.listResources();
		connection.resources = resources.map(r => ({
			uri: r.uri,
			name: r.name,
			mimeType: r.mimeType,
			description: r.description
		}));

		return connection.resources;
	}

	/**
	 * MCPツール一覧を更新する
	 * @param connectionId - 接続ID
	 */
	async refreshTools(connectionId: string): Promise<McpToolInfo[]> {
		const connection = this.getConnectionOrFail(connectionId);

		const { tools } = await connection.client.listTools();
		connection.tools = tools.map(t => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema as Record<string, unknown>,
			outputSchema: t.outputSchema as Record<string, unknown> | undefined
		}));

		return connection.tools;
	}

	/**
	 * すべての接続一覧を取得する
	 */
	listConnections(): McpConnection[] {
		return Array.from(this.state.connections.values());
	}

	/**
	 * 接続情報を取得する
	 * @param id - 接続ID
	 */
	getConnection(id: string): McpConnection | undefined {
		return this.state.connections.get(id);
	}

	/**
	 * 接続情報を取得する（存在しない場合はエラー）
	 * @param id - 接続ID
	 */
	private getConnectionOrFail(id: string): McpConnection {
		const connection = this.state.connections.get(id);
		if (!connection) {
			throw new Error(`Connection '${id}' not found. Use mcp_connect to establish a connection first.`);
		}
		if (connection.status !== 'connected') {
			throw new Error(`Connection '${id}' is not connected (status: ${connection.status})`);
		}
		return connection;
	}

	/**
	 * 接続数を取得する
	 */
	getConnectionCount(): number {
		return this.state.connections.size;
	}
}

/**
 * シングルトンインスタンス
 */
export const mcpManager = new McpConnectionManager();
