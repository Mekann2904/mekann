/**
 * @abdd.meta
 * path: .pi/lib/mcp/config-loader.ts
 * role: MCPサーバー設定の読み込み・バリデーション
 * why: 外部設定ファイルからMCPサーバー接続情報と認証を管理するため
 * related: types.ts, connection-manager.ts, ../extensions/mcp-client.ts, auth-provider.ts
 * public_api: McpServerConfig, McpConfigSchema, McpAuthSchema, loadMcpConfig, validateMcpConfig, applyDefaults, getEnabledServers
 * invariants: 設定ファイルはJSON形式、各サーバーIDは一意、認証タイプは4種類のみ
 * side_effects: ファイルシステムからの設定読み込み
 * failure_modes: ファイル不在、JSONパースエラー、バリデーションエラー、不正な認証タイプ
 * @abdd.explain
 * overview: .pi/mcp-servers.jsonの読み込みとバリデーションを行うモジュール（認証対応）
 * what_it_does:
 *   - MCPサーバー設定のスキーマ定義（認証・ヘッダー含む）
 *   - Bearer/Basic/API-Key/Custom認証のバリデーション
 *   - 設定ファイルの読み込みとパース
 *   - 設定値のバリデーション
 *   - デフォルト設定のマージ
 * why_it_exists: MCPサーバー接続と認証をコードから分離し、設定可能にするため
 * scope:
 *   in: .pi/mcp-servers.json（auth, headers含む）
 *   out: McpServerConfig[], バリデーション結果
 */

import { Type } from "@mariozechner/pi-ai";
import type { Static } from "@sinclair/typebox";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Bearer認証設定スキーマ
 */
export const McpBearerAuthSchema = Type.Object({
	type: Type.Literal('bearer'),
	token: Type.String({ description: "Bearer token" })
});

/**
 * Basic認証設定スキーマ
 */
export const McpBasicAuthSchema = Type.Object({
	type: Type.Literal('basic'),
	username: Type.String({ description: "Username" }),
	password: Type.String({ description: "Password" })
});

/**
 * API Key認証設定スキーマ
 */
export const McpApiKeyAuthSchema = Type.Object({
	type: Type.Literal('api-key'),
	apiKey: Type.String({ description: "API key value" }),
	headerName: Type.Optional(Type.String({ description: "Header name (default: X-API-Key)" }))
});

/**
 * カスタム認証設定スキーマ
 */
export const McpCustomAuthSchema = Type.Object({
	type: Type.Literal('custom'),
	headers: Type.Record(Type.String(), Type.String(), { description: "Custom headers" })
});

/**
 * 認証設定のユニオン型スキーマ
 */
export const McpAuthSchema = Type.Union([
	McpBearerAuthSchema,
	McpBasicAuthSchema,
	McpApiKeyAuthSchema,
	McpCustomAuthSchema
]);

/**
 * MCPサーバー設定のスキーマ
 */
export const McpServerConfigSchema = Type.Object({
	id: Type.String({
		description: "Unique server identifier (alphanumeric, underscores, hyphens)"
	}),
	url: Type.String({
		description: "MCP server URL (e.g., http://localhost:3000/mcp)"
	}),
	name: Type.Optional(Type.String({
		description: "Display name for the server"
	})),
	timeout: Type.Optional(Type.Number({
		description: "Connection timeout in milliseconds (default: 30000)",
		minimum: 1000,
		maximum: 300000
	})),
	enabled: Type.Optional(Type.Boolean({
		description: "Whether to auto-connect on startup (default: false)"
	})),
	description: Type.Optional(Type.String({
		description: "Human-readable description of the server"
	})),
	auth: Type.Optional(McpAuthSchema),
	headers: Type.Optional(Type.Record(Type.String(), Type.String(), {
		description: "Additional HTTP headers"
	}))
});

/**
 * MCP設定ファイル全体のスキーマ
 */
export const McpConfigFileSchema = Type.Object({
	servers: Type.Array(McpServerConfigSchema, {
		description: "List of MCP server configurations"
	}),
	version: Type.Optional(Type.String({
		description: "Config schema version"
	}))
});

/**
 * MCPサーバー設定の型
 */
export type McpServerConfig = Static<typeof McpServerConfigSchema>;

/**
 * MCP設定ファイル全体の型
 */
export type McpConfigFile = Static<typeof McpConfigFileSchema>;

/**
 * デフォルト設定
 */
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_ENABLED = false;
const CONFIG_FILE_NAME = "mcp-servers.json";

/**
 * 設定ファイルのパスを取得する
 * @param projectRoot - プロジェクトルートディレクトリ
 * @returns 設定ファイルのパス
 */
export function getConfigPath(projectRoot: string = process.cwd()): string {
	return join(projectRoot, ".pi", CONFIG_FILE_NAME);
}

/**
 * 認証設定をバリデーションする
 * @param auth - 認証設定
 * @returns エラーリスト（空の場合は成功）
 */
function validateAuthConfig(auth: unknown): string[] {
	const errors: string[] = [];

	if (typeof auth !== "object" || auth === null) {
		return ["must be an object with type field"];
	}

	const a = auth as Record<string, unknown>;

	if (a.type !== "bearer" && a.type !== "basic" && a.type !== "api-key" && a.type !== "custom") {
		return ["type must be 'bearer', 'basic', 'api-key', or 'custom'"];
	}

	switch (a.type) {
		case "bearer":
			if (typeof a.token !== "string" || a.token.trim() === "") {
				errors.push("token is required for bearer auth");
			}
			break;
		case "basic":
			if (typeof a.username !== "string" || a.username.trim() === "") {
				errors.push("username is required for basic auth");
			}
			if (typeof a.password !== "string") {
				errors.push("password is required for basic auth");
			}
			break;
		case "api-key":
			if (typeof a.apiKey !== "string" || a.apiKey.trim() === "") {
				errors.push("apiKey is required for api-key auth");
			}
			if (a.headerName !== undefined && typeof a.headerName !== "string") {
				errors.push("headerName must be a string");
			}
			break;
		case "custom":
			if (typeof a.headers !== "object" || a.headers === null) {
				errors.push("headers object is required for custom auth");
			} else {
				const headers = a.headers as Record<string, unknown>;
				for (const [key, value] of Object.entries(headers)) {
					if (typeof value !== "string") {
						errors.push(`headers.${key} must be a string`);
					}
				}
			}
			break;
	}

	return errors;
}

/**
 * 設定値にデフォルトを適用する
 * @param config - 生の設定値
 * @returns デフォルト適用後の設定
 */
export function applyDefaults(config: McpServerConfig): Required<Omit<McpServerConfig, 'name' | 'description' | 'auth' | 'headers'>> & Pick<McpServerConfig, 'name' | 'description' | 'auth' | 'headers'> {
	return {
		...config,
		timeout: config.timeout ?? DEFAULT_TIMEOUT,
		enabled: config.enabled ?? DEFAULT_ENABLED
	};
}

/**
 * 単一サーバー設定をバリデーションする
 * @param config - バリデーション対象の設定
 * @returns バリデーション結果
 */
export function validateServerConfig(config: unknown): { success: true; data: McpServerConfig } | { success: false; errors: string[] } {
	if (typeof config !== "object" || config === null) {
		return { success: false, errors: ["Config must be an object"] };
	}

	const errors: string[] = [];
	const c = config as Record<string, unknown>;

	// Required fields
	if (typeof c.id !== "string" || c.id.trim() === "") {
		errors.push("id: required string");
	} else if (!/^[a-zA-Z0-9_-]+$/.test(c.id)) {
		errors.push("id: must contain only alphanumeric, underscore, or hyphen characters");
	}

	if (typeof c.url !== "string" || c.url.trim() === "") {
		errors.push("url: required string");
	} else {
		// Check for stdio command (no protocol) or valid URL
		const hasProtocol = /^[a-zA-Z]+:\/\//.test(c.url);
		if (hasProtocol) {
			try {
				const parsedUrl = new URL(c.url);
				const validProtocols = ["http:", "https:", "sse:"];
				if (!validProtocols.includes(parsedUrl.protocol)) {
					errors.push("url: must use http, https, sse, or be a stdio command");
				}
			} catch {
				errors.push("url: invalid URL format");
			}
		}
		// If no protocol, treat as stdio command (valid)
	}

	// Optional fields
	if (c.timeout !== undefined) {
		if (typeof c.timeout !== "number" || c.timeout < 1000 || c.timeout > 300000) {
			errors.push("timeout: must be a number between 1000 and 300000");
		}
	}

	if (c.enabled !== undefined && typeof c.enabled !== "boolean") {
		errors.push("enabled: must be a boolean");
	}

	if (c.name !== undefined && typeof c.name !== "string") {
		errors.push("name: must be a string");
	}

	if (c.description !== undefined && typeof c.description !== "string") {
		errors.push("description: must be a string");
	}

	// Auth validation
	if (c.auth !== undefined) {
		const authErrors = validateAuthConfig(c.auth);
		errors.push(...authErrors.map(e => `auth: ${e}`));
	}

	// Headers validation
	if (c.headers !== undefined) {
		if (typeof c.headers !== "object" || c.headers === null) {
			errors.push("headers: must be an object");
		} else {
			const headers = c.headers as Record<string, unknown>;
			for (const [key, value] of Object.entries(headers)) {
				if (typeof value !== "string") {
					errors.push(`headers.${key}: must be a string`);
				}
			}
		}
	}

	if (errors.length > 0) {
		return { success: false, errors };
	}

	return { success: true, data: config as McpServerConfig };
}

/**
 * 設定ファイル全体をバリデーションする
 * @param config - バリデーション対象の設定ファイル
 * @returns バリデーション結果
 */
export function validateMcpConfig(config: unknown): { success: true; data: McpConfigFile } | { success: false; errors: string[] } {
	if (typeof config !== "object" || config === null) {
		return { success: false, errors: ["Config must be an object"] };
	}

	const c = config as Record<string, unknown>;

	if (!Array.isArray(c.servers)) {
		return { success: false, errors: ["servers: required array"] };
	}

	const errors: string[] = [];
	const ids = new Set<string>();

	for (let i = 0; i < c.servers.length; i++) {
		const result = validateServerConfig(c.servers[i]);
		if (result.success) {
			if (ids.has(result.data.id)) {
				errors.push(`servers[${i}]: duplicate id '${result.data.id}'`);
			} else {
				ids.add(result.data.id);
			}
		} else {
			// Type assertion needed because TypeScript can't narrow through the loop
			const failResult = result as { success: false; errors: string[] };
			errors.push(`servers[${i}]: ${failResult.errors.join(", ")}`);
		}
	}

	// Early return if validation errors found
	if (errors.length > 0) {
		return { success: false, errors };
	}

	return {
		success: true,
		data: {
			servers: c.servers as McpServerConfig[],
			version: typeof c.version === "string" ? c.version : undefined
		}
	};
}

/**
 * MCP設定ファイルを読み込む
 * @param projectRoot - プロジェクトルートディレクトリ
 * @returns 設定データ（ファイルがない場合は空配列）
 * @throws JSONパースエラー、バリデーションエラー
 */
export async function loadMcpConfig(projectRoot: string = process.cwd()): Promise<McpConfigFile> {
	const configPath = getConfigPath(projectRoot);

	// ファイルが存在しない場合は空の設定を返す
	if (!existsSync(configPath)) {
		return { servers: [] };
	}

	const content = await readFile(configPath, "utf-8");
	let parsed: unknown;

	try {
		parsed = JSON.parse(content);
	} catch (error) {
		throw new Error(`Failed to parse MCP config file: ${error instanceof Error ? error.message : String(error)}`);
	}

	const result = validateMcpConfig(parsed);
	if (result.success) {
		return result.data;
	}
	// Type assertion needed because TypeScript can't narrow after the if block
	const failResult = result as { success: false; errors: string[] };
	throw new Error(`Invalid MCP config: ${failResult.errors.join("; ")}`);
}

/**
 * 有効なサーバー設定のみを取得する
 * @param config - 設定ファイル
 * @returns 有効なサーバー設定（デフォルト適用済み）
 */
export function getEnabledServers(config: McpConfigFile): Array<ReturnType<typeof applyDefaults>> {
	return config.servers
		.filter(s => s.enabled !== false)
		.map(applyDefaults);
}
