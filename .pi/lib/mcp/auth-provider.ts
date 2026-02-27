/**
 * @abdd.meta
 * path: .pi/lib/mcp/auth-provider.ts
 * role: MCP認証プロバイダーアダプター
 * why: McpAuthProvider型をSDK互換のRequestInitに変換するため
 * related: types.ts, connection-manager.ts
 * public_api: authProviderToRequestInit, createOAuthProvider, sanitizeAuthForLogging
 * invariants: 認証情報はログに出力しない、トークンは安全に処理する
 * side_effects: なし（純粋関数）
 * failure_modes: 不正な認証タイプ、欠損フィールド
 * @abdd.explain
 * overview: MCP認証設定をSDKトランスポート用のRequestInitに変換
 * what_it_does:
 *   - Bearer/Basic/API-Key/Custom認証をHTTPヘッダーに変換
 *   - OAuth2用のプロバイダーオブジェクト生成
 *   - ログ用の認証情報サニタイズ
 * why_it_exists: SDKトランスポートと認証設定の橋渡しを行うため
 * scope:
 *   in: McpAuthProvider認証設定
 *   out: RequestInit（headers含む）、OAuthプロバイダー
 */

import type { McpAuthProvider, McpOAuth2AuthProvider } from './types.js';

/**
 * McpAuthProviderをSDK互換のRequestInitに変換する
 * @param auth - 認証プロバイダー設定
 * @returns RequestInit（headersを含む）
 * @summary 認証設定をHTTPヘッダーに変換
 */
export function authProviderToRequestInit(auth: McpAuthProvider): RequestInit {
	const headers: Record<string, string> = {};

	switch (auth.type) {
		case 'bearer':
			headers['Authorization'] = `Bearer ${auth.token}`;
			break;
		case 'basic': {
			const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
			headers['Authorization'] = `Basic ${credentials}`;
			break;
		}
		case 'api-key':
			headers[auth.headerName ?? 'X-API-Key'] = auth.apiKey;
			break;
		case 'custom':
			Object.assign(headers, auth.headers);
			break;
	}

	return { headers };
}

/**
 * カスタムヘッダーを認証ヘッダーとマージする
 * @param authInit - 認証由来のRequestInit
 * @param customHeaders - カスタムヘッダー
 * @returns マージされたRequestInit
 * @summary 認証ヘッダーとカスタムヘッダーを統合
 */
export function mergeHeaders(
	authInit: RequestInit | undefined,
	customHeaders: Record<string, string> | undefined
): RequestInit {
	const authHeaders = (authInit?.headers as Record<string, string>) ?? {};
	const mergedHeaders = { ...authHeaders, ...customHeaders };

	return {
		...authInit,
		headers: mergedHeaders
	};
}

/**
 * OAuth2用のSDK互換プロバイダーオブジェクトを作成する
 * @param config - OAuth2認証設定
 * @returns SDK互換のOAuth2プロバイダー
 * @summary OAuth2プロバイダーオブジェクトを生成
 */
export function createOAuthProvider(config: McpOAuth2AuthProvider) {
	return {
		type: 'oauth2' as const,
		tokens: {
			access_token: config.accessToken,
			refresh_token: config.refreshToken,
			expires_at: config.expiresAt
		},
		refresh: config.refreshTokenFn
	};
}

/**
 * ログ出力用に認証情報をサニタイズする
 * @param auth - 認証プロバイダー設定
 * @returns サニタイズされた認証情報
 * @summary 認証情報をログ安全形式に変換
 */
export function sanitizeAuthForLogging(auth: McpAuthProvider | undefined): Record<string, unknown> {
	if (!auth) {
		return { type: 'none' };
	}

	switch (auth.type) {
		case 'bearer':
			return { type: 'bearer', token: '***REDACTED***' };
		case 'basic':
			return { type: 'basic', username: auth.username, password: '***REDACTED***' };
		case 'api-key':
			return { type: 'api-key', headerName: auth.headerName ?? 'X-API-Key', apiKey: '***REDACTED***' };
		case 'custom':
			return {
				type: 'custom',
				headers: Object.keys(auth.headers).reduce((acc, key) => {
					acc[key] = '***REDACTED***';
					return acc;
				}, {} as Record<string, string>)
			};
	}
}

/**
 * 認証設定を検証する
 * @param auth - 認証プロバイダー設定
 * @returns 検証結果（有効な場合はtrue、エラーメッセージの場合は文字列）
 * @summary 認証設定の妥当性を確認
 */
export function validateAuthProvider(auth: McpAuthProvider): true | string {
	switch (auth.type) {
		case 'bearer':
			if (!auth.token || auth.token.trim() === '') {
				return 'Bearer token is required';
			}
			break;
		case 'basic':
			if (!auth.username || auth.username.trim() === '') {
				return 'Username is required for basic auth';
			}
			if (!auth.password) {
				return 'Password is required for basic auth';
			}
			break;
		case 'api-key':
			if (!auth.apiKey || auth.apiKey.trim() === '') {
				return 'API key is required';
			}
			break;
		case 'custom':
			if (!auth.headers || Object.keys(auth.headers).length === 0) {
				return 'At least one header is required for custom auth';
			}
			break;
	}

	return true;
}
