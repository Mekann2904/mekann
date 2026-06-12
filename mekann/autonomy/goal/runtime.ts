/**
 * goal/runtime.ts — Goal runtime lifecycle management.
 *
 * Handles token/time accounting, idle continuation, budget steering,
 * and coordinates with the GoalStore.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { GoalStore, type Goal, type GoalStateEntry, CONTINUATION_COOLDOWN_MS, DEFAULT_MAX_CONTINUATIONS } from "./state.js";
import { continuationPrompt, budgetLimitPrompt, objectiveUpdatedPrompt } from "./prompts.js";

// ---------------------------------------------------------------------------
// Compaction threshold
// ---------------------------------------------------------------------------

/**
 * Reserve tokens threshold for triggering compaction before continuation.
 * Matches Pi's default CompactionSettings.reserveTokens (16384).
 * When estimated context tokens exceed contextWindow − COMPACT_RESERVE_TOKENS,
 * we compact before sending the continuation prompt.
 */
const COMPACT_RESERVE_TOKENS = 16384;

// ---------------------------------------------------------------------------
// GoalRuntime
// ---------------------------------------------------------------------------

export type GoalEventCallback = (action: string, goal: Goal) => void;

export class GoalRuntime {
  private store: GoalStore;
  private pi: ExtensionAPI;
  private readonly goalEventCallback?: GoalEventCallback;

  // ─── Runtime state ────────────────────────────────────────────

  /** goal_id of the goal we're actively accounting for. */
  active_goal_id: string | null = null;
  /** Whether an agent turn is currently in progress. */
  private active_turn_marker = false;
  /** Whether a continuation turn is currently in flight. */
  continuation_active = false;
  /** goal_id for which we've already injected a budget limit prompt. */
  budget_limit_reported_goal_id: string | null = null;
  /** Wall-clock baseline (ms since epoch) for time accounting. */
  last_accounted_wall_clock: number | null = null;
  /** Set of assistant message usage events already accounted for tokens. */
  private accounted_assistant_usage_keys: Set<string> = new Set();
  /** Whether idle continuation should be suppressed. */
  continuationSuppressed = false;
  /** Whether budget steering is suppressed for the current turn. */
  private suppress_budget_steering = false;

  constructor(store: GoalStore, pi: ExtensionAPI, goalEventCallback?: GoalEventCallback) {
    this.store = store;
    this.pi = pi;
    this.goalEventCallback = goalEventCallback;
  }

  // ─── Accessors ────────────────────────────────────────────────

  getGoal(): Goal | null {
    return this.store.getGoal();
  }

  getStore(): GoalStore {
    return this.store;
  }

  // ─── Lifecycle: session_start ──────────────────────────────────

  onSessionStart(_ctx: ExtensionContext): void {
    const goal = this.store.getGoal();
    if (goal && goal.status === "active") {
      this.active_goal_id = goal.goal_id;
      this.last_accounted_wall_clock = Date.now();
    }
  }

  // ─── Lifecycle: agent_start ────────────────────────────────────

  onAgentStart(): void {
    this.active_turn_marker = true;
  }

  // ─── Lifecycle: turn_start ─────────────────────────────────────

  onTurnStart(_event: { turnIndex: number }, _ctx: ExtensionContext): void {
    const goal = this.store.getGoal();
    if (goal && goal.status === "active") {
      this.active_goal_id = goal.goal_id;
      this.last_accounted_wall_clock = Date.now();
    } else {
      this.active_goal_id = null;
    }
    this.suppress_budget_steering = false;
  }

  // ─── Lifecycle: message_end ────────────────────────────────────

  onMessageEnd(event: { message: { role: string; usage?: { input?: number; inputTotal?: number; output?: number; cacheRead?: number }; timestamp: number } }, _ctx: ExtensionContext): void {
    const msg = event.message;
    if (msg.role !== "assistant") return;
    if (!msg.usage) return;

    // Deduplicate exact repeated message_end events. Timestamp alone is not
    // unique enough: two distinct assistant messages can be emitted in the same
    // millisecond, so include usage fields in the key.
    const usage = msg.usage;
    const inputTotal = usage.inputTotal ?? usage.input ?? 0;
    const usageKey = [msg.timestamp, inputTotal, usage.output ?? 0, usage.cacheRead ?? 0].join(":");
    if (this.accounted_assistant_usage_keys.has(usageKey)) return;
    this.accounted_assistant_usage_keys.add(usageKey);

    const goal = this.store.getGoal();
    if (!goal || goal.status !== "active") return;

    // Token delta: exclude cached input tokens.
    // inputTotal/input means total input tokens including cache-read/cache-write tokens.
    // Provider raw usage must be normalized before this point; this is a
    // non-cached-token budget proxy, not provider billing/cost accounting.
    const tokenDelta = Math.max(0, inputTotal - (usage.cacheRead ?? 0)) + (usage.output ?? 0);

    // Also account accumulated wall-clock time
    this.accountUsage(this.consumeWallClockSeconds(), tokenDelta);
  }

  // ─── Lifecycle: tool_execution_end ─────────────────────────────

  onToolExecutionEnd(event: { toolName: string }, _ctx: ExtensionContext): void {
    // Skip goal tools to avoid double-counting
    if (event.toolName === "update_goal" || event.toolName === "create_goal" || event.toolName === "get_goal") {
      return;
    }

    const goal = this.store.getGoal();
    if (!goal || goal.status !== "active") return;

    // Best-effort wall-clock accounting
    this.accountUsage(this.consumeWallClockSeconds(), 0);
  }

  // ─── Lifecycle: turn_end ───────────────────────────────────────

  onTurnEnd(_event: { turnIndex: number }, _ctx: ExtensionContext): void {
    // Final wall-clock accounting for this turn
    const goal = this.store.getGoal();
    if (goal && goal.status === "active") {
      this.accountUsage(this.consumeWallClockSeconds(), 0);
    }

    this.continuation_active = false;
  }

  // ─── Lifecycle: agent_end ──────────────────────────────────────

  onAgentEnd(event: { messages: Array<{ role: string; stopReason?: string }> }, _ctx: ExtensionContext): void {
    // Check if the last assistant message was aborted
    const lastAssistant = [...event.messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.stopReason === "aborted") {
      const goal = this.store.getGoal();
      if (goal && goal.status === "active") {
        // Final accounting before pausing
        this.accountWallClockFinal();
        try {
          this.store.updateGoal({ status: "paused" }, undefined, "runtime");
        } catch {
          // Best effort
        }
        this.active_goal_id = null;
      }
    } else {
      // Final wall-clock accounting
      this.accountWallClockFinal();
    }

    this.active_turn_marker = false;
  }

  // ─── Lifecycle: session_shutdown ───────────────────────────────

  onSessionShutdown(): void {
    this.accountWallClockFinal();
    this.reset();
  }

  // ─── External mutation hooks ───────────────────────────────────

  /** Called before an external mutation (e.g., user command) to flush accounting. */
  onExternalMutationStarting(): void {
    this.accountWallClockFinal();
  }

  /** Called when a goal is externally set/updated. */
  onExternalSet(goal: Goal, previousGoal?: Goal | null): void {
    if (goal.status === "active") {
      this.active_goal_id = goal.goal_id;
      this.last_accounted_wall_clock = Date.now();
    } else {
      this.active_goal_id = null;
      this.last_accounted_wall_clock = null;
    }

    // If objective changed and there's an active turn, inject objective-updated prompt
    if (previousGoal && previousGoal.objective !== goal.objective && this.active_turn_marker) {
      this.pi.sendUserMessage(
        objectiveUpdatedPrompt(previousGoal.objective, goal.objective),
        { deliverAs: "followUp" },
      );
    }

    // Reset budget reporting for new goal_id
    if (!previousGoal || previousGoal.goal_id !== goal.goal_id) {
      this.budget_limit_reported_goal_id = null;
    }
  }

  /** Called when a goal is externally cleared. */
  onExternalClear(): void {
    this.active_goal_id = null;
    this.last_accounted_wall_clock = null;
    this.budget_limit_reported_goal_id = null;
  }

  // ─── Idle continuation ─────────────────────────────────────────

  maybeContinueIfIdle(ctx: ExtensionContext): void {
    // Check all preconditions
    if (this.pi.getFlag("goals") !== true) return;
    if (!(ctx.sessionManager as any).isPersisted?.()) return;
    if (this.continuationSuppressed) return;
    if (this.active_turn_marker) return;
    if (this.continuation_active) return;

    if (!ctx.isIdle()) return;
    if (ctx.hasPendingMessages()) return;

    const goal = this.store.getGoal();
    if (!goal) return;
    if (goal.status !== "active") return;
    if (!goal.objective.trim()) return;
    if (this.active_goal_id !== null && this.active_goal_id !== goal.goal_id) return;

    // Codex-compatible behavior: do not auto-pause after a fixed number of
    // continuations. An active goal should keep launching continuation turns
    // whenever the thread is idle until it becomes complete, blocked,
    // usage-limited, budget-limited, paused by the user, or cleared.

    // Continuation guard: cooldown
    if (goal.last_continued_at_ms !== null) {
      const elapsed = Date.now() - goal.last_continued_at_ms;
      if (elapsed < CONTINUATION_COOLDOWN_MS) return;
    }

    // Check if compaction is needed before sending continuation.
    // During goal continuation, Pi's autocompact may not fire because the
    // follow-up message is queued without re-checking compaction thresholds.
    // See issue #13 for details.
    const contextUsage = ctx.getContextUsage();
    if (contextUsage?.tokens != null && contextUsage.contextWindow > 0) {
      if (contextUsage.tokens > contextUsage.contextWindow - COMPACT_RESERVE_TOKENS) {
        // Defer continuation until after compaction completes.
        this.sendContinuationAfterCompaction(ctx, goal);
        return;
      }
    }

    // Normal continuation — context has room.
    this.sendContinuation(goal);
  }

  // ─── For tool use ──────────────────────────────────────────────

  /** Suppress budget steering for the current turn (e.g., when update_goal sets complete). */
  suppressBudgetSteering(): void {
    this.suppress_budget_steering = true;
  }

  // ─── Continuation dispatch ──────────────────────────────────────

  /** Mark continuation state and bump counter. Shared preamble for all dispatch paths. */
  private beginContinuation(goal: Goal): void {
    this.continuation_active = true;
    const now = Date.now();
    this.store.updateGoal(
      {
        continuation_count: goal.continuation_count + 1,
        last_continued_at_ms: now,
      },
      goal.goal_id,
      "runtime",
    );
  }

  /** Send a continuation prompt immediately. */
  private sendContinuation(goal: Goal): void {
    this.beginContinuation(goal);

    this.pi.sendUserMessage(
      continuationPrompt(this.store.getGoal()!),
      { deliverAs: "followUp" },
    );
  }

  /** Trigger compaction and send continuation after it completes. */
  private sendContinuationAfterCompaction(ctx: ExtensionContext, goal: Goal): void {
    this.beginContinuation(goal);

    ctx.compact({
      onComplete: () => {
        const currentGoal = this.store.getGoal();
        if (currentGoal && currentGoal.status === "active") {
          this.pi.sendUserMessage(
            continuationPrompt(currentGoal),
            { deliverAs: "followUp" },
          );
        } else {
          // Goal no longer active after compaction (e.g., user paused it);
          // reset continuation flag so we can retry later.
          this.continuation_active = false;
        }
      },
      onError: () => {
        // Compaction failed or was aborted; reset flag so we can retry.
        this.continuation_active = false;
      },
    });
  }

  // ─── Internal helpers ──────────────────────────────────────────

  /** Consume elapsed wall-clock seconds and advance the baseline. */
  private consumeWallClockSeconds(): number {
    if (this.last_accounted_wall_clock === null) return 0;
    const now = Date.now();
    const elapsedMs = now - this.last_accounted_wall_clock;
    this.last_accounted_wall_clock = now;
    return Math.max(0, Math.round(elapsedMs / 1000));
  }

  /** Account usage and handle budget limiting. */
  private accountUsage(timeDelta: number, tokenDelta: number, checkBudget?: boolean): void {
    if (timeDelta <= 0 && tokenDelta <= 0) return;
    const expectedGoalId = this.active_goal_id ?? undefined;
    const result = this.store.accountGoalUsage(timeDelta, tokenDelta, expectedGoalId, "active_only");
    if (result?.budgetLimited && (checkBudget !== false) && !this.suppress_budget_steering) {
      this.onBudgetLimited(result.goal);
    }
  }

  /** Final wall-clock accounting (clears baseline). */
  private accountWallClockFinal(): void {
    const goal = this.store.getGoal();
    if (!goal || goal.status !== "active") {
      this.last_accounted_wall_clock = null;
      return;
    }
    const timeDelta = this.consumeWallClockSeconds();
    if (timeDelta > 0) {
      const expectedGoalId = this.active_goal_id ?? undefined;
      this.store.accountGoalUsage(timeDelta, 0, expectedGoalId, "active_only");
    }
    this.last_accounted_wall_clock = null;
  }

  /** Handle budget limit reached — inject steering prompt once per goal. */
  private onBudgetLimited(goal: Goal): void {
    if (this.suppress_budget_steering) return;
    if (this.budget_limit_reported_goal_id === goal.goal_id) return;
    this.budget_limit_reported_goal_id = goal.goal_id;

    this.goalEventCallback?.("budget_exhausted", goal);

    this.pi.sendUserMessage(
      budgetLimitPrompt(goal),
      { deliverAs: "followUp" },
    );
  }

  /** Reset all runtime state. */
  reset(): void {
    this.active_goal_id = null;
    this.active_turn_marker = false;
    this.continuation_active = false;
    this.budget_limit_reported_goal_id = null;
    this.last_accounted_wall_clock = null;
    this.accounted_assistant_usage_keys.clear();
    this.continuationSuppressed = false;
    this.suppress_budget_steering = false;
  }
}
