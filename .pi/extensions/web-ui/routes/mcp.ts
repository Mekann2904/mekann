/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/routes/mcp.ts
 * @role MCP API routes for web-ui server
 * @why Provide RESTful API for MCP connection management
 * @related server.ts, routes/*.ts, lib/mcp-helpers.ts
 * @public_api registerMcpRoutes
 * @invariants MCP manager is loaded dynamically to handle reload scenarios
 * @side_effects Connects/disconnects MCP servers, reads config file
 * @failure_modes MCP connection failures, config file errors
 *
 * @abdd.explain
 * @overview MCP server management API endpoints
 * @what_it_does Lists, connects, disconnects MCP servers; lists tools and resources
 * @why_it_exists Enables MCP server management via web UI
 * @scope(in) HTTP requests with MCP server IDs
 * @scope(out) JSON responses with connection status, tools, resources
 */

import type { Express, Request, Response } from "express";
import path from "path";
import { getMcpManager, normalizeMcpAuth, type McpServerConfig } from "../lib/mcp-helpers.js";

/**
 * @summary Register MCP routes on Express app
 * @param app - Express application instance
 */
export function registerMcpRoutes(app: Express): void {
  /**
   * GET /api/mcp/connections - List all MCP connections
   */
  app.get("/api/mcp/connections", async (_req: Request, res: Response) => {
    try {
      const mcpManager = await getMcpManager();

      const connections = mcpManager.listConnections();
      // Sanitize: remove client/transport objects for JSON serialization
      const sanitized = connections.map(conn => ({
        id: conn.id,
        name: conn.name,
        url: conn.url,
        status: conn.status,
        transportType: conn.transportType,
        toolsCount: conn.tools?.length ?? 0,
        resourcesCount: conn.resources?.length ?? 0,
        error: conn.error,
        connectedAt: conn.connectedAt?.toISOString?.() ?? null,
        serverInfo: conn.serverInfo,
      }));
      res.json({ connections: sanitized, count: sanitized.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("[web-ui] Failed to list MCP connections:", errorMessage, errorStack);
      res.status(500).json({ error: "Failed to list connections", details: errorMessage });
    }
  });

  /**
   * GET /api/mcp/connection/:id - Get single connection details
   */
  app.get("/api/mcp/connection/:id", async (req: Request, res: Response) => {
    try {
      const mcpManager = await getMcpManager();

      const conn = mcpManager.getConnection(req.params.id);
      if (!conn) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }
      res.json({
        id: conn.id,
        name: conn.name,
        url: conn.url,
        status: conn.status,
        transportType: conn.transportType,
        tools: conn.tools ?? [],
        resources: conn.resources ?? [],
        error: conn.error,
        connectedAt: conn.connectedAt?.toISOString?.() ?? null,
        serverInfo: conn.serverInfo,
        subscriptions: Array.from(conn.subscriptions ?? []),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[web-ui] Failed to get MCP connection:", errorMessage);
      res.status(500).json({ error: "Failed to get connection", details: errorMessage });
    }
  });

  /**
   * GET /api/mcp/tools/:id - List tools for connection
   */
  app.get("/api/mcp/tools/:id", async (req: Request, res: Response) => {
    try {
      const mcpManager = await getMcpManager();

      const tools = await mcpManager.listAllTools(req.params.id);
      res.json({ tools: tools ?? [], count: tools?.length ?? 0 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // -32601: Method not found - server doesn't support tools, return empty list
      if (errorMessage.includes("-32601") || errorMessage.includes("Method not found")) {
        res.json({ tools: [], count: 0 });
        return;
      }
      console.error("[web-ui] Failed to list MCP tools:", errorMessage);
      res.status(500).json({ error: "Failed to list tools", details: errorMessage });
    }
  });

  /**
   * GET /api/mcp/resources/:id - List resources for connection
   */
  app.get("/api/mcp/resources/:id", async (req: Request, res: Response) => {
    try {
      const mcpManager = await getMcpManager();

      const result = await mcpManager.listResourcesPaginated(req.params.id);
      res.json({ resources: result?.resources ?? [], nextCursor: result?.nextCursor });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // -32601: Method not found - server doesn't support resources, return empty list
      if (errorMessage.includes("-32601") || errorMessage.includes("Method not found")) {
        res.json({ resources: [], nextCursor: undefined });
        return;
      }
      console.error("[web-ui] Failed to list MCP resources:", errorMessage);
      res.status(500).json({ error: "Failed to list resources", details: errorMessage });
    }
  });

  /**
   * POST /api/mcp/ping/:id - Health check connection
   */
  app.post("/api/mcp/ping/:id", async (req: Request, res: Response) => {
    try {
      const mcpManager = await getMcpManager();

      const result = await mcpManager.ping(req.params.id);
      res.json({ success: result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[web-ui] MCP ping failed:", errorMessage);
      res.status(500).json({ error: "Ping failed", details: errorMessage });
    }
  });

  /**
   * GET /api/mcp/servers - List all MCP servers from config (including disconnected)
   */
  app.get("/api/mcp/servers", async (_req: Request, res: Response) => {
    try {
      const fs = await import('fs');
      const configPath = path.join(process.cwd(), '.pi', 'mcp-servers.json');

      // Load config file
      let configServers: McpServerConfig[] = [];
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as { servers: McpServerConfig[] };
        configServers = config.servers ?? [];
      }

      // Get active connections
      const mcpManager = await getMcpManager();
      const connections = mcpManager.listConnections();
      const connectionMap = new Map(connections.map(c => [c.id, c]));

      // Merge config with connection status
      const servers = configServers.map(server => {
        const conn = connectionMap.get(server.id);
        return {
          id: server.id,
          name: server.name ?? server.id,
          url: server.url,
          description: server.description,
          enabled: server.enabled ?? true,
          transportType: server.transportType ?? 'auto',
          // Connection status (if connected)
          status: conn?.status ?? 'disconnected',
          toolsCount: conn?.tools?.length ?? 0,
          resourcesCount: conn?.resources?.length ?? 0,
          error: conn?.error,
          connectedAt: conn?.connectedAt?.toISOString?.() ?? null,
          serverInfo: conn?.serverInfo,
        };
      });

      res.json({ servers, count: servers.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[web-ui] Failed to list MCP servers:", errorMessage);
      res.status(500).json({ error: "Failed to list servers", details: errorMessage });
    }
  });

  /**
   * POST /api/mcp/connect/:id - Connect to MCP server
   */
  app.post("/api/mcp/connect/:id", async (req: Request, res: Response) => {
    try {
      const fs = await import('fs');
      const configPath = path.join(process.cwd(), '.pi', 'mcp-servers.json');
      const serverId = req.params.id;

      // Load server config
      if (!fs.existsSync(configPath)) {
        res.status(404).json({ error: "MCP config file not found" });
        return;
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as { servers: McpServerConfig[] };
      const server = config.servers?.find(s => s.id === serverId);

      if (!server) {
        res.status(404).json({ error: `Server '${serverId}' not found in config` });
        return;
      }

      const mcpManager = await getMcpManager();

      // Check if already connected
      const existing = mcpManager.getConnection(serverId);
      if (existing && existing.status === 'connected') {
        res.json({ success: true, message: "Already connected", serverId });
        return;
      }

      // Connect
      await mcpManager.connect({
        id: server.id,
        url: server.url,
        transportType: server.transportType ?? 'auto',
        auth: normalizeMcpAuth(server.auth),
        headers: server.headers,
      });

      res.json({ success: true, message: "Connected", serverId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[web-ui] MCP connect failed:", errorMessage);
      res.status(500).json({ error: "Connect failed", details: errorMessage });
    }
  });

  /**
   * POST /api/mcp/disconnect/:id - Disconnect from MCP server
   */
  app.post("/api/mcp/disconnect/:id", async (req: Request, res: Response) => {
    try {
      const serverId = req.params.id;
      const mcpManager = await getMcpManager();

      // Check if connected
      const existing = mcpManager.getConnection(serverId);
      if (!existing) {
        res.json({ success: true, message: "Already disconnected", serverId });
        return;
      }

      // Disconnect
      await mcpManager.disconnect(serverId);
      res.json({ success: true, message: "Disconnected", serverId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[web-ui] MCP disconnect failed:", errorMessage);
      res.status(500).json({ error: "Disconnect failed", details: errorMessage });
    }
  });
}
