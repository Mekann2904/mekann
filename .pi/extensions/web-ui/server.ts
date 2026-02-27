/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/server.ts
 * @role HTTP server for Web UI extension
 * @why Serve Preact dashboard to browser with multi-instance support
 * @related index.ts, lib/instance-registry.ts
 * @public_api startServer, stopServer, isServerRunning, getServerPort
 * @invariants Server must clean up on shutdown
 * @side_effects Opens TCP port, serves HTTP requests, accesses shared storage
 * @failure_modes Port in use, file not found
 *
 * @abdd.explain
 * @overview Express server that serves static files and API endpoints
 * @what_it_does Hosts built Preact app and provides REST API for pi state and instances
 * @why_it_exists Allows browser access to pi monitoring/configuration
 * @scope(in) ExtensionAPI, ExtensionContext
 * @scope(out) HTTP responses, shared storage files
 */

import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server as HttpServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  InstanceRegistry,
  ServerRegistry,
  ThemeStorage,
  type InstanceInfo,
  type ThemeSettings,
} from "./lib/instance-registry.js";
import { mcpManager } from "../../lib/mcp/connection-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServerState {
  server: HttpServer | null;
  port: number;
  pi: ExtensionAPI | null;
  ctx: ExtensionContext | null;
}

const state: ServerState = {
  server: null,
  port: 3000,
  pi: null,
  ctx: null,
};

/**
 * @summary Start HTTP server for Web UI
 * @param port Port number to listen on
 * @param pi Extension API instance
 * @param ctx Extension context
 * @returns HTTP server instance
 */
export function startServer(
  port: number,
  pi: ExtensionAPI,
  ctx: ExtensionContext
): HttpServer {
  const app: Express = express();
  app.use(express.json());

  state.pi = pi;
  state.ctx = ctx;

  // Register this server
  ServerRegistry.register(process.pid, port);

  // ============= API Endpoints =============

  /**
   * GET /api/status - Current instance status
   */
  app.get("/api/status", (_req: Request, res: Response) => {
    const contextUsage = ctx.getContextUsage();
    res.json({
      status: {
        model: ctx.model?.id ?? "unknown",
        cwd: ctx.cwd,
        contextUsage: contextUsage?.percent ?? 0,
        totalTokens: contextUsage?.tokens ?? 0,
        cost: 0, // TODO: integrate with usage tracking
      },
      metrics: {
        toolCalls: 0,
        errors: 0,
        avgResponseTime: 0,
      },
      config: {},
    });
  });

  /**
   * GET /api/instances - All running instances
   */
  app.get("/api/instances", (_req: Request, res: Response) => {
    try {
      const instances = InstanceRegistry.getAll();
      res.json({
        instances,
        count: instances.length,
        serverPid: process.pid,
        serverPort: state.port,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get instances" });
    }
  });

  /**
   * GET /api/theme - Get global theme settings
   */
  app.get("/api/theme", (_req: Request, res: Response) => {
    try {
      const theme = ThemeStorage.get();
      res.json(theme);
    } catch (error) {
      res.status(500).json({ error: "Failed to get theme" });
    }
  });

  /**
   * POST /api/theme - Update global theme settings
   */
  app.post("/api/theme", (req: Request, res: Response) => {
    try {
      const { themeId, mode } = req.body as Partial<ThemeSettings>;

      if (!themeId || !mode) {
        res.status(400).json({ error: "Missing themeId or mode" });
        return;
      }

      if (mode !== "light" && mode !== "dark") {
        res.status(400).json({ error: "Invalid mode" });
        return;
      }

      ThemeStorage.set({ themeId, mode });
      res.json({ success: true, themeId, mode });
    } catch (error) {
      res.status(500).json({ error: "Failed to save theme" });
    }
  });

  /**
   * POST /api/config - Update configuration
   */
  app.post("/api/config", (req: Request, res: Response) => {
    // TODO: implement config persistence
    res.json({ success: true, config: req.body });
  });

  // ============= MCP API Endpoints =============

  /**
   * GET /api/mcp/connections - List all MCP connections
   */
  app.get("/api/mcp/connections", (_req: Request, res: Response) => {
    try {
      // mcpManagerが初期化されているか確認
      if (!mcpManager) {
        console.error("[web-ui] mcpManager is not initialized");
        res.status(500).json({ error: "MCP manager not initialized" });
        return;
      }

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
  app.get("/api/mcp/connection/:id", (req: Request, res: Response) => {
    try {
      if (!mcpManager) {
        console.error("[web-ui] mcpManager is not initialized");
        res.status(500).json({ error: "MCP manager not initialized" });
        return;
      }

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
      if (!mcpManager) {
        console.error("[web-ui] mcpManager is not initialized");
        res.status(500).json({ error: "MCP manager not initialized" });
        return;
      }

      const tools = await mcpManager.listAllTools(req.params.id);
      res.json({ tools: tools ?? [], count: tools?.length ?? 0 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[web-ui] Failed to list MCP tools:", errorMessage);
      res.status(500).json({ error: "Failed to list tools", details: errorMessage });
    }
  });

  /**
   * GET /api/mcp/resources/:id - List resources for connection
   */
  app.get("/api/mcp/resources/:id", async (req: Request, res: Response) => {
    try {
      if (!mcpManager) {
        console.error("[web-ui] mcpManager is not initialized");
        res.status(500).json({ error: "MCP manager not initialized" });
        return;
      }

      const result = await mcpManager.listResourcesPaginated(req.params.id);
      res.json({ resources: result?.resources ?? [], nextCursor: result?.nextCursor });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[web-ui] Failed to list MCP resources:", errorMessage);
      res.status(500).json({ error: "Failed to list resources", details: errorMessage });
    }
  });

  /**
   * POST /api/mcp/ping/:id - Health check connection
   */
  app.post("/api/mcp/ping/:id", async (req: Request, res: Response) => {
    try {
      if (!mcpManager) {
        console.error("[web-ui] mcpManager is not initialized");
        res.status(500).json({ error: "MCP manager not initialized" });
        return;
      }

      const result = await mcpManager.ping(req.params.id);
      res.json({ success: result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[web-ui] MCP ping failed:", errorMessage);
      res.status(500).json({ error: "Ping failed", details: errorMessage });
    }
  });

  // ============= Static Files =============

  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));

  // ============= SPA Fallback =============

  app.get("*", (req: Request, res: Response) => {
    // Skip API routes
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.sendFile(path.join(distPath, "index.html"), (err) => {
      if (err) {
        res.status(404).send(`
          <html>
            <body style="background:#0d1117;color:#f0f6fc;font-family:sans-serif;padding:2rem;">
              <h1>Build Required</h1>
              <p>Run <code style="background:#21262d;padding:0.25rem 0.5rem;border-radius:4px;">npm run build</code> in the web-ui directory first.</p>
            </body>
          </html>
        `);
      }
    });
  });

  state.server = createServer(app);
  state.port = port;

  state.server.listen(port, () => {
    // Server start notification is handled by ctx.ui.notify in index.ts
    // to avoid TUI input field overlap
  });

  return state.server;
}

/**
 * @summary Stop the HTTP server
 */
export function stopServer(): void {
  if (state.server) {
    state.server.close();
    state.server = null;
    ServerRegistry.unregister();
  }
}

/**
 * @summary Check if server is running
 */
export function isServerRunning(): boolean {
  return state.server !== null;
}

/**
 * @summary Get current server port
 */
export function getServerPort(): number {
  return state.port;
}

/**
 * @summary Get extension context
 */
export function getContext(): ExtensionContext | null {
  return state.ctx;
}

/**
 * @summary Get extension API
 */
export function getPi(): ExtensionAPI | null {
  return state.pi;
}
