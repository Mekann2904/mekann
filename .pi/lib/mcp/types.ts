/**
 * @abdd.meta
 * path: .pi/lib/mcp/types.ts
 * role: MCPクライアント統合の型定義
 * why: MCPサーバー接続、ツール、リソース、Roots、Promptsの型安全性を確保するため
 * related: connection-manager.ts, tool-bridge.ts, ../extensions/mcp-client.ts
 * public_api: McpConnection, McpToolInfo, McpResourceInfo, McpConnectionState, McpConnectionStatus, McpTransportType, McpAuthProvider, McpNotificationHandler, McpRoot, McpRootsConfig, McpPromptInfo, McpPromptResult
 * invariants: 接続IDは一意、ステータスは4状態のみ、トランスポート種別は4種類のみ
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: MCP統合のための共有型定義モジュール（SDK準拠）
 * what_it_does:
 *   - MCP接続の状態と情報を表現する型を定義
 *   - MCPツール・リソースのメタデータ型を提供
 *   - Roots機能（ルートディレクトリ設定）の型を提供
 *   - Prompts API（プロンプトテンプレート）の型を提供
 *   - 接続管理の状態型を定義
 *   - トランスポート種別（stdio/sse/http）を定義
 *   - 認証プロバイダー型を定義
 *   - 通知ハンドラー型を定義
 * why_it_exists: 型安全性とコードの一貫性を維持するため
 * scope:
 *   in: なし
 *   out: McpConnection, McpToolInfo, McpResourceInfo, McpRoot, McpPromptInfo, McpPromptResult
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

// ========================================
// Transport Types
// ========================================

/**
 * MCPトランスポート種別
 * @summary 接続方式の種類
 */
export type McpTransportType = 'stdio' | 'sse' | 'http' | 'streamable-http';

/**
 * stdioトランスポート設定
 * @summary プロセス間通信設定
 */
export interface McpStdioTransportConfig {
	/** トランスポート種別 */
	type: 'stdio';
	/** 実行コマンド */
	command: string;
	/** コマンド引数 */
	args?: string[];
	/** 環境変数 */
	env?: Record<string, string>;
	/** 作業ディレクトリ */
	cwd?: string;
}

/**
 * SSEトランスポート設定（非推奨: streamable-httpを使用）
 * @summary HTTP SSE接続設定
 * @deprecated Use McpStreamableHttpTransportConfig instead
 */
export interface McpSseTransportConfig {
	/** トランスポート種別 */
	type: 'sse';
	/** SSEエンドポイントURL */
	url: string;
	/** リクエストヘッダー */
	headers?: Record<string, string>;
}

/**
 * HTTPトランスポート設定
 * @summary HTTP接続設定
 */
export interface McpHttpTransportConfig {
	/** トランスポート種別 */
	type: 'http';
	/** HTTPエンドポイントURL */
	url: string;
	/** リクエストヘッダー */
	headers?: Record<string, string>;
}

/**
 * Streamable HTTPトランスポート設定
 * @summary 推奨HTTP接続設定
 */
export interface McpStreamableHttpTransportConfig {
	/** トランスポート種別 */
	type: 'streamable-http';
	/** HTTPエンドポイントURL */
	url: string;
	/** リクエストヘッダー */
	headers?: Record<string, string>;
	/** セッションID */
	sessionId?: string;
}

/**
 * 全トランスポート設定のユニオン型
 */
export type McpTransportConfig =
	| McpStdioTransportConfig
	| McpSseTransportConfig
	| McpHttpTransportConfig
	| McpStreamableHttpTransportConfig;

// ========================================
// Authentication Types
// ========================================

/**
 * 認証プロバイダー種別
 * @summary 認証方式の種類
 */
export type McpAuthProviderType = 'none' | 'bearer' | 'basic' | 'oauth2' | 'api-key' | 'custom';

/**
 * Bearer認証設定
 */
export interface McpBearerAuthProvider {
	/** 認証種別 */
	type: 'bearer';
	/** アクセストークン */
	token: string;
}

/**
 * Basic認証設定
 */
export interface McpBasicAuthProvider {
	/** 認証種別 */
	type: 'basic';
	/** ユーザー名 */
	username: string;
	/** パスワード */
	password: string;
}

/**
 * OAuth2認証設定
 */
export interface McpOAuth2AuthProvider {
	/** 認証種別 */
	type: 'oauth2';
	/** アクセストークン */
	accessToken: string;
	/** リフレッシュトークン（オプション） */
	refreshToken?: string;
	/** トークン有効期限（Unix timestamp） */
	expiresAt?: number;
	/** トークンリフレッシュ関数 */
	refreshTokenFn?: () => Promise<string>;
}

/**
 * API Key認証設定
 */
export interface McpApiKeyAuthProvider {
	/** 認証種別 */
	type: 'api-key';
	/** APIキー */
	apiKey: string;
	/** ヘッダー名（デフォルト: 'X-API-Key'） */
	headerName?: string;
}

/**
 * カスタム認証設定
 */
export interface McpCustomAuthProvider {
	/** 認証種別 */
	type: 'custom';
	/** カスタムヘッダー */
	headers: Record<string, string>;
}

/**
 * 全認証プロバイダーのユニオン型
 */
export type McpAuthProvider =
	| McpBearerAuthProvider
	| McpBasicAuthProvider
	| McpOAuth2AuthProvider
	| McpApiKeyAuthProvider
	| McpCustomAuthProvider;

// ========================================
// Notification Handler Types
// ========================================

/**
 * MCP通知の種別
 */
export type McpNotificationType =
	| 'tools/list_changed'
	| 'resources/list_changed'
	| 'prompts/list_changed'
	| 'logging/setLevel'
	| 'progress'
	| 'cancelled';

/**
 * MCP通知データ
 */
export interface McpNotification {
	/** 通知種別 */
	type: McpNotificationType;
	/** 通知データ */
	data: Record<string, unknown>;
	/** 送信元接続ID */
	connectionId: string;
	/** タイムスタンプ */
	timestamp: Date;
}

/**
 * 通知ハンドラー関数型
 */
export type McpNotificationHandler = (notification: McpNotification) => void | Promise<void>;

/**
 * 通知ハンドラー登録オプション
 */
export interface McpNotificationHandlerOptions {
	/** 対象通知種別（未指定時は全種別） */
	types?: McpNotificationType[];
	/** 対象接続ID（未指定時は全接続） */
	connectionId?: string;
}

/**
 * 通知ハンドラー登録情報
 */
export interface McpNotificationHandlerRegistration {
	/** ハンドラーID */
	id: string;
	/** ハンドラー関数 */
	handler: McpNotificationHandler;
	/** 登録オプション */
	options: McpNotificationHandlerOptions;
}

// ========================================
// Roots Types (SDK Compliance)
// ========================================

/**
 * Root定義（SDK準拠）
 * @summary MCPサーバーがアクセス可能なルートディレクトリ
 */
export interface McpRoot {
	/** ルートURI（file:///path/to/dir 形式） */
	uri: string;
	/** ルート名（表示用） */
	name: string;
}

/**
 * Roots設定
 * @summary 複数のルート定義
 */
export interface McpRootsConfig {
	/** ルート一覧 */
	roots: McpRoot[];
}

// ========================================
// Prompts Types (SDK Compliance)
// ========================================

/**
 * プロンプト情報（SDK準拠）
 * @summary MCPサーバーが提供するプロンプトテンプレート
 */
export interface McpPromptInfo {
	/** プロンプト名 */
	name: string;
	/** プロンプトの説明 */
	description?: string;
	/** プロンプト引数 */
	arguments?: Array<{
		name: string;
		description?: string;
		required?: boolean;
	}>;
}

/**
 * プロンプト取得結果
 * @summary プロンプトテンプレートの展開結果
 */
export interface McpPromptResult {
	/** プロンプトの説明 */
	description?: string;
	/** メッセージ一覧 */
	messages: Array<{
		role: 'user' | 'assistant';
		content: {
			type: 'text' | 'image' | 'resource';
			text?: string;
			data?: string;
			mimeType?: string;
		};
	}>;
}
