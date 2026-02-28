/**
 * @abdd.meta
 * path: .pi/extensions/server.ts
 * role: REST APIサーバー拡張機能。タスク管理システムへのHTTPアクセスを提供
 * why: 外部ツールやCLIクライアントからタスク管理機能にアクセスするため
 * related: .pi/extensions/task.ts, .pi/lib/comprehensive-logger.ts, README.md
 * public_api: startServer, stopServer, DEFAULT_PORT
 * invariants: サーバーは1つのみ起動、ポートは環境変数で上書き可能
 * side_effects: HTTPサーバーの起動、ポートのリッスン、.pi/tasks/storage.jsonへの読み書き
 * failure_modes: ポート競合、不正なJSONリクエスト、タスクID不存在
 * @abdd.explain
 * overview: Node.js組み込みhttpモジュールを使用した軽量REST APIサーバー
 * what_it_does:
 *   - GET /api/tasks - タスク一覧取得（フィルタ対応）
 *   - GET /api/tasks/:id - 特定タスク取得
 *   - POST /api/tasks - タスク作成
 *   - PUT /api/tasks/:id - タスク更新
 *   - DELETE /api/tasks/:id - タスク削除
 *   - PATCH /api/tasks/:id/complete - タスク完了
 *   - GET /api/tasks/stats - 統計取得
 * why_it_exists:
 *   - 外部ツールからのタスク管理を可能にする
 *   - Webhook連携やCI/CDパイプラインとの統合を容易にする
 * scope:
 *   in: HTTPリクエスト、JSONペイロード
 *   out: JSONレスポンス、HTTPステータスコード
 */

// File: .pi/extensions/server.ts
// Description: REST API server for task management
// Why: Provides HTTP access to task management functionality
// Related: .pi/extensions/task.ts, README.md

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";
import {
  getAllUlWorkflowTasks,
  getUlWorkflowTask,
  getActiveUlWorkflowTask,
  invalidateCache,
} from "./web-ui/lib/ul-workflow-reader.js";

const logger = getLogger();

// ============================================
// Types
// ============================================

type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed";

interface Task {
	id: string;
	title: string;
	description?: string;
	status: TaskStatus;
	priority: TaskPriority;
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

interface ApiResponse {
	success: boolean;
	data?: unknown;
	total?: number;
	error?: string;
}

// ============================================
// Storage Functions (imported from task.ts pattern)
// ============================================

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, isAbsolute } from "node:path";

const TASK_DIR = ".pi/tasks";
const STORAGE_FILE = join(TASK_DIR, "storage.json");
const UL_WORKFLOW_DIR = ".pi/ul-workflow";
const UL_TASKS_DIR = join(UL_WORKFLOW_DIR, "tasks");
const UL_ACTIVE_FILE = join(UL_WORKFLOW_DIR, "active.json");

function ensureTaskDir(): void {
	if (!existsSync(TASK_DIR)) {
		mkdirSync(TASK_DIR, { recursive: true });
	}
}

function loadStorage(): TaskStorage {
	ensureTaskDir();
	if (!existsSync(STORAGE_FILE)) {
		const empty: TaskStorage = { tasks: [] };
		writeFileSync(STORAGE_FILE, JSON.stringify(empty, null, 2), "utf-8");
		return empty;
	}
	try {
		const content = readFileSync(STORAGE_FILE, "utf-8");
		return JSON.parse(content);
	} catch {
		return { tasks: [] };
	}
}

function saveStorage(storage: TaskStorage): void {
	ensureTaskDir();
	writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2), "utf-8");
}

// ============================================
// Server State
// ============================================

const DEFAULT_PORT = 3456;
let server: Server | null = null;
let taskIdSequence = 0;

// ============================================
// Helper Functions
// ============================================

function generateId(): string {
	taskIdSequence += 1;
	return `task-${Date.now()}-${taskIdSequence}`;
}

function sendJson(res: ServerResponse, status: number, data: ApiResponse): void {
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	});
	res.end(JSON.stringify(data));
}

function parseUrl(url: string): { path: string; query: Record<string, string> } {
	const [path, queryString] = url.split("?");
	const query: Record<string, string> = {};
	if (queryString) {
		for (const pair of queryString.split("&")) {
			const [key, value] = pair.split("=");
			if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || "");
		}
	}
	return { path, query };
}

async function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString()));
		req.on("error", reject);
	});
}

// ============================================
// Static File Serving
// ============================================

const MIME_TYPES: Record<string, string> = {
	".html": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
};

async function serveStatic(
	urlPath: string,
	publicDir: string,
	res: ServerResponse
): Promise<boolean> {
	// Normalize path - serve index.html for root
	let filePath = urlPath === "/" ? "/index.html" : urlPath;
	
	// Security: prevent directory traversal
	// Check for path traversal attempts: "..", null bytes, and absolute paths
	if (filePath.includes("..") || filePath.includes("\0") || isAbsolute(filePath)) {
		return false;
	}
	
	const fullPath = join(publicDir, filePath);
	
	// Check if file exists
	if (!existsSync(fullPath)) {
		return false;
	}
	
	try {
		const stat = await import("node:fs/promises").then((fs) => fs.stat(fullPath));
		if (!stat.isFile()) {
			return false;
		}
		
		const content = readFileSync(fullPath);
		const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
		const contentType = MIME_TYPES[ext] || "application/octet-stream";
		
		res.writeHead(200, {
			"Content-Type": contentType,
			"Content-Length": content.length,
		});
		res.end(content);
		return true;
	} catch {
		return false;
	}
}

// ============================================
// Route Handlers
// ============================================

function handleGetTasks(query: Record<string, string>): ApiResponse {
	const storage = loadStorage();
	let tasks = storage.tasks;

	if (query.status) {
		tasks = tasks.filter((t) => t.status === query.status);
	}
	if (query.priority) {
		tasks = tasks.filter((t) => t.priority === query.priority);
	}
	if (query.tag) {
		tasks = tasks.filter((t) => t.tags.includes(query.tag));
	}
	if (query.assignee) {
		tasks = tasks.filter((t) => t.assignee === query.assignee);
	}
	if (query.overdue === "true") {
		const now = new Date();
		tasks = tasks.filter(
			(t) => t.status !== "completed" && t.status !== "cancelled" && t.dueDate && new Date(t.dueDate) < now
		);
	}

	return { success: true, data: tasks };
}

function handleGetTask(id: string): ApiResponse {
	const storage = loadStorage();
	const task = storage.tasks.find((t) => t.id === id);
	if (!task) {
		return { success: false, error: `Task not found: ${id}` };
	}
	return { success: true, data: task };
}

function handleCreateTask(body: Record<string, unknown>): ApiResponse {
	const validPriorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
	const validStatuses: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled", "failed"];

	const title = body.title as string;
	if (!title || typeof title !== "string") {
		return { success: false, error: "Title is required" };
	}

	const priority = (body.priority as TaskPriority) || "medium";
	if (!validPriorities.includes(priority)) {
		return { success: false, error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` };
	}

	const status = (body.status as TaskStatus) || "todo";
	if (!validStatuses.includes(status)) {
		return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` };
	}

	const storage = loadStorage();

	if (body.parentTaskId) {
		const parent = storage.tasks.find((t) => t.id === body.parentTaskId);
		if (!parent) {
			return { success: false, error: `Parent task not found: ${body.parentTaskId}` };
		}
	}

	const task: Task = {
		id: generateId(),
		title,
		description: body.description as string | undefined,
		status,
		priority,
		tags: (body.tags as string[]) || [],
		dueDate: body.dueDate as string | undefined,
		assignee: body.assignee as string | undefined,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		parentTaskId: body.parentTaskId as string | undefined,
	};

	storage.tasks.push(task);
	saveStorage(storage);

	return { success: true, data: task };
}

function handleUpdateTask(id: string, body: Record<string, unknown>): ApiResponse {
	const validPriorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
	const validStatuses: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled", "failed"];

	const storage = loadStorage();
	const taskIndex = storage.tasks.findIndex((t) => t.id === id);
	if (taskIndex === -1) {
		return { success: false, error: `Task not found: ${id}` };
	}

	const task = storage.tasks[taskIndex];

	if (body.priority && !validPriorities.includes(body.priority as TaskPriority)) {
		return { success: false, error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` };
	}

	if (body.status && !validStatuses.includes(body.status as TaskStatus)) {
		return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` };
	}

	// Apply updates
	if (body.title !== undefined) task.title = body.title as string;
	if (body.description !== undefined) task.description = body.description as string;
	if (body.status !== undefined) task.status = body.status as TaskStatus;
	if (body.priority !== undefined) task.priority = body.priority as TaskPriority;
	if (body.tags !== undefined) task.tags = body.tags as string[];
	if (body.dueDate !== undefined) task.dueDate = body.dueDate as string;
	if (body.assignee !== undefined) task.assignee = body.assignee as string;

	task.updatedAt = new Date().toISOString();

	// Auto-set completedAt
	if (body.status === "completed" && !task.completedAt) {
		task.completedAt = new Date().toISOString();
	} else if (body.status && body.status !== "completed") {
		task.completedAt = undefined;
	}

	saveStorage(storage);
	return { success: true, data: task };
}

function handleDeleteTask(id: string): ApiResponse {
	const storage = loadStorage();
	const initialLength = storage.tasks.length;
	storage.tasks = storage.tasks.filter((t) => t.id !== id);

	if (storage.tasks.length === initialLength) {
		return { success: false, error: `Task not found: ${id}` };
	}

	// Also delete subtasks
	storage.tasks = storage.tasks.filter((t) => t.parentTaskId !== id);

	saveStorage(storage);
	return { success: true, data: { deleted: true, id } };
}

function handleCompleteTask(id: string): ApiResponse {
	return handleUpdateTask(id, { status: "completed" });
}

function handleGetStats(): ApiResponse {
	const storage = loadStorage();
	const tasks = storage.tasks;

	const now = new Date();
	const overdue = tasks.filter(
		(t) => t.status !== "completed" && t.status !== "cancelled" && t.dueDate && new Date(t.dueDate) < now
	);

	const stats = {
		total: tasks.length,
		todo: tasks.filter((t) => t.status === "todo").length,
		inProgress: tasks.filter((t) => t.status === "in_progress").length,
		completed: tasks.filter((t) => t.status === "completed").length,
		cancelled: tasks.filter((t) => t.status === "cancelled").length,
		overdue: overdue.length,
		byPriority: {
			urgent: tasks.filter((t) => t.priority === "urgent").length,
			high: tasks.filter((t) => t.priority === "high").length,
			medium: tasks.filter((t) => t.priority === "medium").length,
			low: tasks.filter((t) => t.priority === "low").length,
		},
	};

	return { success: true, data: stats };
}

interface UlWorkflowStatusRecord {
	taskId?: string;
	phase?: string;
	ownerInstanceId?: string | null;
	updatedAt?: string;
	createdAt?: string;
}

interface UlActiveRegistryRecord {
	activeTaskId?: string | null;
}

/**
 * ownerInstanceId から PID を抽出する
 */
function extractPidFromOwnerInstanceId(ownerInstanceId: string | null | undefined): number | null {
	if (!ownerInstanceId) return null;
	const match = ownerInstanceId.match(/-(\d+)$/);
	if (!match) return null;
	const pid = Number(match[1]);
	return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * プロセスが生存しているか確認する
 */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * ULタスクの孤立データを掃除する
 * - owner が死んでいる
 * - owner が null で長時間放置されている
 */
function cleanupDeadOwnerUlWorkflowTasks(): number {
	if (!existsSync(UL_TASKS_DIR)) {
		return 0;
	}

	const terminalPhases = new Set(["completed", "aborted"]);
	const staleUnownedMs = 30 * 60 * 1000; // 30分
	const now = Date.now();
	let activeTaskId: string | null = null;

	if (existsSync(UL_ACTIVE_FILE)) {
		try {
			const activeRaw = readFileSync(UL_ACTIVE_FILE, "utf-8");
			const registry = JSON.parse(activeRaw) as UlActiveRegistryRecord;
			activeTaskId = registry.activeTaskId ?? null;
		} catch {
			activeTaskId = null;
		}
	}

	let deletedCount = 0;

	try {
		const taskDirs = readdirSync(UL_TASKS_DIR)
			.filter((name) => statSync(join(UL_TASKS_DIR, name)).isDirectory());

		for (const taskDirName of taskDirs) {
			const statusPath = join(UL_TASKS_DIR, taskDirName, "status.json");
			if (!existsSync(statusPath)) {
				continue;
			}

			try {
				const statusRaw = readFileSync(statusPath, "utf-8");
				const status = JSON.parse(statusRaw) as UlWorkflowStatusRecord;
				const taskId = status.taskId || taskDirName;
				const phase = status.phase || "unknown";
				const ownerPid = extractPidFromOwnerInstanceId(status.ownerInstanceId);
				const isActiveTask = activeTaskId === taskId;
				const updatedAtMs = status.updatedAt ? Date.parse(status.updatedAt) : NaN;
				const createdAtMs = status.createdAt ? Date.parse(status.createdAt) : NaN;
				const baseTimeMs = Number.isFinite(updatedAtMs)
					? updatedAtMs
					: (Number.isFinite(createdAtMs) ? createdAtMs : 0);
				const isStaleUnowned = baseTimeMs > 0 && now - baseTimeMs > staleUnownedMs;

				// owner が死んでいれば削除
				if (ownerPid && !isProcessAlive(ownerPid)) {
					rmSync(join(UL_TASKS_DIR, taskDirName), { recursive: true, force: true });
					deletedCount++;
					continue;
				}

				// owner がないタスクは終端か stale なら削除
				if (!ownerPid) {
					if (terminalPhases.has(phase) || (!isActiveTask && isStaleUnowned)) {
						rmSync(join(UL_TASKS_DIR, taskDirName), { recursive: true, force: true });
						deletedCount++;
					}
				}
			} catch {
				// 個別タスク破損時はスキップ
			}
		}
	} catch {
		// クリーンアップ失敗時でも API 応答を優先
	}

	if (deletedCount > 0) {
		invalidateCache();
	}

	return deletedCount;
}

// ============================================
// UL Workflow Task Handlers (Read-only)
// ============================================

function handleGetUlWorkflowTasks(): ApiResponse {
	try {
		cleanupDeadOwnerUlWorkflowTasks();
		const tasks = getAllUlWorkflowTasks();
		return { success: true, data: tasks, total: tasks.length };
	} catch (error) {
		return { success: false, error: "Failed to load UL workflow tasks" };
	}
}

function handleGetUlWorkflowTask(id: string): ApiResponse {
	try {
		const taskId = id.startsWith("ul-") ? id.slice(3) : id;
		const task = getUlWorkflowTask(taskId);
		if (!task) {
			return { success: false, error: `Task not found: ${id}` };
		}
		return { success: true, data: task };
	} catch (error) {
		return { success: false, error: "Failed to load task" };
	}
}

function handleGetActiveUlWorkflowTask(): ApiResponse {
	try {
		const task = getActiveUlWorkflowTask();
		return { success: true, data: task };
	} catch (error) {
		return { success: false, error: `Failed to load active UL workflow task: ${error}` };
	}
}

// ============================================
// Request Router
// ============================================

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const { path, query } = parseUrl(req.url || "/");
	const method = req.method || "GET";

	// CORS headers
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}

	try {
		// GET /api/tasks - List tasks
		if (method === "GET" && path === "/api/tasks") {
			sendJson(res, 200, handleGetTasks(query));
			return;
		}

		// GET /api/tasks/stats - Get statistics
		if (method === "GET" && path === "/api/tasks/stats") {
			sendJson(res, 200, handleGetStats());
			return;
		}

		// GET /api/tasks/:id - Get single task
		const getMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
		if (method === "GET" && getMatch) {
			sendJson(res, 200, handleGetTask(getMatch[1]));
			return;
		}

		// POST /api/tasks - Create task
		if (method === "POST" && path === "/api/tasks") {
			let body;
			try {
				body = JSON.parse(await readBody(req));
			} catch {
				sendJson(res, 400, { success: false, error: "Invalid JSON" });
				return;
			}
			sendJson(res, 201, handleCreateTask(body));
			return;
		}

		// PUT /api/tasks/:id - Update task
		if (method === "PUT" && getMatch) {
			let body;
			try {
				body = JSON.parse(await readBody(req));
			} catch {
				sendJson(res, 400, { success: false, error: "Invalid JSON" });
				return;
			}
			sendJson(res, 200, handleUpdateTask(getMatch[1], body));
			return;
		}

		// PATCH /api/tasks/:id/complete - Complete task
		const completeMatch = path.match(/^\/api\/tasks\/([^/]+)\/complete$/);
		if (method === "PATCH" && completeMatch) {
			sendJson(res, 200, handleCompleteTask(completeMatch[1]));
			return;
		}

		// DELETE /api/tasks/:id - Delete task
		const deleteMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
		if (method === "DELETE" && deleteMatch) {
			sendJson(res, 200, handleDeleteTask(deleteMatch[1]));
			return;
		}

		// GET /api/ul-workflow/tasks/active - Get active UL workflow task
		if (method === "GET" && path === "/api/ul-workflow/tasks/active") {
			sendJson(res, 200, handleGetActiveUlWorkflowTask());
			return;
		}

		// GET /api/ul-workflow/tasks/:id - Get single UL workflow task
		const ulTaskMatch = path.match(/^\/api\/ul-workflow\/tasks\/([^/]+)$/);
		if (method === "GET" && ulTaskMatch) {
			sendJson(res, 200, handleGetUlWorkflowTask(ulTaskMatch[1]));
			return;
		}

		// GET /api/ul-workflow/tasks - Get all UL workflow tasks
		if (method === "GET" && path === "/api/ul-workflow/tasks") {
			sendJson(res, 200, handleGetUlWorkflowTasks());
			return;
		}

		// Health check
		if (method === "GET" && path === "/health") {
			sendJson(res, 200, { success: true, data: { status: "ok" } });
			return;
		}

		// Serve static files from public directory
		if (method === "GET") {
			const publicDir = join(process.cwd(), "public");
			const staticFile = await serveStatic(path, publicDir, res);
			if (staticFile) return;
		}

		// 404 for unknown routes
		sendJson(res, 404, { success: false, error: "Not found" });
	} catch (error) {
		console.error(`[API] Error:`, error);
		sendJson(res, 500, { success: false, error: "Internal server error" });
	}
}

// ============================================
// Server Management
// ============================================

function startServer(port: number = DEFAULT_PORT): Promise<number> {
	return new Promise((resolve, reject) => {
		if (server) {
			reject(new Error("Server already running"));
			return;
		}

		server = createServer(handleRequest);

		server.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				reject(new Error(`Port ${port} is already in use`));
			} else {
				reject(err);
			}
		});

		server.listen(port, () => {
			console.log(`[API] Server started on port ${port}`);
			resolve(port);
		});
	});
}

function stopServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!server) {
			resolve();
			return;
		}

		server.close((err) => {
			if (err) {
				reject(err);
			} else {
				server = null;
				console.log("[API] Server stopped");
				resolve();
			}
		});
	});
}

// ============================================
// Extension Registration
// ============================================

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function (pi: ExtensionAPI) {
	if (isInitialized) return;
	isInitialized = true;

	// Auto-start server on session start (can be disabled via PI_API_AUTO_START=false)
	pi.on("session_start", async (_event, ctx) => {
		const autoStart = process.env.PI_API_AUTO_START !== "false";

		if (!autoStart) {
			return;
		}

		// Check if already running
		if (server) {
			return;
		}

		const port = parseInt(process.env.PI_API_PORT || "") || DEFAULT_PORT;
		try {
			await startServer(port);
			ctx.ui.notify(`Task API auto-started on port ${port}`, "info");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Task API auto-start failed: ${message}`, "warning");
		}
	});

	// Cleanup on shutdown
	pi.on("session_shutdown", async () => {
		await stopServer();
		isInitialized = false;
	});

	// Tool: Start API server
	pi.registerTool({
		name: "api_start",
		label: "Start API Server",
		description: "Start the REST API server for task management",
		parameters: Type.Object({
			port: Type.Optional(Type.Number({ description: `Port number (default: ${DEFAULT_PORT})` })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("api_start" as OperationType, String(params.port || DEFAULT_PORT), {
				task: `port ${params.port || DEFAULT_PORT}`,
				params: {},
			});

			try {
				const port = await startServer(params.port);
				return {
					content: [{ type: "text", text: `API server started on port ${port}\n\nEndpoints:\n- GET /api/tasks - List tasks\n- GET /api/tasks/:id - Get task\n- POST /api/tasks - Create task\n- PUT /api/tasks/:id - Update task\n- DELETE /api/tasks/:id - Delete task\n- PATCH /api/tasks/:id/complete - Complete task\n- GET /api/tasks/stats - Statistics\n- GET /health - Health check` }],
					details: { port }
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: "Failed to start API server" }],
					details: {}
				};
			}
		},
	});

	// Tool: Stop API server
	pi.registerTool({
		name: "api_stop",
		label: "Stop API Server",
		description: "Stop the REST API server",
		parameters: Type.Object({}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			try {
				await stopServer();
				return {
					content: [{ type: "text", text: "API server stopped" }],
					details: {}
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `Failed to stop server: ${error}` }],
					details: {}
				};
			}
		},
	});

	// Slash command: /api
	pi.registerCommand("api", {
		description: "Manage REST API server (start/stop)",
		handler: async (args, ctx) => {
			const argList = (args || "").trim().split(/\s+/);
			const subCommand = argList[0];

			if (subCommand === "start") {
				const port = argList[1] ? parseInt(argList[1], 10) : DEFAULT_PORT;
				if (isNaN(port)) {
					ctx.ui.notify("Invalid port number", "error");
					return;
				}
				try {
					await startServer(port);
					ctx.ui.notify(`API server started on port ${port}`, "info");
				} catch (error) {
					ctx.ui.notify(`Failed to start: ${error}`, "error");
				}
				return;
			}

			if (subCommand === "stop") {
				await stopServer();
				ctx.ui.notify("API server stopped", "info");
				return;
			}

			ctx.ui.notify(
				"Usage:\n" +
				"  /api start [port] - Start server (default port: 3456)\n" +
				"  /api stop - Stop server",
				"info"
			);
		},
	});
}

export { startServer, stopServer, DEFAULT_PORT };

// Check if API server is running
function isApiServerRunning(): boolean {
	return server !== null;
}

// Get API server port (returns null if not running)
function getApiServerPort(): number | null {
	if (!server) return null;
	const address = server.address();
	if (typeof address === "object" && address !== null) {
		return address.port;
	}
	return null;
}

export { isApiServerRunning, getApiServerPort };
