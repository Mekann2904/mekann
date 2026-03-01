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
import express from "express";
import { createServer } from "http";
import * as path from "path";
import * as fs from "fs";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { getAllUlWorkflowTasks, getUlWorkflowTask, getActiveUlWorkflowTask, } from "./lib/ul-workflow-reader.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ============================================================================
// Shared Storage (duplicated from instance-registry.ts)
// ============================================================================
const SHARED_DIR = path.join(homedir(), ".pi-shared");
const INSTANCES_FILE = path.join(SHARED_DIR, "instances.json");
const SERVER_FILE = path.join(SHARED_DIR, "web-ui-server.json");
const THEME_FILE = path.join(SHARED_DIR, "theme.json");
const LOCK_FILE = path.join(SHARED_DIR, ".lock");
function ensureSharedDir() {
    if (!fs.existsSync(SHARED_DIR)) {
        fs.mkdirSync(SHARED_DIR, { recursive: true });
    }
}
function readJsonFile(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return defaultValue;
    }
}
function writeJsonFile(filePath, data) {
    ensureSharedDir();
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    try {
        fs.renameSync(tempPath, filePath);
    }
    catch {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        try {
            fs.unlinkSync(tempPath);
        }
        catch { }
    }
}
// ============================================================================
// Instance Registry (read-only for standalone server)
// ============================================================================
class InstanceRegistry {
    static getAll() {
        const instances = readJsonFile(INSTANCES_FILE, {});
        const now = Date.now();
        const STALE_THRESHOLD_MS = 60000; // 60 seconds
        const activeInstances = Object.values(instances).filter((info) => now - info.lastHeartbeat < STALE_THRESHOLD_MS);
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
    static getCount() {
        return InstanceRegistry.getAll().length;
    }
}
// ============================================================================
// Server Registry
// ============================================================================
class ServerRegistry {
    static register(pid, port) {
        const serverInfo = {
            pid,
            port,
            startedAt: Date.now(),
        };
        writeJsonFile(SERVER_FILE, serverInfo);
    }
    static unregister() {
        try {
            fs.unlinkSync(SERVER_FILE);
        }
        catch { }
    }
    static isRunning() {
        const serverInfo = readJsonFile(SERVER_FILE, null);
        if (!serverInfo) {
            return null;
        }
        try {
            process.kill(serverInfo.pid, 0);
            return serverInfo;
        }
        catch {
            try {
                fs.unlinkSync(SERVER_FILE);
            }
            catch { }
            return null;
        }
    }
}
// ============================================================================
// Theme Storage
// ============================================================================
class ThemeStorage {
    static get() {
        return readJsonFile(THEME_FILE, {
            themeId: "blue",
            mode: "dark",
        });
    }
    static set(settings) {
        writeJsonFile(THEME_FILE, settings);
    }
}
// ============================================================================
// Context History Storage (read-only)
// ============================================================================
class ContextHistoryStorage {
    static getAllInstances() {
        const result = new Map();
        ensureSharedDir();
        const files = fs.readdirSync(SHARED_DIR);
        const historyFiles = files.filter((f) => f.startsWith("context-history-") && f.endsWith(".json"));
        for (const file of historyFiles) {
            const match = file.match(/context-history-(\d+)\.json/);
            if (match) {
                const pid = parseInt(match[1], 10);
                const filePath = path.join(SHARED_DIR, file);
                const history = readJsonFile(filePath, []);
                if (history.length > 0) {
                    result.set(pid, history);
                }
            }
        }
        return result;
    }
    static getActiveInstancesHistory() {
        const instances = InstanceRegistry.getAll();
        const allHistory = ContextHistoryStorage.getAllInstances();
        const result = [];
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
    static cleanup() {
        const instances = InstanceRegistry.getAll();
        const activePids = new Set(instances.map((i) => i.pid));
        ensureSharedDir();
        const files = fs.readdirSync(SHARED_DIR);
        const historyFiles = files.filter((f) => f.startsWith("context-history-") && f.endsWith(".json"));
        for (const file of historyFiles) {
            const match = file.match(/context-history-(\d+)\.json/);
            if (match) {
                const pid = parseInt(match[1], 10);
                if (!activePids.has(pid)) {
                    try {
                        fs.unlinkSync(path.join(SHARED_DIR, file));
                    }
                    catch { }
                }
            }
        }
    }
}
class SSEEventBus {
    clients = new Map();
    heartbeatInterval = null;
    instancesBroadcastInterval = null;
    addClient(id, res) {
        this.clients.set(id, { id, res, lastHeartbeat: Date.now() });
    }
    removeClient(id) {
        this.clients.delete(id);
    }
    broadcast(event) {
        const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;
        for (const [id, client] of this.clients) {
            try {
                client.res.write(eventStr);
            }
            catch {
                this.clients.delete(id);
            }
        }
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.broadcast({
                type: "heartbeat",
                data: { timestamp: Date.now() },
                timestamp: Date.now(),
            });
        }, 30000);
    }
    startInstancesBroadcast() {
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
    stopHeartbeat() {
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
    getClientCount() {
        return this.clients.size;
    }
}
const sseEventBus = new SSEEventBus();
const state = {
    server: null,
    port: 3000,
};
// ============================================================================
// Server Implementation
// ============================================================================
function createApp() {
    const app = express();
    app.use(express.json());
    // ============= API Endpoints =============
    /**
     * GET /api/status - Server status
     */
    app.get("/api/status", (_req, res) => {
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
    app.get("/api/instances", (_req, res) => {
        try {
            const instances = InstanceRegistry.getAll();
            res.json({
                instances,
                count: instances.length,
                serverPid: process.pid,
                serverPort: state.port,
            });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to get instances" });
        }
    });
    /**
     * GET /api/theme - Get global theme settings
     */
    app.get("/api/theme", (_req, res) => {
        try {
            const theme = ThemeStorage.get();
            res.json(theme);
        }
        catch (error) {
            res.status(500).json({ error: "Failed to get theme" });
        }
    });
    /**
     * POST /api/theme - Update global theme settings
     */
    app.post("/api/theme", (req, res) => {
        try {
            const { themeId, mode } = req.body;
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
        }
        catch (error) {
            res.status(500).json({ error: "Failed to save theme" });
        }
    });
    /**
     * POST /api/config - Update configuration
     */
    app.post("/api/config", (req, res) => {
        res.json({ success: true, config: req.body });
    });
    /**
     * GET /api/context-history - Get context history for all instances
     */
    app.get("/api/context-history", (_req, res) => {
        try {
            const instancesHistory = ContextHistoryStorage.getActiveInstancesHistory();
            const instances = {};
            for (const instance of instancesHistory) {
                instances[instance.pid] = instance;
            }
            res.json({ instances });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to get context history" });
        }
    });
    /**
     * GET /api/events - Server-Sent Events endpoint
     */
    app.get("/api/events", (req, res) => {
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
    function ensureTaskDir() {
        if (!fs.existsSync(TASK_DIR)) {
            fs.mkdirSync(TASK_DIR, { recursive: true });
        }
    }
    function loadTaskStorage() {
        ensureTaskDir();
        if (!fs.existsSync(TASK_STORAGE_FILE)) {
            return { tasks: [] };
        }
        try {
            const data = fs.readFileSync(TASK_STORAGE_FILE, "utf-8");
            return JSON.parse(data);
        }
        catch {
            return { tasks: [] };
        }
    }
    function saveTaskStorage(storage) {
        ensureTaskDir();
        const tempFile = TASK_STORAGE_FILE + ".tmp";
        fs.writeFileSync(tempFile, JSON.stringify(storage, null, 2));
        fs.renameSync(tempFile, TASK_STORAGE_FILE);
    }
    /**
     * GET /api/tasks - List tasks with filters
     */
    app.get("/api/tasks", (req, res) => {
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
                tasks = tasks.filter((t) => t.dueDate &&
                    new Date(t.dueDate) < now &&
                    t.status !== "completed" &&
                    t.status !== "cancelled");
            }
            const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
            tasks.sort((a, b) => {
                const pa = priorityOrder[a.priority] ?? 2;
                const pb = priorityOrder[b.priority] ?? 2;
                if (pa !== pb)
                    return pa - pb;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            res.json({ success: true, data: tasks, total: tasks.length });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to load tasks", details: errorMessage });
        }
    });
    /**
     * GET /api/tasks/stats - Get task statistics
     */
    app.get("/api/tasks/stats", (_req, res) => {
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
                overdue: tasks.filter((t) => t.dueDate &&
                    new Date(t.dueDate) < now &&
                    t.status !== "completed" &&
                    t.status !== "cancelled").length,
                byPriority: {
                    low: tasks.filter((t) => t.priority === "low").length,
                    medium: tasks.filter((t) => t.priority === "medium").length,
                    high: tasks.filter((t) => t.priority === "high").length,
                    urgent: tasks.filter((t) => t.priority === "urgent").length,
                },
            };
            res.json({ success: true, data: stats });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to get stats", details: errorMessage });
        }
    });
    /**
     * GET /api/tasks/:id - Get single task
     */
    app.get("/api/tasks/:id", (req, res) => {
        try {
            const storage = loadTaskStorage();
            const task = storage.tasks.find((t) => t.id === req.params.id);
            if (!task) {
                res.status(404).json({ success: false, error: "Task not found" });
                return;
            }
            res.json({ success: true, data: task });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to get task", details: errorMessage });
        }
    });
    /**
     * POST /api/tasks - Create new task
     */
    app.post("/api/tasks", (req, res) => {
        try {
            const storage = loadTaskStorage();
            const now = new Date().toISOString();
            const newTask = {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to create task", details: errorMessage });
        }
    });
    /**
     * PUT /api/tasks/:id - Update task
     */
    app.put("/api/tasks/:id", (req, res) => {
        try {
            const storage = loadTaskStorage();
            const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);
            if (taskIndex === -1) {
                res.status(404).json({ success: false, error: "Task not found" });
                return;
            }
            const task = storage.tasks[taskIndex];
            const updatedTask = {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to update task", details: errorMessage });
        }
    });
    /**
     * PATCH /api/tasks/:id/complete - Mark task as completed
     */
    app.patch("/api/tasks/:id/complete", (req, res) => {
        try {
            const storage = loadTaskStorage();
            const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);
            if (taskIndex === -1) {
                res.status(404).json({ success: false, error: "Task not found" });
                return;
            }
            const task = storage.tasks[taskIndex];
            const now = new Date().toISOString();
            const updatedTask = {
                ...task,
                status: "completed",
                completedAt: now,
                updatedAt: now,
            };
            storage.tasks[taskIndex] = updatedTask;
            saveTaskStorage(storage);
            res.json({ success: true, data: updatedTask });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to complete task", details: errorMessage });
        }
    });
    /**
     * DELETE /api/tasks/:id - Delete task
     */
    app.delete("/api/tasks/:id", (req, res) => {
        try {
            const storage = loadTaskStorage();
            const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);
            if (taskIndex === -1) {
                res.status(404).json({ success: false, error: "Task not found" });
                return;
            }
            const taskId = storage.tasks[taskIndex].id;
            storage.tasks = storage.tasks.filter((t) => t.id !== taskId && t.parentTaskId !== taskId);
            saveTaskStorage(storage);
            res.json({ success: true, data: { deletedTaskId: taskId } });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to delete task", details: errorMessage });
        }
    });
    // ============= UL Workflow Task API (Read-only) =============
    /**
     * GET /api/ul-workflow/tasks - Get all UL workflow tasks
     */
    app.get("/api/ul-workflow/tasks", (_req, res) => {
        try {
            const tasks = getAllUlWorkflowTasks();
            res.json({ success: true, data: tasks, total: tasks.length });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to load UL workflow tasks", details: errorMessage });
        }
    });
    /**
     * GET /api/ul-workflow/tasks/active - Get active UL workflow task
     */
    app.get("/api/ul-workflow/tasks/active", (_req, res) => {
        try {
            const task = getActiveUlWorkflowTask();
            res.json({ success: true, data: task });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to load active UL workflow task", details: errorMessage });
        }
    });
    /**
     * GET /api/ul-workflow/tasks/:id - Get single UL workflow task
     */
    app.get("/api/ul-workflow/tasks/:id", (req, res) => {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: "Failed to load task", details: errorMessage });
        }
    });
    // ============= Analytics API =============
    /**
     * GET /api/analytics/stats - Get storage statistics
     */
    app.get("/api/analytics/stats", async (_req, res) => {
        try {
            const { getStorageStats } = await import("../../lib/analytics/behavior-storage.js");
            const stats = getStorageStats();
            res.json(stats);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: "Failed to get stats", details: errorMessage });
        }
    });
    /**
     * GET /api/analytics/records - Get recent behavior records
     */
    app.get("/api/analytics/records", async (req, res) => {
        try {
            const { loadRecentRecords } = await import("../../lib/analytics/behavior-storage.js");
            const limit = parseInt(req.query.limit || "50", 10);
            const records = loadRecentRecords(limit);
            res.json(records);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: "Failed to get records", details: errorMessage });
        }
    });
    /**
     * GET /api/analytics/aggregates - Get aggregated data
     */
    app.get("/api/analytics/aggregates", async (req, res) => {
        try {
            const { loadAggregates } = await import("../../lib/analytics/aggregator.js");
            const type = (req.query.type || "daily");
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            const aggregates = loadAggregates(type, startDate, endDate);
            res.json(aggregates);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: "Failed to get aggregates", details: errorMessage });
        }
    });
    /**
     * GET /api/analytics/anomalies - Get anomaly summary
     */
    app.get("/api/analytics/anomalies", async (_req, res) => {
        try {
            const { getAnomalySummary } = await import("../../lib/analytics/anomaly-detector.js");
            const summary = getAnomalySummary();
            res.json(summary);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: "Failed to get anomalies", details: errorMessage });
        }
    });
    /**
     * GET /api/analytics/summary - Get aggregation summary
     */
    app.get("/api/analytics/summary", async (_req, res) => {
        try {
            const { getAggregationSummary } = await import("../../lib/analytics/aggregator.js");
            const summary = getAggregationSummary();
            res.json(summary);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: "Failed to get summary", details: errorMessage });
        }
    });
    /**
     * GET /api/analytics/paths - Get analytics paths
     */
    app.get("/api/analytics/paths", async (_req, res) => {
        try {
            const { getAnalyticsPaths } = await import("../../lib/analytics/behavior-storage.js");
            const paths = getAnalyticsPaths();
            res.json(paths);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: "Failed to get paths", details: errorMessage });
        }
    });
    // ============= MCP API (Stub - requires pi instance) =============
    /**
     * GET /api/mcp/connections - List MCP connections (stub)
     */
    app.get("/api/mcp/connections", (_req, res) => {
        res.json({ connections: [], count: 0, note: "MCP API requires active pi instance" });
    });
    /**
     * GET /api/mcp/servers - List MCP servers from config
     */
    app.get("/api/mcp/servers", async (_req, res) => {
        try {
            const configPath = path.join(process.cwd(), '.pi', 'mcp-servers.json');
            let configServers = [];
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(content);
                configServers = config.servers ?? [];
            }
            const servers = configServers.map(server => ({
                id: server.id,
                name: server.name ?? server.id,
                url: server.url,
                description: server.description,
                enabled: server.enabled ?? true,
                transportType: server.transportType ?? 'auto',
                status: 'disconnected',
                toolsCount: 0,
                resourcesCount: 0,
                error: undefined,
                connectedAt: null,
                serverInfo: undefined,
            }));
            res.json({ servers, count: servers.length, note: "MCP connections require active pi instance" });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: "Failed to list MCP servers", details: errorMessage });
        }
    });
    // ============= Runtime Status API (Stub - requires pi instance) =============
    /**
     * GET /api/runtime/status - Get runtime status (stub)
     */
    app.get("/api/runtime/status", (_req, res) => {
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
    app.get("/api/runtime/sessions", (_req, res) => {
        res.json({
            success: true,
            data: {
                sessions: [],
                stats: { total: 0, running: 0, idle: 0 },
                note: "Runtime sessions require active pi instance",
            },
        });
    });
    /**
     * GET /api/runtime/stream - SSE endpoint for real-time runtime updates (stub)
     */
    app.get("/api/runtime/stream", (req, res) => {
        // Set SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        // Send initial empty snapshot
        res.write(`event: status_snapshot\ndata: []\nid: ${Date.now()}\n\n`);
        // Send notification that runtime streaming is unavailable
        res.write(`event: unavailable\ndata: ${JSON.stringify({ message: "Runtime streaming requires active pi instance" })}\nid: ${Date.now()}\n\n`);
        // Keep connection alive with periodic comments
        const keepAlive = setInterval(() => {
            try {
                res.write(": keepalive\n\n");
            }
            catch {
                clearInterval(keepAlive);
            }
        }, 15000);
        // Clean up on close
        req.on("close", () => {
            clearInterval(keepAlive);
        });
        res.on("close", () => {
            clearInterval(keepAlive);
        });
    });
    // ============= Static Files =============
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    // ============= SPA Fallback =============
    app.get("*", (req, res) => {
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
function startStandaloneServer(port) {
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
function stopStandaloneServer() {
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
