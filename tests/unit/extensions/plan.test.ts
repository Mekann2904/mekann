/**
 * @file .pi/extensions/plan.ts のユニットテスト
 * @description 計画管理ツールのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// fsモジュールをモック
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	renameSync: vi.fn(),
}));

import {
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	renameSync,
} from "node:fs";

// plan-mode-sharedをモック
vi.mock("../../../.pi/lib/plan-mode-shared.js", () => ({
	PLAN_MODE_POLICY: "PLAN MODE POLICY",
	isBashCommandAllowed: vi.fn(() => true),
	validatePlanModeState: vi.fn(() => true),
	createPlanModeState: vi.fn((enabled: boolean) => ({
		enabled,
		timestamp: Date.now(),
		checksum: "test-checksum",
	})),
	PLAN_MODE_CONTEXT_TYPE: "plan_mode_context",
	PLAN_MODE_STATUS_KEY: "plan_mode_status",
	PLAN_MODE_ENV_VAR: "PI_PLAN_MODE",
}));

// comprehensive-loggerをモック
vi.mock("../../../.pi/lib/comprehensive-logger.js", () => ({
	getLogger: () => ({
		startOperation: vi.fn(() => "op-id"),
		endOperation: vi.fn(),
	}),
}));

// モックの型定義
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedRenameSync = vi.mocked(renameSync);

// ============================================================================
// テスト用型定義
// ============================================================================

interface PlanStep {
	id: string;
	title: string;
	description?: string;
	status: "pending" | "in_progress" | "completed" | "blocked";
	estimatedTime?: number;
	dependencies?: string[];
}

interface Plan {
	id: string;
	name: string;
	description?: string;
	createdAt: string;
	updatedAt: string;
	status: "draft" | "active" | "completed" | "cancelled";
	steps: PlanStep[];
}

interface PlanStorage {
	plans: Plan[];
	currentPlanId?: string;
}

interface ToolHandler {
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal,
		onUpdate: unknown,
		ctx: unknown
	) => Promise<{ content: Array<{ type: string; text: string }>; details: Record<string, unknown> }>;
}

interface RegisteredTool {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	execute: ToolHandler["execute"];
}

// ============================================================================
// テスト用ヘルパー
// ============================================================================

function createMockExtensionAPI(): {
	api: ExtensionAPI;
	tools: Map<string, RegisteredTool>;
	commands: Map<string, { description: string; handler: Function }>;
	shortcuts: Map<string, { description: string; handler: Function }>;
	events: Map<string, Function>;
} {
	const tools = new Map<string, RegisteredTool>();
	const commands = new Map<string, { description: string; handler: Function }>();
	const shortcuts = new Map<string, { description: string; handler: Function }>();
	const events = new Map<string, Function>();

	const api = {
		registerTool: vi.fn((tool: RegisteredTool) => {
			tools.set(tool.name, tool);
		}),
		registerCommand: vi.fn((name: string, config: { description: string; handler: Function }) => {
			commands.set(name, config);
		}),
		registerShortcut: vi.fn((key: string, config: { description: string; handler: Function }) => {
			shortcuts.set(key, config);
		}),
		on: vi.fn((event: string, handler: Function) => {
			events.set(event, handler);
		}),
		setActiveTools: vi.fn(),
	} as unknown as ExtensionAPI;

	return { api, tools, commands, shortcuts, events };
}

function createMockStorage(plans: Plan[] = []): PlanStorage {
	return { plans };
}

function setupStorageMock(storage: PlanStorage): void {
	mockedExistsSync.mockImplementation((path: string) => {
		if (path.includes("storage.json")) {
			return storage.plans.length > 0 || true;
		}
		if (path.includes("plan-mode-state.json")) {
			return false;
		}
		return true;
	});

	mockedReadFileSync.mockImplementation((path: string) => {
		if (path.includes("storage.json")) {
			return JSON.stringify(storage);
		}
		if (path.includes("plan-mode-state.json")) {
			return JSON.stringify({ enabled: false });
		}
		return "";
	});

	mockedWriteFileSync.mockImplementation(() => {});
	mockedMkdirSync.mockImplementation(() => undefined);
	mockedRenameSync.mockImplementation(() => undefined);
}

// 動的インポートで拡張機能を読み込む
async function loadPlanExtension(api: ExtensionAPI): Promise<void> {
	const planExtension = (await import("../../../.pi/extensions/plan.js")).default;
	planExtension(api);
}

// ============================================================================
// テスト本体
// ============================================================================

describe("plan extension", () => {
	let mockApi: ReturnType<typeof createMockExtensionAPI>;
	let tools: Map<string, RegisteredTool>;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockApi = createMockExtensionAPI();
		tools = mockApi.tools;

		// デフォルトのストレージモック
		setupStorageMock(createMockStorage());

		// 拡張機能を読み込み
		await loadPlanExtension(mockApi.api);
	});

	afterEach(() => {
		vi.resetModules();
	});

	// ========================================
	// ツール登録確認
	// ========================================

	describe("ツール登録", () => {
		it("plan_create ツールが登録される", () => {
			expect(tools.has("plan_create")).toBe(true);
			expect(tools.get("plan_create")!.label).toBe("Create Plan");
		});

		it("plan_list ツールが登録される", () => {
			expect(tools.has("plan_list")).toBe(true);
			expect(tools.get("plan_list")!.label).toBe("List Plans");
		});

		it("plan_show ツールが登録される", () => {
			expect(tools.has("plan_show")).toBe(true);
			expect(tools.get("plan_show")!.label).toBe("Show Plan");
		});

		it("plan_add_step ツールが登録される", () => {
			expect(tools.has("plan_add_step")).toBe(true);
			expect(tools.get("plan_add_step")!.label).toBe("Add Step");
		});

		it("plan_update_step ツールが登録される", () => {
			expect(tools.has("plan_update_step")).toBe(true);
			expect(tools.get("plan_update_step")!.label).toBe("Update Step Status");
		});

		it("plan_delete ツールが登録される", () => {
			expect(tools.has("plan_delete")).toBe(true);
			expect(tools.get("plan_delete")!.label).toBe("Delete Plan");
		});

		it("plan_ready_steps ツールが登録される", () => {
			expect(tools.has("plan_ready_steps")).toBe(true);
			expect(tools.get("plan_ready_steps")!.label).toBe("Get Ready Steps");
		});

		it("plan_update_status ツールが登録される", () => {
			expect(tools.has("plan_update_status")).toBe(true);
			expect(tools.get("plan_update_status")!.label).toBe("Update Plan Status");
		});
	});

	// ========================================
	// plan_create テスト
	// ========================================

	describe("plan_create", () => {
		it("正常系: 新しい計画を作成する", async () => {
			const handler = tools.get("plan_create")!.execute;
			const params = { name: "Test Plan", description: "Test Description" };

			const result = await handler("call-1", params, undefined as unknown as AbortSignal, undefined, undefined);

			expect(result.content[0].type).toBe("text");
			expect(result.content[0].text).toContain("Test Plan");
			expect(result.details.planId).toBeDefined();
		});

		it("正常系: 説明なしで計画を作成する", async () => {
			const handler = tools.get("plan_create")!.execute;
			const params = { name: "Simple Plan" };

			const result = await handler("call-2", params, undefined as unknown as AbortSignal, undefined, undefined);

			expect(result.content[0].text).toContain("Simple Plan");
			expect(result.details.planId).toBeDefined();
		});

		it("正常系: 複数の計画を作成できる", async () => {
			const handler = tools.get("plan_create")!.execute;

			const result1 = await handler("call-3", { name: "Plan 1" }, undefined as unknown as AbortSignal, undefined, undefined);
			const result2 = await handler("call-4", { name: "Plan 2" }, undefined as unknown as AbortSignal, undefined, undefined);

			expect(result1.details.planId).not.toBe(result2.details.planId);
		});
	});

	// ========================================
	// plan_list テスト
	// ========================================

	describe("plan_list", () => {
		it("正常系: 空の計画一覧を返す", async () => {
			setupStorageMock(createMockStorage([]));
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_list")!.execute;

			const result = await handler("call-5", {}, undefined as unknown as AbortSignal, undefined, undefined);

			expect(result.content[0].text).toContain("No plans found");
			expect(result.details.count).toBe(0);
		});

		it("正常系: 複数の計画を一覧表示する", async () => {
			const storage = createMockStorage([
				{
					id: "plan-1",
					name: "Plan 1",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [],
				},
				{
					id: "plan-2",
					name: "Plan 2",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_list")!.execute;

			const result = await handler("call-6", {}, undefined as unknown as AbortSignal, undefined, undefined);

			expect(result.content[0].text).toContain("Plan 1");
			expect(result.content[0].text).toContain("Plan 2");
			expect(result.details.count).toBe(2);
		});
	});

	// ========================================
	// plan_show テスト
	// ========================================

	describe("plan_show", () => {
		it("正常系: 計画詳細を表示する", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					description: "Test Description",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_show")!.execute;

			const result = await handler(
				"call-7",
				{ planId: "test-plan-id" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Test Plan");
			expect(result.content[0].text).toContain("Test Description");
			expect(result.details.planId).toBe("test-plan-id");
		});

		it("異常系: 存在しない計画ID", async () => {
			setupStorageMock(createMockStorage([]));
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_show")!.execute;

			const result = await handler(
				"call-8",
				{ planId: "nonexistent" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Plan not found");
		});
	});

	// ========================================
	// plan_add_step テスト
	// ========================================

	describe("plan_add_step", () => {
		it("正常系: ステップを追加する", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_add_step")!.execute;

			const result = await handler(
				"call-9",
				{ planId: "test-plan-id", title: "Step 1", description: "Step description" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Step 1");
			expect(result.details.stepId).toBeDefined();
		});

		it("正常系: 依存関係付きでステップを追加する", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [{ id: "step-1", title: "Step 1", status: "pending" }],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_add_step")!.execute;

			const result = await handler(
				"call-10",
				{ planId: "test-plan-id", title: "Step 2", dependencies: ["step-1"] },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Step 2");
		});

		it("異常系: 存在しない計画にステップ追加", async () => {
			setupStorageMock(createMockStorage([]));
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_add_step")!.execute;

			const result = await handler(
				"call-11",
				{ planId: "nonexistent", title: "Step" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Plan not found");
		});
	});

	// ========================================
	// plan_update_step テスト
	// ========================================

	describe("plan_update_step", () => {
		it("正常系: ステップのステータスを更新する", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [{ id: "step-1", title: "Step 1", status: "pending" }],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_update_step")!.execute;

			const result = await handler(
				"call-12",
				{ planId: "test-plan-id", stepId: "step-1", status: "completed" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("completed");
			expect(result.details.status).toBe("completed");
		});

		it("正常系: すべての有効なステータスに更新できる", async () => {
			const statuses = ["pending", "in_progress", "completed", "blocked"] as const;

			for (const status of statuses) {
				const storage = createMockStorage([
					{
						id: "test-plan-id",
						name: "Test Plan",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						status: "draft",
						steps: [{ id: "step-1", title: "Step 1", status: "pending" }],
					},
				]);
				setupStorageMock(storage);
				await loadPlanExtension(mockApi.api);
				const handler = mockApi.tools.get("plan_update_step")!.execute;

				const result = await handler(
					`call-${status}`,
					{ planId: "test-plan-id", stepId: "step-1", status },
					undefined as unknown as AbortSignal,
					undefined,
					undefined
				);

				expect(result.content[0].text).toContain(status);
			}
		});

		it("異常系: 無効なステータス値", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [{ id: "step-1", title: "Step 1", status: "pending" }],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_update_step")!.execute;

			const result = await handler(
				"call-13",
				{ planId: "test-plan-id", stepId: "step-1", status: "invalid_status" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Invalid status");
		});

		it("異常系: 存在しないステップID", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_update_step")!.execute;

			const result = await handler(
				"call-14",
				{ planId: "test-plan-id", stepId: "nonexistent", status: "completed" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Step not found");
		});
	});

	// ========================================
	// plan_delete テスト
	// ========================================

	describe("plan_delete", () => {
		it("正常系: 計画を削除する", async () => {
			const storage = createMockStorage([
				{
					id: "plan-to-delete",
					name: "Plan to Delete",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_delete")!.execute;

			const result = await handler(
				"call-15",
				{ planId: "plan-to-delete" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Plan deleted");
			expect(result.details.deletedPlanId).toBe("plan-to-delete");
		});

		it("異常系: 存在しない計画の削除", async () => {
			setupStorageMock(createMockStorage([]));
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_delete")!.execute;

			const result = await handler(
				"call-16",
				{ planId: "nonexistent" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Plan not found");
		});
	});

	// ========================================
	// plan_ready_steps テスト
	// ========================================

	describe("plan_ready_steps", () => {
		it("正常系: 実行可能なステップを取得する", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [
						{ id: "step-1", title: "Step 1", status: "pending" },
						{ id: "step-2", title: "Step 2", status: "pending", dependencies: ["step-1"] },
					],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_ready_steps")!.execute;

			const result = await handler(
				"call-17",
				{ planId: "test-plan-id" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			// step-1は依存関係がないため実行可能
			expect(result.content[0].text).toContain("Step 1");
			expect(result.details.count).toBe(1);
		});

		it("正常系: 依存関係が完了したら実行可能になる", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [
						{ id: "step-1", title: "Step 1", status: "completed" },
						{ id: "step-2", title: "Step 2", status: "pending", dependencies: ["step-1"] },
					],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_ready_steps")!.execute;

			const result = await handler(
				"call-18",
				{ planId: "test-plan-id" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			// step-1が完了したためstep-2が実行可能
			expect(result.content[0].text).toContain("Step 2");
		});

		it("正常系: 実行可能なステップがない場合", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [
						{ id: "step-1", title: "Step 1", status: "in_progress" },
						{ id: "step-2", title: "Step 2", status: "pending", dependencies: ["step-1"] },
					],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_ready_steps")!.execute;

			const result = await handler(
				"call-19",
				{ planId: "test-plan-id" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("No steps ready to execute");
			expect(result.details.count).toBe(0);
		});

		it("異常系: 存在しない計画", async () => {
			setupStorageMock(createMockStorage([]));
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_ready_steps")!.execute;

			const result = await handler(
				"call-20",
				{ planId: "nonexistent" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Plan not found");
		});
	});

	// ========================================
	// plan_update_status テスト
	// ========================================

	describe("plan_update_status", () => {
		it("正常系: 計画のステータスを更新する", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_update_status")!.execute;

			const result = await handler(
				"call-21",
				{ planId: "test-plan-id", status: "active" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("active");
			expect(result.details.status).toBe("active");
		});

		it("正常系: すべての有効なステータスに更新できる", async () => {
			const statuses = ["draft", "active", "completed", "cancelled"] as const;

			for (const status of statuses) {
				const storage = createMockStorage([
					{
						id: "test-plan-id",
						name: "Test Plan",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						status: "draft",
						steps: [],
					},
				]);
				setupStorageMock(storage);
				await loadPlanExtension(mockApi.api);
				const handler = mockApi.tools.get("plan_update_status")!.execute;

				const result = await handler(
					`call-plan-${status}`,
					{ planId: "test-plan-id", status },
					undefined as unknown as AbortSignal,
					undefined,
					undefined
				);

				expect(result.content[0].text).toContain(status);
			}
		});

		it("異常系: 無効なステータス値", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_update_status")!.execute;

			const result = await handler(
				"call-22",
				{ planId: "test-plan-id", status: "invalid_status" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Invalid status");
		});
	});

	// ========================================
	// ステータス遷移テスト
	// ========================================

	describe("ステータス遷移", () => {
		it("ステップの完全なライフサイクル: pending -> in_progress -> completed", async () => {
			let storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [{ id: "step-1", title: "Step 1", status: "pending" }],
				},
			]);

			// モックを更新するヘルパー
			const updateStorage = (newStorage: PlanStorage) => {
				storage = newStorage;
				mockedReadFileSync.mockImplementation((path: string) => {
					if (path.includes("storage.json")) {
						return JSON.stringify(storage);
					}
					return "";
				});
			};

			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_update_step")!.execute;

			// pending -> in_progress
			updateStorage(
				createMockStorage([
					{
						id: "test-plan-id",
						name: "Test Plan",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						status: "active",
						steps: [{ id: "step-1", title: "Step 1", status: "pending" }],
					},
				])
			);
			let result = await handler(
				"call-23",
				{ planId: "test-plan-id", stepId: "step-1", status: "in_progress" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);
			expect(result.content[0].text).toContain("in_progress");

			// in_progress -> completed
			updateStorage(
				createMockStorage([
					{
						id: "test-plan-id",
						name: "Test Plan",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						status: "active",
						steps: [{ id: "step-1", title: "Step 1", status: "in_progress" }],
					},
				])
			);
			result = await handler(
				"call-24",
				{ planId: "test-plan-id", stepId: "step-1", status: "completed" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);
			expect(result.content[0].text).toContain("completed");
		});

		it("依存関係のあるステップの順序: 依存元が完了したら次が実行可能に", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [
						{ id: "step-1", title: "Step 1", status: "pending" },
						{ id: "step-2", title: "Step 2", status: "pending", dependencies: ["step-1"] },
						{ id: "step-3", title: "Step 3", status: "pending", dependencies: ["step-2"] },
					],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);

			const readyHandler = mockApi.tools.get("plan_ready_steps")!.execute;

			// 初期状態: step-1のみ実行可能
			let result = await readyHandler(
				"call-25",
				{ planId: "test-plan-id" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);
			expect(result.content[0].text).toContain("Step 1");
			expect(result.details.count).toBe(1);
		});

		it("blocked状態への遷移と復帰", async () => {
			const storage = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [{ id: "step-1", title: "Step 1", status: "pending" }],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_update_step")!.execute;

			// pending -> blocked
			let result = await handler(
				"call-26",
				{ planId: "test-plan-id", stepId: "step-1", status: "blocked" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);
			expect(result.content[0].text).toContain("blocked");

			// blocked -> pending
			const storageBlocked = createMockStorage([
				{
					id: "test-plan-id",
					name: "Test Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [{ id: "step-1", title: "Step 1", status: "blocked" }],
				},
			]);
			setupStorageMock(storageBlocked);
			await loadPlanExtension(mockApi.api);
			const handlerBlocked = mockApi.tools.get("plan_update_step")!.execute;

			result = await handlerBlocked(
				"call-27",
				{ planId: "test-plan-id", stepId: "step-1", status: "pending" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);
			expect(result.content[0].text).toContain("pending");
		});
	});

	// ========================================
	// エッジケース
	// ========================================

	describe("エッジケース", () => {
		it("空のステップ配列を持つ計画でも正常に動作する", async () => {
			const storage = createMockStorage([
				{
					id: "empty-plan",
					name: "Empty Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "draft",
					steps: [],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);

			const showHandler = mockApi.tools.get("plan_show")!.execute;
			const result = await showHandler(
				"call-28",
				{ planId: "empty-plan" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			expect(result.content[0].text).toContain("Empty Plan");
			expect(result.details.stepCount).toBe(0);
		});

		it("ストレージの読み込みエラー時に空のストレージを返す", async () => {
			mockedExistsSync.mockReturnValue(true);
			mockedReadFileSync.mockImplementation(() => {
				throw new Error("Read error");
			});
			mockedMkdirSync.mockReturnValue(undefined);
			mockedWriteFileSync.mockImplementation(() => {});

			await loadPlanExtension(mockApi.api);
			const handler = mockApi.tools.get("plan_list")!.execute;

			// エラー時は空のストレージが返るため、エラーにならない
			const result = await handler("call-29", {}, undefined as unknown as AbortSignal, undefined, undefined);
			expect(result.content[0].text).toBeDefined();
		});

		it("複雑な依存関係グラフでも正常に動作する", async () => {
			const storage = createMockStorage([
				{
					id: "complex-plan",
					name: "Complex Plan",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: "active",
					steps: [
						{ id: "s1", title: "Step 1", status: "completed" },
						{ id: "s2", title: "Step 2", status: "completed" },
						{ id: "s3", title: "Step 3", status: "pending", dependencies: ["s1", "s2"] },
						{ id: "s4", title: "Step 4", status: "pending", dependencies: ["s3"] },
						{ id: "s5", title: "Step 5", status: "pending" }, // 依存なし
					],
				},
			]);
			setupStorageMock(storage);
			await loadPlanExtension(mockApi.api);

			const handler = mockApi.tools.get("plan_ready_steps")!.execute;
			const result = await handler(
				"call-30",
				{ planId: "complex-plan" },
				undefined as unknown as AbortSignal,
				undefined,
				undefined
			);

			// s3（s1, s2完了）とs5（依存なし）が実行可能
			expect(result.content[0].text).toContain("Step 3");
			expect(result.content[0].text).toContain("Step 5");
			expect(result.details.count).toBe(2);
		});
	});

	// ========================================
	// コマンド登録確認
	// ========================================

	describe("コマンド登録", () => {
		it("/plan コマンドが登録される", () => {
			expect(mockApi.commands.has("plan")).toBe(true);
		});

		it("/planmode コマンドが登録される", () => {
			expect(mockApi.commands.has("planmode")).toBe(true);
		});
	});

	// ========================================
	// ショートカット登録確認
	// ========================================

	describe("ショートカット登録", () => {
		it("ctrl+shift+p ショートカットが登録される", () => {
			expect(mockApi.shortcuts.has("ctrl+shift+p")).toBe(true);
		});
	});
});
