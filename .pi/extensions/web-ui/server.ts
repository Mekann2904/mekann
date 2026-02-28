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
import fs from "fs";
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
import {
  getActiveSessions,
  getSessionStats,
  getSessionByTaskId,
  onSessionEvent,
  type RuntimeSession,
  type SessionEvent,
} from "../../lib/runtime-sessions.js";
import {
  getAllUlWorkflowTasks,
  getUlWorkflowTask,
  getActiveUlWorkflowTask,
  invalidateCache,
} from "./lib/ul-workflow-reader.js";
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
 * @summary ownerInstanceIdからPIDを抽出
 * @param ownerInstanceId - "{sessionId}-{pid}"形式のインスタンスID
 * @returns PID（抽出失敗時はnull）
 */
function extractPidFromOwnerInstanceId(ownerInstanceId: string | undefined): number | null {
  if (!ownerInstanceId) return null;
  const match = ownerInstanceId.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * @summary 非アクティブなインスタンスが所有するULタスクを削除
 * @description InstanceRegistryのハートビート情報と照合し、60秒以上応答のない
 *              インスタンスが所有するタスクを削除する
 * @returns 削除されたタスク数
 */
function cleanupDeadOwnerUlWorkflowTasks(): number {
  const activeInstances = InstanceRegistry.getAll();
  const activePids = new Set(activeInstances.map((i) => i.pid));

  const ulTasksDir = path.join(process.cwd(), ".pi", "ul-workflow", "tasks");

  if (!fs.existsSync(ulTasksDir)) {
    return 0;
  }

  // 完了状態のフェーズ
  const terminalPhases = new Set(["completed", "aborted"]);

  let deletedCount = 0;

  try {
    const taskDirs = fs.readdirSync(ulTasksDir)
      .filter((name) => fs.statSync(path.join(ulTasksDir, name)).isDirectory());

    for (const taskId of taskDirs) {
      const statusPath = path.join(ulTasksDir, taskId, "status.json");

      if (!fs.existsSync(statusPath)) {
        continue;
      }

      try {
        const statusRaw = fs.readFileSync(statusPath, "utf-8");
        const status = JSON.parse(statusRaw);
        const ownerPid = extractPidFromOwnerInstanceId(status.ownerInstanceId);
        const phase = status.phase || "unknown";

        // 削除条件1: 完了済み + ownerInstanceIdがnull（古いタスク）
        if (!ownerPid) {
          if (terminalPhases.has(phase)) {
            const taskDir = path.join(ulTasksDir, taskId);
            fs.rmSync(taskDir, { recursive: true, force: true });
            deletedCount++;
            console.log(`[web-ui] Cleaned up UL task ${taskId} (completed with no owner)`);
          }
          continue;
        }

        // 削除条件2: アクティブでないインスタンスが所有している
        if (activePids.has(ownerPid)) {
          continue;
        }

        const taskDir = path.join(ulTasksDir, taskId);
        fs.rmSync(taskDir, { recursive: true, force: true });
        deletedCount++;
        console.log(`[web-ui] Cleaned up UL task ${taskId} (owner PID ${ownerPid} is inactive)`);
      } catch {
        // 個別のタスク削除エラーは無視
      }
    }

    if (deletedCount > 0) {
      // キャッシュを無効化
      invalidateCache();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[web-ui] Failed to cleanup UL tasks: ${errorMessage}`);
  }

  return deletedCount;
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
  private instancesBroadcastInterval: ReturnType<typeof setInterval> | null = null;

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
   * @summary Start instances broadcast interval (3 seconds)
   */
  startInstancesBroadcast(): void {
    this.instancesBroadcastInterval = setInterval(() => {
      const instances = InstanceRegistry.getAll();
      this.broadcast({
        type: "instances-update",
        data: {
          instances,
          count: instances.length,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    }, 3000);
  }

  /**
   * @summary Stop heartbeat interval and clear all clients
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.instancesBroadcastInterval) {
      clearInterval(this.instancesBroadcastInterval);
      this.instancesBroadcastInterval = null;
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
let ulTaskCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * @summary 現在のインスタンス用コンテキスト履歴ストレージ
 */
let contextHistoryStorage: ContextHistoryStorage | null = null;

/**
 * @summary コンテキスト履歴を追加してSSEで通知
 * @param entry - コンテキスト履歴エントリ（pidは省略可能、省略時はprocess.pid）
 */
export function addContextHistory(entry: Omit<ContextHistoryEntry, "pid"> & { pid?: number }): void {
  const pid = entry.pid ?? process.pid;

  if (!contextHistoryStorage || contextHistoryStorage.getPid() !== pid) {
    contextHistoryStorage = new ContextHistoryStorage(pid);
  }

  contextHistoryStorage.add(entry);

  // SSEでコンテキスト更新を通知
  sseEventBus.broadcast({
    type: "context-update",
    data: {
      pid,
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

  // Cleanup UL tasks owned by inactive instances
  const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
  if (cleanedCount > 0) {
    console.log(`[web-ui] Cleaned up ${cleanedCount} UL task(s) from inactive instances`);
  }

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

  // ============= Task API =============

  /**
   * Task storage helper functions
   */
  const TASK_DIR = ".pi/tasks";
  const TASK_STORAGE_FILE = path.join(TASK_DIR, "storage.json");

  interface Task {
    id: string;
    title: string;
    description?: string;
    status: "todo" | "in_progress" | "completed" | "cancelled";
    priority: "low" | "medium" | "high" | "urgent";
    tags: string[];
    dueDate?: string;
    assignee?: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    parentTaskId?: string;
  }

  interface TaskStorage {
    tasks: Task[];
    currentTaskId?: string;
  }

  function ensureTaskDir(): void {
    if (!fs.existsSync(TASK_DIR)) {
      fs.mkdirSync(TASK_DIR, { recursive: true });
    }
  }

  function loadTaskStorage(): TaskStorage {
    ensureTaskDir();
    if (!fs.existsSync(TASK_STORAGE_FILE)) {
      return { tasks: [] };
    }
    try {
      const data = fs.readFileSync(TASK_STORAGE_FILE, "utf-8");
      return JSON.parse(data) as TaskStorage;
    } catch {
      return { tasks: [] };
    }
  }

  function saveTaskStorage(storage: TaskStorage): void {
    ensureTaskDir();
    const tempFile = TASK_STORAGE_FILE + ".tmp";
    fs.writeFileSync(tempFile, JSON.stringify(storage, null, 2));
    fs.renameSync(tempFile, TASK_STORAGE_FILE);
  }

  /**
   * GET /api/tasks - List tasks with filters
   */
  app.get("/api/tasks", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      let tasks = [...storage.tasks];

      // Apply filters
      const { status, priority, tag, assignee, overdue } = req.query;

      if (status && typeof status === "string") {
        const statuses = status.split(",");
        tasks = tasks.filter((t) => statuses.includes(t.status));
      }

      if (priority && typeof priority === "string") {
        const priorities = priority.split(",");
        tasks = tasks.filter((t) => priorities.includes(t.priority));
      }

      if (tag && typeof tag === "string") {
        tasks = tasks.filter((t) => t.tags.includes(tag));
      }

      if (assignee && typeof assignee === "string") {
        tasks = tasks.filter((t) => t.assignee === assignee);
      }

      if (overdue === "true") {
        const now = new Date();
        tasks = tasks.filter(
          (t) =>
            t.dueDate &&
            new Date(t.dueDate) < now &&
            t.status !== "completed" &&
            t.status !== "cancelled"
        );
      }

      // Sort by priority (urgent > high > medium > low)
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      tasks.sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 2;
        const pb = priorityOrder[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      res.json({ success: true, data: tasks, total: tasks.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to load tasks", details: errorMessage });
    }
  });

  /**
   * GET /api/tasks/stats - Get task statistics
   */
  app.get("/api/tasks/stats", (_req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const tasks = storage.tasks;
      const now = new Date();

      const stats = {
        total: tasks.length,
        todo: tasks.filter((t) => t.status === "todo").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
        completed: tasks.filter((t) => t.status === "completed").length,
        cancelled: tasks.filter((t) => t.status === "cancelled").length,
        overdue: tasks.filter(
          (t) =>
            t.dueDate &&
            new Date(t.dueDate) < now &&
            t.status !== "completed" &&
            t.status !== "cancelled"
        ).length,
        byPriority: {
          low: tasks.filter((t) => t.priority === "low").length,
          medium: tasks.filter((t) => t.priority === "medium").length,
          high: tasks.filter((t) => t.priority === "high").length,
          urgent: tasks.filter((t) => t.priority === "urgent").length,
        },
      };

      res.json({ success: true, data: stats });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to get stats", details: errorMessage });
    }
  });

  /**
   * GET /api/tasks/:id - Get single task
   */
  app.get("/api/tasks/:id", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const task = storage.tasks.find((t) => t.id === req.params.id);

      if (!task) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      res.json({ success: true, data: task });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to get task", details: errorMessage });
    }
  });

  /**
   * POST /api/tasks - Create new task
   */
  app.post("/api/tasks", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const now = new Date().toISOString();

      const newTask: Task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: req.body.title || "Untitled",
        description: req.body.description,
        status: req.body.status || "todo",
        priority: req.body.priority || "medium",
        tags: req.body.tags || [],
        dueDate: req.body.dueDate,
        assignee: req.body.assignee,
        parentTaskId: req.body.parentTaskId,
        createdAt: now,
        updatedAt: now,
      };

      storage.tasks.push(newTask);
      saveTaskStorage(storage);

      res.json({ success: true, data: newTask });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to create task", details: errorMessage });
    }
  });

  /**
   * PUT /api/tasks/:id - Update task
   */
  app.put("/api/tasks/:id", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);

      if (taskIndex === -1) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      const task = storage.tasks[taskIndex];
      const updatedTask: Task = {
        ...task,
        title: req.body.title ?? task.title,
        description: req.body.description ?? task.description,
        status: req.body.status ?? task.status,
        priority: req.body.priority ?? task.priority,
        tags: req.body.tags ?? task.tags,
        dueDate: req.body.dueDate ?? task.dueDate,
        assignee: req.body.assignee ?? task.assignee,
        updatedAt: new Date().toISOString(),
      };

      storage.tasks[taskIndex] = updatedTask;
      saveTaskStorage(storage);

      res.json({ success: true, data: updatedTask });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to update task", details: errorMessage });
    }
  });

  /**
   * PATCH /api/tasks/:id/complete - Mark task as completed
   */
  app.patch("/api/tasks/:id/complete", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);

      if (taskIndex === -1) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      const task = storage.tasks[taskIndex];
      const now = new Date().toISOString();
      const updatedTask: Task = {
        ...task,
        status: "completed",
        completedAt: now,
        updatedAt: now,
      };

      storage.tasks[taskIndex] = updatedTask;
      saveTaskStorage(storage);

      res.json({ success: true, data: updatedTask });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to complete task", details: errorMessage });
    }
  });

  /**
   * DELETE /api/tasks/:id - Delete task
   */
  app.delete("/api/tasks/:id", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);

      if (taskIndex === -1) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      const taskId = storage.tasks[taskIndex].id;

      // Delete task and its subtasks
      storage.tasks = storage.tasks.filter(
        (t) => t.id !== taskId && t.parentTaskId !== taskId
      );
      saveTaskStorage(storage);

      res.json({ success: true, data: { deletedTaskId: taskId } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to delete task", details: errorMessage });
    }
  });

  // ============= UL Workflow Task API (Read-only) =============

  /**
   * GET /api/ul-workflow/tasks - Get all UL workflow tasks
   */
  app.get("/api/ul-workflow/tasks", (_req: Request, res: Response) => {
    try {
      const tasks = getAllUlWorkflowTasks();
      res.json({ success: true, data: tasks, total: tasks.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to load UL workflow tasks", details: errorMessage });
    }
  });

  /**
   * GET /api/ul-workflow/tasks/active - Get active UL workflow task
   */
  app.get("/api/ul-workflow/tasks/active", (_req: Request, res: Response) => {
    try {
      const task = getActiveUlWorkflowTask();
      res.json({ success: true, data: task });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to load active UL workflow task", details: errorMessage });
    }
  });

  /**
   * GET /api/ul-workflow/tasks/:id - Get single UL workflow task
   */
  app.get("/api/ul-workflow/tasks/:id", (req: Request, res: Response) => {
    try {
      const taskId = req.params.id.startsWith("ul-")
        ? req.params.id.slice(3)
        : req.params.id;
      const task = getUlWorkflowTask(taskId);
      if (!task) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }
      res.json({ success: true, data: task });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to load task", details: errorMessage });
    }
  });

  // ============= Runtime Status API =============

  /**
   * GET /api/runtime/status - Get current runtime status
   */
  app.get("/api/runtime/status", async (_req: Request, res: Response) => {
    try {
      // Import agent-runtime dynamically
      const { getRuntimeSnapshot } = await import("../agent-runtime.js");
      const snapshot = getRuntimeSnapshot();
      const sessionStats = getSessionStats();

      res.json({
        success: true,
        data: {
          // Runtime snapshot from agent-runtime.ts
          activeLlm: snapshot.totalActiveLlm,
          activeRequests: snapshot.totalActiveRequests,
          limits: snapshot.limits,
          queuedOrchestrations: snapshot.queuedOrchestrations,
          priorityStats: snapshot.priorityStats,
          // Session stats from runtime-sessions.ts
          sessions: sessionStats,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Fallback to session-only stats if agent-runtime fails
      const sessionStats = getSessionStats();
      res.json({
        success: true,
        data: {
          activeLlm: sessionStats.running,
          activeRequests: sessionStats.total,
          limits: null,
          queuedOrchestrations: 0,
          priorityStats: null,
          sessions: sessionStats,
          warning: `agent-runtime unavailable: ${errorMessage}`,
        },
      });
    }
  });

  /**
   * GET /api/runtime/sessions - Get active sessions
   */
  app.get("/api/runtime/sessions", (_req: Request, res: Response) => {
    try {
      const sessions = getActiveSessions();
      const stats = getSessionStats();

      res.json({
        success: true,
        data: {
          sessions,
          stats,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: "Failed to get sessions",
        details: errorMessage,
      });
    }
  });

  /**
   * GET /api/runtime/sessions/task/:taskId - Get session by task ID
   */
  app.get("/api/runtime/sessions/task/:taskId", (req: Request, res: Response) => {
    try {
      const session = getSessionByTaskId(req.params.taskId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: "No active session for this task",
        });
        return;
      }

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: "Failed to get session",
        details: errorMessage,
      });
    }
  });

  // Runtime SSE clients for session updates
  const runtimeSSEClients = new Map<string, Response>();

  // Subscribe to session events and broadcast to SSE clients
  const unsubscribeSessionEvents = onSessionEvent((event: SessionEvent) => {
    const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;
    for (const [id, clientRes] of runtimeSSEClients) {
      try {
        clientRes.write(eventStr);
      } catch {
        runtimeSSEClients.delete(id);
      }
    }
  });

  /**
   * GET /api/runtime/stream - SSE endpoint for real-time runtime updates
   */
  app.get("/api/runtime/stream", (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Generate client ID
    const clientId = `runtime-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Register client
    runtimeSSEClients.set(clientId, res);

    // Send initial snapshot
    const sessions = getActiveSessions();
    res.write(`event: status_snapshot\ndata: ${JSON.stringify(sessions)}\nid: ${Date.now()}\n\n`);

    // Keep connection alive with periodic comments
    const keepAlive = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(keepAlive);
        runtimeSSEClients.delete(clientId);
      }
    }, 15000);

    // Clean up on close
    const cleanup = () => {
      clearInterval(keepAlive);
      runtimeSSEClients.delete(clientId);
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
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

    // インスタンス情報の定期ブロードキャストを開始
    sseEventBus.startInstancesBroadcast();

    // 定期的に古い履歴ファイルをクリーンアップ（5分ごと）
    if (contextCleanupInterval) {
      clearInterval(contextCleanupInterval);
    }
    contextCleanupInterval = setInterval(() => {
      ContextHistoryStorage.cleanup();
    }, 5 * 60 * 1000);

    // 定期的に非アクティブなインスタンスが所有するULタスクをクリーンアップ（5分ごと）
    if (ulTaskCleanupInterval) {
      clearInterval(ulTaskCleanupInterval);
    }
    ulTaskCleanupInterval = setInterval(() => {
      const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
      if (cleanedCount > 0) {
        console.log(`[web-ui] Periodic cleanup: removed ${cleanedCount} UL task(s) from inactive instances`);
      }
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
    if (ulTaskCleanupInterval) {
      clearInterval(ulTaskCleanupInterval);
      ulTaskCleanupInterval = null;
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
