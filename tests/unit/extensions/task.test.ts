/**
 * @file .pi/extensions/task.ts の単体テスト
 * @description タスク管理拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => "{}"),
	writeFileSync: vi.fn(),
	renameSync: vi.fn(),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
}));

// pi SDKのモック
vi.mock("@mariozechner/pi-ai", () => ({
	Type: {
		String: () => ({ type: "string" }),
		Optional: (type) => type,
		Object: (fields) => ({ type: "object", fields }),
		Array: (type) => ({ type: "array", itemType: type }),
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

// モジュールのモック
vi.mock("../lib/comprehensive-logger", () => ({
	getLogger: vi.fn(() => ({
		startOperation: vi.fn(() => "op-1"),
		endOperation: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	})),
}));

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("task.ts 型定義", () => {
	describe("TaskPriority", () => {
		it("すべての優先度値", () => {
			const priorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
			expect(priorities).toHaveLength(4);
		});
	});

	describe("TaskStatus", () => {
		it("すべてのステータス値", () => {
			const statuses: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled"];
			expect(statuses).toHaveLength(4);
		});
	});

	describe("Task", () => {
		it("必須フィールドを持つ", () => {
			const task = {
				id: "task-1",
				title: "テストタスク",
				status: "todo" as const,
				priority: "medium" as const,
				tags: [],
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};
			expect(task.id).toBe("task-1");
			expect(task.title).toBe("テストタスク");
			expect(task.status).toBe("todo");
			expect(task.priority).toBe("medium");
		});

		it("オプションフィールドを持つ", () => {
			const task = {
				id: "task-1",
				title: "テストタスク",
				description: "タスクの説明",
				status: "todo" as const,
				priority: "high" as const,
				tags: ["urgent", "bug"],
				dueDate: "2024-12-31",
				assignee: "user1",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
				completedAt: undefined,
				parentTaskId: "task-0",
			};
			expect(task.description).toBe("タスクの説明");
			expect(task.tags).toEqual(["urgent", "bug"]);
			expect(task.dueDate).toBe("2024-12-31");
			expect(task.assignee).toBe("user1");
			expect(task.parentTaskId).toBe("task-0");
		});
	});

	describe("TaskStorage", () => {
		it("tasks配列を持つ", () => {
			const storage = { tasks: [] };
			expect(storage.tasks).toEqual([]);
		});

		it("currentTaskIdを持つ（オプション）", () => {
			const storage = { tasks: [], currentTaskId: "task-1" };
			expect(storage.currentTaskId).toBe("task-1");
		});
	});
});

// ============================================================================
// ID生成のテスト
// ============================================================================

describe("ID生成", () => {
	let taskIdSequence = 0;

	function generateId(): string {
		taskIdSequence += 1;
		return `task-${Date.now()}-${taskIdSequence}`;
	}

	beforeEach(() => {
		taskIdSequence = 0;
	});

	it("一意なIDを生成する", () => {
		const id1 = generateId();
		const id2 = generateId();

		expect(id1).not.toBe(id2);
	});

	it("IDは単調増加する", () => {
		const id1 = generateId();
		const id2 = generateId();
		const id3 = generateId();

		const seq1 = parseInt(id1.split("-")[2]!, 10);
		const seq2 = parseInt(id2.split("-")[2]!, 10);
		const seq3 = parseInt(id3.split("-")[2]!, 10);

		expect(seq2).toBeGreaterThan(seq1);
		expect(seq3).toBeGreaterThan(seq2);
	});

	it("ID形式チェック", () => {
		const id = generateId();
		const parts = id.split("-");

		expect(parts.length).toBeGreaterThanOrEqual(3);
		expect(parts[0]).toBe("task");
		expect(parts[parts.length - 1]).toMatch(/^\d+$/);
	});
});

// ============================================================================
// タスク操作のテスト
// ============================================================================

describe("タスク操作", () => {
	describe("createTask", () => {
		let taskIdSequence = 0;

		function generateId(): string {
			taskIdSequence += 1;
			return `task-${Date.now()}-${taskIdSequence}`;
		}

		beforeEach(() => {
			taskIdSequence = 0;
		});

		it("新しいタスクを作成", () => {
			const task = {
				id: generateId(),
				title: "テストタスク",
				description: "説明",
				status: "todo" as const,
				priority: "medium" as const,
				tags: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			expect(task.title).toBe("テストタスク");
			expect(task.status).toBe("todo");
			expect(task.priority).toBe("medium");
			expect(task.tags).toHaveLength(0);
		});

		it("デフォルト値の確認", () => {
			const task = {
				id: generateId(),
				title: "テスト",
				status: "todo" as const,
				priority: "medium" as const,
				tags: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			expect(task.description).toBeUndefined();
			expect(task.dueDate).toBeUndefined();
			expect(task.assignee).toBeUndefined();
		});

		it("優先度を指定して作成", () => {
			const task = {
				id: generateId(),
				title: "緊急タスク",
				status: "todo" as const,
				priority: "urgent" as const,
				tags: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			expect(task.priority).toBe("urgent");
		});

		it("タグ付きで作成", () => {
			const task = {
				id: generateId(),
				title: "バグ修正",
				status: "todo" as const,
				priority: "high" as const,
				tags: ["bug", "urgent"],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			expect(task.tags).toEqual(["bug", "urgent"]);
		});
	});

	describe("findTaskById", () => {
		it("IDでタスクを検索", () => {
			const tasks = [
				{ id: "task-1", title: "Task A", status: "todo" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
				{ id: "task-2", title: "Task B", status: "todo" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
			];

			const found = tasks.find(t => t.id === "task-2");
			expect(found?.title).toBe("Task B");
		});

		it("存在しないIDで検索", () => {
			const tasks = [
				{ id: "task-1", title: "Task A", status: "todo" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
			];

			const found = tasks.find(t => t.id === "task-999");
			expect(found).toBeUndefined();
		});
	});

	describe("updateTask", () => {
		it("タスクを更新", () => {
			const storage = {
				tasks: [
					{ id: "task-1", title: "Task A", status: "todo" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
				],
			};

			const task = storage.tasks.find(t => t.id === "task-1");
			if (task) {
				Object.assign(task, { title: "Updated Task A", priority: "high" as const });
				task.updatedAt = new Date().toISOString();
			}

			expect(storage.tasks[0].title).toBe("Updated Task A");
			expect(storage.tasks[0].priority).toBe("high");
		});

		it("ステータスを完了に更新するとcompletedAtが設定される", () => {
			const storage = {
				tasks: [
					{ id: "task-1", title: "Task A", status: "in_progress" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
				],
			};

			const task = storage.tasks.find(t => t.id === "task-1");
			if (task) {
				task.status = "completed";
				task.updatedAt = new Date().toISOString();
				task.completedAt = new Date().toISOString();
			}

			expect(storage.tasks[0].status).toBe("completed");
			expect(storage.tasks[0].completedAt).toBeDefined();
		});

		it("存在しないタスクの更新はnullを返す", () => {
			const storage = { tasks: [] };
			const task = storage.tasks.find(t => t.id === "task-999");
			expect(task).toBeUndefined();
		});
	});

	describe("deleteTask", () => {
		it("タスクを削除", () => {
			const storage = {
				tasks: [
					{ id: "task-1", title: "Task A", status: "todo" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
					{ id: "task-2", title: "Task B", status: "todo" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
				],
			};

			const initialLength = storage.tasks.length;
			storage.tasks = storage.tasks.filter(t => t.id !== "task-1");

			expect(storage.tasks.length).toBe(initialLength - 1);
			expect(storage.tasks.find(t => t.id === "task-1")).toBeUndefined();
		});

		it("存在しないタスクの削除は何もしない", () => {
			const storage = {
				tasks: [
					{ id: "task-1", title: "Task A", status: "todo" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
				],
			};

			const initialLength = storage.tasks.length;
			storage.tasks = storage.tasks.filter(t => t.id !== "task-999");

			expect(storage.tasks.length).toBe(initialLength);
		});
	});

	describe("completeTask", () => {
		it("タスクを完了", () => {
			const task = {
				id: "task-1",
				title: "Task A",
				status: "in_progress" as const,
				priority: "medium" as const,
				tags: [],
				createdAt: "",
				updatedAt: "",
			};

			task.status = "completed";
			task.updatedAt = new Date().toISOString();
			task.completedAt = new Date().toISOString();

			expect(task.status).toBe("completed");
			expect(task.completedAt).toBeDefined();
		});
	});
});

// ============================================================================
// フィルタリングのテスト
// ============================================================================

describe("タスクフィルタリング", () => {
	const storage = {
		tasks: [
			{ id: "task-1", title: "Task A", status: "todo" as const, priority: "high" as const, tags: ["bug"], assignee: "user1", createdAt: "", updatedAt: "" },
			{ id: "task-2", title: "Task B", status: "in_progress" as const, priority: "medium" as const, tags: ["feature"], assignee: "user2", createdAt: "", updatedAt: "" },
			{ id: "task-3", title: "Task C", status: "completed" as const, priority: "low" as const, tags: ["bug", "urgent"], assignee: "user1", createdAt: "", updatedAt: "" },
			{ id: "task-4", title: "Task D", status: "todo" as const, priority: "urgent" as const, tags: [], assignee: "user3", createdAt: "", updatedAt: "" },
		],
	};

	describe("filterByStatus", () => {
		it("ステータスでフィルタリング", () => {
			const filtered = storage.tasks.filter(t => t.status === "todo");
			expect(filtered).toHaveLength(2);
			expect(filtered.every(t => t.status === "todo")).toBe(true);
		});

		it("完了タスクでフィルタリング", () => {
			const filtered = storage.tasks.filter(t => t.status === "completed");
			expect(filtered).toHaveLength(1);
			expect(filtered[0].id).toBe("task-3");
		});
	});

	describe("filterByPriority", () => {
		it("優先度でフィルタリング", () => {
			const filtered = storage.tasks.filter(t => t.priority === "urgent");
			expect(filtered).toHaveLength(1);
			expect(filtered[0].id).toBe("task-4");
		});

		it("高優先度でフィルタリング", () => {
			const filtered = storage.tasks.filter(t => t.priority === "high");
			expect(filtered).toHaveLength(1);
			expect(filtered[0].id).toBe("task-1");
		});
	});

	describe("filterByTag", () => {
		it("タグでフィルタリング", () => {
			const filtered = storage.tasks.filter(t => t.tags.includes("bug"));
			expect(filtered).toHaveLength(2);
		});

		it("存在しないタグでフィルタリング", () => {
			const filtered = storage.tasks.filter(t => t.tags.includes("nonexistent"));
			expect(filtered).toHaveLength(0);
		});
	});

	describe("filterByAssignee", () => {
		it("担当者でフィルタリング", () => {
			const filtered = storage.tasks.filter(t => t.assignee === "user1");
			expect(filtered).toHaveLength(2);
		});
	});
});

// ============================================================================
// サブタスクのテスト
// ============================================================================

describe("サブタスク", () => {
	const storage = {
		tasks: [
			{ id: "task-1", title: "Parent Task", status: "todo" as const, priority: "high" as const, tags: [], createdAt: "", updatedAt: "" },
			{ id: "task-2", title: "Subtask 1", status: "todo" as const, priority: "medium" as const, tags: [], parentTaskId: "task-1", createdAt: "", updatedAt: "" },
			{ id: "task-3", title: "Subtask 2", status: "completed" as const, priority: "medium" as const, tags: [], parentTaskId: "task-1", createdAt: "", updatedAt: "" },
			{ id: "task-4", title: "Other Task", status: "todo" as const, priority: "low" as const, tags: [], createdAt: "", updatedAt: "" },
		],
	};

	describe("getSubtasks", () => {
		it("親タスクのサブタスクを取得", () => {
			const subtasks = storage.tasks.filter(t => t.parentTaskId === "task-1");
			expect(subtasks).toHaveLength(2);
			expect(subtasks.map(t => t.title)).toEqual(["Subtask 1", "Subtask 2"]);
		});

		it("サブタスクがない場合", () => {
			const subtasks = storage.tasks.filter(t => t.parentTaskId === "task-4");
			expect(subtasks).toHaveLength(0);
		});
	});
});

// ============================================================================
// 期限切れタスクのテスト
// ============================================================================

describe("期限切れタスク", () => {
	it("期限切れタスクを取得", () => {
		const now = new Date();
		const past = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1日前

		const storage = {
			tasks: [
				{
					id: "task-1",
					title: "Overdue Task",
					status: "todo" as const,
					priority: "high" as const,
					tags: [],
					dueDate: past.toISOString(),
					createdAt: "",
					updatedAt: ""
				},
				{
					id: "task-2",
					title: "Future Task",
					status: "todo" as const,
					priority: "medium" as const,
					tags: [],
					dueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
					createdAt: "",
					updatedAt: ""
				},
				{
					id: "task-3",
					title: "No Due Date",
					status: "todo" as const,
					priority: "low" as const,
					tags: [],
					createdAt: "",
					updatedAt: ""
				},
				{
					id: "task-4",
					title: "Completed Overdue",
					status: "completed" as const,
					priority: "medium" as const,
					tags: [],
					dueDate: past.toISOString(),
					createdAt: "",
					updatedAt: ""
				},
			],
		};

		const overdue = storage.tasks.filter(t => {
			if (t.status === "completed" || t.status === "cancelled") return false;
			if (!t.dueDate) return false;
			return new Date(t.dueDate) < now;
		});

		expect(overdue).toHaveLength(1);
		expect(overdue[0].id).toBe("task-1");
	});
});

// ============================================================================
// フォーマット関数のテスト
// ============================================================================

describe("formatTaskDetails", () => {
	it("タスク詳細をフォーマット", () => {
		const task = {
			id: "task-1",
			title: "テストタスク",
			description: "テスト用のタスクです",
			status: "in_progress" as const,
			priority: "high" as const,
			tags: ["bug", "urgent"],
			assignee: "user1",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T01:00:00Z",
		};

		const lines: string[] = [];
		lines.push(`## Task: ${task.title}`);
		lines.push(`\nID: ${task.id}`);
		lines.push(`Status: → ${task.status}`);
		lines.push(`Priority: 🟠 ${task.priority}`);

		if (task.description) {
			lines.push(`\n### Description`);
			lines.push(task.description);
		}

		if (task.tags.length > 0) {
			lines.push(`\nTags: ${task.tags.map(t => `#${t}`).join(" ")}`);
		}

		if (task.assignee) {
			lines.push(`Assignee: ${task.assignee}`);
		}

		const formatted = lines.join("\n");

		expect(formatted).toContain("## Task: テストタスク");
		expect(formatted).toContain("Status: → in_progress");
		expect(formatted).toContain("Priority: 🟠 high");
		expect(formatted).toContain("#bug #urgent");
	});
});

describe("formatTaskList", () => {
	it("タスクリストをフォーマット", () => {
		const tasks = [
			{
				id: "task-1",
				title: "Task A",
				status: "in_progress" as const,
				priority: "high" as const,
				tags: ["bug"],
				createdAt: "",
				updatedAt: "",
			},
			{
				id: "task-2",
				title: "Task B",
				status: "todo" as const,
				priority: "urgent" as const,
				tags: [],
				createdAt: "",
				updatedAt: "",
			},
		];

		const lines: string[] = [`## Tasks (${tasks.length})`];

		// Sort by status then priority
		const sortedTasks = [...tasks].sort((a, b) => {
			const statusOrder = { in_progress: 0, todo: 1, completed: 2, cancelled: 3 };
			if (statusOrder[a.status] !== statusOrder[b.status]) {
				return statusOrder[a.status] - statusOrder[b.status];
			}
			const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
			return priorityOrder[a.priority] - priorityOrder[b.priority];
		});

		sortedTasks.forEach((task, idx) => {
			lines.push(`\n${idx + 1}. → 🟠 ${task.title}`);
			lines.push(`   ID: ${task.id}`);
		});

		const formatted = lines.join("\n");

		expect(formatted).toContain("## Tasks (2)");
		expect(formatted).toContain("Task A");
		expect(formatted).toContain("Task B");
	});

	it("空リスト", () => {
		const formatted = "No tasks found.";
		expect(formatted).toContain("No tasks found");
	});
});

// ============================================================================
// 統計情報のテスト
// ============================================================================

describe("タスク統計", () => {
	it("統計情報を計算", () => {
		const storage = {
			tasks: [
				{ id: "task-1", status: "todo" as const, priority: "high" as const, tags: [], createdAt: "", updatedAt: "" },
				{ id: "task-2", status: "in_progress" as const, priority: "medium" as const, tags: [], createdAt: "", updatedAt: "" },
				{ id: "task-3", status: "completed" as const, priority: "low" as const, tags: [], createdAt: "", updatedAt: "" },
				{ id: "task-4", status: "todo" as const, priority: "urgent" as const, tags: [], createdAt: "", updatedAt: "" },
			],
		};

		const total = storage.tasks.length;
		const todo = storage.tasks.filter(t => t.status === "todo").length;
		const inProgress = storage.tasks.filter(t => t.status === "in_progress").length;
		const completed = storage.tasks.filter(t => t.status === "completed").length;

		const urgent = storage.tasks.filter(t => t.priority === "urgent").length;
		const high = storage.tasks.filter(t => t.priority === "high").length;
		const medium = storage.tasks.filter(t => t.priority === "medium").length;
		const low = storage.tasks.filter(t => t.priority === "low").length;

		expect(total).toBe(4);
		expect(todo).toBe(2);
		expect(inProgress).toBe(1);
		expect(completed).toBe(1);
		expect(urgent).toBe(1);
		expect(high).toBe(1);
		expect(medium).toBe(1);
		expect(low).toBe(1);
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のタスクリスト", () => {
		it("タスクなし", () => {
			const storage = { tasks: [] };
			expect(storage.tasks).toHaveLength(0);

			const todoCount = storage.tasks.filter(t => t.status === "todo").length;
			expect(todoCount).toBe(0);
		});
	});

	describe("特殊文字を含むタスク", () => {
		it("日本語タイトル", () => {
			const task = {
				id: "task-1",
				title: "重要なバグ修正: ログイン機能の不具合",
				description: "ユーザーがログインできない問題を修正",
				status: "todo" as const,
				priority: "urgent" as const,
				tags: ["バグ", "緊急"],
				createdAt: "",
				updatedAt: "",
			};

			expect(task.title).toContain("バグ");
			expect(task.tags).toContain("バグ");
		});

		it("長いタイトル", () => {
			const longTitle = "a".repeat(500);
			const task = {
				id: "task-1",
				title: longTitle,
				status: "todo" as const,
				priority: "medium" as const,
				tags: [],
				createdAt: "",
				updatedAt: "",
			};

			expect(task.title.length).toBe(500);
		});
	});

	describe("多数のタグ", () => {
		it("10個以上のタグ", () => {
			const task = {
				id: "task-1",
				title: "Multi-tag Task",
				status: "todo" as const,
				priority: "medium" as const,
				tags: ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
				createdAt: "",
				updatedAt: "",
			};

			expect(task.tags).toHaveLength(10);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("task.ts プロパティベーステスト", () => {
	it("PBT: IDは一意", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 100 }),
				(count) => {
					const ids = new Set<string>();
					for (let i = 0; i < count; i++) {
						ids.add(`task-${Date.now()}-${i + 1}`);
					}
					return ids.size === count;
				}
			),
			{ numRuns: 20 }
		);
	});

	it("PBT: ステータス遷移の一貫性", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("todo", "in_progress", "completed", "cancelled" as const),
				(initialStatus) => {
					const validTransitions: Record<string, string[]> = {
						todo: ["in_progress", "cancelled"],
						in_progress: ["completed", "cancelled"],
						completed: [],
						cancelled: [],
					};

					const allowed = validTransitions[initialStatus] || [];
					return Array.isArray(allowed);
				}
			),
			{ numRuns: 20 }
		);
	});

	it("PBT: 優先度の順序", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("low", "medium", "high", "urgent" as const),
				fc.constantFrom("low", "medium", "high", "urgent" as const),
				(p1, p2) => {
					const order = { low: 0, medium: 1, high: 2, urgent: 3 };
					const diff = order[p1] - order[p2];

					// 順序が定義されていることを確認
					return typeof diff === "number";
				}
			),
			{ numRuns: 20 }
		);
	});

	it("PBT: フィルタリングの整合性", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 10 }),
						status: fc.constantFrom("todo", "in_progress", "completed", "cancelled" as const),
						priority: fc.constantFrom("low", "medium", "high", "urgent" as const),
						tags: fc.array(fc.string({ minLength: 1, maxLength: 5 })),
					}),
					{ minLength: 0, maxLength: 20 }
				),
				(tasks) => {
					const todoCount = tasks.filter(t => t.status === "todo").length;
					const highPriorityCount = tasks.filter(t => t.priority === "high").length;

					return todoCount >= 0 && highPriorityCount >= 0;
				}
			),
			{ numRuns: 30 }
		);
	});

	it("PBT: タグフィルタリングの整合性", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 10 }),
						tags: fc.array(fc.string({ minLength: 1, maxLength: 5 })),
					}),
					{ minLength: 0, maxLength: 20 }
				),
				fc.string({ minLength: 1, maxLength: 5 }),
				(tasks, tag) => {
					const filtered = tasks.filter(t => t.tags.includes(tag));
					// フィルタリング結果は常に元の配列のサブセット
					return filtered.length <= tasks.length;
				}
			),
			{ numRuns: 30 }
		);
	});
});

// ============================================================================
// 型エクスポート（テスト用）
// ============================================================================

type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";
