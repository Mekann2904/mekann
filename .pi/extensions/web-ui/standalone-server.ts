/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/standalone-server.ts
 * @role Standalone HTTP server for Web UI (runs as detached child process)
 * @why Allow web server to survive parent pi instance termination
 * @related server.ts, index.ts, lib/instance-registry.ts
 * @public_api startStandaloneServer (CLI entry point)
 * @invariants Server must clean up on SIGTERM/SIGINT, must handle orphaned cleanup
 * @side_effects Opens TCP port, serves HTTP requests, accesses shared storage
 * @failure_modes Port in use, build missing, permission denied
 *
 * @abdd.explain
 * @overview Standalone Express server that runs independently of any pi instance
 * @what_it_does Hosts built Preact app, provides REST API for pi state from shared storage, broadcasts SSE events
 * @why_it_exists Enables web UI to persist across pi instance restarts and multiple instances
 * @scope(in) Shared storage files (~/.pi-shared/), environment variables
 * @scope(out) HTTP responses, SSE broadcasts, shared storage updates
 */

import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server as HttpServer } from "http";
import * as path from "path";
import * as fs from "fs";
import { homedir } from "os";
import { fileURLToPath } from "url";
import {
  getAllUlWorkflowTasks,
  getUlWorkflowTask,
  getActiveUlWorkflowTask,
  invalidateCache,
  type UlWorkflowTask,
} from "./lib/ul-workflow-reader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types (duplicated from instance-registry.ts to avoid dependency)
// ============================================================================

interface InstanceInfo {
  pid: number;
  startedAt: number;
  cwd: string;
  model: string;
  lastHeartbeat: number;
}

interface ServerInfo {
  pid: number;
  port: number;
  startedAt: number;
}

interface ThemeSettings {
  themeId: string;
  mode: "light" | "dark";
}

interface ContextHistoryEntry {
  timestamp: string;
  input: number;
  output: number;
  pid: number;
}

interface InstanceContextHistory {
  pid: number;
  cwd: string;
  model: string;
  history: ContextHistoryEntry[];
}

// ============================================================================
// Shared Storage (duplicated from instance-registry.ts)
// ============================================================================

const SHARED_DIR = path.join(homedir(), ".pi-shared");
const INSTANCES_FILE = path.join(SHARED_DIR, "instances.json");
const SERVER_FILE = path.join(SHARED_DIR, "web-ui-server.json");
const THEME_FILE = path.join(SHARED_DIR, "theme.json");
const LOCK_FILE = path.join(SHARED_DIR, ".lock");

function ensureSharedDir(): void {
  if (!fs.existsSync(SHARED_DIR)) {
    fs.mkdirSync(SHARED_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureSharedDir();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  try {
    fs.renameSync(tempPath, filePath);
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}

// ============================================================================
// Instance Registry (read-only for standalone server)
// ============================================================================

class InstanceRegistry {
  static getAll(): InstanceInfo[] {
    const instances = readJsonFile<Record<number, InstanceInfo>>(INSTANCES_FILE, {});
    const now = Date.now();
    const STALE_THRESHOLD_MS = 60000; // 60 seconds

    const activeInstances = Object.values(instances).filter(
      (info) => now - info.lastHeartbeat < STALE_THRESHOLD_MS
    );

    // Clean up stale entries
    const activePids = new Set(activeInstances.map((i) => i.pid));
    let hasStale = false;

    for (const pid of Object.keys(instances)) {
      if (!activePids.has(Number(pid))) {
        delete instances[Number(pid)];
        hasStale = true;
      }
    }

    if (hasStale) {
      writeJsonFile(INSTANCES_FILE, instances);
    }

    return activeInstances;
  }

  static getCount(): number {
    return InstanceRegistry.getAll().length;
  }
}

// ============================================================================
// Server Registry
// ============================================================================

class ServerRegistry {
  static register(pid: number, port: number): void {
    const serverInfo: ServerInfo = {
      pid,
      port,
      startedAt: Date.now(),
    };
    writeJsonFile(SERVER_FILE, serverInfo);
  }

  static unregister(): void {
    try {
      fs.unlinkSync(SERVER_FILE);
    } catch {}
  }

  static isRunning(): ServerInfo | null {
    const serverInfo = readJsonFile<ServerInfo | null>(SERVER_FILE, null);
    if (!serverInfo) {
      return null;
    }

    try {
      process.kill(serverInfo.pid, 0);
      return serverInfo;
    } catch {
      try {
        fs.unlinkSync(SERVER_FILE);
      } catch {}
      return null;
    }
  }
}

// ============================================================================
// Theme Storage
// ============================================================================

class ThemeStorage {
  static get(): ThemeSettings {
    return readJsonFile<ThemeSettings>(THEME_FILE, {
      themeId: "blue",
      mode: "dark",
    });
  }

  static set(settings: ThemeSettings): void {
    writeJsonFile(THEME_FILE, settings);
  }
}

// ============================================================================
// Context History Storage (read-only)
// ============================================================================

class ContextHistoryStorage {
  static getAllInstances(): Map<number, ContextHistoryEntry[]> {
    const result = new Map<number, ContextHistoryEntry[]>();

    ensureSharedDir();

    const files = fs.readdirSync(SHARED_DIR);
    const historyFiles = files.filter((f) =>
      f.startsWith("context-history-") && f.endsWith(".json")
    );

    for (const file of historyFiles) {
      const match = file.match(/context-history-(\d+)\.json/);
      if (match) {
        const pid = parseInt(match[1], 10);
        const filePath = path.join(SHARED_DIR, file);
        const history = readJsonFile<ContextHistoryEntry[]>(filePath, []);
        if (history.length > 0) {
          result.set(pid, history);
        }
      }
    }

    return result;
  }

  static getActiveInstancesHistory(): InstanceContextHistory[] {
    const instances = InstanceRegistry.getAll();
    const allHistory = ContextHistoryStorage.getAllInstances();
    const result: InstanceContextHistory[] = [];

    for (const instance of instances) {
      const history = allHistory.get(instance.pid) ?? [];
      result.push({
        pid: instance.pid,
        cwd: instance.cwd,
        model: instance.model,
        history,
      });
    }

    return result;
  }

  static cleanup(): void {
    const instances = InstanceRegistry.getAll();
    const activePids = new Set(instances.map((i) => i.pid));

    ensureSharedDir();

    const files = fs.readdirSync(SHARED_DIR);
    const historyFiles = files.filter((f) =>
      f.startsWith("context-history-") && f.endsWith(".json")
    );

    for (const file of historyFiles) {
      const match = file.match(/context-history-(\d+)\.json/);
      if (match) {
        const pid = parseInt(match[1], 10);
        if (!activePids.has(pid)) {
          try {
            fs.unlinkSync(path.join(SHARED_DIR, file));
          } catch {}
        }
      }
    }
  }
}

// ============================================================================
// SSE Event Bus
// ============================================================================

interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

interface SSEClient {
  id: string;
  res: Response;
  lastHeartbeat: number;
}

class SSEEventBus {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private instancesBroadcastInterval: ReturnType<typeof setInterval> | null = null;

  addClient(id: string, res: Response): void {
    this.clients.set(id, { id, res, lastHeartbeat: Date.now() });
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(event: SSEEvent): void {
    const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;

    for (const [id, client] of this.clients) {
      try {
        client.res.write(eventStr);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: "heartbeat",
        data: { timestamp: Date.now() },
        timestamp: Date.now(),
      });
    }, 30000);
  }

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

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.instancesBroadcastInterval) {
      clearInterval(this.instancesBroadcastInterval);
      this.instancesBroadcastInterval = null;
    }
    this.clients.clear();
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

const sseEventBus = new SSEEventBus();

// ============================================================================
// Server State
// ============================================================================

interface ServerState {
  server: HttpServer | null;
  port: number;
}

const state: ServerState = {
  server: null,
  port: 3000,
};

// ============================================================================
// Server Implementation
// ============================================================================

function createApp(): Express {
  const app: Express = express();
  app.use(express.json());

  // ============= API Endpoints =============

  /**
   * GET /api/status - Server status
   */
  app.get("/api/status", (_req: Request, res: Response) => {
    const instances = InstanceRegistry.getAll();
    res.json({
      status: {
        serverPid: process.pid,
        port: state.port,
        instancesCount: instances.length,
        uptime: process.uptime(),
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
    res.json({ success: true, config: req.body });
  });

  /**
   * GET /api/context-history - Get context history for all instances
   */
  app.get("/api/context-history", (_req: Request, res: Response) => {
    try {
      const instancesHistory = ContextHistoryStorage.getActiveInstancesHistory();

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
   * GET /api/events - Server-Sent Events endpoint
   */
  app.get("/api/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    sseEventBus.addClient(clientId, res);

    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`);

    req.on("close", () => {
      sseEventBus.removeClient(clientId);
    });

    req.socket.setKeepAlive(true);
  });

  // ============= Task API =============

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

  // ============= MCP API (Stub - requires pi instance) =============

  /**
   * GET /api/mcp/connections - List MCP connections (stub)
   */
  app.get("/api/mcp/connections", (_req: Request, res: Response) => {
    res.json({ connections: [], count: 0, note: "MCP API requires active pi instance" });
  });

  /**
   * GET /api/mcp/servers - List MCP servers from config
   */
  app.get("/api/mcp/servers", async (_req: Request, res: Response) => {
    try {
      const configPath = path.join(process.cwd(), '.pi', 'mcp-servers.json');

      let configServers: Array<{
        id: string;
        url: string;
        name?: string;
        description?: string;
        enabled?: boolean;
        transportType?: string;
      }> = [];

      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as { servers: typeof configServers };
        configServers = config.servers ?? [];
      }

      const servers = configServers.map(server => ({
        id: server.id,
        name: server.name ?? server.id,
        url: server.url,
        description: server.description,
        enabled: server.enabled ?? true,
        transportType: server.transportType ?? 'auto',
        status: 'disconnected' as const,
        toolsCount: 0,
        resourcesCount: 0,
        error: undefined,
        connectedAt: null,
        serverInfo: undefined,
      }));

      res.json({ servers, count: servers.length, note: "MCP connections require active pi instance" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to list MCP servers", details: errorMessage });
    }
  });

  // ============= Runtime Status API (Stub - requires pi instance) =============

  /**
   * GET /api/runtime/status - Get runtime status (stub)
   */
  app.get("/api/runtime/status", (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        activeLlm: 0,
        activeRequests: 0,
        limits: null,
        queuedOrchestrations: 0,
        priorityStats: null,
        sessions: { total: 0, running: 0, idle: 0 },
        note: "Runtime status requires active pi instance",
      },
    });
  });

  /**
   * GET /api/runtime/sessions - Get active sessions (stub)
   */
  app.get("/api/runtime/sessions", (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        sessions: [],
        stats: { total: 0, running: 0, idle: 0 },
        note: "Runtime sessions require active pi instance",
      },
    });
  });

  // ============= Static Files =============

  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));

  // ============= SPA Fallback =============

  app.get("*", (req: Request, res: Response) => {
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

  return app;
}

// ============================================================================
// Entry Point
// ============================================================================

function startStandaloneServer(port: number): HttpServer {
  const app = createApp();
  const server = createServer(app);

  state.server = server;
  state.port = port;

  // Register this server
  ServerRegistry.register(process.pid, port);

  server.listen(port, () => {
    console.log(`[web-ui-standalone] Server started on port ${port} (PID: ${process.pid})`);

    // SSEハートビートを開始
    sseEventBus.startHeartbeat();
    sseEventBus.startInstancesBroadcast();
  });

  return server;
}

function stopStandaloneServer(): void {
  if (state.server) {
    sseEventBus.stopHeartbeat();
    state.server.close();
    state.server = null;
    ServerRegistry.unregister();
    console.log(`[web-ui-standalone] Server stopped (PID: ${process.pid})`);
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => {
  console.log("[web-ui-standalone] Received SIGTERM, shutting down...");
  stopStandaloneServer();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[web-ui-standalone] Received SIGINT, shutting down...");
  stopStandaloneServer();
  process.exit(0);
});

// Periodic cleanup of orphaned instances and history files
setInterval(() => {
  ContextHistoryStorage.cleanup();
}, 5 * 60 * 1000);

// Periodic check for active instances (if no instances, shutdown server)
setInterval(() => {
  const count = InstanceRegistry.getCount();
  if (count === 0) {
    console.log("[web-ui-standalone] No active instances, shutting down server...");
    stopStandaloneServer();
    process.exit(0);
  }
}, 30000); // Check every 30 seconds

// CLI entry point
const port = parseInt(process.env.PI_WEB_UI_PORT || "") || 3000;
startStandaloneServer(port);
