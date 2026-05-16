/**
 * goal/state.ts — Goal data model and state management.
 *
 * Pure types and GoalStore class for managing thread-local goals.
 * No pi API dependencies — designed for easy unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Goal status values. */
export type GoalStatus = "active" | "paused" | "budget_limited" | "complete";

/** Default maximum number of automatic continuations. */
export const DEFAULT_MAX_CONTINUATIONS = 5;

/** Cooldown between continuations in milliseconds. */
export const CONTINUATION_COOLDOWN_MS = 2000;

/** A persistent goal tied to a thread/session. */
export interface Goal {
  /** Thread/session ID from ctx.sessionManager.getSessionId() */
  thread_id: string;
  /** Unique goal identifier (UUID) */
  goal_id: string;
  /** Human-readable objective */
  objective: string;
  /** Current status */
  status: GoalStatus;
  /** Token budget, or null for unlimited */
  token_budget: number | null;
  /** Cumulative tokens used */
  tokens_used: number;
  /** Cumulative wall-clock seconds used */
  time_used_seconds: number;
  /** Creation timestamp (ms) */
  created_at_ms: number;
  /** Last update timestamp (ms) */
  updated_at_ms: number;
  /** How many continuation turns have been sent for this goal. */
  continuation_count: number;
  /** Maximum number of automatic continuations allowed. */
  max_continuations: number;
  /** Timestamp of the last continuation sent (ms), or null. */
  last_continued_at_ms: number | null;
}

/** Who initiated the goal mutation. */
export type GoalSource = "user" | "tool" | "runtime";

/** Append-only persistence entry for goal state. */
export type GoalStateEntry =
  | { kind: "set"; goal: Goal; previous_goal_id?: string; source: GoalSource }
  | { kind: "clear"; thread_id: string; previous_goal_id?: string; source: "user" | "runtime" }
  | { kind: "usage"; thread_id: string; goal_id: string; token_delta: number; time_delta_seconds: number; goal: Goal };

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class GoalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalError";
  }
}

// ---------------------------------------------------------------------------
// Persistence function type
// ---------------------------------------------------------------------------

export type PersistFn = (entry: GoalStateEntry) => void;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MAX_OBJECTIVE_LENGTH = 4000;

export function validateObjective(objective: string): string {
  const trimmed = objective.trim();
  if (!trimmed) throw new GoalError("Objective cannot be empty");
  if (trimmed.length > MAX_OBJECTIVE_LENGTH) {
    throw new GoalError(`Objective too long (max ${MAX_OBJECTIVE_LENGTH} characters)`);
  }
  return trimmed;
}

export function remainingTokens(goal: Goal): number | null {
  return goal.token_budget !== null ? Math.max(0, goal.token_budget - goal.tokens_used) : null;
}

export function validateTokenBudget(budget: unknown): number | null {
  if (budget === undefined || budget === null) return null;
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget <= 0) {
    throw new GoalError("Token budget must be a positive integer or null");
  }
  return budget;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Normalize a goal to ensure all fields have valid defaults. */
function normalizeGoal(goal: Goal | Record<string, unknown>): Goal {
  return {
    ...goal,
    continuation_count: Number.isInteger((goal as any).continuation_count)
      ? (goal as any).continuation_count
      : 0,
    max_continuations:
      Number.isInteger((goal as any).max_continuations) && (goal as any).max_continuations > 0
        ? (goal as any).max_continuations
        : DEFAULT_MAX_CONTINUATIONS,
    last_continued_at_ms:
      typeof (goal as any).last_continued_at_ms === "number"
        ? (goal as any).last_continued_at_ms
        : null,
  } as Goal;
}

// ---------------------------------------------------------------------------
// GoalStore
// ---------------------------------------------------------------------------

/**
 * Manages a single goal per thread.
 *
 * Persistence is via an injected `PersistFn` callback.
 * Reconstruction from stored entries is done via `GoalStore.fromEntries()`.
 */
export class GoalStore {
  private goal: Goal | null = null;
  private readonly persistFn: PersistFn;

  constructor(persistFn: PersistFn) {
    this.persistFn = persistFn;
  }

  /**
   * Reconstruct a GoalStore from a sequence of persistence entries.
   * Entries are applied in order; the final state reflects the latest entry.
   */
  static fromEntries(entries: GoalStateEntry[], persistFn: PersistFn): GoalStore {
    const store = new GoalStore(persistFn);
    for (const entry of entries) {
      switch (entry.kind) {
        case "set":
          store.goal = normalizeGoal(entry.goal);
          break;
        case "clear":
          store.goal = null;
          break;
        case "usage":
          store.goal = normalizeGoal(entry.goal);
          break;
      }
    }
    return store;
  }

  /** Get the current goal, or null if none exists. Returns a defensive copy. */
  getGoal(): Goal | null {
    return this.goal ? { ...this.goal } : null;
  }

  /**
   * Create a new goal. Fails if a goal already exists.
   * Use `replaceGoal` to replace an existing goal.
   */
  createGoal(
    threadId: string,
    objective: string,
    tokenBudget?: number | null,
    source: GoalSource = "user",
  ): Goal {
    if (this.goal) {
      throw new GoalError("Goal already exists for this thread");
    }

    const validatedObjective = validateObjective(objective);
    const validatedBudget = validateTokenBudget(tokenBudget);

    const now = Date.now();
    const goal: Goal = {
      thread_id: threadId,
      goal_id: crypto.randomUUID(),
      objective: validatedObjective,
      status: "active",
      token_budget: validatedBudget,
      tokens_used: 0,
      time_used_seconds: 0,
      created_at_ms: now,
      updated_at_ms: now,
      continuation_count: 0,
      max_continuations: DEFAULT_MAX_CONTINUATIONS,
      last_continued_at_ms: null,
    };

    this.goal = goal;
    this.persistFn({ kind: "set", goal: { ...goal }, source });
    return { ...goal };
  }

  /**
   * Replace the current goal with a new one.
   * Resets usage counters and issues a new goal_id.
   */
  replaceGoal(
    threadId: string,
    objective: string,
    status: GoalStatus = "active",
    tokenBudget?: number | null,
    source: GoalSource = "user",
  ): Goal {
    const validatedObjective = validateObjective(objective);
    const validatedBudget = validateTokenBudget(tokenBudget);
    const previousGoalId = this.goal?.goal_id;

    const now = Date.now();
    const goal: Goal = {
      thread_id: threadId,
      goal_id: crypto.randomUUID(),
      objective: validatedObjective,
      status,
      token_budget: validatedBudget,
      tokens_used: 0,
      time_used_seconds: 0,
      created_at_ms: now,
      updated_at_ms: now,
      continuation_count: 0,
      max_continuations: DEFAULT_MAX_CONTINUATIONS,
      last_continued_at_ms: null,
    };

    // If activating with exhausted budget, clamp to budget_limited
    if (goal.status === "active" && goal.token_budget !== null && goal.tokens_used >= goal.token_budget) {
      goal.status = "budget_limited";
    }

    this.goal = goal;
    this.persistFn({ kind: "set", goal: { ...goal }, previous_goal_id: previousGoalId, source });
    return { ...goal };
  }

  /**
   * Update the current goal.
   * If `expectedGoalId` is provided and doesn't match, throws (stale update).
   */
  updateGoal(
    patch: {
      objective?: string;
      status?: GoalStatus;
      token_budget?: number | null;
      continuation_count?: number;
      max_continuations?: number;
      last_continued_at_ms?: number | null;
    },
    expectedGoalId?: string,
    source: GoalSource = "user",
  ): Goal {
    if (!this.goal) {
      throw new GoalError("No goal to update");
    }
    if (expectedGoalId !== undefined && this.goal.goal_id !== expectedGoalId) {
      throw new GoalError("Stale update: goal_id mismatch");
    }

    const goal = { ...this.goal };

    if (patch.objective !== undefined) {
      goal.objective = validateObjective(patch.objective);
    }

    if (patch.status !== undefined) {
      goal.status = patch.status;
    }

    if (patch.token_budget !== undefined) {
      goal.token_budget = validateTokenBudget(patch.token_budget);
    }

    if (patch.continuation_count !== undefined) {
      if (!Number.isInteger(patch.continuation_count) || patch.continuation_count < 0) {
        throw new GoalError("continuation_count must be a non-negative integer");
      }
      goal.continuation_count = patch.continuation_count;
    }

    if (patch.max_continuations !== undefined) {
      if (!Number.isInteger(patch.max_continuations) || patch.max_continuations <= 0) {
        throw new GoalError("max_continuations must be a positive integer");
      }
      goal.max_continuations = patch.max_continuations;
    }

    if (patch.last_continued_at_ms !== undefined) {
      goal.last_continued_at_ms = patch.last_continued_at_ms;
    }

    // If setting active and budget is exhausted, clamp to budget_limited
    if (goal.status === "active" && goal.token_budget !== null && goal.tokens_used >= goal.token_budget) {
      goal.status = "budget_limited";
    }

    goal.updated_at_ms = Date.now();
    this.goal = goal;
    this.persistFn({ kind: "set", goal: { ...goal }, source });
    return { ...goal };
  }

  /** Delete the current goal. Returns true if a goal was deleted. */
  deleteGoal(source: "user" | "runtime" = "user"): boolean {
    if (!this.goal) return false;
    const previousGoalId = this.goal.goal_id;
    const threadId = this.goal.thread_id;
    this.goal = null;
    this.persistFn({ kind: "clear", thread_id: threadId, previous_goal_id: previousGoalId, source });
    return true;
  }

  /**
   * Account for token and time usage.
   * Returns null if no goal, or if mode is "active_only" and goal is not active.
   */
  accountGoalUsage(
    timeDeltaSeconds: number,
    tokenDelta: number,
    expectedGoalId?: string,
    mode: "active_only" | "any" = "active_only",
  ): { goal: Goal; budgetLimited: boolean } | null {
    if (!this.goal) return null;
    if (mode === "active_only" && this.goal.status !== "active") return null;
    if (expectedGoalId !== undefined && this.goal.goal_id !== expectedGoalId) return null;

    const clampedTime = Math.max(0, Math.round(timeDeltaSeconds));
    const clampedTokens = Math.max(0, tokenDelta);

    const goal = { ...this.goal };
    goal.tokens_used += clampedTokens;
    goal.time_used_seconds += clampedTime;

    let budgetLimited = false;
    if (goal.status === "active" && goal.token_budget !== null && goal.tokens_used >= goal.token_budget) {
      goal.status = "budget_limited";
      budgetLimited = true;
    }

    goal.updated_at_ms = Date.now();
    this.goal = goal;
    this.persistFn({
      kind: "usage",
      thread_id: goal.thread_id,
      goal_id: goal.goal_id,
      token_delta: clampedTokens,
      time_delta_seconds: clampedTime,
      goal: { ...goal },
    });
    return { goal: { ...goal }, budgetLimited };
  }
}
