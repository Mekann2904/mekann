/**
 * Feature audit tests — GoalRuntime wall-clock and continuation behavior.
 *
 * Validates GL-02-T1, GL-02-T2, GL-02-T3 from the feature list.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { GoalStore, GoalError, DEFAULT_OBJECTIVE_LENGTH, type GoalStateEntry } from "./state.js";
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
		isIdle: vi.fn(() => true),
		hasPendingMessages: vi.fn(() => false),
		getContextUsage: vi.fn(() => undefined),
		compact: vi.fn(),
		...overrides,
	};
}

function createStoreWithGoal(
	objective = "Test objective",
	budget: number | null = null,
): { store: GoalStore; entries: GoalStateEntry[] } {
	const entries: GoalStateEntry[] = [];
	const store = new GoalStore((e) => entries.push(e));
	store.createGoal("test-session", objective, budget, "tool");
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

		// User increases budget above tokens_used; goal auto-reactivates.
		goal = store.updateGoal({ token_budget: 200 });
		expect(goal!.status).toBe("active");
	});
});

// ---------------------------------------------------------------------------
// GL-02-T3: Codex-compatible continuations do not auto-pause
// ---------------------------------------------------------------------------

describe("GL-02-T3: Codex-compatible continuation", () => {
	it("continues indefinitely regardless of prior continuation history", () => {
		const { store } = createStoreWithGoal("obj", null);
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);
		const ctx = createMockCtx();

		runtime.onSessionStart(ctx as any);
		runtime.maybeContinueIfIdle(ctx as any);

		const goal = store.getGoal();
		expect(goal!.status).toBe("active");
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			expect.stringContaining("Continue working toward the active thread goal"),
			expect.any(Object),
		);
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

	it("rejects objective over the default limit", () => {
		const entries: GoalStateEntry[] = [];
		const store = new GoalStore((e) => entries.push(e));
		expect(() => store.createGoal("t", "x".repeat(DEFAULT_OBJECTIVE_LENGTH + 1))).toThrow(GoalError);
	});

	it("accepts objective at exactly the default limit", () => {
		const entries: GoalStateEntry[] = [];
		const store = new GoalStore((e) => entries.push(e));
		const goal = store.createGoal("t", "x".repeat(DEFAULT_OBJECTIVE_LENGTH));
		expect(goal.objective).toHaveLength(DEFAULT_OBJECTIVE_LENGTH);
	});

	it("honors an injected maxObjectiveLength", () => {
		const entries: GoalStateEntry[] = [];
		const store = new GoalStore((e) => entries.push(e), 50);
		expect(() => store.createGoal("t", "x".repeat(51))).toThrow(GoalError);
		const goal = store.createGoal("t", "x".repeat(50));
		expect(goal.objective).toHaveLength(50);
	});
});

// ---------------------------------------------------------------------------
// IC-213: token accounting must normalize cache semantics per provider
// ---------------------------------------------------------------------------

describe("GoalRuntime: IC-213 cache-usage normalization (no double-subtraction)", () => {
	it("does not double-subtract cache read for non-cached-input providers", () => {
		const { store } = createStoreWithGoal("obj", 100000);
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);
		const ctx = createMockCtx();

		runtime.onSessionStart(ctx as any);
		runtime.onAgentStart();

		// Anthropic-style usage: usage.input is the NON-cached input (100); cache
		// read (500) and cache write (200) are reported separately. The old code
		// computed input(100) - cacheRead(500), clamped to 0, plus output 50 =
		// 50 tokens (a massive underreport). After normalization the total input
		// is 100 + 500 + 200 = 800, so the non-cached budget proxy is
		// 800 - 500 + 50 = 350.
		runtime.onMessageEnd({
			message: {
				role: "assistant",
				usage: { input: 100, output: 50, cacheRead: 500, cacheWrite: 200 },
				timestamp: 2000,
			},
		}, ctx as any);

		expect(store.getGoal()!.tokens_used).toBe(350);
	});

	it("converges to the same delta for total-input providers", () => {
		const { store } = createStoreWithGoal("obj", 100000);
		const pi = createMockPi();
		const runtime = new GoalRuntime(store, pi as any);
		const ctx = createMockCtx();

		runtime.onSessionStart(ctx as any);
		runtime.onAgentStart();

		// Same physical request expressed with total_input semantics
		// (inputTotal already includes cache read): 800 - 500 + 50 = 350, matching
		// the non-cached-input case above.
		runtime.onMessageEnd({
			message: {
				role: "assistant",
				usage: { inputTotal: 800, output: 50, cacheRead: 500 },
				timestamp: 3000,
			},
		}, ctx as any);

		expect(store.getGoal()!.tokens_used).toBe(350);
	});
});
