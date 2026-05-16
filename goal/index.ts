/**
 * Goal Extension — Persistent thread-local goals with idle continuation.
 *
 * Provides:
 * - `/goal` command for managing goals
 * - `get_goal`, `create_goal`, `update_goal` model tools
 * - Automatic idle continuation for active goals
 * - Token/time budget tracking
 * - Plan mode integration
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
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  GoalStore,
  GoalError,
  type GoalStateEntry,
  type Goal,
} from "./state.js";
import { GoalRuntime } from "./runtime.js";
import { renderGoalSummary, renderNoGoal, renderWidget } from "./render.js";
import { renderGoalContext } from "./prompts.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CUSTOM_TYPE = "goal-state";

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

  // ─── Plan mode integration ────────────────────────────────────

  try {
    pi.events.on("mekann:plan-mode:status", (data: unknown) => {
      if (runtime) {
        const evt = data as { mode: "main" | "plan" };
        runtime.inPlanMode = evt.mode === "plan";
      }
    });
  } catch {
    // plan-mode extension not loaded
  }

  // ─── Helpers ──────────────────────────────────────────────────

  function persist(entry: GoalStateEntry): void {
    pi.appendEntry(CUSTOM_TYPE, entry);
  }

  function isEnabled(ctx: ExtensionContext): boolean {
    if (pi.getFlag("goals") !== true) return false;
    if (!ctx.sessionManager.isPersisted()) return false;
    return true;
  }

  function updateWidget(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const goal = store?.getGoal() ?? null;
    const lines = renderWidget(goal);
    ctx.ui.setWidget("goal", lines);
  }

  function emitUpdated(ctx: ExtensionContext, goal: Goal): void {
    pi.events.emit("goal:updated", { thread_id: goal.thread_id, goal });
    updateWidget(ctx);
  }

  function emitCleared(ctx: ExtensionContext, threadId: string): void {
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
    runtime = new GoalRuntime(store, pi);
    runtime.onSessionStart(ctx);
    updateWidget(ctx);
  });

  pi.on("session_shutdown", async () => {
    runtime?.onSessionShutdown();
    store = null;
    runtime = null;
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

  // ─── before_agent_start: inject active goal context ───────

  pi.on("before_agent_start", async (_event, _ctx) => {
    if (!store) return {};
    const goal = store.getGoal();
    if (!goal || goal.status !== "active") return {};
    const extra = "\n" + renderGoalContext(goal) + "\n";
    return {
      systemPrompt: _event.systemPrompt + extra,
    };
  });

  // ─── Model tools ──────────────────────────────────────────────

  // get_goal
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
      if (!isEnabled(ctx) || !store) {
        return {
          content: [{ type: "text" as const, text: "Goals feature is disabled or session is not persisted." }],
          details: {},
        };
      }
      const goal = store.getGoal();
      if (!goal) {
        return {
          content: [{ type: "text" as const, text: "No active goal." }],
          details: {},
        };
      }
      const remaining = goal.token_budget !== null
        ? Math.max(0, goal.token_budget - goal.tokens_used)
        : null;
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
        Type.Number({ description: "Optional token budget (positive integer)" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!isEnabled(ctx) || !store || !runtime) {
        return {
          content: [{ type: "text" as const, text: "Goals feature is disabled or session is not persisted." }],
          details: {},
        };
      }
      try {
        const goal = store.createGoal(
          ctx.sessionManager.getSessionId(),
          params.objective,
          params.token_budget ?? null,
          "tool",
        );
        runtime.onExternalSet(goal);
        emitUpdated(ctx, goal);
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
  pi.registerTool({
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
      }),
      expected_goal_id: Type.Optional(
        Type.String({ description: "Optional: expected goal_id for optimistic concurrency" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!isEnabled(ctx) || !store || !runtime) {
        return {
          content: [{ type: "text" as const, text: "Goals feature is disabled or session is not persisted." }],
          details: {},
        };
      }
      try {
        const patch: { status: "complete" } = { status: params.status };

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

        const goal = store.updateGoal(patch, params.expected_goal_id, "tool");

        // Suppress budget steering since we're completing
        runtime.suppressBudgetSteering();

        emitUpdated(ctx, goal);
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

  pi.registerCommand("goal", {
    description: "Manage thread goals (set, pause, resume, clear, edit, budget)",
    async handler(args, ctx) {
      const input = (args ?? "").trim();
      const parts = input.split(/\s+/);
      const sub = parts[0] || "";

      // Feature disabled?
      if (pi.getFlag("goals") !== true) {
        ctx.ui.notify("Goals feature is disabled (enable with --goals flag)", "warning");
        return;
      }
      if (!ctx.sessionManager.isPersisted()) {
        ctx.ui.notify("Goals require a persisted session", "warning");
        return;
      }
      if (!store || !runtime) {
        ctx.ui.notify("Goal system not initialized", "warning");
        return;
      }

      const goal = store.getGoal();

      switch (sub) {
        // ── status (default) ─────────────────────────────────
        case "":
        case "status": {
          if (!goal) {
            ctx.ui.notify(renderNoGoal().join("\n"), "info");
          } else {
            ctx.ui.notify(renderGoalSummary(goal).join("\n"), "info");
          }
          break;
        }

        // ── pause ────────────────────────────────────────────
        case "pause": {
          if (!goal) {
            ctx.ui.notify("No goal to pause", "warning");
            return;
          }
          if (goal.status !== "active") {
            ctx.ui.notify(`Goal is already ${goal.status}`, "warning");
            return;
          }
          try {
            runtime.onExternalMutationStarting();
            const updated = store.updateGoal({ status: "paused" }, undefined, "user");
            runtime.onExternalSet(updated);
            emitUpdated(ctx, updated);
            ctx.ui.notify("Goal paused", "info");
          } catch (e) {
            ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }

        // ── resume ───────────────────────────────────────────
        case "resume": {
          if (!goal) {
            ctx.ui.notify("No goal to resume", "warning");
            return;
          }
          if (goal.status === "active") {
            ctx.ui.notify("Goal is already active", "info");
            return;
          }
          // Check if budget is exhausted
          if (goal.token_budget !== null && goal.tokens_used >= goal.token_budget) {
            ctx.ui.notify(
              `Cannot resume: token budget exhausted (${goal.tokens_used}/${goal.token_budget}). Use /goal budget <n> to increase.`,
              "warning",
            );
            return;
          }
          try {
            runtime.onExternalMutationStarting();
            const updated = store.updateGoal({ status: "active" }, undefined, "user");
            runtime.onExternalSet(updated);
            emitUpdated(ctx, updated);
            ctx.ui.notify("Goal resumed", "success");
            runtime.maybeContinueIfIdle(ctx);
          } catch (e) {
            ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }

        // ── clear ────────────────────────────────────────────
        case "clear": {
          if (!goal) {
            ctx.ui.notify("No goal to clear", "warning");
            return;
          }
          const confirmed = await ctx.ui.confirm("Clear goal?", `Objective: "${goal.objective}"`);
          if (!confirmed) {
            ctx.ui.notify("Cancelled", "info");
            return;
          }
          runtime.onExternalMutationStarting();
          const threadId = goal.thread_id;
          store.deleteGoal("user");
          runtime.onExternalClear();
          emitCleared(ctx, threadId);
          ctx.ui.notify("Goal cleared", "info");
          break;
        }

        // ── edit ─────────────────────────────────────────────
        case "edit": {
          if (!goal) {
            ctx.ui.notify("No goal to edit", "warning");
            return;
          }
          const edited = await ctx.ui.editor("Edit goal objective:", goal.objective);
          if (!edited || edited.trim() === goal.objective.trim()) {
            ctx.ui.notify("Goal unchanged", "info");
            return;
          }
          try {
            runtime.onExternalMutationStarting();
            const previousGoal = store.getGoal();
            // Editing reactivates the goal (clears complete/budget_limited)
            const updated = store.updateGoal(
              { objective: edited, status: "active" },
              undefined,
              "user",
            );
            runtime.onExternalSet(updated, previousGoal);
            emitUpdated(ctx, updated);
            ctx.ui.notify(`Goal updated: ${updated.objective}`, "success");
            // Trigger continuation check after editing goal
            runtime.maybeContinueIfIdle(ctx);
          } catch (e) {
            ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }

        // ── budget ───────────────────────────────────────────
        case "budget": {
          const budgetArg = parts.slice(1).join(" ").trim();
          if (!budgetArg) {
            if (goal) {
              const budgetStr = goal.token_budget !== null ? String(goal.token_budget) : "none";
              ctx.ui.notify(`Current budget: ${budgetStr} (used: ${goal.tokens_used})`, "info");
            } else {
              ctx.ui.notify("No active goal", "warning");
            }
            return;
          }
          if (!goal) {
            ctx.ui.notify("No goal to set budget for", "warning");
            return;
          }
          const newBudget = budgetArg === "none" ? null : parseInt(budgetArg, 10);
          if (newBudget !== null && (!Number.isInteger(newBudget) || newBudget <= 0)) {
            ctx.ui.notify("Budget must be a positive integer or 'none'", "warning");
            return;
          }
          try {
            runtime.onExternalMutationStarting();
            const updated = store.updateGoal({ token_budget: newBudget }, undefined, "user");
            runtime.onExternalSet(updated);
            emitUpdated(ctx, updated);
            ctx.ui.notify(
              `Budget set: ${updated.token_budget ?? "unlimited"} (status: ${updated.status})`,
              "info",
            );
          } catch (e) {
            ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }

        // ── set <objective> ──────────────────────────────────
        case "set": {
          const objectiveText = parts.slice(1).join(" ").trim();
          if (!objectiveText) {
            ctx.ui.notify("Usage: /goal set <objective>", "warning");
            return;
          }
          await handleSetObjective(ctx, objectiveText);
          break;
        }

        // ── default: treat as /goal <objective> ──────────────
        default: {
          await handleSetObjective(ctx, input);
          break;
        }
      }
    },
  });

  // ─── Objective setter (shared by /goal <obj> and /goal set <obj>) ──

  async function handleSetObjective(ctx: ExtensionContext, input: string): Promise<void> {
    if (!store || !runtime) return;

    let objective: string;
    let budget: number | null = null;

    // Parse --budget <n> prefix or suffix
    const budgetPrefixMatch = input.match(/^--budget\s+(\d+)\s+([\s\S]+)$/);
    const budgetSuffixMatch = input.match(/^([\s\S]+?)\s+--budget\s+(\d+)$/);
    if (budgetPrefixMatch) {
      budget = parseInt(budgetPrefixMatch[1], 10);
      objective = budgetPrefixMatch[2].trim();
    } else if (budgetSuffixMatch) {
      budget = parseInt(budgetSuffixMatch[2], 10);
      objective = budgetSuffixMatch[1].trim();
    } else {
      objective = input.trim();
    }

    if (!objective) {
      ctx.ui.notify("Usage: /goal <objective> [--budget <n>]", "warning");
      return;
    }

    runtime.onExternalMutationStarting();

    const existingGoal = store.getGoal();
    if (existingGoal) {
      const confirmed = await ctx.ui.confirm(
        "Replace existing goal?",
        `Current: "${existingGoal.objective}"\nNew: "${objective}"`,
      );
      if (!confirmed) {
        ctx.ui.notify("Goal replacement cancelled", "info");
        return;
      }
    }

    try {
      const previousGoal = store.getGoal();
      const newGoal = existingGoal
        ? store.replaceGoal(ctx.sessionManager.getSessionId(), objective, "active", budget, "user")
        : store.createGoal(ctx.sessionManager.getSessionId(), objective, budget, "user");
      runtime.onExternalSet(newGoal, previousGoal);
      emitUpdated(ctx, newGoal);
      ctx.ui.notify(`Goal set: ${newGoal.objective}`, "success");
      // Trigger continuation check after setting a new goal
      runtime.maybeContinueIfIdle(ctx);
    } catch (e) {
      ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }
}
