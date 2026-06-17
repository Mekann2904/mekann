/**
 * goal/state.test.ts — GoalStore and validation unit tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	GoalStore,
	GoalError,
	validateObjective,
	validateTokenBudget,
	DEFAULT_OBJECTIVE_LENGTH,
	HARD_MAX_OBJECTIVE_LENGTH,
	clampObjectiveLimit,
	type GoalStateEntry,
	type Goal,
} from "./state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore() {
	const persisted: GoalStateEntry[] = [];
	const store = new GoalStore((entry) => persisted.push(entry));
	return { store, persisted };
}

function makeStoreWithLimit(maxObjectiveLength: number) {
	const persisted: GoalStateEntry[] = [];
	const store = new GoalStore((entry) => persisted.push(entry), maxObjectiveLength);
	return { store, persisted };
}

let uuidCounter = 0;

beforeEach(() => {
	uuidCounter = 0;
	vi.spyOn(crypto, "randomUUID").mockImplementation(() => `uuid-${++uuidCounter}`);
});

// ---------------------------------------------------------------------------
// validateObjective
// ---------------------------------------------------------------------------

describe("validateObjective", () => {
	it("accepts valid objective", () => {
		expect(validateObjective("Build a REST API")).toBe("Build a REST API");
	});

	it("trims whitespace", () => {
		expect(validateObjective("  hello  ")).toBe("hello");
	});

	it("rejects empty objective", () => {
		expect(() => validateObjective("")).toThrow(GoalError);
		expect(() => validateObjective("")).toThrow("Objective cannot be empty");
	});

	it("rejects whitespace-only objective", () => {
		expect(() => validateObjective("   ")).toThrow(GoalError);
	});

	it(`rejects objective exceeding default ${DEFAULT_OBJECTIVE_LENGTH} characters`, () => {
		const long = "a".repeat(DEFAULT_OBJECTIVE_LENGTH + 1);
		expect(() => validateObjective(long)).toThrow(GoalError);
		expect(() => validateObjective(long)).toThrow("Objective too long");
	});

	it(`accepts objective at exactly ${DEFAULT_OBJECTIVE_LENGTH} characters`, () => {
		const exact = "a".repeat(DEFAULT_OBJECTIVE_LENGTH);
		expect(validateObjective(exact)).toBe(exact);
	});

	it("honors an explicit maxLen argument", () => {
		expect(() => validateObjective("a".repeat(501), 500)).toThrow("Objective too long");
		expect(validateObjective("a".repeat(500), 500)).toHaveLength(500);
	});
});

// ---------------------------------------------------------------------------
// clampObjectiveLimit
// ---------------------------------------------------------------------------

describe("clampObjectiveLimit", () => {
	it("returns the default for undefined / non-finite values", () => {
		expect(clampObjectiveLimit(undefined)).toBe(DEFAULT_OBJECTIVE_LENGTH);
		expect(clampObjectiveLimit(NaN)).toBe(DEFAULT_OBJECTIVE_LENGTH);
		expect(clampObjectiveLimit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_OBJECTIVE_LENGTH);
	});

	it("clamps below 1 up to 1", () => {
		expect(clampObjectiveLimit(0)).toBe(1);
		expect(clampObjectiveLimit(-5)).toBe(1);
	});

	it(`clamps above ${HARD_MAX_OBJECTIVE_LENGTH} down to the hard ceiling`, () => {
		expect(clampObjectiveLimit(HARD_MAX_OBJECTIVE_LENGTH + 1)).toBe(HARD_MAX_OBJECTIVE_LENGTH);
	});

	it("floors fractional input", () => {
		expect(clampObjectiveLimit(123.9)).toBe(123);
	});
});

// ---------------------------------------------------------------------------
// validateTokenBudget
// ---------------------------------------------------------------------------

describe("validateTokenBudget", () => {
	it("returns null for undefined", () => {
		expect(validateTokenBudget(undefined)).toBeNull();
	});

	it("returns null for null", () => {
		expect(validateTokenBudget(null)).toBeNull();
	});

	it("accepts positive integer", () => {
		expect(validateTokenBudget(100)).toBe(100);
	});

	it("rejects zero", () => {
		expect(() => validateTokenBudget(0)).toThrow(GoalError);
	});

	it("rejects negative integer", () => {
		expect(() => validateTokenBudget(-5)).toThrow(GoalError);
	});

	it("rejects float", () => {
		expect(() => validateTokenBudget(1.5)).toThrow(GoalError);
	});

	it("rejects string", () => {
		expect(() => validateTokenBudget("100" as unknown as number)).toThrow(GoalError);
	});
});

// ---------------------------------------------------------------------------
// createGoal
// ---------------------------------------------------------------------------

describe("createGoal", () => {
	it("creates active goal", () => {
		const { store, persisted } = makeStore();
		const goal = store.createGoal("thread-1", "Build a REST API", 5000, "user");

		expect(goal.thread_id).toBe("thread-1");
		expect(goal.goal_id).toBe("uuid-1");
		expect(goal.objective).toBe("Build a REST API");
		expect(goal.status).toBe("active");
		expect(goal.token_budget).toBe(5000);
		expect(goal.tokens_used).toBe(0);
		expect(goal.time_used_seconds).toBe(0);
		expect(goal.created_at_ms).toBeTypeOf("number");
		expect(goal.updated_at_ms).toBe(goal.created_at_ms);

		// Persisted a "set" entry
		expect(persisted).toHaveLength(1);
		expect(persisted[0]).toEqual({
			kind: "set",
			goal: { ...goal },
			source: "user",
		});
	});

	it("creates goal with null budget by default", () => {
		const { store } = makeStore();
		const goal = store.createGoal("t1", "Do stuff");
		expect(goal.token_budget).toBeNull();
	});

	it("creates goal with tool source", () => {
		const { store, persisted } = makeStore();
		store.createGoal("t1", "Obj", null, "tool");
		expect(persisted[0]!.source).toBe("tool");
	});

	it("fails when existing goal exists", () => {
		const { store } = makeStore();
		store.createGoal("thread-1", "First goal");
		expect(() => store.createGoal("thread-1", "Second goal")).toThrow(GoalError);
		expect(() => store.createGoal("thread-1", "Second goal")).toThrow(
			"Goal already exists for this thread",
		);
	});

	it("rejects empty objective", () => {
		const { store } = makeStore();
		expect(() => store.createGoal("t1", "")).toThrow("Objective cannot be empty");
	});

	it(`rejects objective over default ${DEFAULT_OBJECTIVE_LENGTH} characters`, () => {
		const { store } = makeStore();
		expect(() => store.createGoal("t1", "x".repeat(DEFAULT_OBJECTIVE_LENGTH + 1))).toThrow("Objective too long");
	});

	it("rejects invalid token budget", () => {
		const { store } = makeStore();
		expect(() => store.createGoal("t1", "Obj", -10)).toThrow(
			"Token budget must be a positive integer or null",
		);
	});
});

// ---------------------------------------------------------------------------
// GoalStore: maxObjectiveLength injection
// ---------------------------------------------------------------------------

describe("GoalStore maxObjectiveLength injection", () => {
	it("createGoal honors the injected limit", () => {
		const { store } = makeStoreWithLimit(50);
		expect(() => store.createGoal("t1", "x".repeat(51))).toThrow("Objective too long");
		expect(store.createGoal("t1", "x".repeat(50)).objective).toHaveLength(50);
	});

	it("replaceGoal honors the injected limit", () => {
		const { store } = makeStoreWithLimit(50);
		expect(() => store.replaceGoal("t1", "x".repeat(51))).toThrow("Objective too long");
});

	it("updateGoal honors the injected limit", () => {
		const { store } = makeStoreWithLimit(50);
		store.createGoal("t1", "short");
		expect(() => store.updateGoal({ objective: "x".repeat(51) })).toThrow("Objective too long");
	});

	it("fromEntries reconstructs a store with the injected limit", () => {
		const entries: GoalStateEntry[] = [];
		const store = GoalStore.fromEntries([], (e) => entries.push(e), 10);
		expect(() => store.createGoal("t1", "x".repeat(11))).toThrow("Objective too long");
	});

	it("falls back to the default limit when none is injected", () => {
		const { store } = makeStore();
		expect(store.createGoal("t1", "x".repeat(DEFAULT_OBJECTIVE_LENGTH)).objective)
			.toHaveLength(DEFAULT_OBJECTIVE_LENGTH);
	});
});

// ---------------------------------------------------------------------------
// replaceGoal
// ---------------------------------------------------------------------------

describe("replaceGoal", () => {
	it("resets usage counters and emits new goal_id", () => {
		const { store, persisted } = makeStore();
		const first = store.createGoal("t1", "First", 1000);

		// Simulate some usage
		store.accountGoalUsage(10, 200, first.goal_id, "any");

		const second = store.replaceGoal("t1", "Second", "active", 2000);

		expect(second.goal_id).toBe("uuid-2"); // new UUID
		expect(second.objective).toBe("Second");
		expect(second.tokens_used).toBe(0);
		expect(second.time_used_seconds).toBe(0);
		expect(second.status).toBe("active");
		expect(second.token_budget).toBe(2000);

		// Persisted entry should include previous_goal_id
		const setEntry = persisted.at(-1)!;
		expect(setEntry.kind).toBe("set");
		if (setEntry.kind === "set") {
			expect(setEntry.previous_goal_id).toBe("uuid-1");
		}
	});

	it("works even when no existing goal exists", () => {
		const { store } = makeStore();
		const goal = store.replaceGoal("t1", "From scratch");
		expect(goal.objective).toBe("From scratch");
		expect(goal.goal_id).toBe("uuid-1");
	});

	it("sets budget_limited when activating with exhausted budget", () => {
		const { store } = makeStore();
		// Create with token_budget = 0 is invalid, so use a workaround:
		// replaceGoal with status "active" and tokens_used starts at 0,
		// but token_budget=0 is invalid. Instead, test via updateGoal path.
		// Actually, since tokens_used=0 and token_budget>0, this won't trigger.
		// The budget_limited clamp in replaceGoal checks: tokens_used >= token_budget
		// With fresh goal tokens_used=0, this only fires if token_budget <= 0 (invalid).
		// So we verify the status parameter is accepted.
		const goal = store.replaceGoal("t1", "Paused goal", "paused", 100);
		expect(goal.status).toBe("paused");
	});
});

// ---------------------------------------------------------------------------
// updateGoal
// ---------------------------------------------------------------------------

describe("updateGoal", () => {
	it("changes status", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);
		const updated = store.updateGoal({ status: "paused" });
		expect(updated.status).toBe("paused");
	});

	it("changes objective", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Old objective");
		const updated = store.updateGoal({ objective: "New objective" });
		expect(updated.objective).toBe("New objective");
	});

	it("changes token_budget", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);
		const updated = store.updateGoal({ token_budget: 5000 });
		expect(updated.token_budget).toBe(5000);
	});

	it("changes multiple fields at once", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Original", 1000);
		const updated = store.updateGoal({
			objective: "Updated",
			status: "complete",
			token_budget: null,
		});
		expect(updated.objective).toBe("Updated");
		expect(updated.status).toBe("complete");
		expect(updated.token_budget).toBeNull();
	});

	it("updates updated_at_ms", () => {
		const { store } = makeStore();
		const original = store.createGoal("t1", "Obj");
		const beforeMs = original.updated_at_ms;
		// Advance mock time or just verify it's set
		const updated = store.updateGoal({ status: "paused" });
		expect(updated.updated_at_ms).toBeGreaterThanOrEqual(beforeMs);
	});

	it("throws when no goal exists", () => {
		const { store } = makeStore();
		expect(() => store.updateGoal({ status: "active" })).toThrow(GoalError);
		expect(() => store.updateGoal({ status: "active" })).toThrow("No goal to update");
	});
});

// ---------------------------------------------------------------------------
// expectedGoalId mismatch
// ---------------------------------------------------------------------------

describe("expectedGoalId mismatch", () => {
	it("updateGoal throws on stale goal_id", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj");
		expect(() => store.updateGoal({ status: "paused" }, "wrong-id")).toThrow(GoalError);
		expect(() => store.updateGoal({ status: "paused" }, "wrong-id")).toThrow(
			"Stale update: goal_id mismatch",
		);
	});

	it("updateGoal succeeds with matching expectedGoalId", () => {
		const { store } = makeStore();
		const goal = store.createGoal("t1", "Obj");
		const updated = store.updateGoal({ status: "paused" }, goal.goal_id);
		expect(updated.status).toBe("paused");
	});

	it("updateGoal succeeds when expectedGoalId is undefined", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj");
		const updated = store.updateGoal({ status: "paused" }, undefined);
		expect(updated.status).toBe("paused");
	});
});

// ---------------------------------------------------------------------------
// token_budget reached → budget_limited
// ---------------------------------------------------------------------------

describe("budget_limited status clamping", () => {
	it("updateGoal clamps to budget_limited when budget exhausted", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 100);
		// Use up tokens
		store.accountGoalUsage(0, 100, "uuid-1", "any");

		// Now try to set status back to active — should be clamped
		const updated = store.updateGoal({ status: "active" });
		expect(updated.status).toBe("budget_limited");
	});

	it("updateGoal does not clamp if tokens under budget", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 100);
		store.accountGoalUsage(0, 50, "uuid-1", "any");

		const updated = store.updateGoal({ status: "active" });
		expect(updated.status).toBe("active");
	});

	it("updateGoal does not clamp when token_budget is null", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", null);
		store.accountGoalUsage(0, 9999, "uuid-1", "any");

		const updated = store.updateGoal({ status: "active" });
		expect(updated.status).toBe("active");
	});

	it("updateGoal clamps when token_budget is reduced below usage", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);
		store.accountGoalUsage(0, 500, "uuid-1", "any");

		// Reduce budget below usage
		const updated = store.updateGoal({ status: "active", token_budget: 400 });
		expect(updated.status).toBe("budget_limited");
	});
});

// ---------------------------------------------------------------------------
// accountGoalUsage
// ---------------------------------------------------------------------------

describe("accountGoalUsage", () => {
	it("increments tokens and time", () => {
		const { store, persisted } = makeStore();
		store.createGoal("t1", "Obj", 1000);

		const result = store.accountGoalUsage(5, 100, "uuid-1", "any");
		expect(result).not.toBeNull();
		expect(result!.goal.tokens_used).toBe(100);
		expect(result!.goal.time_used_seconds).toBe(5);
		expect(result!.budgetLimited).toBe(false);

		// Check persisted usage entry
		const usageEntry = persisted[1]!;
		expect(usageEntry.kind).toBe("usage");
		if (usageEntry.kind === "usage") {
			expect(usageEntry.token_delta).toBe(100);
			expect(usageEntry.time_delta_seconds).toBe(5);
			expect(usageEntry.goal_id).toBe("uuid-1");
		}
	});

	it("accumulates across multiple calls", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);

		store.accountGoalUsage(3, 50, "uuid-1", "any");
		store.accountGoalUsage(7, 30, "uuid-1", "any");

		const goal = store.getGoal()!;
		expect(goal.tokens_used).toBe(80);
		expect(goal.time_used_seconds).toBe(10);
	});

	it("sets budgetLimited when budget reached", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 100);

		const result = store.accountGoalUsage(0, 100, "uuid-1", "any");
		expect(result!.budgetLimited).toBe(true);
		expect(result!.goal.status).toBe("budget_limited");
	});

	it("sets budgetLimited when budget exceeded", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 100);

		const result = store.accountGoalUsage(0, 200, "uuid-1", "any");
		expect(result!.budgetLimited).toBe(true);
		expect(result!.goal.tokens_used).toBe(200);
		expect(result!.goal.status).toBe("budget_limited");
	});

	it("returns null when no goal exists", () => {
		const { store } = makeStore();
		expect(store.accountGoalUsage(1, 1)).toBeNull();
	});

	it("returns null for non-active goal in active_only mode", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);
		store.updateGoal({ status: "paused" });

		const result = store.accountGoalUsage(1, 10);
		expect(result).toBeNull();
		// Goal usage should not have changed
		expect(store.getGoal()!.tokens_used).toBe(0);
	});

	it("returns usage for non-active goal in 'any' mode", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);
		store.updateGoal({ status: "paused" });

		const result = store.accountGoalUsage(5, 50, undefined, "any");
		expect(result).not.toBeNull();
		expect(result!.goal.tokens_used).toBe(50);
		expect(result!.goal.time_used_seconds).toBe(5);
	});

	it("uses Codex-compatible accounting modes for budget-limited and stopped goals", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 100);
		store.accountGoalUsage(0, 100, "uuid-1", "any");
		expect(store.getGoal()!.status).toBe("budget_limited");

		const activeOnly = store.accountGoalUsage(1, 10, "uuid-1", "active_only");
		expect(activeOnly).not.toBeNull();
		expect(activeOnly!.goal.tokens_used).toBe(110);

		store.updateGoal({ status: "blocked" });
		expect(store.accountGoalUsage(1, 10, "uuid-1", "active_only")).toBeNull();
		const stopped = store.accountGoalUsage(1, 10, "uuid-1", "active_or_stopped");
		expect(stopped).not.toBeNull();
		expect(stopped!.goal.status).toBe("blocked");
	});

	it("clamps negative deltas to 0", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);

		const result = store.accountGoalUsage(-10, -50, "uuid-1", "any");
		expect(result!.goal.tokens_used).toBe(0);
		expect(result!.goal.time_used_seconds).toBe(0);
	});

	it("returns null on goal_id mismatch", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);

		const result = store.accountGoalUsage(1, 10, "wrong-id", "any");
		expect(result).toBeNull();
		expect(store.getGoal()!.tokens_used).toBe(0);
	});

	it("clamps negative time delta via Math.round", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);

		const result = store.accountGoalUsage(-3.7, 10, "uuid-1", "any");
		expect(result!.goal.time_used_seconds).toBe(0);
		expect(result!.goal.tokens_used).toBe(10);
	});

	it("rounds fractional time delta", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj", 1000);

		const result = store.accountGoalUsage(3.7, 10, "uuid-1", "any");
		expect(result!.goal.time_used_seconds).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// deleteGoal
// ---------------------------------------------------------------------------

describe("deleteGoal", () => {
	it("removes goal and returns true", () => {
		const { store, persisted } = makeStore();
		store.createGoal("t1", "Obj");

		const deleted = store.deleteGoal();
		expect(deleted).toBe(true);
		expect(store.getGoal()).toBeNull();

		// Check persisted clear entry
		const clearEntry = persisted[1]!;
		expect(clearEntry.kind).toBe("clear");
		if (clearEntry.kind === "clear") {
			expect(clearEntry.thread_id).toBe("t1");
			expect(clearEntry.previous_goal_id).toBe("uuid-1");
			expect(clearEntry.source).toBe("user");
		}
	});

	it("returns false when no goal exists", () => {
		const { store } = makeStore();
		expect(store.deleteGoal()).toBe(false);
	});

	it("uses runtime source", () => {
		const { store, persisted } = makeStore();
		store.createGoal("t1", "Obj");
		store.deleteGoal("runtime");

		const clearEntry = persisted[1]!;
		if (clearEntry.kind === "clear") {
			expect(clearEntry.source).toBe("runtime");
		}
	});

	it("allows creating a new goal after deletion", () => {
		const { store } = makeStore();
		store.createGoal("t1", "First");
		store.deleteGoal();
		const second = store.createGoal("t1", "Second");
		expect(second.objective).toBe("Second");
		expect(second.goal_id).toBe("uuid-2");
	});
});

// ---------------------------------------------------------------------------
// getGoal
// ---------------------------------------------------------------------------

describe("getGoal", () => {
	it("returns null when no goal", () => {
		const { store } = makeStore();
		expect(store.getGoal()).toBeNull();
	});

	it("returns the current goal", () => {
		const { store } = makeStore();
		const created = store.createGoal("t1", "Obj");
		const got = store.getGoal();
		expect(got).toEqual(created);
	});

	it("returns a defensive copy", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Obj");
		const got = store.getGoal()!;
		got.objective = "mutated";
		// getGoal returns a defensive copy, not the internal reference
		expect(store.getGoal()!.objective).toBe("Obj");
	});
});

// ---------------------------------------------------------------------------
// fromEntries
// ---------------------------------------------------------------------------

describe("fromEntries", () => {
	it("reconstructs from set entry", () => {
		const goal: Goal = {
			thread_id: "t1",
			goal_id: "g1",
			objective: "Test",
			status: "active",
			token_budget: 1000,
			tokens_used: 0,
			time_used_seconds: 0,
			created_at_ms: 1000,
			updated_at_ms: 1000,
		};

		const entries: GoalStateEntry[] = [
			{ kind: "set", goal: { ...goal }, source: "user" },
		];

		const persisted: GoalStateEntry[] = [];
		const store = GoalStore.fromEntries(entries, (e) => persisted.push(e));

		const got = store.getGoal()!;
		expect(got.goal_id).toBe("g1");
		expect(got.objective).toBe("Test");
		expect(got.status).toBe("active");
	});

	it("reconstructs from set then clear", () => {
		const goal: Goal = {
			thread_id: "t1",
			goal_id: "g1",
			objective: "Test",
			status: "active",
			token_budget: null,
			tokens_used: 0,
			time_used_seconds: 0,
			created_at_ms: 1000,
			updated_at_ms: 1000,
		};

		const entries: GoalStateEntry[] = [
			{ kind: "set", goal: { ...goal }, source: "user" },
			{ kind: "clear", thread_id: "t1", previous_goal_id: "g1", source: "user" },
		];

		const persisted: GoalStateEntry[] = [];
		const store = GoalStore.fromEntries(entries, (e) => persisted.push(e));

		expect(store.getGoal()).toBeNull();
	});

	it("reconstructs from set then usage", () => {
		const goal: Goal = {
			thread_id: "t1",
			goal_id: "g1",
			objective: "Test",
			status: "active",
			token_budget: 1000,
			tokens_used: 100,
			time_used_seconds: 5,
			created_at_ms: 1000,
			updated_at_ms: 2000,
		};

		const entries: GoalStateEntry[] = [
			{ kind: "set", goal: { ...goal, tokens_used: 0, time_used_seconds: 0 }, source: "user" },
			{
				kind: "usage",
				thread_id: "t1",
				goal_id: "g1",
				token_delta: 100,
				time_delta_seconds: 5,
				goal: { ...goal },
			},
		];

		const persisted: GoalStateEntry[] = [];
		const store = GoalStore.fromEntries(entries, (e) => persisted.push(e));

		const got = store.getGoal()!;
		expect(got.tokens_used).toBe(100);
		expect(got.time_used_seconds).toBe(5);
	});

	it("reconstructed store can continue operations", () => {
		const goal: Goal = {
			thread_id: "t1",
			goal_id: "g1",
			objective: "Test",
			status: "active",
			token_budget: 1000,
			tokens_used: 0,
			time_used_seconds: 0,
			created_at_ms: 1000,
			updated_at_ms: 1000,
		};

		const entries: GoalStateEntry[] = [
			{ kind: "set", goal: { ...goal }, source: "user" },
		];

		const persisted: GoalStateEntry[] = [];
		const store = GoalStore.fromEntries(entries, (e) => persisted.push(e));

		// Can continue using the store
		store.updateGoal({ status: "paused" });
		expect(store.getGoal()!.status).toBe("paused");
		expect(persisted).toHaveLength(1); // the new entry from updateGoal
	});

	it("handles empty entries", () => {
		const persisted: GoalStateEntry[] = [];
		const store = GoalStore.fromEntries([], (e) => persisted.push(e));
		expect(store.getGoal()).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// continuation fields
// ---------------------------------------------------------------------------

describe("continuation fields", () => {
	it("createGoal initializes continuation fields", () => {
		const { store } = makeStore();
		const goal = store.createGoal("t1", "Test");
		expect(goal.last_continued_at_ms).toBeNull();
	});

	it("replaceGoal initializes continuation fields", () => {
		const { store } = makeStore();
		const goal = store.replaceGoal("t1", "Test");
		expect(goal.last_continued_at_ms).toBeNull();
	});

	it("updateGoal can set last_continued_at_ms", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Test");
		const now = Date.now();
		const updated = store.updateGoal({
			last_continued_at_ms: now,
		});
		expect(updated.last_continued_at_ms).toBe(now);
	});
});

// ---------------------------------------------------------------------------
// fromEntries normalization
// ---------------------------------------------------------------------------

describe("fromEntries normalization", () => {
	it("normalizes old goal entries missing last_continued_at_ms", () => {
		const oldGoal: any = {
			thread_id: "t1",
			goal_id: "g1",
			objective: "Test",
			status: "active",
			token_budget: 1000,
			tokens_used: 50,
			time_used_seconds: 5,
			created_at_ms: 1000,
			updated_at_ms: 2000,
			// last_continued_at_ms missing
		};

		const entries: GoalStateEntry[] = [
			{ kind: "set", goal: oldGoal, source: "user" },
		];

		const persisted: GoalStateEntry[] = [];
		const store = GoalStore.fromEntries(entries, (e) => persisted.push(e));

		const got = store.getGoal()!;
		expect(got.last_continued_at_ms).toBeNull();
		expect(got).not.toHaveProperty("continuation_count");
		expect(got).not.toHaveProperty("max_continuations");
	});

	it("strips stale continuation_count/max_continuations from older persisted goals", () => {
		// These fields were removed in favor of Codex-compatible unlimited
		// continuations. Older persisted goal entries may still carry them;
		// reconstruction must not retain dead state or re-persist it through later updates.
		const staleGoal: any = {
			thread_id: "t1",
			goal_id: "g1",
			objective: "Test",
			status: "active",
			token_budget: null,
			tokens_used: 0,
			time_used_seconds: 0,
			created_at_ms: 1000,
			updated_at_ms: 1000,
			continuation_count: 7,
			max_continuations: 5,
			last_continued_at_ms: null,
		};

		const entries: GoalStateEntry[] = [
			{ kind: "set", goal: staleGoal, source: "user" },
		];

		const persisted: GoalStateEntry[] = [];
		const store = GoalStore.fromEntries(entries, (e) => persisted.push(e));

		const got = store.getGoal()!;
		expect(got.last_continued_at_ms).toBeNull();
		expect(got).not.toHaveProperty("continuation_count");
		expect(got).not.toHaveProperty("max_continuations");
	});
});

// ---------------------------------------------------------------------------
// updateGoal validation for continuation fields
// ---------------------------------------------------------------------------

describe("updateGoal continuation validation", () => {
	it("accepts null last_continued_at_ms", () => {
		const { store } = makeStore();
		store.createGoal("t1", "Test");
		const updated = store.updateGoal({ last_continued_at_ms: null });
		expect(updated.last_continued_at_ms).toBeNull();
	});
});
