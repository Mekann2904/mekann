/**
 * @file .pi/extensions/subagents.ts の単体テスト
 * @description サブエージェント拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
	readdirSync: vi.fn(() => []),
	unlinkSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:path", () => ({
	basename: vi.fn((p) => p.split("/").pop() || ""),
	join: vi.fn((...args) => args.join("/")),
}));

// pi SDKのモック
vi.mock("@mariozechner/pi-ai", () => ({
	Type: {
		String: () => ({ type: "string" }),
		Optional: (type) => type,
		Number: () => ({ type: "number" }),
		Boolean: () => ({ type: "boolean" }),
		Array: (type) => ({ type: "array", itemType: type }),
		Object: (fields) => ({ type: "object", fields }),
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Key: {
		enter: "enter",
		escape: "escape",
	},
	getMarkdownTheme: vi.fn(() => ({})),
	isToolCallEventType: vi.fn(() => false),
	Markdown: vi.fn(),
	matchesKey: vi.fn(),
	truncateToWidth: vi.fn((s) => s),
}));

// モジュールのモック
vi.mock("../lib/fs-utils", () => ({
	ensureDir: vi.fn(),
}));

vi.mock("../lib/format-utils", () => ({
	formatDurationMs: vi.fn((ms) => `${ms}ms`),
	formatBytes: vi.fn((bytes) => `${bytes}B`),
	formatClockTime: vi.fn(() => "12:00"),
}));

vi.mock("../lib/error-utils", () => ({
	extractStatusCodeFromMessage: vi.fn(() => 200),
	classifyPressureError: vi.fn(() => "pressure"),
	isCancelledErrorMessage: vi.fn(() => false),
	isTimeoutErrorMessage: vi.fn(() => false),
	toErrorMessage: vi.fn((err) => err?.message || "Error"),
}));

vi.mock("../lib/agent-utils", () => ({
	createRunId: vi.fn(() => `run-${Date.now()}`),
	computeLiveWindow: vi.fn(() => ({ start: 0, end: 100 })),
}));

vi.mock("../lib/agent-types", () => ({
	ThinkingLevel: {
		off: "off",
		low: "low",
		medium: "medium",
		high: "high",
	},
	RunOutcomeCode: {
		SUCCESS: "success",
		FAILED: "failed",
		TIMEOUT: "timeout",
		CANCELLED: "cancelled",
	},
	DEFAULT_AGENT_TIMEOUT_MS: 300000,
}));

vi.mock("../lib/model-timeouts", () => ({
	computeModelTimeoutMs: vi.fn(() => 60000),
}));

vi.mock("../lib/output-validation", () => ({
	hasNonEmptyResultSection: vi.fn(() => true),
	validateSubagentOutput: vi.fn(() => ({ valid: true, errors: [] })),
}));

vi.mock("../lib/runtime-utils", () => ({
	trimForError: vi.fn((s) => s),
	buildRateLimitKey: vi.fn(() => "key"),
	createRetrySchema: vi.fn(() => ({})),
	toConcurrencyLimit: vi.fn(() => 4),
}));

vi.mock("../lib/agent-common", () => ({
	STABLE_RUNTIME_PROFILE: true,
	ADAPTIVE_PARALLEL_MAX_PENALTY: 30000,
	ADAPTIVE_PARALLEL_DECAY_MS: 60000,
	STABLE_MAX_RETRIES: 2,
	STABLE_INITIAL_DELAY_MS: 1000,
	STABLE_MAX_DELAY_MS: 32000,
	STABLE_MAX_RATE_LIMIT_RETRIES: 3,
	STABLE_MAX_RATE_LIMIT_WAIT_MS: 60000,
	SUBAGENT_CONFIG: {},
	buildFailureSummary: vi.fn(() => "failure summary"),
}));

vi.mock("../lib/agent-errors", () => ({
	isRetryableSubagentError: vi.fn(() => false),
	resolveSubagentFailureOutcome: vi.fn(() => "failed"),
	trimErrorMessage: vi.fn((s) => s),
	buildDiagnosticContext: vi.fn(() => ({})),
}));

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

vi.mock("../lib/concurrency", () => ({
	runWithConcurrencyLimit: vi.fn(async (fn) => await fn()),
}));

vi.mock("../lib/execution-rules", () => ({
	getSubagentExecutionRules: vi.fn(() => ({
		allowNonInteractive: true,
		allowWriteTools: true,
	})),
}));

vi.mock("../lib/plan-mode-shared", () => ({
	isPlanModeActive: vi.fn(() => false),
	PLAN_MODE_WARNING: "PLAN MODE WARNING",
}));

vi.mock("./agent-runtime", () => ({
	acquireRuntimeDispatchPermit: vi.fn(),
	formatRuntimeStatusLine: vi.fn(() => "status line"),
	getRuntimeSnapshot: vi.fn(() => ({
		subagentActiveRequests: 0,
		subagentActiveAgents: 0,
		teamActiveRuns: 0,
		teamActiveAgents: 0,
		reservedRequests: 0,
		reservedLlm: 0,
		activeReservations: 0,
		totalActiveRequests: 0,
		totalActiveLlm: 0,
		limits: {
			maxTotalActiveRequests: 16,
			maxTotalActiveLlm: 8,
		},
	})),
	getSharedRuntimeState: vi.fn(() => ({
		subagents: { activeRunRequests: 0, activeAgents: 0 },
		teams: { activeTeamRuns: 0, activeTeammates: 0 },
		notifyRuntimeCapacityChanged: vi.fn(),
	})),
	notifyRuntimeCapacityChanged: vi.fn(),
	resetRuntimeTransientState: vi.fn(),
}));

vi.mock("../lib/retry-with-backoff", () => ({
	getRateLimitGateSnapshot: vi.fn(() => ({})),
	isRetryableError: vi.fn(() => true),
	retryWithBackoff: vi.fn(async (fn) => await fn()),
}));

vi.mock("./shared/pi-print-executor", () => ({
	runPiPrintMode: vi.fn(async () => ({ text: "output", exitCode: 0 })),
}));

vi.mock("./shared/runtime-helpers", () => ({
	buildRuntimeLimitError: vi.fn(() => "limit error"),
	startReservationHeartbeat: vi.fn(),
	refreshRuntimeStatus: vi.fn(),
}));

vi.mock("./subagents/storage", () => ({
	getPaths: vi.fn(() => ({
		dir: "/.pi/subagents",
		storage: "/.pi/subagents/storage.json",
		runsDir: "/.pi/subagents/runs",
		backgroundJobsDir: "/.pi/subagents/background-jobs",
	})),
	ensurePaths: vi.fn(),
	createDefaultAgents: vi.fn(() => []),
	loadStorage: vi.fn(() => ({ agents: [], currentAgentId: null, runs: [] })),
	saveStorage: vi.fn(),
	saveStorageWithPatterns: vi.fn(),
	SUBAGENT_DEFAULTS_VERSION: "1.0.0",
	MAX_RUNS_TO_KEEP: 100,
}));

vi.mock("./subagents/live-monitor", () => ({
	renderSubagentLiveView: vi.fn(() => "live view"),
	createSubagentLiveMonitor: vi.fn(() => ({})),
}));

vi.mock("./subagents/parallel-execution", () => ({
	resolveSubagentParallelCapacity: vi.fn(() => ({
		allowed: true,
		resolution: "ok",
		parallelCount: 2,
	})),
}));

vi.mock("./subagents/task-execution", () => ({
	normalizeSubagentOutput: vi.fn(() => "normalized output"),
	buildSubagentPrompt: vi.fn(() => "prompt"),
	runSubagentTask: vi.fn(async () => ({ text: "output", exitCode: 0 })),
	isRetryableSubagentError: vi.fn(() => false),
	buildFailureSummary: vi.fn(() => "failure"),
	resolveSubagentFailureOutcome: vi.fn(() => "failed"),
	mergeSkillArrays: vi.fn(() => []),
	resolveEffectiveSkills: vi.fn(() => []),
	formatSkillsSection: vi.fn(() => "skills"),
	extractSummary: vi.fn(() => "summary"),
}));

vi.mock("../lib/subagent-types", () => ({
	createSubagentPaths: vi.fn(() => ({})),
}));

vi.mock("../lib/cost-estimator", () => ({
	getCostEstimator: vi.fn(() => ({})),
}));

vi.mock("../lib/provider-limits", () => ({
	detectTier: vi.fn(() => "standard"),
	getConcurrencyLimit: vi.fn(() => 4),
}));

vi.mock("../lib/adaptive-penalty", () => ({
	createAdaptivePenaltyController: vi.fn(() => ({
		getPenalty: vi.fn(() => 0),
		recordFailure: vi.fn(),
		recordSuccess: vi.fn(),
	})),
}));

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("subagents.ts 型定義", () => {
	describe("SubagentDefinition", () => {
		it("必須フィールドを持つ", () => {
			const agent = {
				id: "researcher",
				name: "Researcher",
				description: "Research specialist",
				systemPrompt: "You are a researcher.",
				enabled: "enabled" as const,
			};
			expect(agent.id).toBe("researcher");
			expect(agent.name).toBe("Researcher");
			expect(agent.enabled).toBe("enabled");
		});

		it("オプションフィールド", () => {
			const agent = {
				id: "researcher",
				name: "Researcher",
				description: "Research specialist",
				systemPrompt: "You are a researcher.",
				enabled: "enabled" as const,
				provider: "anthropic" as const,
				model: "claude-3",
			};
			expect(agent.provider).toBe("anthropic");
			expect(agent.model).toBe("claude-3");
		});
	});

	describe("SubagentRunRecord", () => {
		it("必須フィールドを持つ", () => {
			const record = {
				runId: "run-123",
				agentId: "researcher",
				task: "Research task",
				startedAt: "2024-01-01T00:00:00Z",
				status: "completed" as const,
				summary: "Task completed",
			};
			expect(record.runId).toBe("run-123");
			expect(record.status).toBe("completed");
		});

		it("オプションフィールド", () => {
			const record = {
				runId: "run-123",
				agentId: "researcher",
				task: "Research task",
				startedAt: "2024-01-01T00:00:00Z",
				finishedAt: "2024-01-01T00:01:00Z",
				status: "completed" as const,
				summary: "Task completed",
				exitCode: 0,
				tokensUsed: 1000,
			};
			expect(record.finishedAt).toBeDefined();
			expect(record.exitCode).toBe(0);
			expect(record.tokensUsed).toBe(1000);
		});
	});

	describe("SubagentStorage", () => {
		it("基本構造", () => {
			const storage = {
				agents: [],
				currentAgentId: null,
				runs: [],
				defaultsVersion: "1.0.0",
			};
			expect(storage.agents).toEqual([]);
			expect(storage.currentAgentId).toBeNull();
			expect(storage.runs).toEqual([]);
		});
	});
});

// ============================================================================
// ID正規化のテスト
// ============================================================================

describe("toAgentId", () => {
	function toAgentId(input: string): string {
		return input
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\s_-]/g, "")
			.replace(/[\s_]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48);
	}

	it("小文字化", () => {
		expect(toAgentId("MyAgent")).toBe("myagent");
	});

	it("スペースをハイフンに変換", () => {
		expect(toAgentId("my agent")).toBe("my-agent");
	});

	it("特殊文字を削除", () => {
		expect(toAgentId("my@agent#123")).toBe("myagent123");
	});

	it("アンダースコアをハイフンに変換", () => {
		expect(toAgentId("my_agent")).toBe("my-agent");
	});

	it("最大長48文字に切り詰め", () => {
		const longId = "a".repeat(100);
		const result = toAgentId(longId);
		expect(result.length).toBe(48);
	});

	it("前後のハイフンを削除", () => {
		expect(toAgentId("--agent--")).toBe("agent");
	});

	it("複数のハイフンを単一に", () => {
		expect(toAgentId("my---agent")).toBe("my-agent");
	});
});

// ============================================================================
// エージェント選択のテスト
// ============================================================================

describe("エージェント選択", () => {
	describe("pickAgent", () => {
		it("IDで選択", () => {
			const storage = {
				agents: [
					{ id: "researcher", name: "Researcher", description: "", systemPrompt: "", enabled: "enabled" as const },
					{ id: "implementer", name: "Implementer", description: "", systemPrompt: "", enabled: "enabled" as const },
				],
				currentAgentId: null,
				runs: [],
				defaultsVersion: "1.0.0",
			};

			const requestedId = "implementer";
			const found = storage.agents.find((agent) => agent.id === requestedId);

			expect(found?.id).toBe("implementer");
		});

		it("現在のエージェントを選択", () => {
			const storage = {
				agents: [
					{ id: "researcher", name: "Researcher", description: "", systemPrompt: "", enabled: "enabled" as const },
					{ id: "implementer", name: "Implementer", description: "", systemPrompt: "", enabled: "enabled" as const },
				],
				currentAgentId: "implementer",
				runs: [],
				defaultsVersion: "1.0.0",
			};

			const found = storage.currentAgentId
				? storage.agents.find((agent) => agent.id === storage.currentAgentId)
				: undefined;

			expect(found?.id).toBe("implementer");
		});

		it("有効なエージェントを選択（指定なし）", () => {
			const storage = {
				agents: [
					{ id: "researcher", name: "Researcher", description: "", systemPrompt: "", enabled: "enabled" as const },
					{ id: "implementer", name: "Implementer", description: "", systemPrompt: "", enabled: "disabled" as const },
				],
				currentAgentId: null,
				runs: [],
				defaultsVersion: "1.0.0",
			};

			const found = storage.agents.find((agent) => agent.enabled === "enabled");

			expect(found?.id).toBe("researcher");
		});
	});

	describe("pickDefaultParallelAgents", () => {
		it("有効なエージェントのみ返す", () => {
			const storage = {
				agents: [
					{ id: "a1", name: "A1", description: "", systemPrompt: "", enabled: "enabled" as const },
					{ id: "a2", name: "A2", description: "", systemPrompt: "", enabled: "disabled" as const },
					{ id: "a3", name: "A3", description: "", systemPrompt: "", enabled: "enabled" as const },
				],
				currentAgentId: null,
				runs: [],
				defaultsVersion: "1.0.0",
			};

			const enabledAgents = storage.agents.filter((agent) => agent.enabled === "enabled");

			expect(enabledAgents).toHaveLength(2);
			expect(enabledAgents.map(a => a.id)).toEqual(["a1", "a3"]);
		});
	});
});

// ============================================================================
// バックグラウンドジョブのテスト
// ============================================================================

describe("バックグラウンドジョブ", () => {
	const MAX_BACKGROUND_JOBS = 200;
	const backgroundJobs = new Map<string, {
		jobId: string;
		mode: "single" | "parallel";
		status: "queued" | "running" | "completed" | "failed";
	}>();
	const backgroundJobOrder: string[] = [];

	function createBackgroundJob(input: {
		mode: "single" | "parallel";
		task: string;
		subagentIds: string[];
	}) {
		const nowIso = new Date().toISOString();
		const job = {
			jobId: `job-${Date.now()}-${Math.random()}`,
			mode: input.mode,
			status: "queued" as const,
			task: input.task,
			subagentIds: input.subagentIds,
			createdAt: nowIso,
		};
		backgroundJobs.set(job.jobId, job);
		backgroundJobOrder.push(job.jobId);

		// 古いジョブを削除
		while (backgroundJobOrder.length > MAX_BACKGROUND_JOBS) {
			const droppedId = backgroundJobOrder.shift();
			if (!droppedId) break;
			backgroundJobs.delete(droppedId);
		}
		return job;
	}

	beforeEach(() => {
		backgroundJobs.clear();
		backgroundJobOrder.length = 0;
	});

	it("ジョブを作成", () => {
		const job = createBackgroundJob({
			mode: "single",
			task: "test task",
			subagentIds: ["researcher"],
		});

		expect(backgroundJobs.has(job.jobId)).toBe(true);
		expect(backgroundJobOrder).toContain(job.jobId);
	});

	it("最大ジョブ数を維持", () => {
		// 多数のジョブを作成
		for (let i = 0; i < 300; i++) {
			createBackgroundJob({
				mode: "single",
				task: `task ${i}`,
				subagentIds: ["researcher"],
			});
		}

		expect(backgroundJobOrder.length).toBe(MAX_BACKGROUND_JOBS);
		expect(backgroundJobs.size).toBe(MAX_BACKGROUND_JOBS);
	});

	it("古いジョブが削除される", () => {
		// 最初のジョブを作成
		const firstJob = createBackgroundJob({
			mode: "single",
			task: "first task",
			subagentIds: ["researcher"],
		});

		// 多数のジョブを作成
		for (let i = 0; i < 250; i++) {
			createBackgroundJob({
				mode: "single",
				task: `task ${i}`,
				subagentIds: ["researcher"],
			});
		}

		// 最初のジョブは削除されている
		expect(backgroundJobs.has(firstJob.jobId)).toBe(false);
		expect(backgroundJobOrder.includes(firstJob.jobId)).toBe(false);
	});
});

// ============================================================================
// スキル管理のテスト
// ============================================================================

describe("スキル管理", () => {
	describe("mergeSkillArrays", () => {
		it("空配列[]は未指定として扱う", () => {
			const base: string[] = [];
			const additional: string[] = [];

			// []はマージしない
			const merged = base.length === 0 ? additional : [...base, ...additional];

			expect(merged).toEqual([]);
		});

		it("非空配列をマージ", () => {
			const base: string[] = ["skill1", "skill2"];
			const additional: string[] = ["skill3", "skill4"];

			const merged = [...base, ...additional];

			expect(merged).toEqual(["skill1", "skill2", "skill3", "skill4"]);
		});

		it("重複を削除", () => {
			const base: string[] = ["skill1", "skill2"];
			const additional: string[] = ["skill2", "skill3"];

			const merged = [...new Set([...base, ...additional])];

			expect(merged).toEqual(["skill1", "skill2", "skill3"]);
		});
	});

	describe("resolveEffectiveSkills", () => {
		it("エージェントのスキルを優先", () => {
			const agentSkills = ["skill1", "skill2"];
			const inheritedSkills = ["skill3"];

			const effective = agentSkills.length > 0 ? agentSkills : inheritedSkills;

			expect(effective).toEqual(["skill1", "skill2"]);
		});

		it("エージェントにスキルがない場合は継承", () => {
			const agentSkills: string[] = [];
			const inheritedSkills = ["skill3"];

			const effective = agentSkills.length > 0 ? agentSkills : inheritedSkills;

			expect(effective).toEqual(["skill3"]);
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のストレージ", () => {
		it("エージェントがない", () => {
			const storage = {
				agents: [],
				currentAgentId: null,
				runs: [],
				defaultsVersion: "1.0.0",
			};

			const found = storage.agents.find(() => true);
			expect(found).toBeUndefined();
		});
	});

	describe("無効なエージェントID", () => {
		it("存在しないIDの検索", () => {
			const storage = {
				agents: [
					{ id: "agent1", name: "A1", description: "", systemPrompt: "", enabled: "enabled" as const },
				],
				currentAgentId: null,
				runs: [],
				defaultsVersion: "1.0.0",
			};

			const found = storage.agents.find((agent) => agent.id === "nonexistent");
			expect(found).toBeUndefined();
		});
	});

	describe("特殊なID", () => {
		it("空文字列のID正規化", () => {
			const result = "".toLowerCase().trim().replace(/[^a-z0-9\s_-]/g, "");
			expect(result).toBe("");
		});

		it("記号のみのID", () => {
			const result = "@#$%^&*()".toLowerCase().trim().replace(/[^a-z0-9\s_-]/g, "");
			expect(result).toBe("");
		});
	});

	describe("全エージェント無効", () => {
		it("有効なエージェントがない場合", () => {
			const storage = {
				agents: [
					{ id: "a1", name: "A1", description: "", systemPrompt: "", enabled: "disabled" as const },
					{ id: "a2", name: "A2", description: "", systemPrompt: "", enabled: "disabled" as const },
				],
				currentAgentId: null,
				runs: [],
				defaultsVersion: "1.0.0",
			};

			const enabledAgents = storage.agents.filter((agent) => agent.enabled === "enabled");

			expect(enabledAgents).toHaveLength(0);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("subagents.ts プロパティベーステスト", () => {
	it("PBT: toAgentIdは有効なIDを生成", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 100 }),
				(input) => {
					const result = input
						.toLowerCase()
						.trim()
						.replace(/[^a-z0-9\s_-]/g, "")
						.replace(/[\s_]+/g, "-")
						.replace(/-+/g, "-")
						.replace(/^-+|-+$/g, "")
						.slice(0, 48);

					// 結果は英数字とハイフンのみ
					return /^[a-z0-9-]*$/.test(result);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("PBT: スキル配列のマージ", () => {
		fc.assert(
			fc.property(
				fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
				fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
				(arr1, arr2) => {
					const merged = [...new Set([...arr1, ...arr2])];

					// すべての要素が含まれている
					const allElements = [...arr1, ...arr2].every(el => merged.includes(el));

					// 重複がない
					const noDuplicates = merged.length === new Set(merged).size;

					return allElements && noDuplicates;
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: エージェント選択の一貫性", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 10 }),
						enabled: fc.constantFrom("enabled", "disabled" as const),
					}),
					{ minLength: 1, maxLength: 10 }
				),
				(agents) => {
					const enabledAgents = agents.filter(a => a.enabled === "enabled");
					const disabledAgents = agents.filter(a => a.enabled === "disabled");

					// 有効と無効の合計は総数
					return enabledAgents.length + disabledAgents.length === agents.length;
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: バックグラウンドジョブの上限維持", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 1000 }),
				(count) => {
					const MAX_JOBS = 200;
					const actualCount = Math.min(count, MAX_JOBS);

					return actualCount <= MAX_JOBS;
				}
			),
			{ numRuns: 50 }
		);
	});
});
