/**
 * Goal Extension — Persistent thread-local goals with idle continuation.
 *
 * Provides:
 * - `/goal` command for managing goals
 * - `get_goal`, `create_goal`, `update_goal` model tools
 * - Automatic idle continuation for active goals
 * - Token/time budget tracking
 * - Continuation suppression integration
 *
 * Usage:
 *   /goal <objective>           — Set a new goal
 *   /goal                       — Show current goal status
 *   /goal edit                  — Edit the objective
 *   /goal pause                 — Pause the active goal
 *   /goal resume                — Resume a paused goal
 *   /goal clear                 — Delete the goal
 *   /goal budget <n|none>       — Set or clear token budget
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  GoalStore,
  GoalError,
  type GoalStateEntry,
  type Goal,
  remainingTokens,
} from "./state.js";
import { GoalRuntime } from "./runtime.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";
import { featureStringValue } from "../../settings/enabled.js";
import { setToolsActive } from "../../settings/toolSurface.js";
import { renderWidget, renderGoalPolicy, renderGoalObjectiveContext, renderGoalRuntimeState } from "./prompts.js";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { registerGoalCommand } from "./command.js";
import { recordGoalEvent, type GoalAction } from "./context-events.js";
import { MODE_STATUS_EVENT } from "../../safety/policy-core/modes.js";
import { registerContextTool } from "../../context/observations.js";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CUSTOM_TYPE = "goal-state";
const GOAL_TOOL_NAMES = ["get_goal", "create_goal", "update_goal"] as const;
void MODE_STATUS_EVENT;

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function goalExtension(pi: ExtensionAPI): void {
  let store: GoalStore | null = null;
  let runtime: GoalRuntime | null = null;

  // ─── Feature flag ─────────────────────────────────────────────

  pi.registerFlag("goals", {
    description: "Enable the goal tracking feature",
    type: "boolean",
    default: true,
  });

  // ─── Helpers ──────────────────────────────────────────────────

  function persist(entry: GoalStateEntry): void {
    pi.appendEntry(CUSTOM_TYPE, entry);
  }

  function isEnabled(ctx: ExtensionContext): boolean {
    if (pi.getFlag("goals") !== true) return false;
    if (!(ctx.sessionManager as any).isPersisted?.()) return false;
    return true;
  }

  const DISABLED_RESPONSE = {
    content: [{ type: "text" as const, text: "Goals feature is disabled or session is not persisted." }],
    details: {},
  };

  function shouldExposeGoalTools(): boolean {
    const surface = featureStringValue("goal", "toolSurface", "slash");
    if (surface === "always") return true;
    if (surface === "active") {
      const goal = store?.getGoal();
      return goal?.status === "active";
    }
    return false;
  }

  function syncGoalToolSurface(): void {
    setToolsActive(pi, GOAL_TOOL_NAMES, shouldExposeGoalTools());
  }

  function updateWidget(ctx: ExtensionContext): void {
    syncGoalToolSurface();
    if (!ctx.hasUI) return;
    const goal = store?.getGoal() ?? null;
    const lines = renderWidget(goal);
    ctx.ui.setWidget("goal", lines ? (_tui: unknown, _theme: any) => ({
      invalidate() {},
      render(width: number): string[] {
        return lines.map(l => truncateToWidth(l, width));
      },
    }) : undefined);
  }

  function emitUpdated(ctx: ExtensionContext, goal: Goal, action: GoalAction = "updated", source: "user" | "tool" | "runtime" = "user"): void {
    const cwd = (ctx as any)?.cwd ?? process.cwd();
    recordGoalEvent({
      action,
      goal,
      cwd,
      sessionId: (ctx as any)?.sessionId,
      turnId: (ctx as any)?.turnId,
      branchId: (ctx as any)?.branchId,
      source,
    }).catch(() => {});
    pi.events.emit("goal:updated", { thread_id: goal.thread_id, goal });
    updateWidget(ctx);
  }

  function emitCleared(ctx: ExtensionContext, threadId: string, goal?: Goal | null, source: "user" | "runtime" = "user"): void {
    const cwd = (ctx as any)?.cwd ?? process.cwd();
    recordGoalEvent({
      action: "cleared",
      goal: goal ?? null,
      cwd,
      sessionId: (ctx as any)?.sessionId,
      turnId: (ctx as any)?.turnId,
      branchId: (ctx as any)?.branchId,
      source,
    }).catch(() => {});
    pi.events.emit("goal:cleared", { thread_id: threadId });
    updateWidget(ctx);
  }

  // ─── Session lifecycle ────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (!isEnabled(ctx)) {
      store = null;
      runtime = null;
      ctx.ui.setWidget("goal", undefined);
      return;
    }

    // Reconstruct from session custom entries
    const branch = ctx.sessionManager.getBranch();
    const goalEntries: GoalStateEntry[] = [];
    // branch is leaf→root; reverse for chronological (root→leaf) replay
    for (let i = branch.length - 1; i >= 0; i--) {
      const entry = branch[i];
      if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) {
        goalEntries.push(entry.data as GoalStateEntry);
      }
    }
    store = GoalStore.fromEntries(goalEntries, persist);
    runtime = new GoalRuntime(store, pi, (action, goal) => {
      const cwd = (ctx as any)?.cwd ?? process.cwd();
      recordGoalEvent({
        action: action as GoalAction,
        goal,
        cwd,
        sessionId: (ctx as any)?.sessionId,
        turnId: (ctx as any)?.turnId,
        branchId: (ctx as any)?.branchId,
        source: "runtime",
      }).catch(() => {});
    });
    runtime.onSessionStart(ctx);
    updateWidget(ctx);
  });

  pi.on("session_shutdown", async () => {
    runtime?.onSessionShutdown();
    store = null;
    runtime = null;
    syncGoalToolSurface();
  });

  // ─── Agent lifecycle ──────────────────────────────────────────

  pi.on("agent_start", async () => {
    runtime?.onAgentStart();
  });

  pi.on("turn_start", async (event, ctx) => {
    runtime?.onTurnStart(event, ctx);
  });

  pi.on("message_end", async (event, ctx) => {
    runtime?.onMessageEnd(event, ctx);
    updateWidget(ctx);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    runtime?.onToolExecutionEnd(event, ctx);
    updateWidget(ctx);
  });

  pi.on("turn_end", async (event, ctx) => {
    runtime?.onTurnEnd(event, ctx);
    updateWidget(ctx);
  });

  pi.on("agent_end", async (event, ctx) => {
    runtime?.onAgentEnd(event, ctx);
    updateWidget(ctx);
    // Consider idle continuation after agent finishes
    if (runtime && store) {
      runtime.maybeContinueIfIdle(ctx);
    }
  });

  // ─── Prompt fragments ─────────────────────────────────────

  registerPromptProvider({
    id: "goal",
    getFragments() {
      const goal = store?.getGoal();
      if (!goal || goal.status !== "active") return [];
      return [
        {
          id: "goal:policy",
          source: "goal",
          kind: "goal_policy",
          stability: "stable",
          scope: "global",
          priority: 300,
          version: "v1",
          cacheIntent: "prefer_cache",
          content: renderGoalPolicy(),
        },
        {
          id: "goal:objective",
          source: "goal",
          kind: "goal_objective",
          stability: "semi_stable",
          scope: "session",
          priority: 310,
          version: "v1",
          cacheIntent: "neutral",
          content: renderGoalObjectiveContext(goal),
        },
        {
          id: "goal:runtime-state",
          source: "goal",
          kind: "goal_runtime_state",
          stability: "dynamic",
          scope: "turn",
          priority: 700,
          version: "v1",
          cacheIntent: "avoid_cache",
          content: renderGoalRuntimeState(goal),
        },
      ];
    },
  });

  // ─── Model tools ──────────────────────────────────────────────

  // get_goal
  registerContextTool(pi, {
    name: "get_goal",
    label: "Get current goal",
    description:
      "Get the current thread goal, including objective, status, and remaining token budget.",
    promptSnippet: "Check current goal status and remaining budget",
    promptGuidelines: [
      "Use get_goal to check the current goal status before deciding whether to continue or complete.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (!isEnabled(ctx) || !store) return DISABLED_RESPONSE;
      const goal = store.getGoal();
      if (!goal) {
        return {
          content: [{ type: "text" as const, text: "No active goal." }],
          details: {},
        };
      }
      const remaining = remainingTokens(goal);
      return {
        content: [{
          type: "text" as const,
          text: [
            `Goal: ${goal.objective}`,
            `Status: ${goal.status}`,
            `Tokens used: ${goal.tokens_used}`,
            ...(goal.token_budget !== null
              ? [`Token budget: ${goal.token_budget}`, `Remaining tokens: ${remaining}`]
              : []),
            `Time used: ${goal.time_used_seconds}s`,
          ].join("\n"),
        }],
        details: { goal, remaining_tokens: remaining },
      };
    },
  });

  // create_goal
  registerContextTool(pi, {
    name: "create_goal",
    label: "Create a goal",
    description:
      "Create a new thread goal with an objective and optional token budget. " +
      "Only use this when the user explicitly requests goal creation. " +
      "Fails if a goal already exists.",
    promptSnippet: "Create a new goal when explicitly requested",
    promptGuidelines: [
      "Use create_goal only when the user explicitly asks to set a goal.",
      "Do NOT create goals autonomously for ordinary tasks.",
      "If a goal already exists, report the error to the user.",
    ],
    parameters: Type.Object({
      objective: Type.String({ description: "The goal objective" }),
      token_budget: Type.Optional(
        Type.Integer({
          minimum: 1,
          description: "Optional positive integer token budget.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!isEnabled(ctx) || !store || !runtime) return DISABLED_RESPONSE;
      try {
        const goal = store.createGoal(
          ctx.sessionManager.getSessionId(),
          params.objective,
          params.token_budget ?? null,
          "tool",
        );
        runtime.onExternalSet(goal);
        emitUpdated(ctx, goal, "set", "tool");
        return {
          content: [{ type: "text" as const, text: `Goal created: ${goal.objective}` }],
          details: { goal },
        };
      } catch (e) {
        const msg = e instanceof GoalError ? e.message : "Failed to create goal";
        return {
          content: [{ type: "text" as const, text: `[ERROR] ${msg}` }],
          details: { error: msg },
        };
      }
    },
  });

  // update_goal
  registerContextTool(pi, {
    name: "update_goal",
    label: "Update goal",
    description:
      "Update the current goal. Only status='complete' is allowed via this tool. " +
      "Use this when the goal's objective has been fully achieved.",
    promptSnippet: "Mark goal as complete when achieved",
    promptGuidelines: [
      "Use update_goal to mark a goal as complete ONLY when the objective is genuinely fully achieved.",
      "Do NOT mark goals as complete prematurely.",
      "You cannot pause, resume, clear, or set budget_limited via this tool.",
    ],
    parameters: Type.Object({
      status: StringEnum(["complete"] as const, {
        description: "Set to 'complete' when the goal is achieved",
      }) as any,
      expected_goal_id: Type.Optional(
        Type.String({ description: "Optional: expected goal_id for optimistic concurrency" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!isEnabled(ctx) || !store || !runtime) return DISABLED_RESPONSE;
      try {
        const patch: { status: "complete" } = { status: params.status as "complete" };

        // Reject if goal status is already complete
        const current = store.getGoal();
        if (!current) {
          return {
            content: [{ type: "text" as const, text: "[ERROR] No goal to update" }],
            details: { error: "No goal to update" },
          };
        }
        if (current.status === "complete") {
          return {
            content: [{ type: "text" as const, text: "[ERROR] Goal is already complete" }],
            details: { error: "Goal is already complete" },
          };
        }

        // Flush wall-clock accounting before completing
        runtime.onExternalMutationStarting();
        const previousGoal = store.getGoal();

        const goal = store.updateGoal(patch, params.expected_goal_id as string | undefined, "tool");

        // Suppress budget steering since we're completing
        runtime.suppressBudgetSteering();
        // Synchronize runtime state (clears active_goal_id, wall-clock baseline)
        runtime.onExternalSet(goal, previousGoal);

        emitUpdated(ctx, goal, "completed", "tool");
        const usageReport = `Final usage: ${goal.tokens_used} tokens, ${goal.time_used_seconds}s`;

        return {
          content: [{ type: "text" as const, text: `Goal marked as complete. ${usageReport}` }],
          details: { goal, final_usage: { tokens: goal.tokens_used, time: goal.time_used_seconds } },
        };
      } catch (e) {
        const msg = e instanceof GoalError ? e.message : "Failed to update goal";
        return {
          content: [{ type: "text" as const, text: `[ERROR] ${msg}` }],
          details: { error: msg },
        };
      }
    },
  });

  // ─── /goal command ────────────────────────────────────────────

  registerGoalCommand(pi, {
    getStore: () => store,
    getRuntime: () => runtime,
    isEnabled,
    emitUpdated,
    emitCleared,
  });
}
