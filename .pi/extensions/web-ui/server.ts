/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/server.ts
 * @role HTTP server for Web UI extension
 * @why Serve Preact dashboard to browser with multi-instance support and real-time updates
 * @related index.ts, lib/instance-registry.ts
 * @public_api startServer, stopServer, isServerRunning, getServerPort, broadcastSSEEvent, getSSEClientCount
 * @invariants Server must clean up on shutdown, SSE clients must be cleaned up on disconnect
 * @side_effects Opens TCP port, serves HTTP requests, accesses shared storage, maintains SSE connections
 * @failure_modes Port in use, file not found, SSE connection failures
 *
 * @abdd.explain
 * @overview Express server that serves static files, API endpoints, and SSE for real-time updates
 * @what_it_does Hosts built Preact app, provides REST API for pi state and instances, broadcasts SSE events
 * @why_it_exists Allows browser access to pi monitoring/configuration with real-time push notifications
 * @scope(in) ExtensionAPI, ExtensionContext, SSE events
 * @scope(out) HTTP responses, shared storage files, SSE broadcasts
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
  ContextHistoryStorage,
  type InstanceInfo,
  type ThemeSettings,
  type ContextHistoryEntry,
  type InstanceContextHistory,
} from "./lib/instance-registry.js";
// Note: mcpManager is imported dynamically in each request to ensure
// we always get the latest instance from globalThis (handles reload scenarios)

/**
 * @summary Get mcpManager dynamically to handle reload scenarios
 */
async function getMcpManager() {
  const { mcpManager } = await import("../../lib/mcp/connection-manager.js");
  return mcpManager;
}

/**
 * @summary MCP server configuration from mcp-servers.json
 */
interface McpServerConfig {
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
 * @summary Load MCP server configuration and auto-connect enabled servers
 */
async function loadAndConnectMcpServers(): Promise<void> {
  const fs = await import('fs');
  const configPath = path.join(process.cwd(), '.pi', 'mcp-servers.json');

  try {
    if (!fs.existsSync(configPath)) {
      return;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as { servers: McpServerConfig[] };

    if (!config.servers || !Array.isArray(config.servers)) {
      return;
    }

    const mcpManager = await getMcpManager();

    for (const server of config.servers) {
      if (server.enabled === false) {
        continue;
      }

      try {
        await mcpManager.connect({
          id: server.id,
          url: server.url,
          transportType: server.transportType ?? 'auto',
          auth: server.auth,
          headers: server.headers,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[web-ui] Failed to connect MCP server ${server.id}: ${errorMessage}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[web-ui] Failed to load MCP config: ${errorMessage}`);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @summary SSE event types for real-time updates
 */
export type SSEEventType = "status" | "tool-call" | "response" | "heartbeat" | "context-update";

/**
 * @summary SSE event payload structure
 */
export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * @summary SSE client connection
 */
interface SSEClient {
  id: string;
  res: Response;
  lastHeartbeat: number;
}

/**
 * @summary Event bus for SSE broadcasting
 */
class SSEEventBus {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * @summary Add SSE client connection
   */
  addClient(id: string, res: Response): void {
    this.clients.set(id, { id, res, lastHeartbeat: Date.now() });
  }

  /**
   * @summary Remove SSE client connection
   */
  removeClient(id: string): void {
    this.clients.delete(id);
  }

  /**
   * @summary Broadcast event to all connected clients
   */
  broadcast(event: SSEEvent): void {
    const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;

    for (const [id, client] of this.clients) {
      try {
        client.res.write(eventStr);
      } catch (error) {
        // Client disconnected, remove it
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[web-ui] SSE client ${id} disconnected during broadcast: ${errorMessage}`);
        this.clients.delete(id);
      }
    }
  }

  /**
   * @summary Start heartbeat interval (30 seconds)
   */
  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: "heartbeat",
        data: { timestamp: Date.now() },
        timestamp: Date.now(),
      });
    }, 30000);
  }

  /**
   * @summary Stop heartbeat interval and clear all clients
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    // Clear all clients on server shutdown
    this.clients.clear();
  }

  /**
   * @summary Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

const sseEventBus = new SSEEventBus();
let contextCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * @summary 現在のインスタンス用コンテキスト履歴ストレージ
 */
let contextHistoryStorage: ContextHistoryStorage | null = null;

/**
 * @summary コンテキスト履歴を追加してSSEで通知
 */
export function addContextHistory(entry: Omit<ContextHistoryEntry, "pid">): void {
  if (!contextHistoryStorage) {
    contextHistoryStorage = new ContextHistoryStorage(process.pid);
  }

  contextHistoryStorage.add(entry);

  // SSEでコンテキスト更新を通知
  sseEventBus.broadcast({
    type: "context-update",
    data: {
      pid: process.pid,
      timestamp: entry.timestamp,
      input: entry.input,
      output: entry.output,
    },
    timestamp: Date.now(),
  });
}

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

  /**
   * GET /api/context-history - 全インスタンスのコンテキスト使用量履歴を取得
   */
  app.get("/api/context-history", (_req: Request, res: Response) => {
    try {
      const instancesHistory = ContextHistoryStorage.getActiveInstancesHistory();

      // レスポンス形式をマップに変換
      const instances: Record<number, InstanceContextHistory> = {};
      for (const instance of instancesHistory) {
        instances[instance.pid] = instance;
      }

      res.json({ instances });
    } catch (error) {
      res.status(500).json({ error: "Failed to get context history" });
    }
  });

  /**
   * GET /api/events - Server-Sent Events endpoint for real-time updates
   */
  app.get("/api/events", (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Generate unique client ID
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Register client
    sseEventBus.addClient(clientId, res);

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`);

    // Handle client disconnect
    req.on("close", () => {
      sseEventBus.removeClient(clientId);
    });

    // Keep connection alive
    req.socket.setKeepAlive(true);
  });

  // ============= MCP API Endpoints =============

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
        auth: server.auth,
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
    // コンテキスト履歴ストレージを初期化
    contextHistoryStorage = new ContextHistoryStorage(process.pid);

    // SSEハートビートを開始
    sseEventBus.startHeartbeat();

    // 定期的に古い履歴ファイルをクリーンアップ（5分ごと）
    if (contextCleanupInterval) {
      clearInterval(contextCleanupInterval);
    }
    contextCleanupInterval = setInterval(() => {
      ContextHistoryStorage.cleanup();
    }, 5 * 60 * 1000);

    // MCPサーバー設定ファイルからの自動接続は無効化
    // 理由: MCPサーバーの起動メッセージがTUI入力欄に混入する問題を回避
    // 必要な場合は手動で接続してください
    // loadAndConnectMcpServers();

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
    sseEventBus.stopHeartbeat();
    if (contextCleanupInterval) {
      clearInterval(contextCleanupInterval);
      contextCleanupInterval = null;
    }
    state.server.close();
    state.server = null;
    ServerRegistry.unregister();

    // バッファをフラッシュしてイベントリスナーを削除
    if (contextHistoryStorage) {
      contextHistoryStorage.dispose();
      contextHistoryStorage = null;
    }
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

/**
 * @summary Broadcast SSE event to all connected clients
 */
export function broadcastSSEEvent(event: SSEEvent): void {
  sseEventBus.broadcast(event);
}

/**
 * @summary Get connected SSE client count
 */
export function getSSEClientCount(): number {
  return sseEventBus.getClientCount();
}
