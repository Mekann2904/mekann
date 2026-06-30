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
export type GoalStatus = "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete";

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

const DEFAULT_OBJECTIVE_LENGTH = 100_000;

/**
 * Hard sanity ceiling that caps any configured objective length. Protects
 * against pathological inputs regardless of the `goal.maxObjectiveLength`
 * setting so a malformed mekann.json cannot disable the limit entirely.
 *
 * Objectives are re-injected into the prompt on every continuation turn, so an
 * oversized objective directly inflates context usage and degrades prompt-cache
 * hit rate. The ceiling is therefore bounded to a still-generous value (2× the
 * default) rather than the previous 500 000-char ceiling, which let a single
 * objective consume ~125k tokens of every turn (issue #167 / IC-210).
 */
export const HARD_MAX_OBJECTIVE_LENGTH = 200_000;

/** Default maximum objective length (characters). Exported for schema/tools. */
export { DEFAULT_OBJECTIVE_LENGTH };

/**
 * Resolve a raw objective-length value to a safe positive integer within
 * `[1, HARD_MAX_OBJECTIVE_LENGTH]`. Falls back to the default for missing or
 * non-finite input so a misconfigured setting degrades gracefully rather than
 * disabling the limit.
 */
export function clampObjectiveLimit(value: number | undefined | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_OBJECTIVE_LENGTH;
  return Math.min(Math.max(Math.floor(value), 1), HARD_MAX_OBJECTIVE_LENGTH);
}

export function validateObjective(objective: string, maxLen: number = DEFAULT_OBJECTIVE_LENGTH): string {
  const limit = clampObjectiveLimit(maxLen);
  const trimmed = objective.trim();
  if (!trimmed) throw new GoalError("Objective cannot be empty");
  if (trimmed.length > limit) {
    throw new GoalError(`Objective too long (max ${limit} characters)`);
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
function normalizeGoal(goal: Goal): Goal {
  return {
    // Construct from the known fields only — this intentionally drops stale
    // properties (e.g. legacy continuation_count/max_continuations) carried by
    // older persisted entries. `goal` is typed `Goal`, so access is type-safe.
    thread_id: goal.thread_id,
    goal_id: goal.goal_id,
    objective: goal.objective,
    status: goal.status,
    token_budget: goal.token_budget,
    tokens_used: goal.tokens_used,
    time_used_seconds: goal.time_used_seconds,
    created_at_ms: goal.created_at_ms,
    updated_at_ms: goal.updated_at_ms,
    // Defensive: persistence entries are JSON-deserialized, so this may be
    // missing/garbage even though the static type says `number | null`.
    last_continued_at_ms:
      typeof goal.last_continued_at_ms === "number" ? goal.last_continued_at_ms : null,
  };
}

// ---------------------------------------------------------------------------
// Accounting mode compatibility
// ---------------------------------------------------------------------------

function shouldAccountGoalStatus(
  status: GoalStatus,
  mode: "active_status_only" | "active_only" | "active_or_complete" | "active_or_stopped" | "any",
): boolean {
  switch (mode) {
    case "active_status_only":
      return status === "active";
    case "active_only":
      // Codex-compatible: continue final accounting for a goal that just became
      // budget-limited, but do not account paused/blocked/usage-limited/complete.
      return status === "active" || status === "budget_limited";
    case "active_or_complete":
      return status === "active" || status === "budget_limited" || status === "complete";
    case "active_or_stopped":
      return status !== "complete";
    case "any":
      return true;
  }
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
  private readonly maxObjectiveLength: number;

  constructor(persistFn: PersistFn, maxObjectiveLength: number = DEFAULT_OBJECTIVE_LENGTH) {
    this.persistFn = persistFn;
    this.maxObjectiveLength = clampObjectiveLimit(maxObjectiveLength);
  }

  /**
   * Reconstruct a GoalStore from a sequence of persistence entries.
   * Entries are applied in order; the final state reflects the latest entry.
   */
  static fromEntries(
    entries: GoalStateEntry[],
    persistFn: PersistFn,
    maxObjectiveLength?: number,
  ): GoalStore {
    const store = new GoalStore(persistFn, maxObjectiveLength);
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

    const validatedObjective = validateObjective(objective, this.maxObjectiveLength);
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
    const validatedObjective = validateObjective(objective, this.maxObjectiveLength);
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
      goal.objective = validateObjective(patch.objective, this.maxObjectiveLength);
    }

    if (patch.status !== undefined) {
      goal.status = patch.status;
    }

    const previousStatus = goal.status;
    const previousBudget = goal.token_budget;

    if (patch.token_budget !== undefined) {
      goal.token_budget = validateTokenBudget(patch.token_budget);
      if (
        previousStatus === "budget_limited" &&
        patch.status === undefined &&
        goal.token_budget !== null &&
        (previousBudget === null || goal.token_budget > previousBudget) &&
        goal.tokens_used < goal.token_budget
      ) {
        goal.status = "active";
      }
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
    mode:
      | "active_status_only"
      | "active_only"
      | "active_or_complete"
      | "active_or_stopped"
      | "any" = "active_only",
  ): { goal: Goal; budgetLimited: boolean } | null {
    if (!this.goal) return null;
    if (!shouldAccountGoalStatus(this.goal.status, mode)) return null;
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
