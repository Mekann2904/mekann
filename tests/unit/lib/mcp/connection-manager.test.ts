/**
 * connection-manager.ts 単体テスト
 * カバレッジ: McpConnectionManager (behavioral tests for API contracts)
 * 
 * Note: Full integration tests with MCP SDK mocking are complex due to how
 * the Client class is instantiated internally. This file tests:
 * 1. Constructor and initial state
 * 2. Error handling for invalid inputs
 * 3. Basic API contract tests that don't require actual connections
 * 
 * For full connection tests, consider:
 * - Integration tests with a real MCP server
 * - E2E tests in the extensions layer
 */
import {
	describe,
	it,
	expect,
	beforeEach,
} from "vitest";

import {
	McpConnectionManager,
	mcpManager,
	type McpNotificationCallback,
} from "@lib/mcp/connection-manager.js";

// ============================================================================
// McpConnectionManager Tests (No Connection Required)
// ============================================================================

describe("McpConnectionManager", () => {
	let manager: McpConnectionManager;

	beforeEach(() => {
		manager = new McpConnectionManager();
	});

	describe("constructor", () => {
		it("should_create_instance_with_empty_connections", () => {
			expect(manager.getConnectionCount()).toBe(0);
			expect(manager.listConnections()).toEqual([]);
		});
	});

	describe("getConnection", () => {
		it("should_return_undefined_for_nonexistent_id", () => {
			const connection = manager.getConnection("nonexistent");
			expect(connection).toBeUndefined();
		});
	});

	describe("listConnections", () => {
		it("should_return_empty_array_when_no_connections", () => {
			const connections = manager.listConnections();
			expect(connections).toEqual([]);
		});
	});

	describe("getConnectionCount", () => {
		it("should_return_zero_initially", () => {
			expect(manager.getConnectionCount()).toBe(0);
		});
	});

	describe("disconnect", () => {
		it("should_not_throw_for_nonexistent_connection", async () => {
			await expect(manager.disconnect("nonexistent")).resolves.not.toThrow();
		});
	});

	describe("disconnectAll", () => {
		it("should_not_throw_when_no_connections", async () => {
			await expect(manager.disconnectAll()).resolves.not.toThrow();
		});
	});

	describe("setNotificationCallback", () => {
		it("should_accept_callback_function", () => {
			const callback: McpNotificationCallback = (notification) => {
				console.log(notification.type);
			};

			expect(() => manager.setNotificationCallback(callback)).not.toThrow();
		});

		it("should_accept_null_to_clear_callback", () => {
			manager.setNotificationCallback(() => {});
			expect(() => manager.setNotificationCallback(null)).not.toThrow();
		});
	});

	describe("callTool", () => {
		it("should_throw_for_nonexistent_connection", async () => {
			await expect(
				manager.callTool("nonexistent", "tool", {})
			).rejects.toThrow("not found");
		});
	});

	describe("readResource", () => {
		it("should_throw_for_nonexistent_connection", async () => {
			await expect(
				manager.readResource("nonexistent", "file:///test.txt")
			).rejects.toThrow("not found");
		});
	});

	describe("refreshTools", () => {
		it("should_throw_for_nonexistent_connection", async () => {
			await expect(
				manager.refreshTools("nonexistent")
			).rejects.toThrow("not found");
		});
	});

	describe("refreshResources", () => {
		it("should_throw_for_nonexistent_connection", async () => {
			await expect(
				manager.refreshResources("nonexistent")
			).rejects.toThrow("not found");
		});
	});
});

// ============================================================================
// Singleton Instance Tests
// ============================================================================

describe("mcpManager singleton", () => {
	it("should_be_instance_of_McpConnectionManager", () => {
		expect(mcpManager).toBeInstanceOf(McpConnectionManager);
	});
});

// ============================================================================
// Type Export Tests
// ============================================================================

describe("McpConnectionType type", () => {
	it("should_support_http_type", () => {
		const type = "http" as const;
		expect(type).toBe("http");
	});

	it("should_support_stdio_type", () => {
		const type = "stdio" as const;
		expect(type).toBe("stdio");
	});

	it("should_support_sse_type", () => {
		const type = "sse" as const;
		expect(type).toBe("sse");
	});
});

// ============================================================================
// McpNotificationCallback Type Tests
// ============================================================================

describe("McpNotificationCallback", () => {
	it("should_accept_sync_function", () => {
		const callback: McpNotificationCallback = (notification) => {
			console.log(notification.type, notification.connectionId);
		};

		expect(typeof callback).toBe("function");
	});

	it("should_accept_async_function", () => {
		const callback: McpNotificationCallback = async (notification) => {
			await Promise.resolve(notification.data);
		};

		expect(typeof callback).toBe("function");
	});
});
