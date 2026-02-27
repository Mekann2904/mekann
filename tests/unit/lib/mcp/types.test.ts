/**
 * types.ts 単体テスト
 * カバレッジ: McpConnectionStatus, McpToolInfo, McpResourceInfo, McpConnection, McpTransportType, McpAuthProvider
 */
import {
	describe,
	it,
	expect,
} from "vitest";
import type {
	McpConnectionStatus,
	McpToolInfo,
	McpResourceInfo,
	McpConnection,
	McpConnectionState,
	McpConnectParams,
	McpCallToolParams,
	McpReadResourceParams,
	McpTransportType,
	McpStdioTransportConfig,
	McpSseTransportConfig,
	McpHttpTransportConfig,
	McpStreamableHttpTransportConfig,
	McpTransportConfig,
	McpAuthProviderType,
	McpBearerAuthProvider,
	McpBasicAuthProvider,
	McpOAuth2AuthProvider,
	McpApiKeyAuthProvider,
	McpCustomAuthProvider,
	McpAuthProvider,
	McpNotificationType,
	McpNotification,
	McpNotificationHandler,
	McpNotificationHandlerOptions,
	McpNotificationHandlerRegistration,
} from "@lib/mcp/types.js";

// ============================================================================
// McpConnectionStatus Type Tests
// ============================================================================

describe("McpConnectionStatus", () => {
	it("should_accept_connecting_status", () => {
		const status: McpConnectionStatus = "connecting";
		expect(status).toBe("connecting");
	});

	it("should_accept_connected_status", () => {
		const status: McpConnectionStatus = "connected";
		expect(status).toBe("connected");
	});

	it("should_accept_disconnected_status", () => {
		const status: McpConnectionStatus = "disconnected";
		expect(status).toBe("disconnected");
	});

	it("should_accept_error_status", () => {
		const status: McpConnectionStatus = "error";
		expect(status).toBe("error");
	});
});

// ============================================================================
// McpToolInfo Type Tests
// ============================================================================

describe("McpToolInfo", () => {
	it("should_create_minimal_tool_info", () => {
		const tool: McpToolInfo = {
			name: "test-tool",
			inputSchema: { type: "object" },
		};

		expect(tool.name).toBe("test-tool");
		expect(tool.inputSchema).toEqual({ type: "object" });
		expect(tool.description).toBeUndefined();
		expect(tool.outputSchema).toBeUndefined();
	});

	it("should_create_full_tool_info", () => {
		const tool: McpToolInfo = {
			name: "full-tool",
			description: "A test tool",
			inputSchema: {
				type: "object",
				properties: { query: { type: "string" } },
			},
			outputSchema: {
				type: "object",
				properties: { result: { type: "string" } },
			},
		};

		expect(tool.name).toBe("full-tool");
		expect(tool.description).toBe("A test tool");
		expect(tool.inputSchema.properties).toBeDefined();
		expect(tool.outputSchema?.properties).toBeDefined();
	});
});

// ============================================================================
// McpResourceInfo Type Tests
// ============================================================================

describe("McpResourceInfo", () => {
	it("should_create_minimal_resource_info", () => {
		const resource: McpResourceInfo = {
			uri: "file:///test.txt",
			name: "test.txt",
		};

		expect(resource.uri).toBe("file:///test.txt");
		expect(resource.name).toBe("test.txt");
		expect(resource.mimeType).toBeUndefined();
		expect(resource.description).toBeUndefined();
	});

	it("should_create_full_resource_info", () => {
		const resource: McpResourceInfo = {
			uri: "file:///data.json",
			name: "data.json",
			mimeType: "application/json",
			description: "JSON data file",
		};

		expect(resource.uri).toBe("file:///data.json");
		expect(resource.mimeType).toBe("application/json");
		expect(resource.description).toBe("JSON data file");
	});
});

// ============================================================================
// McpTransportType Type Tests
// ============================================================================

describe("McpTransportType", () => {
	it("should_accept_stdio_type", () => {
		const type: McpTransportType = "stdio";
		expect(type).toBe("stdio");
	});

	it("should_accept_sse_type", () => {
		const type: McpTransportType = "sse";
		expect(type).toBe("sse");
	});

	it("should_accept_http_type", () => {
		const type: McpTransportType = "http";
		expect(type).toBe("http");
	});

	it("should_accept_streamable_http_type", () => {
		const type: McpTransportType = "streamable-http";
		expect(type).toBe("streamable-http");
	});
});

// ============================================================================
// McpTransportConfig Union Type Tests
// ============================================================================

describe("McpTransportConfig", () => {
	it("should_create_stdio_config", () => {
		const config: McpStdioTransportConfig = {
			type: "stdio",
			command: "node",
			args: ["server.js"],
		};

		expect(config.type).toBe("stdio");
		expect(config.command).toBe("node");
		expect(config.args).toEqual(["server.js"]);
	});

	it("should_create_stdio_config_with_env", () => {
		const config: McpStdioTransportConfig = {
			type: "stdio",
			command: "npx",
			args: ["-y", "@anthropic/mcp-server"],
			env: { NODE_ENV: "production" },
			cwd: "/app",
		};

		expect(config.env).toEqual({ NODE_ENV: "production" });
		expect(config.cwd).toBe("/app");
	});

	it("should_create_sse_config", () => {
		const config: McpSseTransportConfig = {
			type: "sse",
			url: "http://localhost:3000/sse",
		};

		expect(config.type).toBe("sse");
		expect(config.url).toBe("http://localhost:3000/sse");
	});

	it("should_create_http_config", () => {
		const config: McpHttpTransportConfig = {
			type: "http",
			url: "http://localhost:3000/mcp",
			headers: { "X-API-Key": "secret" },
		};

		expect(config.type).toBe("http");
		expect(config.headers).toEqual({ "X-API-Key": "secret" });
	});

	it("should_create_streamable_http_config", () => {
		const config: McpStreamableHttpTransportConfig = {
			type: "streamable-http",
			url: "http://localhost:3000/mcp",
			sessionId: "session-123",
		};

		expect(config.type).toBe("streamable-http");
		expect(config.sessionId).toBe("session-123");
	});
});

// ============================================================================
// McpAuthProviderType Type Tests
// ============================================================================

describe("McpAuthProviderType", () => {
	it("should_accept_none_type", () => {
		const type: McpAuthProviderType = "none";
		expect(type).toBe("none");
	});

	it("should_accept_bearer_type", () => {
		const type: McpAuthProviderType = "bearer";
		expect(type).toBe("bearer");
	});

	it("should_accept_basic_type", () => {
		const type: McpAuthProviderType = "basic";
		expect(type).toBe("basic");
	});

	it("should_accept_oauth2_type", () => {
		const type: McpAuthProviderType = "oauth2";
		expect(type).toBe("oauth2");
	});

	it("should_accept_api_key_type", () => {
		const type: McpAuthProviderType = "api-key";
		expect(type).toBe("api-key");
	});

	it("should_accept_custom_type", () => {
		const type: McpAuthProviderType = "custom";
		expect(type).toBe("custom");
	});
});

// ============================================================================
// McpAuthProvider Union Type Tests
// ============================================================================

describe("McpAuthProvider", () => {
	it("should_create_bearer_auth", () => {
		const auth: McpBearerAuthProvider = {
			type: "bearer",
			token: "access-token-123",
		};

		expect(auth.type).toBe("bearer");
		expect(auth.token).toBe("access-token-123");
	});

	it("should_create_basic_auth", () => {
		const auth: McpBasicAuthProvider = {
			type: "basic",
			username: "user",
			password: "pass",
		};

		expect(auth.type).toBe("basic");
		expect(auth.username).toBe("user");
		expect(auth.password).toBe("pass");
	});

	it("should_create_oauth2_auth", () => {
		const auth: McpOAuth2AuthProvider = {
			type: "oauth2",
			accessToken: "oauth-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 3600000,
		};

		expect(auth.type).toBe("oauth2");
		expect(auth.refreshToken).toBe("refresh-token");
		expect(auth.expiresAt).toBeGreaterThan(Date.now());
	});

	it("should_create_api_key_auth", () => {
		const auth: McpApiKeyAuthProvider = {
			type: "api-key",
			apiKey: "api-key-123",
			headerName: "X-Custom-API-Key",
		};

		expect(auth.type).toBe("api-key");
		expect(auth.headerName).toBe("X-Custom-API-Key");
	});

	it("should_create_custom_auth", () => {
		const auth: McpCustomAuthProvider = {
			type: "custom",
			headers: {
				"X-Auth-Token": "token",
				"X-Request-ID": "req-123",
			},
		};

		expect(auth.type).toBe("custom");
		expect(Object.keys(auth.headers)).toHaveLength(2);
	});
});

// ============================================================================
// McpNotification Types Tests
// ============================================================================

describe("McpNotificationType", () => {
	it("should_accept_all_notification_types", () => {
		const types: McpNotificationType[] = [
			"tools/list_changed",
			"resources/list_changed",
			"prompts/list_changed",
			"logging/setLevel",
			"progress",
			"cancelled",
		];

		expect(types).toHaveLength(6);
	});
});

describe("McpNotification", () => {
	it("should_create_notification", () => {
		const notification: McpNotification = {
			type: "tools/list_changed",
			data: { count: 5 },
			connectionId: "server-1",
			timestamp: new Date(),
		};

		expect(notification.type).toBe("tools/list_changed");
		expect(notification.data.count).toBe(5);
		expect(notification.connectionId).toBe("server-1");
		expect(notification.timestamp).toBeInstanceOf(Date);
	});
});

describe("McpNotificationHandlerOptions", () => {
	it("should_create_empty_options", () => {
		const options: McpNotificationHandlerOptions = {};

		expect(options.types).toBeUndefined();
		expect(options.connectionId).toBeUndefined();
	});

	it("should_create_options_with_types", () => {
		const options: McpNotificationHandlerOptions = {
			types: ["tools/list_changed", "resources/list_changed"],
			connectionId: "server-1",
		};

		expect(options.types).toHaveLength(2);
		expect(options.connectionId).toBe("server-1");
	});
});

describe("McpNotificationHandlerRegistration", () => {
	it("should_create_registration", () => {
		const handler: McpNotificationHandler = (n) => console.log(n.type);
		const registration: McpNotificationHandlerRegistration = {
			id: "handler-1",
			handler,
			options: { types: ["progress"] },
		};

		expect(registration.id).toBe("handler-1");
		expect(typeof registration.handler).toBe("function");
		expect(registration.options.types).toEqual(["progress"]);
	});
});

// ============================================================================
// McpConnectionState Type Tests
// ============================================================================

describe("McpConnectionState", () => {
	it("should_create_empty_state", () => {
		const state: McpConnectionState = {
			connections: new Map(),
		};

		expect(state.connections.size).toBe(0);
	});

	it("should_create_state_with_connections", () => {
		const state: McpConnectionState = {
			connections: new Map([["conn-1", {} as McpConnection]]),
		};

		expect(state.connections.size).toBe(1);
		expect(state.connections.has("conn-1")).toBe(true);
	});
});

// ============================================================================
// McpConnectParams Type Tests
// ============================================================================

describe("McpConnectParams", () => {
	it("should_create_minimal_params", () => {
		const params: McpConnectParams = {
			id: "server-1",
			url: "http://localhost:3000/mcp",
		};

		expect(params.id).toBe("server-1");
		expect(params.timeout).toBeUndefined();
	});

	it("should_create_params_with_timeout", () => {
		const params: McpConnectParams = {
			id: "server-1",
			url: "http://localhost:3000/mcp",
			timeout: 60000,
		};

		expect(params.timeout).toBe(60000);
	});
});

// ============================================================================
// McpCallToolParams Type Tests
// ============================================================================

describe("McpCallToolParams", () => {
	it("should_create_call_tool_params", () => {
		const params: McpCallToolParams = {
			connectionId: "server-1",
			toolName: "search",
			arguments: { query: "test" },
			timeout: 10000,
		};

		expect(params.connectionId).toBe("server-1");
		expect(params.toolName).toBe("search");
		expect(params.arguments).toEqual({ query: "test" });
		expect(params.timeout).toBe(10000);
	});
});

// ============================================================================
// McpReadResourceParams Type Tests
// ============================================================================

describe("McpReadResourceParams", () => {
	it("should_create_read_resource_params", () => {
		const params: McpReadResourceParams = {
			connectionId: "server-1",
			uri: "file:///data.txt",
		};

		expect(params.connectionId).toBe("server-1");
		expect(params.uri).toBe("file:///data.txt");
	});
});
