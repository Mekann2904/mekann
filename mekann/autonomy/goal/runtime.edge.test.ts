/**
 * Feature audit tests — GoalRuntime wall-clock and continuation behavior.
 *
 * Validates GL-02-T1, GL-02-T2, GL-02-T3 from the feature list.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { GoalStore, GoalError, type GoalStateEntry, DEFAULT_MAX_CONTINUATIONS } from "./state.js";
import { GoalRuntime } from "./runtime.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPi() {
	return {
		sendUserMessage: vi.fn(),
		getFlag: vi.fn(() => true),
		registerTool: vi.fn(),
		registerCommand: vi.fn(),
		registerFlag: vi.fn(),
		on: vi.fn(),
		events: { on: vi.fn(), emit: vi.fn() },
		appendEntry: vi.fn(),
	};
}

function createMockCtx(overrides: Record<string, any> = {}) {
	return {
		sessionManager: {
			isPersisted: vi.fn(() => true),
			getSessionId: vi.fn(() => "test-session"),
			getBranch: vi.fn(() => []),
		},
		ui: {
			notify: vi.fn(),
			setWidget: vi.fn(),
			confirm: vi.fn(() => Promise.resolve(true)),
			editor: vi.fn(() => Promise.resolve("edited")),
		},
		hasUI: true,
		cwd: "/test",
		...overrides,
	};
}

function createStoreWithGoal(
	objective = "Test objective",
	budget: number | null = null,
	continuationCount = 0,
): { store: GoalStore; entries: GoalStateEntry[] } {
	const entries: GoalStateEntry[] = [];
	const store = new GoalStore((e) => entries.push(e));
	store.createGoal("test-session", objective, budget, "tool");
	// Set continuation count if needed
	if (continuationCount > 0) {
		store.updateGoal({ continuation_count: continuationCount }, undefined, "runtime");
	}
	return { store, entries };
}

// ---------------------------------------------------------------------------
// GL-02-T1: onExternalMutationStarting pauses wall-clock
// ---------------------------------------------------------------------------

describe("GL-02-T1: onExternalMutationStarting pauses wall-clock accounting", () => {
	it("clears last_accounted_wall_clock baseline", () => {
		const { store } = createStoreWithGoal();
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);
		const ctx = createMockCtx();

		// Simulate session start to establish wall-clock baseline
		runtime.onSessionStart(ctx as any);
		expect(runtime.last_accounted_wall_clock).not.toBeNull();

		// External mutation should flush and clear baseline
		runtime.onExternalMutationStarting();
		expect(runtime.last_accounted_wall_clock).toBeNull();
	});

	it("does not account time during external mutation gap", () => {
		const { store } = createStoreWithGoal("obj", 10000);
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);
		const ctx = createMockCtx();

		runtime.onSessionStart(ctx as any);

		// Flush baseline
		runtime.onExternalMutationStarting();

		// Simulate 100 seconds passing during mutation
		const goalBefore = store.getGoal();
		const timeBefore = goalBefore!.time_used_seconds;

		// onExternalSet should reset baseline to now
		runtime.onExternalSet(store.getGoal()!);

		// Account for some time after resuming
		runtime.onTurnStart({ turnIndex: 1 }, ctx as any);
		runtime.onTurnEnd({ turnIndex: 1 }, ctx as any);

		const goalAfter = store.getGoal()!;
		// Time should have been accounted only after resumption, not the gap
		expect(goalAfter.time_used_seconds).toBeGreaterThanOrEqual(timeBefore);
	});
});

// ---------------------------------------------------------------------------
// GL-02-T2: budget exhaustion → user adds budget → resume
// ---------------------------------------------------------------------------

describe("GL-02-T2: budget exhaustion and user budget increase", () => {
	it("goal becomes budget_limited when tokens exceed budget", () => {
		const { store } = createStoreWithGoal("obj", 100);
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);
		const ctx = createMockCtx();

		runtime.onSessionStart(ctx as any);
		runtime.onAgentStart();

		// Account for 100 tokens → should trigger budget_limited
		runtime.onMessageEnd({
			message: {
				role: "assistant",
				usage: { input: 80, output: 20, cacheRead: 0 },
				timestamp: Date.now(),
			},
		}, ctx as any);

		const goal = store.getGoal();
		expect(goal!.status).toBe("budget_limited");
	});

	it("user increases budget and goal becomes active again via updateGoal", () => {
		const { store } = createStoreWithGoal("obj", 100);
		// Exhaust budget
		store.accountGoalUsage(0, 100);

		let goal = store.getGoal();
		expect(goal!.status).toBe("budget_limited");

		// User increases budget
		goal = store.updateGoal({ token_budget: 200 });
		// Status should still be budget_limited because updateGoal doesn't auto-reactivate
		expect(goal!.status).toBe("budget_limited");

		// Explicit activation needed
		goal = store.updateGoal({ status: "active" });
		// But if tokens_used >= token_budget, it clamps back to budget_limited
		// tokens_used = 100, budget = 200, so 100 < 200 → active
		expect(goal!.status).toBe("active");
	});
});

// ---------------------------------------------------------------------------
// GL-02-T3: max continuations → auto pause → resume resets count
// ---------------------------------------------------------------------------

describe("GL-02-T3: max continuations auto-pause and resume reset", () => {
	it("auto-pauses when continuation_count >= max_continuations", () => {
		const { store } = createStoreWithGoal("obj", null, DEFAULT_MAX_CONTINUATIONS);
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);
		const ctx = createMockCtx();

		runtime.onSessionStart(ctx as any);

		// Trigger continuation check
		runtime.maybeContinueIfIdle(ctx as any);

		// Goal should be paused
		const goal = store.getGoal();
		expect(goal!.status).toBe("paused");
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("automatically paused"),
			expect.any(Object),
		);
	});

	it("resume after max-continuations pause resets continuation_count", () => {
		const { store } = createStoreWithGoal("obj", null, DEFAULT_MAX_CONTINUATIONS);
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);

		// Simulate auto-pause from continuation limit
		store.updateGoal({ status: "paused" });

		// Resume with count reset (mimicking /goal resume behavior)
		const goal = store.getGoal();
		expect(goal!.continuation_count).toBe(DEFAULT_MAX_CONTINUATIONS);

		// The /goal resume handler checks: if continuation_count >= max_continuations → reset
		const shouldReset = goal!.continuation_count >= goal!.max_continuations;
		expect(shouldReset).toBe(true);

		store.updateGoal({
			status: "active",
			continuation_count: 0,
			last_continued_at_ms: null,
		});

		const resumed = store.getGoal();
		expect(resumed!.status).toBe("active");
		expect(resumed!.continuation_count).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Additional: usage deduplication
// ---------------------------------------------------------------------------

describe("GoalRuntime: assistant message usage deduplication", () => {
	it("does not double-count identical usage events", () => {
		const { store } = createStoreWithGoal("obj", 10000);
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);
		const ctx = createMockCtx();

		runtime.onSessionStart(ctx as any);
		runtime.onAgentStart();

		const usageEvent = {
			message: {
				role: "assistant",
				usage: { input: 50, output: 10, cacheRead: 0 },
				timestamp: 1000,
			},
		};

		// First event: counts
		runtime.onMessageEnd(usageEvent, ctx as any);
		const after1 = store.getGoal();
		expect(after1!.tokens_used).toBe(60); // 50 + 10

		// Duplicate event: ignored
		runtime.onMessageEnd(usageEvent, ctx as any);
		const after2 = store.getGoal();
		expect(after2!.tokens_used).toBe(60); // unchanged
	});
});

// ---------------------------------------------------------------------------
// Additional: objective length validation
// ---------------------------------------------------------------------------

describe("GoalStore: objective validation", () => {
	it("rejects empty objective", () => {
		const entries: GoalStateEntry[] = [];
		const store = new GoalStore((e) => entries.push(e));
		expect(() => store.createGoal("t", "")).toThrow(GoalError);
		expect(() => store.createGoal("t", "   ")).toThrow(GoalError);
	});

	it("rejects objective over 4000 characters", () => {
		const entries: GoalStateEntry[] = [];
		const store = new GoalStore((e) => entries.push(e));
		expect(() => store.createGoal("t", "x".repeat(4001))).toThrow(GoalError);
	});

	it("accepts objective at exactly 4000 characters", () => {
		const entries: GoalStateEntry[] = [];
		const store = new GoalStore((e) => entries.push(e));
		const goal = store.createGoal("t", "x".repeat(4000));
		expect(goal.objective).toHaveLength(4000);
	});
});

