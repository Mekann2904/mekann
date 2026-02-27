/**
 * config-loader.ts 単体テスト
 * カバレッジ: McpServerConfigSchema, McpConfigFileSchema, validateServerConfig, validateMcpConfig, loadMcpConfig, applyDefaults, getEnabledServers
 */
import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	vi,
} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	McpServerConfigSchema,
	McpConfigFileSchema,
	getConfigPath,
	applyDefaults,
	validateServerConfig,
	validateMcpConfig,
	loadMcpConfig,
	getEnabledServers,
	type McpServerConfig,
	type McpConfigFile,
} from "@lib/mcp/config-loader.js";

// ============================================================================
// McpServerConfigSchema Tests
// ============================================================================

describe("McpServerConfigSchema", () => {
	it("should_have_id_property", () => {
		expect(McpServerConfigSchema.properties.id).toBeDefined();
	});

	it("should_have_url_property", () => {
		expect(McpServerConfigSchema.properties.url).toBeDefined();
	});

	it("should_have_optional_properties", () => {
		expect(McpServerConfigSchema.properties.name).toBeDefined();
		expect(McpServerConfigSchema.properties.timeout).toBeDefined();
		expect(McpServerConfigSchema.properties.enabled).toBeDefined();
		expect(McpServerConfigSchema.properties.description).toBeDefined();
	});
});

// ============================================================================
// McpConfigFileSchema Tests
// ============================================================================

describe("McpConfigFileSchema", () => {
	it("should_have_servers_array", () => {
		expect(McpConfigFileSchema.properties.servers).toBeDefined();
	});

	it("should_have_optional_version", () => {
		expect(McpConfigFileSchema.properties.version).toBeDefined();
	});
});

// ============================================================================
// getConfigPath Tests
// ============================================================================

describe("getConfigPath", () => {
	it("should_return_default_path", () => {
		const result = getConfigPath();
		expect(result).toContain(".pi");
		expect(result).toContain("mcp-servers.json");
	});

	it("should_return_path_with_custom_root", () => {
		const result = getConfigPath("/custom/root");
		expect(result).toBe("/custom/root/.pi/mcp-servers.json");
	});
});

// ============================================================================
// applyDefaults Tests
// ============================================================================

describe("applyDefaults", () => {
	it("should_apply_default_timeout", () => {
		const config: McpServerConfig = {
			id: "test-server",
			url: "http://localhost:3000/mcp",
		};

		const result = applyDefaults(config);

		expect(result.timeout).toBe(30000);
	});

	it("should_apply_default_enabled", () => {
		const config: McpServerConfig = {
			id: "test-server",
			url: "http://localhost:3000/mcp",
		};

		const result = applyDefaults(config);

		expect(result.enabled).toBe(false);
	});

	it("should_preserve_existing_values", () => {
		const config: McpServerConfig = {
			id: "test-server",
			url: "http://localhost:3000/mcp",
			timeout: 60000,
			enabled: true,
			name: "Test Server",
			description: "A test server",
		};

		const result = applyDefaults(config);

		expect(result.timeout).toBe(60000);
		expect(result.enabled).toBe(true);
		expect(result.name).toBe("Test Server");
		expect(result.description).toBe("A test server");
	});

	it("should_preserve_name_and_description_as_optional", () => {
		const config: McpServerConfig = {
			id: "test-server",
			url: "http://localhost:3000/mcp",
		};

		const result = applyDefaults(config);

		expect(result.name).toBeUndefined();
		expect(result.description).toBeUndefined();
	});
});

// ============================================================================
// validateServerConfig Tests
// ============================================================================

describe("validateServerConfig", () => {
	describe("valid configs", () => {
		it("should_accept_minimal_http_config", () => {
			const config = {
				id: "server-1",
				url: "http://localhost:3000/mcp",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.id).toBe("server-1");
				expect(result.data.url).toBe("http://localhost:3000/mcp");
			}
		});

		it("should_accept_https_config", () => {
			const config = {
				id: "server-2",
				url: "https://api.example.com/mcp",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(true);
		});

		it("should_accept_sse_config", () => {
			const config = {
				id: "server-3",
				url: "sse://localhost:3000/sse",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(true);
		});

		it("should_accept_stdio_command", () => {
			const config = {
				id: "server-4",
				url: "node server.js",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(true);
		});

		it("should_accept_full_config", () => {
			const config = {
				id: "full-server",
				url: "http://localhost:3000/mcp",
				name: "Full Server",
				timeout: 60000,
				enabled: true,
				description: "A full server config",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("Full Server");
				expect(result.data.timeout).toBe(60000);
				expect(result.data.enabled).toBe(true);
			}
		});

		it("should_accept_id_with_underscore", () => {
			const config = {
				id: "my_server_1",
				url: "http://localhost:3000/mcp",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(true);
		});

		it("should_accept_id_with_hyphen", () => {
			const config = {
				id: "my-server-1",
				url: "http://localhost:3000/mcp",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(true);
		});
	});

	describe("invalid configs", () => {
		it("should_reject_non_object", () => {
			const result = validateServerConfig(null);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors).toContain("Config must be an object");
			}
		});

		it("should_reject_missing_id", () => {
			const config = {
				url: "http://localhost:3000/mcp",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("id"))).toBe(true);
			}
		});

		it("should_reject_empty_id", () => {
			const config = {
				id: "",
				url: "http://localhost:3000/mcp",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
		});

		it("should_reject_invalid_id_characters", () => {
			const config = {
				id: "server@invalid!",
				url: "http://localhost:3000/mcp",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("alphanumeric"))).toBe(true);
			}
		});

		it("should_reject_missing_url", () => {
			const config = {
				id: "server-1",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("url"))).toBe(true);
			}
		});

		it("should_reject_invalid_url_protocol", () => {
			const config = {
				id: "server-1",
				url: "ftp://localhost/file",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("http") || e.includes("https") || e.includes("sse"))).toBe(true);
			}
		});

		it("should_reject_timeout_too_low", () => {
			const config = {
				id: "server-1",
				url: "http://localhost:3000/mcp",
				timeout: 500,
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("timeout"))).toBe(true);
			}
		});

		it("should_reject_timeout_too_high", () => {
			const config = {
				id: "server-1",
				url: "http://localhost:3000/mcp",
				timeout: 400000,
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("timeout"))).toBe(true);
			}
		});

		it("should_reject_non_boolean_enabled", () => {
			const config = {
				id: "server-1",
				url: "http://localhost:3000/mcp",
				enabled: "yes",
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("enabled"))).toBe(true);
			}
		});

		it("should_reject_non_string_name", () => {
			const config = {
				id: "server-1",
				url: "http://localhost:3000/mcp",
				name: 123,
			};

			const result = validateServerConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("name"))).toBe(true);
			}
		});
	});
});

// ============================================================================
// validateMcpConfig Tests
// ============================================================================

describe("validateMcpConfig", () => {
	describe("valid configs", () => {
		it("should_accept_empty_servers", () => {
			const config = {
				servers: [],
			};

			const result = validateMcpConfig(config);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.servers).toEqual([]);
			}
		});

		it("should_accept_single_server", () => {
			const config = {
				servers: [
					{
						id: "server-1",
						url: "http://localhost:3000/mcp",
					},
				],
			};

			const result = validateMcpConfig(config);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.servers).toHaveLength(1);
			}
		});

		it("should_accept_multiple_servers", () => {
			const config = {
				servers: [
					{ id: "server-1", url: "http://localhost:3000/mcp" },
					{ id: "server-2", url: "http://localhost:3001/mcp" },
				],
			};

			const result = validateMcpConfig(config);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.servers).toHaveLength(2);
			}
		});

		it("should_accept_version", () => {
			const config = {
				servers: [],
				version: "1.0.0",
			};

			const result = validateMcpConfig(config);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.version).toBe("1.0.0");
			}
		});
	});

	describe("invalid configs", () => {
		it("should_reject_non_object", () => {
			const result = validateMcpConfig(null);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors).toContain("Config must be an object");
			}
		});

		it("should_reject_missing_servers", () => {
			const config = {};

			const result = validateMcpConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("servers"))).toBe(true);
			}
		});

		it("should_reject_non_array_servers", () => {
			const config = {
				servers: "not-an-array",
			};

			const result = validateMcpConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("servers"))).toBe(true);
			}
		});

		it("should_reject_duplicate_ids", () => {
			const config = {
				servers: [
					{ id: "server-1", url: "http://localhost:3000/mcp" },
					{ id: "server-1", url: "http://localhost:3001/mcp" },
				],
			};

			const result = validateMcpConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("duplicate"))).toBe(true);
			}
		});

		it("should_report_invalid_server_with_index", () => {
			const config = {
				servers: [
					{ id: "valid-server", url: "http://localhost:3000/mcp" },
					{ id: "", url: "invalid-url" },
				],
			};

			const result = validateMcpConfig(config);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.errors.some(e => e.includes("servers[1]"))).toBe(true);
			}
		});
	});
});

// ============================================================================
// loadMcpConfig Tests
// ============================================================================

describe("loadMcpConfig", () => {
	const tempDir = path.join(process.cwd(), `.test-mcp-config-${Date.now()}`);
	const configPath = path.join(tempDir, ".pi", "mcp-servers.json");

	beforeEach(() => {
		// Create temp directory
		fs.mkdirSync(path.join(tempDir, ".pi"), { recursive: true });
	});

	afterEach(() => {
		// Cleanup temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should_return_empty_config_when_file_not_found", async () => {
		const result = await loadMcpConfig(tempDir);

		expect(result.servers).toEqual([]);
	});

	it("should_load_valid_config", async () => {
		const configContent = {
			servers: [
				{
					id: "test-server",
					url: "http://localhost:3000/mcp",
				},
			],
		};

		fs.writeFileSync(configPath, JSON.stringify(configContent));

		const result = await loadMcpConfig(tempDir);

		expect(result.servers).toHaveLength(1);
		expect(result.servers[0].id).toBe("test-server");
	});

	it("should_throw_on_invalid_json", async () => {
		fs.writeFileSync(configPath, "{ invalid json }");

		await expect(loadMcpConfig(tempDir)).rejects.toThrow("Failed to parse MCP config file");
	});

	it("should_throw_on_validation_error", async () => {
		const configContent = {
			servers: [
				{
					id: "",
					url: "invalid",
				},
			],
		};

		fs.writeFileSync(configPath, JSON.stringify(configContent));

		await expect(loadMcpConfig(tempDir)).rejects.toThrow("Invalid MCP config");
	});

	it("should_load_config_with_version", async () => {
		const configContent = {
			servers: [],
			version: "2.0.0",
		};

		fs.writeFileSync(configPath, JSON.stringify(configContent));

		const result = await loadMcpConfig(tempDir);

		expect(result.version).toBe("2.0.0");
	});
});

// ============================================================================
// getEnabledServers Tests
// ============================================================================

describe("getEnabledServers", () => {
	it("should_return_empty_array_for_no_servers", () => {
		const config: McpConfigFile = { servers: [] };

		const result = getEnabledServers(config);

		expect(result).toEqual([]);
	});

	it("should_return_only_enabled_servers", () => {
		const config: McpConfigFile = {
			servers: [
				{ id: "enabled-1", url: "http://localhost:3000/mcp", enabled: true },
				{ id: "disabled-1", url: "http://localhost:3001/mcp", enabled: false },
				{ id: "enabled-2", url: "http://localhost:3002/mcp", enabled: true },
			],
		};

		const result = getEnabledServers(config);

		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("enabled-1");
		expect(result[1].id).toBe("enabled-2");
	});

	it("should_include_servers_with_undefined_enabled", () => {
		const config: McpConfigFile = {
			servers: [
				{ id: "default", url: "http://localhost:3000/mcp" },
				{ id: "explicit-false", url: "http://localhost:3001/mcp", enabled: false },
			],
		};

		const result = getEnabledServers(config);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("default");
	});

	it("should_apply_defaults_to_results", () => {
		const config: McpConfigFile = {
			servers: [
				{ id: "server-1", url: "http://localhost:3000/mcp", enabled: true },
			],
		};

		const result = getEnabledServers(config);

		expect(result[0].timeout).toBe(30000);
		expect(result[0].enabled).toBe(true);
	});
});
