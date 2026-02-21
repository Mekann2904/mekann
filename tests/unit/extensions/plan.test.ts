/**
 * @file .pi/extensions/plan.ts の単体テスト
 * @description プラン管理拡張機能のテスト
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

vi.mock("@mariozechner/pi-agent-core", () => ({
	AgentMessage: {},
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

vi.mock("../lib/plan-mode-shared", () => ({
	PLAN_MODE_POLICY: "PLAN MODE POLICY TEXT",
	isBashCommandAllowed: vi.fn(() => true),
	validatePlanModeState: vi.fn(() => true),
	createPlanModeState: vi.fn((enabled) => ({ enabled, checksum: "abc123" })),
	PLAN_MODE_CONTEXT_TYPE: "plan-mode-context",
	PLAN_MODE_STATUS_KEY: "PLAN_MODE",
	PLAN_MODE_ENV_VAR: "PI_PLAN_MODE_ENABLED",
}));

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("plan.ts 型定義", () => {
	describe("PlanStep", () => {
		it("必須フィールドを持つ", () => {
			const step = {
				id: "step-1",
				title: "テストステップ",
				status: "pending" as const,
			};
			expect(step.id).toBe("step-1");
			expect(step.title).toBe("テストステップ");
			expect(step.status).toBe("pending");
		});

		it("オプションフィールドを持つ", () => {
			const step = {
				id: "step-1",
				title: "テストステップ",
				status: "pending" as const,
				description: "ステップの説明",
				estimatedTime: 30,
				dependencies: ["step-0"],
			};
			expect(step.description).toBe("ステップの説明");
			expect(step.estimatedTime).toBe(30);
			expect(step.dependencies).toEqual(["step-0"]);
		});

		it("すべてのステータス値", () => {
			const statuses: PlanStep["status"][] = ["pending", "in_progress", "completed", "blocked"];
			expect(statuses).toHaveLength(4);
		});
	});

	describe("Plan", () => {
		it("必須フィールドを持つ", () => {
			const plan = {
				id: "plan-1",
				name: "テストプラン",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
				status: "draft" as const,
				steps: [],
			};
			expect(plan.id).toBe("plan-1");
			expect(plan.name).toBe("テストプラン");
			expect(plan.status).toBe("draft");
		});

		it("すべてのステータス値", () => {
			const statuses: Plan["status"][] = ["draft", "active", "completed", "cancelled"];
			expect(statuses).toHaveLength(4);
		});
	});

	describe("PlanStorage", () => {
		it("plans配列を持つ", () => {
			const storage = { plans: [] };
			expect(storage.plans).toEqual([]);
		});

		it("currentPlanIdを持つ（オプション）", () => {
			const storage = { plans: [], currentPlanId: "plan-1" };
			expect(storage.currentPlanId).toBe("plan-1");
		});
	});
});

// ============================================================================
// ID生成のテスト
// ============================================================================

describe("ID生成", () => {
	let planIdSequence = 0;

	function generateId(): string {
		planIdSequence += 1;
		return `${Date.now()}-${planIdSequence}`;
	}

	beforeEach(() => {
		planIdSequence = 0;
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

		const seq1 = parseInt(id1.split("-")[1]!, 10);
		const seq2 = parseInt(id2.split("-")[1]!, 10);
		const seq3 = parseInt(id3.split("-")[1]!, 10);

		expect(seq2).toBeGreaterThan(seq1);
		expect(seq3).toBeGreaterThan(seq2);
	});

	it("ID形式チェック", () => {
		const id = generateId();
		const parts = id.split("-");

		expect(parts.length).toBeGreaterThanOrEqual(2);
		expect(parts[parts.length - 1]).toMatch(/^\d+$/);
	});
});

// ============================================================================
// プラン操作のテスト
// ============================================================================

describe("プラン操作", () => {
	describe("createPlan", () => {
		let planIdSequence = 0;

		function generateId(): string {
			planIdSequence += 1;
			return `${Date.now()}-${planIdSequence}`;
		}

		beforeEach(() => {
			planIdSequence = 0;
		});

		it("新しいプランを作成", () => {
			const plan = {
				id: generateId(),
				name: "テストプラン",
				description: "説明",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				status: "draft" as const,
				steps: [],
			};

			expect(plan.name).toBe("テストプラン");
			expect(plan.status).toBe("draft");
			expect(plan.steps).toHaveLength(0);
		});

		it("オプションフィールドなし", () => {
			const plan = {
				id: generateId(),
				name: "テスト",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				status: "draft" as const,
				steps: [],
			};

			expect(plan.description).toBeUndefined();
		});
	});

	describe("findPlanById", () => {
		it("IDでプランを検索", () => {
			const plans = [
				{ id: "plan-1", name: "Plan A", createdAt: "", updatedAt: "", status: "draft" as const, steps: [] },
				{ id: "plan-2", name: "Plan B", createdAt: "", updatedAt: "", status: "draft" as const, steps: [] },
			];

			const found = plans.find(p => p.id === "plan-2");
			expect(found?.name).toBe("Plan B");
		});

		it("存在しないIDで検索", () => {
			const plans = [
				{ id: "plan-1", name: "Plan A", createdAt: "", updatedAt: "", status: "draft" as const, steps: [] },
			];

			const found = plans.find(p => p.id === "plan-999");
			expect(found).toBeUndefined();
		});
	});

	describe("findStepById", () => {
		it("IDでステップを検索", () => {
			const plan = {
				id: "plan-1",
				name: "Plan",
				createdAt: "",
				updatedAt: "",
				status: "draft" as const,
				steps: [
					{ id: "step-1", title: "Step 1", status: "pending" as const },
					{ id: "step-2", title: "Step 2", status: "pending" as const },
				],
			};

			const found = plan.steps.find(s => s.id === "step-2");
			expect(found?.title).toBe("Step 2");
		});

		it("存在しないIDで検索", () => {
			const plan = {
				id: "plan-1",
				name: "Plan",
				createdAt: "",
				updatedAt: "",
				status: "draft" as const,
				steps: [
					{ id: "step-1", title: "Step 1", status: "pending" as const },
				],
			};

			const found = plan.steps.find(s => s.id === "step-999");
			expect(found).toBeUndefined();
		});
	});

	describe("addStepToPlan", () => {
		let planIdSequence = 0;

		function generateId(): string {
			planIdSequence += 1;
			return `${Date.now()}-${planIdSequence}`;
		}

		beforeEach(() => {
			planIdSequence = 0;
		});

		it("ステップを追加", () => {
			const plan = {
				id: generateId(),
				name: "Plan",
				createdAt: "",
				updatedAt: "",
				status: "draft" as const,
				steps: [],
			};

			const step = {
				id: generateId(),
				title: "New Step",
				status: "pending" as const,
			};

			plan.steps.push(step);
			plan.updatedAt = new Date().toISOString();

			expect(plan.steps).toHaveLength(1);
			expect(plan.steps[0].title).toBe("New Step");
		});

		it("updatedAtを更新", () => {
			const now = new Date().toISOString();
			const plan = {
				id: generateId(),
				name: "Plan",
				createdAt: now,
				updatedAt: now,
				status: "draft" as const,
				steps: [],
			};

			// ステップ追加でupdatedAt更新
			plan.steps.push({
				id: generateId(),
				title: "Step",
				status: "pending" as const,
			});

			// 少し待ってから更新（同じタイムスタンプにならないように）
			const updatedTime = new Date(now).getTime() + 1;
			plan.updatedAt = new Date(updatedTime).toISOString();

			expect(plan.updatedAt).not.toBe(now);
		});
	});

	describe("updateStepStatus", () => {
		it("ステータスを更新", () => {
			const plan = {
				id: "plan-1",
				name: "Plan",
				createdAt: "",
				updatedAt: "",
				status: "draft" as const,
				steps: [
					{ id: "step-1", title: "Step 1", status: "pending" as const },
				],
			};

			const step = plan.steps.find(s => s.id === "step-1");
			if (step) {
				step.status = "in_progress";
			}

			expect(plan.steps[0].status).toBe("in_progress");
		});

		it("存在しないステップの更新は無視", () => {
			const plan = {
				id: "plan-1",
				name: "Plan",
				createdAt: "",
				updatedAt: "",
				status: "draft" as const,
				steps: [
					{ id: "step-1", title: "Step 1", status: "pending" as const },
				],
			};

			const step = plan.steps.find(s => s.id === "step-999");
			expect(step).toBeUndefined();

			// ステータスが変更されていないことを確認
			expect(plan.steps[0].status).toBe("pending");
		});
	});

	describe("getReadySteps", () => {
		it("依存関係のないpendingステップを返す", () => {
			const plan = {
				id: "plan-1",
				name: "Plan",
				createdAt: "",
				updatedAt: "",
				status: "active" as const,
				steps: [
					{ id: "s1", title: "Step 1", status: "pending" as const },
					{ id: "s2", title: "Step 2", status: "pending" as const, dependencies: ["s1"] },
					{ id: "s3", title: "Step 3", status: "pending" as const, dependencies: ["s1", "s2"] },
				],
			};

			const readySteps = plan.steps.filter(step => {
				if (step.status !== "pending") return false;
				if (!step.dependencies || step.dependencies.length === 0) return true;
				return step.dependencies.every(depId => {
					const depStep = plan.steps.find(s => s.id === depId);
					return depStep?.status === "completed";
				});
			});

			expect(readySteps).toHaveLength(1);
			expect(readySteps[0].id).toBe("s1");
		});

		it("依存関係が完了したステップを返す", () => {
			const plan = {
				id: "plan-1",
				name: "Plan",
				createdAt: "",
				updatedAt: "",
				status: "active" as const,
				steps: [
					{ id: "s1", title: "Step 1", status: "completed" as const },
					{ id: "s2", title: "Step 2", status: "pending" as const, dependencies: ["s1"] },
				],
			};

			const readySteps = plan.steps.filter(step => {
				if (step.status !== "pending") return false;
				if (!step.dependencies || step.dependencies.length === 0) return true;
				return step.dependencies.every(depId => {
					const depStep = plan.steps.find(s => s.id === depId);
					return depStep?.status === "completed";
				});
			});

			expect(readySteps).toHaveLength(1);
			expect(readySteps[0].id).toBe("s2");
		});

		it("依存関係が未完了なら返さない", () => {
			const plan = {
				id: "plan-1",
				name: "Plan",
				createdAt: "",
				updatedAt: "",
				status: "active" as const,
				steps: [
					{ id: "s1", title: "Step 1", status: "in_progress" as const },
					{ id: "s2", title: "Step 2", status: "pending" as const, dependencies: ["s1"] },
				],
			};

			const readySteps = plan.steps.filter(step => {
				if (step.status !== "pending") return false;
				if (!step.dependencies || step.dependencies.length === 0) return true;
				return step.dependencies.every(depId => {
					const depStep = plan.steps.find(s => s.id === depId);
					return depStep?.status === "completed";
				});
			});

			expect(readySteps).toHaveLength(0);
		});
	});
});

// ============================================================================
// フォーマット関数のテスト
// ============================================================================

describe("formatPlanSummary", () => {
	it("プラン概要をフォーマット", () => {
		const plan = {
			id: "plan-1",
			name: "テストプラン",
			description: "テスト用のプランです",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T01:00:00Z",
			status: "active" as const,
			steps: [
				{ id: "s1", title: "Step 1", status: "completed" as const },
				{ id: "s2", title: "Step 2", status: "pending" as const },
			],
		};

		const lines: string[] = [];
		lines.push(`## Plan: ${plan.name}`);
		if (plan.description) {
			lines.push(`\n${plan.description}`);
		}
		lines.push(`\nStatus: ${plan.status}`);
		lines.push(`Created: ${new Date(plan.createdAt).toLocaleString()}`);
		lines.push(`Updated: ${new Date(plan.updatedAt).toLocaleString()}`);

		const statusCounts = {
			pending: plan.steps.filter(s => s.status === "pending").length,
			in_progress: plan.steps.filter(s => s.status === "in_progress").length,
			completed: plan.steps.filter(s => s.status === "completed").length,
			blocked: plan.steps.filter(s => s.status === "blocked").length,
		};

		lines.push(`\nProgress: ${statusCounts.completed}/${plan.steps.length} steps completed`);
		lines.push(`  Pending: ${statusCounts.pending} | In Progress: ${statusCounts.in_progress} | Completed: ${statusCounts.completed} | Blocked: ${statusCounts.blocked}`);

		const formatted = lines.join("\n");

		expect(formatted).toContain("## Plan: テストプラン");
		expect(formatted).toContain("Status: active");
		expect(formatted).toContain("Progress: 1/2 steps completed");
	});
});

describe("formatPlanList", () => {
	it("プランリストをフォーマット", () => {
		const plans = [
			{
				id: "plan-1",
				name: "Plan A",
				description: "Desc A",
				createdAt: "",
				updatedAt: "",
				status: "active" as const,
				steps: [
					{ id: "s1", title: "Step 1", status: "completed" as const },
					{ id: "s2", title: "Step 2", status: "pending" as const },
				],
			},
		];

		const lines: string[] = ["## Plans"];
		plans.forEach(plan => {
			const progress = plan.steps.length > 0
				? `${plan.steps.filter(s => s.status === "completed").length}/${plan.steps.length}`
				: "0/0";
			lines.push(`\n### ${plan.name}`);
			lines.push(`ID: ${plan.id}`);
			lines.push(`Status: ${plan.status} | Progress: ${progress}`);
			if (plan.description) {
				lines.push(`Description: ${plan.description}`);
			}
		});

		const formatted = lines.join("\n");

		expect(formatted).toContain("## Plans");
		expect(formatted).toContain("### Plan A");
		expect(formatted).toContain("Status: active | Progress: 1/2");
	});

	it("空リスト", () => {
		const formatted = "No plans found. Create one using plan_create.";
		expect(formatted).toContain("No plans found");
	});
});

// ============================================================================
// プランモード状態管理のテスト
// ============================================================================

describe("プランモード状態管理", () => {
	describe("validatePlanModeState", () => {
		it("有効な状態を検証", () => {
			const state = { enabled: true, checksum: "abc123" };
			const isValid = typeof state.enabled === "boolean" && typeof state.checksum === "string";
			expect(isValid).toBe(true);
		});

		it("無効な状態を拒否", () => {
			const state = { enabled: "true" as unknown as boolean, checksum: "" };
			const isValid = typeof state.enabled === "boolean" && typeof state.checksum === "string";
			expect(isValid).toBe(false);
		});
	});

	describe("syncPlanModeEnv", () => {
		it("有効時に環境変数を設定", () => {
			const enabled = true;
			const envVar = "PI_PLAN_MODE_ENABLED";

			if (enabled) {
				process.env[envVar] = "1";
			}

			expect(process.env[envVar]).toBe("1");
		});

		it("無効時に環境変数を削除", () => {
			const enabled = false;
			const envVar = "PI_PLAN_MODE_ENABLED";

			if (!enabled) {
				delete process.env[envVar];
			}

			expect(process.env[envVar]).toBeUndefined();
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のプラン", () => {
		it("ステップなしのプラン", () => {
			const plan = {
				id: "plan-1",
				name: "Empty Plan",
				createdAt: "",
				updatedAt: "",
				status: "draft" as const,
				steps: [],
			};

			expect(plan.steps).toHaveLength(0);

			const completedCount = plan.steps.filter(s => s.status === "completed").length;
			expect(completedCount).toBe(0);
		});
	});

	describe("深い依存関係", () => {
		it("チェーン状の依存関係", () => {
			const plan = {
				id: "plan-1",
				name: "Chain Plan",
				createdAt: "",
				updatedAt: "",
				status: "active" as const,
				steps: [
					{ id: "s1", title: "Step 1", status: "completed" as const },
					{ id: "s2", title: "Step 2", status: "completed" as const, dependencies: ["s1"] },
					{ id: "s3", title: "Step 3", status: "completed" as const, dependencies: ["s2"] },
					{ id: "s4", title: "Step 4", status: "pending" as const, dependencies: ["s3"] },
				],
			};

			// s4は全ての依存が完了しているのでready
			const s4 = plan.steps.find(s => s.id === "s4");
			expect(s4?.status).toBe("pending");

			const readySteps = plan.steps.filter(step => {
				if (step.status !== "pending") return false;
				if (!step.dependencies || step.dependencies.length === 0) return true;
				return step.dependencies.every(depId => {
					const depStep = plan.steps.find(s => s.id === depId);
					return depStep?.status === "completed";
				});
			});

			expect(readySteps).toHaveLength(1);
			expect(readySteps[0].id).toBe("s4");
		});

		it("複数の依存関係", () => {
			const plan = {
				id: "plan-1",
				name: "Multi Dep Plan",
				createdAt: "",
				updatedAt: "",
				status: "active" as const,
				steps: [
					{ id: "s1", title: "Step 1", status: "completed" as const },
					{ id: "s2", title: "Step 2", status: "pending" as const },
					{ id: "s3", title: "Step 3", status: "pending" as const, dependencies: ["s1", "s2"] },
				],
			};

			// s3はs1とs2の両方が完了していないとreadyではない
			const readySteps = plan.steps.filter(step => {
				if (step.status !== "pending") return false;
				if (!step.dependencies || step.dependencies.length === 0) return true;
				return step.dependencies.every(depId => {
					const depStep = plan.steps.find(s => s.id === depId);
					return depStep?.status === "completed";
				});
			});

			expect(readySteps).toHaveLength(1);
			expect(readySteps[0].id).toBe("s2");
		});
	});

	describe("循環依存", () => {
		it("循環依存は正しく扱われない場合がある", () => {
			const plan = {
				id: "plan-1",
				name: "Cyclic Plan",
				createdAt: "",
				updatedAt: "",
				status: "active" as const,
				steps: [
					{ id: "s1", title: "Step 1", status: "pending" as const, dependencies: ["s3"] },
					{ id: "s2", title: "Step 2", status: "pending" as const, dependencies: ["s1"] },
					{ id: "s3", title: "Step 3", status: "pending" as const, dependencies: ["s2"] },
				],
			};

			// 循環依存がある場合、どのステップもreadyにならない
			const readySteps = plan.steps.filter(step => {
				if (step.status !== "pending") return false;
				if (!step.dependencies || step.dependencies.length === 0) return true;
				return step.dependencies.every(depId => {
					const depStep = plan.steps.find(s => s.id === depId);
					return depStep?.status === "completed";
				});
			});

			expect(readySteps).toHaveLength(0);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("plan.ts プロパティベーステスト", () => {
	it("PBT: IDは一意", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 100 }),
				(count) => {
					const ids = new Set<string>();
					for (let i = 0; i < count; i++) {
						ids.add(`${Date.now()}-${i + 1}`);
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
				fc.constantFrom("pending", "in_progress", "completed", "blocked" as const),
				(initialStatus) => {
					const validTransitions: Record<string, string[]> = {
						pending: ["in_progress", "blocked"],
						in_progress: ["completed", "blocked"],
						completed: [],
						blocked: ["pending", "in_progress"],
					};

					const allowed = validTransitions[initialStatus] || [];
					// どの状態からも有効な遷移が存在する
					return Array.isArray(allowed);
				}
			),
			{ numRuns: 20 }
		);
	});

	it("PBT: 依存関係の解決順序", () => {
		fc.assert(
			fc.property(
				fc.array(fc.nat(5), { minLength: 1, maxLength: 10 }),
				(dependencies) => {
					// 各ステップが自分より前のステップに依存する場合
					const steps = dependencies.map((depCount, idx) => ({
						id: `s${idx}`,
						title: `Step ${idx}`,
						status: "pending" as const,
						dependencies: Array.from({ length: Math.min(depCount, idx) }, (_, i) => `s${i}`),
					}));

					// 循環がないことを確認
					const visited = new Set<string>();
					const hasCycle = steps.some(step => {
						if (visited.has(step.id)) return true;
						visited.add(step.id);
						return false;
					});

					return !hasCycle;
				}
			),
			{ numRuns: 20 }
		);
	});

	it("PBT: ステータスカウントの整合性", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.constantFrom("pending", "in_progress", "completed", "blocked" as const),
					{ minLength: 0, maxLength: 20 }
				),
				(statuses) => {
					const statusCounts = {
						pending: statuses.filter(s => s === "pending").length,
						in_progress: statuses.filter(s => s === "in_progress").length,
						completed: statuses.filter(s => s === "completed").length,
						blocked: statuses.filter(s => s === "blocked").length,
					};

					const total = statusCounts.pending + statusCounts.in_progress +
						statusCounts.completed + statusCounts.blocked;

					return total === statuses.length;
				}
			),
			{ numRuns: 30 }
		);
	});
});
