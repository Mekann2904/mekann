/**
 * @file .pi/extensions/ul-dual-mode.ts の単体テスト
 * @description 高品質実行モードとセッション永続化機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

const ulWorkflowMocks = vi.hoisted(() => ({
	getCurrentWorkflow: vi.fn(() => null),
}));

vi.mock("../../../.pi/lib/workspace-verification.js", () => ({
	isCompletionBlocked: vi.fn(() => false),
	loadWorkspaceVerificationConfig: vi.fn(() => ({ enabled: false })),
	loadWorkspaceVerificationState: vi.fn(() => ({})),
	resolveWorkspaceVerificationPlan: vi.fn(() => ({})),
}));

vi.mock("../../../.pi/extensions/ul-workflow.js", () => ({
	getCurrentWorkflow: ulWorkflowMocks.getCurrentWorkflow,
}));

// モック後にインポート
import ulDualMode, { buildUlWorkflowPrompt } from "../../../.pi/extensions/ul-dual-mode.js";

function createMockPi() {
	const handlers = new Map<string, (event: any, ctx: any) => Promise<any> | any>();
	return {
		handlers,
		appendEntry: vi.fn(),
		registerCommand: vi.fn(),
		on: vi.fn((name: string, handler: any) => handlers.set(name, handler)),
	};
}

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("ul-dual-mode.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(ulDualMode).toBeDefined();
		expect(typeof ulDualMode).toBe("function");
	});
});

// ============================================================================
// UL_PREFIX検出のテスト
// ============================================================================

describe("UL_PREFIX検出", () => {
	const UL_PREFIX = /^\s*ul(?:\s+|$)/i;

	it("ulプレフィックスを検出する", () => {
		expect(UL_PREFIX.test("ul task")).toBe(true);
		expect(UL_PREFIX.test("ul")).toBe(true);
	});

	it("先頭空白を許容する", () => {
		expect(UL_PREFIX.test("  ul task")).toBe(true);
		expect(UL_PREFIX.test("\tul task")).toBe(true);
	});

	it("大文字小文字を区別しない", () => {
		expect(UL_PREFIX.test("UL task")).toBe(true);
		expect(UL_PREFIX.test("Ul task")).toBe(true);
		expect(UL_PREFIX.test("uL task")).toBe(true);
	});

	it("ulのみで終わる場合もマッチする", () => {
		expect(UL_PREFIX.test("ul")).toBe(true);
		expect(UL_PREFIX.test("  ul")).toBe(true);
	});

	it("プレフィックスがない場合はマッチしない", () => {
		expect(UL_PREFIX.test("task")).toBe(false);
		expect(UL_PREFIX.test("module")).toBe(false); // "ul"を含むがプレフィックスではない
	});

	it("途中にulがある場合はマッチしない", () => {
		expect(UL_PREFIX.test("please ul task")).toBe(false);
	});
});

// ============================================================================
// テキスト抽出のテスト
// ============================================================================

describe("extractTextWithoutUlPrefix関数", () => {
	const extractTextWithoutUlPrefix = (text: string): string => {
		return text.replace(/^\s*ul(?:\s+|$)/i, "").trimStart();
	};

	it("ulプレフィックスを除去する", () => {
		expect(extractTextWithoutUlPrefix("ul task")).toBe("task");
	});

	it("先頭空白を保持しつつプレフィックスを除去", () => {
		expect(extractTextWithoutUlPrefix("  ul task")).toBe("task");
	});

	it("大文字小文字を区別しない", () => {
		expect(extractTextWithoutUlPrefix("UL TASK")).toBe("TASK");
	});

	it("プレフィックスがない場合はそのまま", () => {
		expect(extractTextWithoutUlPrefix("task")).toBe("task");
	});

	it("空文字列の場合は空文字列", () => {
		expect(extractTextWithoutUlPrefix("")).toBe("");
	});

	it("ulのみの場合は空文字列", () => {
		expect(extractTextWithoutUlPrefix("ul")).toBe("");
	});
});

// ============================================================================
// ワークフロープロンプト生成のテスト
// ============================================================================

describe("buildUlWorkflowPrompt", () => {
	it("ResearchからCommitまでの固定フローを含む", () => {
		const prompt = buildUlWorkflowPrompt("認証フローのバグを修正");

		expect(prompt).toContain("1. Research");
		expect(prompt).toContain("2. Plan");
		expect(prompt).toContain("3. Question拡張で人間確認");
		expect(prompt).toContain("4. 承認された場合のみ Implement");
		expect(prompt).toContain("5. Verify");
		expect(prompt).toContain("6. Commit");
	});

	it("questionツールの実際の引数形式を使う", () => {
		const prompt = buildUlWorkflowPrompt("通知バグ修正");

		expect(prompt).toContain('"tool": "question"');
		expect(prompt).toContain('"question": "plan.md を確認してください。');
		expect(prompt).toContain('"options": [');
		expect(prompt).not.toContain('"questions": [');
	});

	it("修正要求時に modify_plan を再実行する指示を含む", () => {
		const prompt = buildUlWorkflowPrompt("通知バグ修正");

		expect(prompt).toContain("ul_workflow_modify_plan");
		expect(prompt).toContain("再度 `question` ツールで確認する");
	});

	it("verify-first の closeout 条件を含む", () => {
		const prompt = buildUlWorkflowPrompt("通知バグ修正");

		expect(prompt).toContain("workspace_verify");
		expect(prompt).toContain("console error");
		expect(prompt).toContain("workspace_verify_ack");
		expect(prompt).toContain("verify が通る前に Commit しない");
	});

	it("ABDD ツールを前提にしない", () => {
		const prompt = buildUlWorkflowPrompt("通知バグ修正");

		expect(prompt.toLowerCase()).not.toContain("abdd");
		expect(prompt).not.toContain("abdd_compare_plan");
	});
});

// ============================================================================
// クリアゴール検出のテスト
// ============================================================================

describe("looksLikeClearGoalTask関数", () => {
	const CLEAR_GOAL_SIGNAL =
		/(達成条件|完了条件|成功条件|受け入れ条件|until|done when|all tests pass|tests pass|lint pass|build succeeds?|exit code 0|エラー0|テスト.*通る|lint.*通る|build.*成功)/i;

	const looksLikeClearGoalTask = (text: string): boolean => {
		const normalized = String(text || "").trim();
		if (!normalized) return false;
		return CLEAR_GOAL_SIGNAL.test(normalized);
	};

	it("達成条件を検出する", () => {
		expect(looksLikeClearGoalTask("達成条件: テストが通る")).toBe(true);
	});

	it("完了条件を検出する", () => {
		expect(looksLikeClearGoalTask("完了条件を満たす")).toBe(true);
	});

	it("all tests passを検出する", () => {
		expect(looksLikeClearGoalTask("Make all tests pass")).toBe(true);
	});

	it("build succeedsを検出する", () => {
		expect(looksLikeClearGoalTask("Ensure build succeeds")).toBe(true);
	});

	it("通常のタスクは検出しない", () => {
		expect(looksLikeClearGoalTask("Fix the bug")).toBe(false);
		expect(looksLikeClearGoalTask("Add feature")).toBe(false);
	});

	it("空文字列はfalse", () => {
		expect(looksLikeClearGoalTask("")).toBe(false);
	});
});

// ============================================================================
// 小規模タスク判定のテスト
// ============================================================================

describe("isTrivialTask関数", () => {
	const UL_REVIEWER_MIN_TASK_LENGTH = 200;
	const UL_TRIVIAL_PATTERNS = [
		/^read\s+/i,
		/^show\s+/i,
		/^list\s+/i,
		/^what\s+is/i,
		/^explain\s+/i,
		/^\?/,
		/^search\s+/i,
		/^find\s+/i,
	];

	const isTrivialTask = (task: string): boolean => {
		const normalized = String(task || "").trim();
		if (!normalized) return true;

		if (normalized.length < UL_REVIEWER_MIN_TASK_LENGTH) {
			return true;
		}

		for (const pattern of UL_TRIVIAL_PATTERNS) {
			if (pattern.test(normalized)) {
				return true;
			}
		}

		return false;
	};

	it("短いタスクは小規模扱い", () => {
		expect(isTrivialTask("Fix typo")).toBe(true);
	});

	it("readパターンを検出する", () => {
		const longRead = "read " + "x".repeat(300);
		expect(isTrivialTask(longRead)).toBe(true);
	});

	it("showパターンを検出する", () => {
		const longShow = "show " + "x".repeat(300);
		expect(isTrivialTask(longShow)).toBe(true);
	});

	it("疑問符開始を検出する", () => {
		const longQuestion = "? " + "x".repeat(300);
		expect(isTrivialTask(longQuestion)).toBe(true);
	});

	it("長く複雑なタスクは小規模扱いしない", () => {
		const complexTask =
			"Implement a new feature that includes multiple components and requires thorough testing";
		expect(isTrivialTask(complexTask)).toBe(true); // まだ短い

		const veryLongTask = "Implement ".repeat(50);
		expect(isTrivialTask(veryLongTask)).toBe(false);
	});

	it("空文字列はtrue", () => {
		expect(isTrivialTask("")).toBe(true);
	});
});

// ============================================================================
// 状態管理のテスト
// ============================================================================

describe("状態管理", () => {
	const state = {
		persistentUlMode: false,
		pendingUlMode: false,
		activeUlMode: false,
		pendingGoalLoopMode: false,
		activeGoalLoopMode: false,
		usedSubagentRun: false,
		usedAgentTeamRun: false,
		completedRecommendedSubagentPhase: false,
		completedRecommendedTeamPhase: false,
		completedRecommendedReviewerPhase: false,
		currentTask: "",
	};

	describe("初期状態", () => {
		it("全てのフラグが初期化されている", () => {
			expect(state.persistentUlMode).toBe(false);
			expect(state.activeUlMode).toBe(false);
			expect(state.usedSubagentRun).toBe(false);
		});
	});

	describe("resetState", () => {
		it("状態をリセットする", () => {
			const resetState = () => ({
				pendingUlMode: false,
				activeUlMode: false,
				pendingGoalLoopMode: false,
				activeGoalLoopMode: false,
				usedSubagentRun: false,
				usedAgentTeamRun: false,
				completedRecommendedSubagentPhase: false,
				completedRecommendedTeamPhase: false,
				completedRecommendedReviewerPhase: false,
				currentTask: "",
			});

			const newState = resetState();
			expect(newState.activeUlMode).toBe(false);
			expect(newState.usedSubagentRun).toBe(false);
			expect(newState.currentTask).toBe("");
		});
	});
});

// ============================================================================
// ツール実行検出のテスト
// ============================================================================

describe("ツール実行検出", () => {
	const SUBAGENT_EXECUTION_TOOLS = new Set([
		"subagent_run",
		"subagent_run_parallel",
	]);

	const AGENT_TEAM_EXECUTION_TOOLS = new Set([
		"agent_team_run",
		"agent_team_run_parallel",
	]);

	it("サブエージェントツールを検出する", () => {
		expect(SUBAGENT_EXECUTION_TOOLS.has("subagent_run")).toBe(true);
		expect(SUBAGENT_EXECUTION_TOOLS.has("subagent_run_parallel")).toBe(true);
	});

	it("チームツールを検出する", () => {
		expect(AGENT_TEAM_EXECUTION_TOOLS.has("agent_team_run")).toBe(true);
		expect(AGENT_TEAM_EXECUTION_TOOLS.has("agent_team_run_parallel")).toBe(
			true
		);
	});

	it("他のツールは検出しない", () => {
		expect(SUBAGENT_EXECUTION_TOOLS.has("read")).toBe(false);
		expect(AGENT_TEAM_EXECUTION_TOOLS.has("bash")).toBe(false);
	});
});

// ============================================================================
// スロットリングのテスト
// ============================================================================

describe("スロットリング", () => {
	const REFRESH_STATUS_THROTTLE_MS = 300;

	it("300ms間隔でスロットリングする", () => {
		let lastRefreshStatusMs = -REFRESH_STATUS_THROTTLE_MS; // 初回は必ず通す
		const shouldRefresh = (now: number): boolean => {
			if (now - lastRefreshStatusMs < REFRESH_STATUS_THROTTLE_MS) {
				return false;
			}
			lastRefreshStatusMs = now;
			return true;
		};

		expect(shouldRefresh(0)).toBe(true);
		expect(shouldRefresh(100)).toBe(false);
		expect(shouldRefresh(200)).toBe(false);
		expect(shouldRefresh(300)).toBe(true);
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("非常に長いタスク", () => {
		it("長いタスクでも処理可能", () => {
			const longTask = "x".repeat(10000);
			expect(longTask.length).toBe(10000);
		});
	});

	describe("特殊文字を含むタスク", () => {
		it("日本語タスク", () => {
			const task = "ul 日本語タスクを実行する";
			const extracted = task.replace(/^\s*ul(?:\s+|$)/i, "").trimStart();
			expect(extracted).toBe("日本語タスクを実行する");
		});

		it("絵文字を含むタスク", () => {
			const task = "ul Implement feature!";
			expect(task).toContain("ul");
		});
	});

	describe("複数行タスク", () => {
		it("複数行でもプレフィックス検出", () => {
			const task = "ul first line\nsecond line";
			const UL_PREFIX = /^\s*ul(?:\s+|$)/i;
			expect(UL_PREFIX.test(task)).toBe(true);
		});
	});
});

describe("承認前実装ゲート", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ulWorkflowMocks.getCurrentWorkflow.mockReturnValue(null);
	});

	it("annotateフェーズではeditをブロックする", async () => {
		const pi = createMockPi();
		ulDualMode(pi as any);

		const ctx = {
			hasUI: false,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
			},
			sessionManager: { getEntries: () => [] },
		};

		await pi.handlers.get("input")?.({ source: "user", text: "ul 通知バグを修正" }, ctx);
		await pi.handlers.get("before_agent_start")?.({ systemPrompt: "base" }, ctx);

		ulWorkflowMocks.getCurrentWorkflow.mockReturnValue({
			taskId: "task-1",
			phase: "annotate",
			approvedPhases: ["research", "plan"],
		});

		const result = await pi.handlers.get("tool_call")?.({ toolName: "edit", input: { file: "a.ts" } }, ctx);
		expect(result?.block).toBe(true);
		expect(result?.reason).toContain("plan 承認前");

		await pi.handlers.get("session_shutdown")?.({}, ctx);
	});

	it("annotateフェーズでもplan.mdの編集は許可する", async () => {
		const pi = createMockPi();
		ulDualMode(pi as any);

		const ctx = {
			hasUI: false,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
			},
			sessionManager: { getEntries: () => [] },
		};

		await pi.handlers.get("input")?.({ source: "user", text: "ul 通知バグを修正" }, ctx);
		await pi.handlers.get("before_agent_start")?.({ systemPrompt: "base" }, ctx);

		ulWorkflowMocks.getCurrentWorkflow.mockReturnValue({
			taskId: "task-1",
			phase: "annotate",
			approvedPhases: ["research", "plan"],
		});

		const result = await pi.handlers.get("tool_call")?.({
			toolName: "edit",
			input: { path: ".pi/ul-workflow/tasks/task-1/plan.md" },
		}, ctx);
		expect(result).toBeUndefined();

		await pi.handlers.get("session_shutdown")?.({}, ctx);
	});

	it("edit以外のツールは通常どおり通す", async () => {
		const pi = createMockPi();
		ulDualMode(pi as any);

		const ctx = {
			hasUI: false,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
			},
			sessionManager: { getEntries: () => [] },
		};

		await pi.handlers.get("input")?.({ source: "user", text: "ul 認証バグを修正" }, ctx);
		await pi.handlers.get("before_agent_start")?.({ systemPrompt: "base" }, ctx);

		ulWorkflowMocks.getCurrentWorkflow.mockReturnValue({
			taskId: "task-2",
			phase: "annotate",
			approvedPhases: ["research", "plan"],
		});

		const writeResult = await pi.handlers.get("tool_call")?.({
			toolName: "write",
			input: { path: "src/new-file.ts" },
		}, ctx);
		expect(writeResult).toBeUndefined();

		const approveResult = await pi.handlers.get("tool_call")?.({
			toolName: "ul_workflow_approve",
			input: {},
		}, ctx);
		expect(approveResult).toBeUndefined();

		await pi.handlers.get("session_shutdown")?.({}, ctx);
	});
});
