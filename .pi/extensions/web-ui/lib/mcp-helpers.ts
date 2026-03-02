/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/lib/mcp-helpers.ts
 * @role MCP helper utilities for route handlers
 * @why Encapsulate MCP configuration and authentication logic
 * @related routes/mcp.ts
 * @public_api getMcpManager, normalizeMcpAuth, type McpServerConfig
 * @invariants MCP manager is loaded dynamically to handle reload scenarios
 * @side_effects Dynamic import of MCP connection manager
 * @failure_modes Import failures, invalid auth configurations
 *
 * @abdd.explain
 * @overview Helper functions for MCP route handlers
 * @what_it_does Provides MCP manager access and authentication normalization
 * @why_it_exists Separates concerns and enables testability
 * @scope(in) MCP configuration data
 * @scope(out) MCP manager instance, auth providers
 */

import type { McpAuthProvider } from "../../../lib/mcp/types.js";

/**
 * @summary MCP server configuration from mcp-servers.json
 */
export interface McpServerConfig {
  id: string;
  url: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  transportType?: 'auto' | 'streamable-http' | 'sse' | 'stdio' | 'websocket';
  auth?: {
    type: 'bearer' | 'basic' | 'api-key';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    headerName?: string;
  };
  headers?: Record<string, string>;
}

/**
 * @summary Get mcpManager dynamically to handle reload scenarios
 * @returns MCP connection manager instance
 */
export async function getMcpManager() {
  const { mcpManager } = await import("../../../lib/mcp/connection-manager.js");
  return mcpManager;
}

/**
 * @summary Normalize MCP auth configuration to auth provider
 * @param auth - Auth configuration from server config
 * @returns Normalized auth provider or undefined
 */
export function normalizeMcpAuth(auth?: McpServerConfig["auth"]): McpAuthProvider | undefined {
  if (!auth) return undefined;
  if (auth.type === "bearer" && auth.token) {
    return { type: "bearer", token: auth.token };
  }
  if (auth.type === "basic" && auth.username && auth.password) {
    return { type: "basic", username: auth.username, password: auth.password };
  }
  if (auth.type === "api-key" && auth.apiKey) {
    return { type: "api-key", apiKey: auth.apiKey, headerName: auth.headerName };
  }
  return undefined;
}
