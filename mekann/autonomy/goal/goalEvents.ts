/**
 * goal/goalEvents.ts — Goal event orchestration and context metadata extraction.
 *
 * This module is the single boundary that turns an `ExtensionContext` into the
 * metadata shape required by the context ledger (`recordGoalEvent`), and exposes
 * fire-and-forget helpers used by the composition root, tools, command, and
 * runtime callback.
 *
 * All `ctx as any` casts for `cwd` / `sessionId` / `turnId` / `branchId` are
 * confined to `extractGoalContextMeta` so callers never repeat them.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { recordGoalEvent, type GoalAction } from "./context-events.js";
import type { Goal, GoalSource } from "./state.js";

// ---------------------------------------------------------------------------
// Context metadata extraction (single cast boundary)
// ---------------------------------------------------------------------------

/**
 * Metadata extracted from a Pi `ExtensionContext` for ledger recording.
 *
 * Pi's API type does not expose `cwd`/`sessionId`/`turnId`/`branchId` as stable
 * fields, so the cast is confined to this helper instead of being repeated at
 * every call site.
 */
export interface GoalContextMeta {
  cwd: string;
  sessionId?: string;
  turnId?: string;
  branchId?: string;
}

/** Extract ledger-recording metadata from a context, with safe defaults. */
export function extractGoalContextMeta(ctx: ExtensionContext): GoalContextMeta {
  // Pi's API type does not expose these fields, so cast through `unknown` once
  // at this boundary rather than repeating `ctx as any` at every call site.
  const raw = ctx as unknown as Record<string, unknown> | null | undefined;
  return {
    cwd: typeof raw?.cwd === "string" ? raw.cwd : process.cwd(),
    sessionId: typeof raw?.sessionId === "string" ? raw.sessionId : undefined,
    turnId: typeof raw?.turnId === "string" ? raw.turnId : undefined,
    branchId: typeof raw?.branchId === "string" ? raw.branchId : undefined,
  };
}

// ---------------------------------------------------------------------------
// Fire-and-forget goal action recording
// ---------------------------------------------------------------------------

export interface RecordGoalActionInput {
  action: GoalAction;
  goal?: Goal | null;
  source?: GoalSource;
  ctx: ExtensionContext;
}

/**
 * Record a goal lifecycle event to the context ledger, best-effort.
 *
 * Pulls `cwd` / `sessionId` / `turnId` / `branchId` from `ctx` via
 * `extractGoalContextMeta` and swallows ledger failures. This is the helper
 * callers should use instead of assembling `recordGoalEvent` input by hand.
 */
export function recordGoalAction(input: RecordGoalActionInput): void {
  const meta = extractGoalContextMeta(input.ctx);
  recordGoalEvent({
    action: input.action,
    goal: input.goal ?? null,
    cwd: meta.cwd,
    sessionId: meta.sessionId,
    turnId: meta.turnId,
    branchId: meta.branchId,
    source: input.source,
  }).catch(() => {
    // best-effort: ledger write failure must never block goal mutations
  });
}

// ---------------------------------------------------------------------------
// Event emitters (goal:updated / goal:cleared + widget refresh)
// ---------------------------------------------------------------------------

/** Refreshes the goal widget after a state change. Provided by goalWidget.ts. */
export type UpdateWidgetFn = (ctx: ExtensionContext) => void;

export interface GoalEmitters {
  emitUpdated: (
    ctx: ExtensionContext,
    goal: Goal,
    action?: GoalAction,
    source?: GoalSource,
  ) => void;
  emitCleared: (
    ctx: ExtensionContext,
    threadId: string,
    goal?: Goal | null,
    source?: "user" | "runtime",
  ) => void;
}

/**
 * Create the `goal:updated` / `goal:cleared` emitters.
 *
 * Each emitter records a ledger event, emits the corresponding Pi event, and
 * refreshes the widget. Centralising this here means tools and the `/goal`
 * command share one implementation instead of duplicating the wiring.
 */
export function createGoalEmitters(pi: ExtensionAPI, updateWidget: UpdateWidgetFn): GoalEmitters {
  function emitUpdated(
    ctx: ExtensionContext,
    goal: Goal,
    action: GoalAction = "updated",
    source: GoalSource = "user",
  ): void {
    recordGoalAction({ action, goal, source, ctx });
    pi.events.emit("goal:updated", { thread_id: goal.thread_id, goal });
    updateWidget(ctx);
  }

  function emitCleared(
    ctx: ExtensionContext,
    threadId: string,
    goal: Goal | null = null,
    source: "user" | "runtime" = "user",
  ): void {
    recordGoalAction({ action: "cleared", goal, source, ctx });
    pi.events.emit("goal:cleared", { thread_id: threadId });
    updateWidget(ctx);
  }

  return { emitUpdated, emitCleared };
}
