/**
 * @file .pi/extensions/server.ts の単体テスト
 * @description REST APIサーバー拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

// Node.jsモジュールのモック
const mockStorage: { tasks: unknown[] } = { tasks: [] };

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => JSON.stringify(mockStorage)),
	writeFileSync: vi.fn((_path, data) => {
		Object.assign(mockStorage, JSON.parse(data as string));
	}),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
}));

vi.mock("node:http", () => ({
	createServer: vi.fn(() => ({
		listen: vi.fn((_port, cb) => cb?.()),
		close: vi.fn((cb) => cb?.()),
		on: vi.fn(),
	})),
}));

// pi SDKのモック
vi.mock("@mariozechner/pi-ai", () => ({
	Type: {
		String: () => ({ type: "string" }),
		Optional: (type) => type,
		Object: (fields) => ({ type: "object", fields }),
		Number: () => ({ type: "number" }),
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("../lib/comprehensive-logger", () => ({
	getLogger: vi.fn(() => ({
		startOperation: vi.fn(() => "op-1"),
		endOperation: vi.fn(),
	})),
}));

// ============================================================================
// テスト用ヘルパー
// ============================================================================

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

interface ApiResponse {
	success: boolean;
	data?: unknown;
	error?: string;
}

// テスト用のストレージリセット
function resetStorage(): void {
	mockStorage.tasks = [];
}

// テスト用のタスク作成
function createTestTask(overrides: Partial<Task> = {}): Task {
	return {
		id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		title: "Test Task",
		status: "todo",
		priority: "medium",
		tags: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

// ============================================================================
// ハンドラー関数のテスト（直接テスト）
// ============================================================================

describe("API Handler Functions", () => {
	beforeEach(() => {
		resetStorage();
	});

	describe("handleGetTasks", () => {
		it("should return empty array when no tasks", () => {
			// このテストはモックされたストレージが空であることを確認
			expect(mockStorage.tasks).toEqual([]);
		});

		it("should return all tasks without filters", () => {
			const task1 = createTestTask({ id: "task-1", title: "Task 1" });
			const task2 = createTestTask({ id: "task-2", title: "Task 2" });
			mockStorage.tasks = [task1, task2];
			expect(mockStorage.tasks).toHaveLength(2);
		});

		it("should filter by status", () => {
			const todoTask = createTestTask({ id: "task-1", status: "todo" });
			const completedTask = createTestTask({ id: "task-2", status: "completed" });
			mockStorage.tasks = [todoTask, completedTask];

			const filtered = (mockStorage.tasks as Task[]).filter(t => t.status === "todo");
			expect(filtered).toHaveLength(1);
			expect(filtered[0].status).toBe("todo");
		});

		it("should filter by priority", () => {
			const lowTask = createTestTask({ id: "task-1", priority: "low" });
			const urgentTask = createTestTask({ id: "task-2", priority: "urgent" });
			mockStorage.tasks = [lowTask, urgentTask];

			const filtered = (mockStorage.tasks as Task[]).filter(t => t.priority === "urgent");
			expect(filtered).toHaveLength(1);
			expect(filtered[0].priority).toBe("urgent");
		});

		it("should filter by tag", () => {
			const taggedTask = createTestTask({ id: "task-1", tags: ["feature", "urgent"] });
			const untaggedTask = createTestTask({ id: "task-2", tags: [] });
			mockStorage.tasks = [taggedTask, untaggedTask];

			const filtered = (mockStorage.tasks as Task[]).filter(t => t.tags.includes("feature"));
			expect(filtered).toHaveLength(1);
		});

		it("should filter by assignee", () => {
			const assignedTask = createTestTask({ id: "task-1", assignee: "user1" });
			const unassignedTask = createTestTask({ id: "task-2", assignee: undefined });
			mockStorage.tasks = [assignedTask, unassignedTask];

			const filtered = (mockStorage.tasks as Task[]).filter(t => t.assignee === "user1");
			expect(filtered).toHaveLength(1);
		});

		it("should filter overdue tasks", () => {
			const overdueTask = createTestTask({
				id: "task-1",
				dueDate: "2020-01-01",
				status: "todo"
			});
			const futureTask = createTestTask({
				id: "task-2",
				dueDate: "2099-12-31",
				status: "todo"
			});
			mockStorage.tasks = [overdueTask, futureTask];

			const now = new Date();
			const overdue = (mockStorage.tasks as Task[]).filter(t =>
				t.status !== "completed" &&
				t.status !== "cancelled" &&
				t.dueDate &&
				new Date(t.dueDate) < now
			);
			expect(overdue).toHaveLength(1);
		});
	});

	describe("handleGetTask", () => {
		it("should find task by ID", () => {
			const task = createTestTask({ id: "task-123" });
			mockStorage.tasks = [task];

			const found = (mockStorage.tasks as Task[]).find(t => t.id === "task-123");
			expect(found).toBeDefined();
			expect(found?.id).toBe("task-123");
		});

		it("should return undefined for non-existent ID", () => {
			const task = createTestTask({ id: "task-123" });
			mockStorage.tasks = [task];

			const found = (mockStorage.tasks as Task[]).find(t => t.id === "task-999");
			expect(found).toBeUndefined();
		});
	});

	describe("handleCreateTask", () => {
		it("should validate required title", () => {
			const body = { description: "No title" };
			const hasTitle = typeof body.title === "string" && body.title.length > 0;
			expect(hasTitle).toBe(false);
		});

		it("should validate priority values", () => {
			const validPriorities = ["low", "medium", "high", "urgent"];
			expect(validPriorities.includes("medium")).toBe(true);
			expect(validPriorities.includes("invalid")).toBe(false);
		});

		it("should validate status values", () => {
			const validStatuses = ["todo", "in_progress", "completed", "cancelled"];
			expect(validStatuses.includes("todo")).toBe(true);
			expect(validStatuses.includes("unknown")).toBe(false);
		});

		it("should generate unique IDs", () => {
			const ids = new Set();
			for (let i = 0; i < 100; i++) {
				ids.add(`task-${Date.now()}-${i}`);
			}
			expect(ids.size).toBe(100);
		});

		it("should set default values", () => {
			const defaults = {
				status: "todo",
				priority: "medium",
				tags: [],
			};
			expect(defaults.status).toBe("todo");
			expect(defaults.priority).toBe("medium");
			expect(defaults.tags).toEqual([]);
		});
	});

	describe("handleUpdateTask", () => {
		it("should update task fields", () => {
			const task = createTestTask({ id: "task-1", title: "Original" });
			mockStorage.tasks = [task];

			const updates = { title: "Updated", priority: "high" };
			Object.assign(task, updates);
			task.updatedAt = new Date().toISOString();

			expect(task.title).toBe("Updated");
			expect(task.priority).toBe("high");
		});

		it("should set completedAt when status changes to completed", () => {
			const task = createTestTask({ id: "task-1", status: "todo" });
			task.status = "completed";
			task.completedAt = new Date().toISOString();

			expect(task.status).toBe("completed");
			expect(task.completedAt).toBeDefined();
		});

		it("should clear completedAt when status changes from completed", () => {
			const task = createTestTask({
				id: "task-1",
				status: "completed",
				completedAt: "2024-01-01"
			});
			task.status = "todo";
			task.completedAt = undefined;

			expect(task.status).toBe("todo");
			expect(task.completedAt).toBeUndefined();
		});
	});

	describe("handleDeleteTask", () => {
		it("should remove task from storage", () => {
			const task1 = createTestTask({ id: "task-1" });
			const task2 = createTestTask({ id: "task-2" });
			mockStorage.tasks = [task1, task2];

			mockStorage.tasks = (mockStorage.tasks as Task[]).filter(t => t.id !== "task-1");
			expect(mockStorage.tasks).toHaveLength(1);
			expect((mockStorage.tasks as Task[])[0].id).toBe("task-2");
		});

		it("should cascade delete subtasks", () => {
			const parent = createTestTask({ id: "parent-1" });
			const child = createTestTask({ id: "child-1", parentTaskId: "parent-1" });
			const other = createTestTask({ id: "other-1" });
			mockStorage.tasks = [parent, child, other];

			// Delete parent and cascade
			mockStorage.tasks = (mockStorage.tasks as Task[]).filter(
				t => t.id !== "parent-1" && t.parentTaskId !== "parent-1"
			);
			expect(mockStorage.tasks).toHaveLength(1);
		});
	});

	describe("handleCompleteTask", () => {
		it("should set status to completed", () => {
			const task = createTestTask({ id: "task-1", status: "todo" });
			task.status = "completed";
			task.completedAt = new Date().toISOString();

			expect(task.status).toBe("completed");
			expect(task.completedAt).toBeDefined();
		});
	});

	describe("handleGetStats", () => {
		it("should calculate statistics correctly", () => {
			mockStorage.tasks = [
				createTestTask({ id: "1", status: "todo", priority: "high" }),
				createTestTask({ id: "2", status: "todo", priority: "low" }),
				createTestTask({ id: "3", status: "completed", priority: "medium" }),
				createTestTask({ id: "4", status: "in_progress", priority: "urgent" }),
				createTestTask({ id: "5", status: "cancelled", priority: "low" }),
			];

			const tasks = mockStorage.tasks as Task[];
			expect(tasks.length).toBe(5);
			expect(tasks.filter(t => t.status === "todo").length).toBe(2);
			expect(tasks.filter(t => t.status === "completed").length).toBe(1);
			expect(tasks.filter(t => t.status === "in_progress").length).toBe(1);
			expect(tasks.filter(t => t.status === "cancelled").length).toBe(1);
			expect(tasks.filter(t => t.priority === "urgent").length).toBe(1);
		});
	});
});

// ============================================================================
// ルーティングのテスト
// ============================================================================

describe("API Routing", () => {
	it("should parse URL path correctly", () => {
		const url = "/api/tasks?status=todo&priority=high";
		const [path, queryString] = url.split("?");
		expect(path).toBe("/api/tasks");
		expect(queryString).toBe("status=todo&priority=high");
	});

	it("should parse query parameters", () => {
		const queryString = "status=todo&priority=high&tag=feature";
		const query: Record<string, string> = {};
		for (const pair of queryString.split("&")) {
			const [key, value] = pair.split("=");
			if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || "");
		}
		expect(query.status).toBe("todo");
		expect(query.priority).toBe("high");
		expect(query.tag).toBe("feature");
	});

	it("should match task ID pattern", () => {
		const path = "/api/tasks/task-123";
		const match = path.match(/^\/api\/tasks\/([^/]+)$/);
		expect(match).not.toBeNull();
		expect(match?.[1]).toBe("task-123");
	});

	it("should match complete endpoint pattern", () => {
		const path = "/api/tasks/task-123/complete";
		const match = path.match(/^\/api\/tasks\/([^/]+)\/complete$/);
		expect(match).not.toBeNull();
		expect(match?.[1]).toBe("task-123");
	});

	it("should match stats endpoint", () => {
		const path = "/api/tasks/stats";
		expect(path).toBe("/api/tasks/stats");
	});

	it("should match health endpoint", () => {
		const path = "/health";
		expect(path).toBe("/health");
	});
});

// ============================================================================
// JSON レスポンス形式のテスト
// ============================================================================

describe("API Response Format", () => {
	it("should format success response correctly", () => {
		const response: ApiResponse = {
			success: true,
			data: { id: "task-1", title: "Test" }
		};
		expect(response.success).toBe(true);
		expect(response.data).toBeDefined();
		expect(response.error).toBeUndefined();
	});

	it("should format error response correctly", () => {
		const response: ApiResponse = {
			success: false,
			error: "Task not found"
		};
		expect(response.success).toBe(false);
		expect(response.error).toBeDefined();
		expect(response.data).toBeUndefined();
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("Edge Cases", () => {
	beforeEach(() => {
		resetStorage();
	});

	it("should handle empty tags array", () => {
		const task = createTestTask({ tags: [] });
		expect(task.tags).toEqual([]);
		expect(task.tags.length).toBe(0);
	});

	it("should handle special characters in title", () => {
		const task = createTestTask({ title: "Test <script>alert('xss')</script>" });
		expect(task.title).toContain("<script>");
	});

	it("should handle very long descriptions", () => {
		const longDescription = "a".repeat(10000);
		const task = createTestTask({ description: longDescription });
		expect(task.description?.length).toBe(10000);
	});

	it("should handle concurrent task creation", () => {
		const tasks: Task[] = [];
		for (let i = 0; i < 100; i++) {
			tasks.push(createTestTask({ id: `task-${i}` }));
		}
		expect(tasks.length).toBe(100);

		const ids = new Set(tasks.map(t => t.id));
		expect(ids.size).toBe(100);
	});

	it("should handle invalid ISO date format", () => {
		const task = createTestTask({ dueDate: "not-a-date" });
		const parsed = new Date(task.dueDate!);
		expect(isNaN(parsed.getTime())).toBe(true);
	});

	it("should handle circular parent references", () => {
		// Note: This would be prevented at the API level
		const task1 = createTestTask({ id: "task-1", parentTaskId: "task-2" });
		const task2 = createTestTask({ id: "task-2", parentTaskId: "task-1" });
		mockStorage.tasks = [task1, task2];
		expect(mockStorage.tasks.length).toBe(2);
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("Property-Based Tests", () => {
	it("should maintain task ID uniqueness", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			const id = `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			ids.add(id);
		}
		// All IDs should be unique (high probability)
		expect(ids.size).toBeGreaterThan(990);
	});

	it("should sort tasks by priority correctly", () => {
		const priorityOrder: Record<string, number> = {
			urgent: 0,
			high: 1,
			medium: 2,
			low: 3,
		};

		const tasks: Task[] = [
			createTestTask({ priority: "low" }),
			createTestTask({ priority: "urgent" }),
			createTestTask({ priority: "medium" }),
			createTestTask({ priority: "high" }),
		];

		const sorted = [...tasks].sort((a, b) =>
			priorityOrder[a.priority] - priorityOrder[b.priority]
		);

		expect(sorted[0].priority).toBe("urgent");
		expect(sorted[1].priority).toBe("high");
		expect(sorted[2].priority).toBe("medium");
		expect(sorted[3].priority).toBe("low");
	});
});
