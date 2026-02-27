/**
 * @abdd.meta
 * path: .pi/lib/mcp/connection-manager.ts
 * role: MCPサーバー接続のライフサイクル管理
 * why: 複数のMCPサーバーへの接続を一元管理し、状態を追跡するため
 * related: types.ts, tool-bridge.ts, ../extensions/mcp-client.ts, auth-provider.ts
 * public_api: McpConnectionManager, mcpManager, McpConnectionType, setRoots, getRoots, listPrompts, getPrompt, subscribeResource, unsubscribeResource, getSubscriptions, listTools, listResourcesPaginated, listAllTools, listAllResources, ping, complete, setLoggingLevel, setSamplingHandler, setElicitationHandler
 * invariants: 接続IDは一意、最大接続数は10、切断時にリソースと購読を解放
 * side_effects: ネットワーク接続の確立・切断、Roots通知の送信、認証ヘッダーの送信、Sampling/Elicitationハンドラーの設定
 * failure_modes: ネットワークエラー、無効なURL、認証失敗、タイムアウト、SSEフォールバック失敗、WebSocket接続エラー
 * @abdd.explain
 * overview: MCPサーバー接続のシングルトン管理クラス（SDK 100%準拠）
 * what_it_does:
 *   - MCPサーバーへの接続を確立・管理・切断（認証対応）
 *   - StreamableHTTP → SSE自動フォールバック（レガシーサーバー対応）
 *   - WebSocket Transport（ws://wss://接続対応）
 *   - Roots機能（サーバーにルートディレクトリを通知）
 *   - Prompts API（プロンプトテンプレートの取得・展開）
 *   - リソース購読機能（更新通知の受信）
 *   - ページネーション対応のリスト取得
 *   - ping/complete メソッド
 *   - ログレベル制御（setLoggingLevel）
 *   - Sampling Handler（サーバーからのLLMサンプリングリクエスト処理）
 *   - Elicitation Handler（サーバーからの情報収集リクエスト処理）
 * why_it_exists: 複数接続の状態を一元管理し、MCP SDK準拠の機能を提供するため
 * scope:
 *   in: 接続パラメータ（id, url, type, auth, headers）, Roots設定, プロンプト引数, 購読URI, ログレベル, Sampling/Elicitationハンドラー
 *   out: McpConnection, ツール一覧, リソース一覧, プロンプト結果, 購読状態
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ListRootsRequestSchema, CreateMessageRequestSchema, ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection, McpConnectionState, McpToolInfo, McpResourceInfo, McpNotificationType, McpNotification, McpRoot, McpPromptInfo, McpPromptResult, McpAuthProvider, McpResourceTemplateInfo, McpConnectOptions, McpActiveTransportType, McpLoggingLevel, McpSamplingHandler, McpSamplingRequest, McpSamplingResponse, McpElicitationHandler, McpElicitationRequest, McpElicitationResponse } from "./types.js";
import { authProviderToRequestInit, mergeHeaders } from "./auth-provider.js";

/**
 * 通知コールバック型
 */
export type McpNotificationCallback = (notification: McpNotification) => void | Promise<void>;

/**
 * 接続タイプ
 */
export type McpConnectionType = 'http' | 'stdio' | 'sse' | 'websocket';

/**
 * 接続タイプを判定する
 * @param url - 接続URL または コマンド
 * @returns 接続タイプ
 */
function detectConnectionType(url: string): McpConnectionType {
	// WebSocketパターン: ws:// または wss://
	if (url.startsWith('ws://') || url.startsWith('wss://')) {
		return 'websocket';
	}

	// SSEパターン: sse:// または http+sse://
	if (url.startsWith('sse://') || url.startsWith('http+sse://') || url.startsWith('https+sse://')) {
		return 'sse';
	}

	// HTTPパターン: http:// または https://
	if (url.startsWith('http://') || url.startsWith('https://')) {
		return 'http';
	}

	// stdioパターン: コマンド形式 (例: "node server.js", "npx -y @anthropic/mcp-server")
	// URL形式でない場合はstdioとみなす
	return 'stdio';
}

/**
 * stdioコマンドをパースする
 * @param command - コマンド文字列
 * @returns コマンドと引数
 */
function parseStdioCommand(command: string): { command: string; args: string[] } {
	const parts = command.trim().split(/\s+/);
	return {
		command: parts[0],
		args: parts.slice(1)
	};
}

/**
 * URLに適合するトランスポート種別かチェック
 * @param url - 接続URL
 * @param transportType - トランスポート種別
 * @returns 適合する場合true
 */
function isValidTransportForUrl(url: string, transportType: 'streamable-http' | 'sse' | 'stdio' | 'websocket'): boolean {
	if (transportType === 'stdio') {
		return !url.startsWith('http://') && !url.startsWith('https://') &&
		       !url.startsWith('sse://') && !url.startsWith('http+sse://') &&
		       !url.startsWith('ws://') && !url.startsWith('wss://');
	}
	if (transportType === 'sse') {
		return url.startsWith('sse://') || url.startsWith('http+sse://') || url.startsWith('https+sse://');
	}
	if (transportType === 'streamable-http') {
		return url.startsWith('http://') || url.startsWith('https://');
	}
	if (transportType === 'websocket') {
		return url.startsWith('ws://') || url.startsWith('wss://');
	}
	return false;
}

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

	private notificationCallback: McpNotificationCallback | null = null;

	/**
	 * Roots設定（サーバーがアクセス可能なディレクトリ）
	 */
	private roots: McpRoot[] = [];

	/**
	 * サンプリングハンドラー（サーバーからのLLMサンプリングリクエスト処理）
	 */
	private samplingHandler: McpSamplingHandler | null = null;

	/**
	 * エリシテーションハンドラー（サーバーからの情報収集リクエスト処理）
	 */
	private elicitationHandler: McpElicitationHandler | null = null;

	/**
	 * 通知コールバックを設定する
	 * @param callback - 通知を受け取るコールバック関数
	 */
	setNotificationCallback(callback: McpNotificationCallback | null): void {
		this.notificationCallback = callback;
	}

	/**
	 * HTTPエラーかどうかを判定する
	 * @param error - エラーオブジェクト
	 * @param statusCodePrefix - ステータスコードのプレフィックス（4 = 4xx）
	 * @returns HTTPエラーの場合true
	 */
	private isHttpError(error: unknown, statusCodePrefix: number): boolean {
		if (!(error instanceof Error)) return false;
		const message = error.message.toLowerCase();
		// Check for status code patterns: "4xx", "400", "404", etc.
		if (message.includes(`${statusCodePrefix}`) && /\b4\d{2}\b/.test(message)) return true;
		// Check for common error messages
		if (statusCodePrefix === 4 && (
			message.includes('bad request') ||
			message.includes('not found') ||
			message.includes('method not allowed') ||
			message.includes('unsupported media type')
		)) return true;
		return false;
	}

	/**
	 * クライアントケーパビリティを取得する
	 * @returns MCPクライアントケーパビリティ
	 */
	private getCapabilities() {
		return {
			roots: { listChanged: true },
			sampling: {},
			elicitation: {}
		};
	}

	/**
	 * MCPサーバーに接続する
	 * @param params - 接続パラメータ
	 * @returns 接続情報
	 * @throws ネットワークエラー、無効なURL、タイムアウト等
	 */
	async connect(params: {
		id: string;
		url: string;
		timeout?: number;
		type?: McpConnectionType;
		auth?: McpAuthProvider;
		headers?: Record<string, string>;
		/** 明示的なトランスポート種別（auto時は自動検出） */
		transportType?: 'auto' | 'streamable-http' | 'sse' | 'stdio' | 'websocket';
		/** フォールバックの無効化 */
		disableFallback?: boolean;
	}): Promise<McpConnection> {
		const { id, url, timeout = DEFAULT_TIMEOUT, type, auth, headers, transportType = 'auto', disableFallback = false } = params;

		// 既存接続のチェック
		if (this.state.connections.has(id)) {
			throw new Error(`Connection '${id}' already exists. Use a different ID or disconnect first.`);
		}

		// 最大接続数チェック
		if (this.state.connections.size >= MAX_CONNECTIONS) {
			throw new Error(`Maximum connections (${MAX_CONNECTIONS}) reached. Disconnect a server first.`);
		}

		// 接続タイプの判定（明示指定または自動検出）
		const connectionType = type ?? (transportType === 'auto' ? detectConnectionType(url) : transportType);

		// 明示指定されたトランスポートとURLの整合性チェック
		if (transportType !== 'auto' && !isValidTransportForUrl(url, transportType)) {
			throw new Error(`Transport type '${transportType}' is not compatible with URL '${url}'`);
		}

		// 接続情報の初期化（先に作成してステータス追跡）
		const connection: McpConnection = {
			id,
			name: id,
			url,
			client: null as unknown as Client,
			transport: null as unknown as Transport,
			status: 'connecting',
			tools: [],
			resources: [],
			subscriptions: new Set(),
			connectedAt: new Date()
		};

		this.state.connections.set(id, connection);

		try {
			// タイムアウト付きで接続
			const connectWithTimeout = async (client: Client, transport: Transport) => {
				const connectPromise = client.connect(transport);
				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error(`Connection timeout after ${timeout}ms`)), timeout);
				});
				return Promise.race([connectPromise, timeoutPromise]);
			};

			let client: Client;
			let transport: Transport;
			let activeTransportType: McpActiveTransportType;

			switch (connectionType) {
				case 'stdio': {
					const { command, args } = parseStdioCommand(url);
					transport = new StdioClientTransport({
						command,
						args,
						env: process.env as Record<string, string>
					});
					client = new Client(
						{ name: "pi-mcp-client", version: "1.0.0" },
						{ capabilities: this.getCapabilities() }
					);
					await connectWithTimeout(client, transport);
					activeTransportType = 'stdio';
					console.log(`[MCP] Connected to ${id} using stdio transport`);
					break;
				}
				case 'sse': {
					// SSE URLを通常のHTTP URLに変換
					const sseUrl = url
						.replace(/^sse:\/\//, 'http://')
						.replace(/^http\+sse:\/\//, 'http://')
						.replace(/^https\+sse:\/\//, 'https://');
					transport = new SSEClientTransport(new URL(sseUrl));
					client = new Client(
						{ name: "pi-mcp-client", version: "1.0.0" },
						{ capabilities: this.getCapabilities() }
					);
					await connectWithTimeout(client, transport);
					activeTransportType = 'sse';
					console.log(`[MCP] Connected to ${id} using SSE transport`);
					break;
				}
				case 'websocket': {
					// WebSocket接続
					const wsUrl = new URL(url);
					if (!['ws:', 'wss:'].includes(wsUrl.protocol)) {
						throw new Error(`Invalid WebSocket protocol: ${wsUrl.protocol}. Only ws and wss are allowed.`);
					}
					transport = new WebSocketClientTransport(wsUrl);
					client = new Client(
						{ name: "pi-mcp-client", version: "1.0.0" },
						{ capabilities: this.getCapabilities() }
					);
					await connectWithTimeout(client, transport);
					activeTransportType = 'websocket';
					console.log(`[MCP] Connected to ${id} using WebSocket transport`);
					break;
				}
				case 'http':
				default: {
					// URL検証
					const parsedUrl = new URL(url);
					if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
						throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Only http and https are allowed.`);
					}

					// Build transport options with auth and headers
					const transportOptions: ConstructorParameters<typeof StreamableHTTPClientTransport>[1] = {};

					// Add auth headers
					if (auth) {
						const authInit = authProviderToRequestInit(auth);
						transportOptions.requestInit = authInit;
					}

					// Add custom headers (merge with auth headers)
					if (headers) {
						const existingHeaders = (transportOptions.requestInit?.headers as Record<string, string>) ?? {};
						const mergedInit = mergeHeaders(existingHeaders, headers);
						// Type assertion needed because RequestInit.headers is HeadersInit
						transportOptions.requestInit = {
							...transportOptions.requestInit,
							headers: mergedInit.headers as HeadersInit
						};
					}

					// StreamableHTTPを試行、4xxエラー時にSSEへフォールバック
					try {
						transport = new StreamableHTTPClientTransport(parsedUrl, transportOptions);
						client = new Client(
							{ name: "pi-mcp-client", version: "1.0.0" },
							{ capabilities: this.getCapabilities() }
						);
						await connectWithTimeout(client, transport);
						activeTransportType = 'streamable-http';
						console.log(`[MCP] Connected to ${id} using StreamableHTTP transport`);
					} catch (error) {
						// フォールバックが無効な場合はエラーを再スロー
						if (disableFallback || !this.isHttpError(error, 4)) {
							throw error;
						}

						// SSEフォールバック（レガシーサーバー対応）
						console.warn(`[MCP] StreamableHTTP connection failed for ${id}, falling back to SSE transport`);
						// SSEClientTransportはSSEClientTransportOptionsを受け取る
						transport = new SSEClientTransport(parsedUrl, transportOptions);
						client = new Client(
							{ name: "pi-mcp-client", version: "1.0.0" },
							{ capabilities: this.getCapabilities() }
						);
						await connectWithTimeout(client, transport);
						activeTransportType = 'sse';
						console.log(`[MCP] Connected to ${id} using SSE transport (fallback)`);
					}
					break;
				}
			}

			// 接続情報を更新
			connection.client = client;
			connection.transport = transport;
			connection.transportType = activeTransportType;
			connection.status = 'connected';

			// Rootsハンドラーの設定
			this.setupRootsHandler(client);

			// 通知ハンドラーの設定
			this.setupNotificationHandlers(client, id);

			// サンプリングハンドラーの設定
			this.setupSamplingHandler(client, id);

			// エリシテーションハンドラーの設定
			this.setupElicitationHandler(client, id);

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
				await connection.transport?.close();
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

		// Clear subscriptions
		connection.subscriptions.clear();

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
	 * MCPクライアントに通知ハンドラーを設定する
	 * @param client - MCPクライアント
	 * @param connectionId - 接続ID
	 */
	private setupNotificationHandlers(client: Client, connectionId: string): void {
		if (!this.notificationCallback) return;

		// フォールバックハンドラーですべての通知をキャッチ
		client.fallbackNotificationHandler = async (notification: { method: string; params?: unknown }) => {
			// 通知タイプをマッピング（SDK準拠）
			let notificationType: McpNotificationType | null = null;
			switch (notification.method) {
				case 'notifications/tools/list_changed':
					notificationType = 'tools/list_changed';
					break;
				case 'notifications/resources/list_changed':
					notificationType = 'resources/list_changed';
					break;
				case 'notifications/resources/updated':
					notificationType = 'resources/updated';
					break;
				case 'notifications/prompts/list_changed':
					notificationType = 'prompts/list_changed';
					break;
				case 'notifications/message':
					notificationType = 'logging/setLevel';
					break;
				case 'notifications/progress':
					notificationType = 'progress';
					break;
				case 'notifications/cancelled':
					notificationType = 'cancelled';
					break;
				default:
					// 不明な通知タイプはログ出力してスキップ
					console.warn(`[MCP] Unknown notification type: ${notification.method} (connection: ${connectionId})`);
					return;
			}

			this.dispatchNotification({
				type: notificationType,
				data: (notification.params as Record<string, unknown>) ?? {},
				connectionId,
				timestamp: new Date()
			});
		};
	}

	/**
	 * Rootsハンドラーを設定する
	 * @param client - MCPクライアント
	 */
	private setupRootsHandler(client: Client): void {
		client.setRequestHandler(ListRootsRequestSchema, async () => {
			return { roots: this.roots };
		});
	}

	/**
	 * Roots設定を設定する
	 * @param roots - ルートディレクトリ一覧
	 */
	setRoots(roots: McpRoot[]): void {
		this.roots = roots;
		// 全接続に通知
		for (const conn of this.state.connections.values()) {
			if (conn.client && conn.status === 'connected') {
				conn.client.sendRootsListChanged().catch(() => {
					// 通知エラーは無視（サーバーが対応していない可能性）
				});
			}
		}
	}

	/**
	 * 現在のRoots設定を取得する
	 */
	getRoots(): McpRoot[] {
		return [...this.roots];
	}

	/**
	 * 通知をディスパッチする
	 * @param notification - 通知データ
	 */
	private dispatchNotification(notification: McpNotification): void {
		if (this.notificationCallback) {
			try {
				const result = this.notificationCallback(notification);
				if (result instanceof Promise) {
					result.catch(err => console.error('Notification callback error:', err));
				}
			} catch (err) {
				console.error('Notification callback error:', err);
			}
		}
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
	 * MCPプロンプト一覧を取得する
	 * @param connectionId - 接続ID
	 * @returns プロンプト情報一覧
	 */
	async listPrompts(connectionId: string): Promise<McpPromptInfo[]> {
		const connection = this.getConnectionOrFail(connectionId);

		const result = await connection.client.listPrompts();
		return result.prompts.map(p => ({
			name: p.name,
			description: p.description,
			arguments: p.arguments?.map(a => ({
				name: a.name,
				description: a.description,
				required: a.required
			}))
		}));
	}

	/**
	 * MCPプロンプトを取得する
	 * @param connectionId - 接続ID
	 * @param name - プロンプト名
	 * @param args - プロンプト引数
	 * @returns プロンプト展開結果
	 */
	async getPrompt(connectionId: string, name: string, args?: Record<string, string>): Promise<McpPromptResult> {
		const connection = this.getConnectionOrFail(connectionId);

		const result = await connection.client.getPrompt({ name, arguments: args });
		return {
			description: result.description,
			messages: result.messages.map(m => ({
				role: m.role as 'user' | 'assistant',
				content: {
					type: m.content.type as 'text' | 'image' | 'resource',
					text: 'text' in m.content ? m.content.text : undefined,
					data: 'data' in m.content ? m.content.data : undefined,
					mimeType: 'mimeType' in m.content ? m.content.mimeType : undefined
				}
			}))
		};
	}

	// ========================================
	// Resource Subscriptions (SDK Compliance)
	// ========================================

	/**
	 * Subscribe to resource updates
	 * @summary リソース更新通知を購読
	 * @param connectionId - Connection ID
	 * @param uri - Resource URI to subscribe to
	 */
	async subscribeResource(connectionId: string, uri: string): Promise<void> {
		const connection = this.getConnectionOrFail(connectionId);

		// Check server capability
		const capabilities = connection.client.getServerCapabilities();
		if (!capabilities?.resources?.subscribe) {
			throw new Error(`Server does not support resource subscriptions`);
		}

		try {
			await connection.client.subscribeResource({ uri });
			connection.subscriptions.add(uri);
			console.log(`[MCP] Subscribed to resource: ${uri} (${connectionId})`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[MCP] Failed to subscribe to resource ${uri} (${connectionId}): ${errorMessage}`);
			throw new Error(`Failed to subscribe to resource: ${errorMessage}`, { cause: error });
		}
	}

	/**
	 * Unsubscribe from resource updates
	 * @summary リソース購読を解除
	 * @param connectionId - Connection ID
	 * @param uri - Resource URI to unsubscribe from
	 */
	async unsubscribeResource(connectionId: string, uri: string): Promise<void> {
		const connection = this.getConnectionOrFail(connectionId);

		try {
			await connection.client.unsubscribeResource({ uri });
			connection.subscriptions.delete(uri);
			console.log(`[MCP] Unsubscribed from resource: ${uri} (${connectionId})`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[MCP] Failed to unsubscribe from resource ${uri} (${connectionId}): ${errorMessage}`);
			throw new Error(`Failed to unsubscribe from resource: ${errorMessage}`, { cause: error });
		}
	}

	/**
	 * Get active subscriptions for a connection
	 * @summary アクティブな購読一覧を取得
	 * @param connectionId - Connection ID
	 * @returns Array of subscribed URIs
	 */
	getSubscriptions(connectionId: string): string[] {
		const connection = this.getConnection(connectionId);
		return connection ? Array.from(connection.subscriptions) : [];
	}

	// ========================================
	// Pagination Support (SDK Compliance)
	// ========================================

	/**
	 * List tools with optional pagination
	 * @summary ツール一覧を取得（ページネーション対応）
	 * @param connectionId - Connection ID
	 * @param options - Pagination options
	 */
	async listTools(
		connectionId: string,
		options?: { cursor?: string }
	): Promise<{ tools: McpToolInfo[]; nextCursor?: string }> {
		const connection = this.getConnectionOrFail(connectionId);

		const result = await connection.client.listTools({
			cursor: options?.cursor
		});

		const tools: McpToolInfo[] = result.tools.map(tool => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema as Record<string, unknown>,
			outputSchema: tool.outputSchema as Record<string, unknown> | undefined
		}));

		return {
			tools,
			nextCursor: result.nextCursor
		};
	}

	/**
	 * List resources with optional pagination
	 * @summary リソース一覧を取得（ページネーション対応）
	 * @param connectionId - Connection ID
	 * @param options - Pagination options
	 */
	async listResourcesPaginated(
		connectionId: string,
		options?: { cursor?: string }
	): Promise<{ resources: McpResourceInfo[]; nextCursor?: string }> {
		const connection = this.getConnectionOrFail(connectionId);

		const result = await connection.client.listResources({
			cursor: options?.cursor
		});

		const resources: McpResourceInfo[] = result.resources.map(res => ({
			uri: res.uri,
			name: res.name,
			mimeType: res.mimeType,
			description: res.description
		}));

		return {
			resources,
			nextCursor: result.nextCursor
		};
	}

	/**
	 * List prompts with optional pagination
	 * @summary プロンプト一覧を取得（ページネーション対応）
	 * @param connectionId - Connection ID
	 * @param options - Pagination options
	 */
	async listPromptsPaginated(
		connectionId: string,
		options?: { cursor?: string }
	): Promise<{ prompts: McpPromptInfo[]; nextCursor?: string }> {
		const connection = this.getConnectionOrFail(connectionId);

		const result = await connection.client.listPrompts({
			cursor: options?.cursor
		});

		const prompts: McpPromptInfo[] = result.prompts.map(p => ({
			name: p.name,
			description: p.description,
			arguments: p.arguments?.map(a => ({
				name: a.name,
				description: a.description,
				required: a.required
			}))
		}));

		return {
			prompts,
			nextCursor: result.nextCursor
		};
	}

	/**
	 * Auto-pagination helper - fetch all tools
	 * @summary 全ツールを自動ページネーションで取得
	 * @param connectionId - Connection ID
	 */
	async listAllTools(connectionId: string): Promise<McpToolInfo[]> {
		const allTools: McpToolInfo[] = [];
		let cursor: string | undefined;

		do {
			const result = await this.listTools(connectionId, { cursor });
			allTools.push(...result.tools);
			cursor = result.nextCursor;
		} while (cursor);

		return allTools;
	}

	/**
	 * Auto-pagination helper - fetch all resources
	 * @summary 全リソースを自動ページネーションで取得
	 * @param connectionId - Connection ID
	 */
	async listAllResources(connectionId: string): Promise<McpResourceInfo[]> {
		const allResources: McpResourceInfo[] = [];
		let cursor: string | undefined;

		do {
			const result = await this.listResourcesPaginated(connectionId, { cursor });
			allResources.push(...result.resources);
			cursor = result.nextCursor;
		} while (cursor);

		return allResources;
	}

	/**
	 * Auto-pagination helper - fetch all prompts
	 * @summary 全プロンプトを自動ページネーションで取得
	 * @param connectionId - Connection ID
	 */
	async listAllPrompts(connectionId: string): Promise<McpPromptInfo[]> {
		const allPrompts: McpPromptInfo[] = [];
		let cursor: string | undefined;

		do {
			const result = await this.listPromptsPaginated(connectionId, { cursor });
			allPrompts.push(...result.prompts);
			cursor = result.nextCursor;
		} while (cursor);

		return allPrompts;
	}

	// ========================================
	// Additional Methods (SDK Compliance)
	// ========================================

	/**
	 * Ping server to check connection health
	 * @summary サーバー接続状態を確認
	 * @param connectionId - Connection ID
	 * @returns true if server is responsive
	 */
	async ping(connectionId: string): Promise<boolean> {
		const connection = this.getConnectionOrFail(connectionId);

		try {
			await connection.client.ping();
			return true;
		} catch {
			connection.status = 'error';
			return false;
		}
	}

	/**
	 * Get argument completions for a prompt or resource
	 * @summary プロンプト/リソース引数の補完を取得
	 * @param connectionId - Connection ID
	 * @param params - Completion parameters
	 */
	async complete(
		connectionId: string,
		params: {
			ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uri: string };
			argument: { name: string; value: string };
		}
	): Promise<{ values: string[]; total?: number; hasMore?: boolean }> {
		const connection = this.getConnectionOrFail(connectionId);

		// Check server capability
		const capabilities = connection.client.getServerCapabilities();
		if (!capabilities?.completions) {
			throw new Error(`Server does not support completions`);
		}

		const result = await connection.client.complete(params);
		return {
			values: result.values as string[],
			total: result.total as number | undefined,
			hasMore: result.hasMore as boolean | undefined
		};
	}

	/**
	 * すべての接続一覧を取得する
	 */
	listConnections(): McpConnection[] {
		return Array.from(this.state.connections.values());
	}

	// ========================================
	// Server Instructions (SDK Compliance)
	// ========================================

	/**
	 * サーバーの指示（instructions）を取得する
	 * @summary サーバー指示を取得
	 * @param connectionId - 接続ID
	 * @returns サーバーの指示テキスト（存在しない場合はundefined）
	 */
	async getInstructions(connectionId: string): Promise<string | undefined> {
		const connection = this.getConnectionOrFail(connectionId);

		try {
			const instructions = await connection.client.getInstructions();
			return instructions;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.warn(`[MCP] Failed to get instructions from ${connectionId}: ${errorMessage}`);
			throw error;
		}
	}

	// ========================================
	// Resource Templates (SDK Compliance)
	// ========================================

	/**
	 * リソーステンプレート一覧を取得する
	 * @summary リソーステンプレート一覧取得
	 * @param connectionId - 接続ID
	 * @returns リソーステンプレート情報の配列
	 */
	async listResourceTemplates(connectionId: string): Promise<McpResourceTemplateInfo[]> {
		const connection = this.getConnectionOrFail(connectionId);

		// Check server capability
		const capabilities = connection.client.getServerCapabilities();
		if (!capabilities?.resources) {
			throw new Error(`Server does not support resources`);
		}

		try {
			const result = await connection.client.listResourceTemplates();
			return result.resourceTemplates.map(rt => ({
				uriTemplate: rt.uriTemplate,
				name: rt.name,
				description: rt.description,
				mimeType: rt.mimeType
			}));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.warn(`[MCP] Failed to list resource templates from ${connectionId}: ${errorMessage}`);
			throw error;
		}
	}

	/**
	 * リソーステンプレート一覧を取得する（ページネーション対応）
	 * @summary リソーステンプレート一覧取得（ページネーション）
	 * @param connectionId - 接続ID
	 * @param options - ページネーションオプション
	 */
	async listResourceTemplatesPaginated(
		connectionId: string,
		options?: { cursor?: string }
	): Promise<{ resourceTemplates: McpResourceTemplateInfo[]; nextCursor?: string }> {
		const connection = this.getConnectionOrFail(connectionId);

		const result = await connection.client.listResourceTemplates({
			cursor: options?.cursor
		});

		const resourceTemplates: McpResourceTemplateInfo[] = result.resourceTemplates.map(rt => ({
			uriTemplate: rt.uriTemplate,
			name: rt.name,
			description: rt.description,
			mimeType: rt.mimeType
		}));

		return {
			resourceTemplates,
			nextCursor: result.nextCursor
		};
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

	// ========================================
	// Logging Level Control (SDK Compliance)
	// ========================================

	/**
	 * サーバーのログレベルを設定する
	 * @summary サーバーログレベルを設定
	 * @param connectionId - 接続ID
	 * @param level - ログレベル（debug/info/notice/warning/error/critical/alert/emergency）
	 */
	async setLoggingLevel(connectionId: string, level: McpLoggingLevel): Promise<void> {
		const connection = this.getConnectionOrFail(connectionId);

		try {
			await connection.client.setLoggingLevel(level);
			console.log(`[MCP] Set logging level to '${level}' for ${connectionId}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.warn(`[MCP] Failed to set logging level for ${connectionId}: ${errorMessage}`);
			throw error;
		}
	}

	// ========================================
	// Sampling Handler (SDK Compliance)
	// ========================================

	/**
	 * サンプリングハンドラーを設定する
	 * @summary サンプリングリクエストハンドラー設定
	 * @param handler - サンプリングリクエスト処理関数
	 */
	setSamplingHandler(handler: McpSamplingHandler | null): void {
		this.samplingHandler = handler;
		// 既存接続にもハンドラーを適用
		for (const conn of this.state.connections.values()) {
			if (conn.client && conn.status === 'connected') {
				this.setupSamplingHandler(conn.client, conn.id);
			}
		}
	}

	/**
	 * サンプリングハンドラーを設定する
	 * @param client - MCPクライアント
	 * @param connectionId - 接続ID
	 */
	private setupSamplingHandler(client: Client, connectionId: string): void {
		if (!this.samplingHandler) return;

		client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
			console.log(`[MCP] Sampling request received from ${connectionId}`);

			try {
				const response = await this.samplingHandler!(
					{
						messages: request.params.messages.map(m => ({
							role: m.role as 'user' | 'assistant',
							content: this.normalizeSamplingContent(m.content)
						})),
						modelPreferences: request.params.modelPreferences,
						systemPrompt: request.params.systemPrompt,
						includeContext: request.params.includeContext as 'none' | 'thisServer' | 'allServers' | undefined,
						temperature: request.params.temperature,
						maxTokens: request.params.maxTokens,
						stopSequences: request.params.stopSequences,
						metadata: request.params.metadata as Record<string, unknown> | undefined
					},
					connectionId
				);

				return {
					model: response.model,
					stopReason: response.stopReason,
					content: response.content
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error(`[MCP] Sampling handler error for ${connectionId}: ${errorMessage}`);
				throw error;
			}
		});
	}

	/**
	 * サンプリングコンテンツブロックを正規化する
	 */
	private normalizeSamplingContent(content: unknown): McpSamplingRequest['messages'][0]['content'] {
		const c = content as Record<string, unknown>;
		return {
			type: c.type as 'text' | 'image' | 'resource',
			text: c.text as string | undefined,
			data: c.data as string | undefined,
			mimeType: c.mimeType as string | undefined
		};
	}

	// ========================================
	// Elicitation Handler (SDK Compliance)
	// ========================================

	/**
	 * エリシテーションハンドラーを設定する
	 * @summary エリシテーションリクエストハンドラー設定
	 * @param handler - エリシテーションリクエスト処理関数
	 */
	setElicitationHandler(handler: McpElicitationHandler | null): void {
		this.elicitationHandler = handler;
		for (const conn of this.state.connections.values()) {
			if (conn.client && conn.status === 'connected') {
				this.setupElicitationHandler(conn.client, conn.id);
			}
		}
	}

	/**
	 * エリシテーションハンドラーを設定する
	 * @param client - MCPクライアント
	 * @param connectionId - 接続ID
	 */
	private setupElicitationHandler(client: Client, connectionId: string): void {
		if (!this.elicitationHandler) return;

		client.setRequestHandler(ElicitRequestSchema, async (request) => {
			console.log(`[MCP] Elicitation request received from ${connectionId}`);

			try {
				const params = request.params as Record<string, unknown>;
				const elicitationId = params.elicitationId as string;

				// Determine request type (form or url)
				let elicitationRequest: McpElicitationRequest;

				if ('form' in params) {
					const form = params.form as Record<string, unknown>;
					elicitationRequest = {
						type: 'form',
						elicitationId,
						title: form.title as string,
						description: form.description as string | undefined,
						fields: (form.fields as Array<Record<string, unknown>>).map(f => ({
							name: f.name as string,
							type: f.type as 'text' | 'password' | 'select' | 'checkbox',
							label: f.label as string,
							required: f.required as boolean | undefined,
							options: f.options as Array<{ label: string; value: string }> | undefined
						}))
					};
				} else if ('url' in params) {
					elicitationRequest = {
						type: 'url',
						elicitationId,
						url: params.url as string,
						expiresIn: params.expiresIn as number | undefined
					};
				} else {
					throw new Error('Invalid elicitation request: missing form or url');
				}

				const response = await this.elicitationHandler!(elicitationRequest, connectionId);

				return {
					elicitationId: response.elicitationId,
					action: response.action,
					values: response.values
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error(`[MCP] Elicitation handler error for ${connectionId}: ${errorMessage}`);
				throw error;
			}
		});
	}
}

/**
 * シングルトンインスタンス
 * globalに保存して、異なるモジュールパスからのインポートでも同じインスタンスを共有する
 */
declare global {
  // eslint-disable-next-line no-var
  var __mcpManager: McpConnectionManager | undefined;
}

export const mcpManager: McpConnectionManager = globalThis.__mcpManager ?? new McpConnectionManager();
globalThis.__mcpManager = mcpManager;
