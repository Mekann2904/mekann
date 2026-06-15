/**
 * goal/goalTools.ts — Registration of the goal model tools.
 *
 * Owns the `get_goal`, `create_goal`, and `update_goal` tool registrations.
 * Tool bodies are unchanged in behavior; this module simply lifts them out of
 * the composition root so `index.ts` no longer carries tool implementation
 * detail.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { GoalError, type Goal, type GoalStore, type GoalSource, remainingTokens } from "./state.js";
import type { GoalRuntime } from "./runtime.js";
import type { GoalAction } from "./context-events.js";

// ---------------------------------------------------------------------------
// Shared disabled response
// ---------------------------------------------------------------------------

export const DISABLED_RESPONSE = {
  content: [{ type: "text" as const, text: "Goals feature is disabled or session is not persisted." }],
  details: {},
};

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GoalToolDeps {
  pi: ExtensionAPI;
  getStore(): GoalStore | null;
  getRuntime(): GoalRuntime | null;
  isEnabled(ctx: ExtensionContext): boolean;
  emitUpdated: (
    ctx: ExtensionContext,
    goal: Goal,
    action?: GoalAction,
    source?: GoalSource,
  ) => void;
}

/**
 * Register the goal model tools.
 *
 * Behavior is preserved exactly: `get_goal` reports status, `create_goal`
 * creates a new goal (failing if one exists), and `update_goal` marks a goal
 * complete or blocked after runtime synchronization.
 */
export function registerGoalTools(deps: GoalToolDeps): void {
  const { pi } = deps;

  // ─── get_goal ─────────────────────────────────────────────────

  pi.registerTool({
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
      const store = deps.getStore();
      if (!deps.isEnabled(ctx) || !store) return DISABLED_RESPONSE;
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

  // ─── create_goal ──────────────────────────────────────────────

  pi.registerTool({
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
      const store = deps.getStore();
      const runtime = deps.getRuntime();
      if (!deps.isEnabled(ctx) || !store || !runtime) return DISABLED_RESPONSE;
      try {
        const goal = store.createGoal(
          ctx.sessionManager.getSessionId(),
          params.objective,
          params.token_budget ?? null,
          "tool",
        );
        runtime.onExternalSet(goal);
        deps.emitUpdated(ctx, goal, "set", "tool");
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

  // ─── update_goal ──────────────────────────────────────────────

  pi.registerTool({
    name: "update_goal",
    label: "Update goal",
    description:
      "Update the existing goal. Use only to mark the goal achieved or genuinely blocked. " +
      "Set status='complete' only when the objective has actually been achieved and no required work remains. " +
      "Set status='blocked' only when the same blocking condition has repeated for at least three consecutive goal turns and no meaningful progress is possible without user input or an external-state change. " +
      "Pause, resume, budget-limited, and usage-limited status changes are controlled by the user or runtime.",
    promptSnippet: "Mark goal as complete or strictly blocked",
    promptGuidelines: [
      "Use update_goal with status='complete' ONLY when authoritative current-state evidence proves every requirement is satisfied.",
      "Use update_goal with status='blocked' ONLY after the same blocker recurs for at least three consecutive goal turns and you are truly at an impasse.",
      "Do NOT use blocked merely because the work is hard, slow, uncertain, incomplete, or would benefit from clarification.",
      "Do NOT mark goals as complete prematurely or because you are stopping work/budget is nearly exhausted.",
      "You cannot pause, resume, clear, or set budget_limited/usage_limited via this tool.",
    ],
    parameters: Type.Object({
      status: StringEnum(["complete", "blocked"] as const, {
        description: "Set to 'complete' only when fully achieved; set to 'blocked' only after the strict three-consecutive-goal-turn blocked audit is satisfied",
      }) as any,
      expected_goal_id: Type.Optional(
        Type.String({ description: "Optional: expected goal_id for optimistic concurrency" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = deps.getStore();
      const runtime = deps.getRuntime();
      if (!deps.isEnabled(ctx) || !store || !runtime) return DISABLED_RESPONSE;
      try {
        const status = params.status as "complete" | "blocked";
        const patch: { status: "complete" | "blocked" } = { status };

        // Reject if goal status is already complete
        const current = store.getGoal();
        if (!current) {
          return {
            content: [{ type: "text" as const, text: "[ERROR] No goal to update" }],
            details: { error: "No goal to update" },
          };
        }
        if (current.status === "complete" || current.status === "blocked") {
          return {
            content: [{ type: "text" as const, text: `[ERROR] Goal is already ${current.status}` }],
            details: { error: `Goal is already ${current.status}` },
          };
        }

        // Flush wall-clock accounting before completing
        runtime.onExternalMutationStarting();
        const previousGoal = store.getGoal();

        const goal = store.updateGoal(patch, params.expected_goal_id as string | undefined, "tool");

        // Suppress budget steering since this is a terminal model-declared status.
        runtime.suppressBudgetSteering();
        // Synchronize runtime state (clears active_goal_id, wall-clock baseline)
        runtime.onExternalSet(goal, previousGoal);

        deps.emitUpdated(ctx, goal, status === "complete" ? "completed" : "blocked", "tool");
        const usageReport = `Final usage: ${goal.tokens_used} tokens, ${goal.time_used_seconds}s`;
        const statusText = status === "complete" ? "complete" : "blocked";

        return {
          content: [{ type: "text" as const, text: `Goal marked as ${statusText}. ${usageReport}` }],
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
}
