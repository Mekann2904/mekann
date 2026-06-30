import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Goal } from "./state.js";
import { GoalStore } from "./state.js";
import type { GoalAction } from "./context-events.js";
import { GoalRuntime } from "./runtime.js";
import { renderGoalSummary, renderNoGoal } from "./prompts.js";
import { isPersistedSession } from "./session.js";
import { parseFlags, tokenizeArgs } from "../../utils/cli-args/index.js";

export interface GoalCommandDeps {
  getStore(): GoalStore | null;
  getRuntime(): GoalRuntime | null;
  isEnabled(ctx: ExtensionContext): boolean;
  emitUpdated(ctx: ExtensionContext, goal: Goal, action?: GoalAction): void;
  emitCleared(ctx: ExtensionContext, threadId: string, goal?: Goal | null): void;
}

/**
 * Register and implement the interactive /goal command.
 *
 * Keeping command parsing and user-facing mutations outside index.ts leaves the
 * extension entry point focused on lifecycle wiring and tool registration.
 */
export function registerGoalCommand(pi: ExtensionAPI, deps: GoalCommandDeps): void {
  pi.registerCommand("goal", {
    description: "Manage thread goals (set, pause, resume, clear, edit, budget)",
    async handler(args, ctx) {
      const store = deps.getStore();
      const runtime = deps.getRuntime();
      const input = (args ?? "").trim();
      const parts = input.split(/\s+/);
      const sub = parts[0] || "";

      if (!deps.isEnabled(ctx) || !store || !runtime) {
        ctx.ui.notify(
          !pi.getFlag("goals")
            ? "Goals feature is disabled (enable with --goals flag)"
            : !isPersistedSession(ctx)
              ? "Goals require a persisted session"
              : "Goal system not initialized",
          "warning",
        );
        return;
      }

      const goal = store.getGoal();

      switch (sub) {
        case "":
        case "status": {
          ctx.ui.notify(goal ? renderGoalSummary(goal).join("\n") : renderNoGoal().join("\n"), "info");
          break;
        }

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
            deps.emitUpdated(ctx, updated, "paused");
            ctx.ui.notify("Goal paused", "info");
          } catch (e) {
            ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }

        case "resume": {
          if (!goal) {
            ctx.ui.notify("No goal to resume", "warning");
            return;
          }
          if (goal.status === "active") {
            ctx.ui.notify("Goal is already active", "info");
            return;
          }
          if (goal.token_budget !== null && goal.tokens_used >= goal.token_budget) {
            ctx.ui.notify(
              `Cannot resume: token budget exhausted (${goal.tokens_used}/${goal.token_budget}). Use /goal budget <n> to increase.`,
              "warning",
            );
            return;
          }
          try {
            runtime.onExternalMutationStarting();
            const updated = store.updateGoal(
              {
                status: "active",
              },
              undefined,
              "user",
            );
            runtime.onExternalSet(updated);
            deps.emitUpdated(ctx, updated, "resumed");
            ctx.ui.notify("Goal resumed", "info");
            runtime.maybeContinueIfIdle(ctx);
          } catch (e) {
            ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }

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
          deps.emitCleared(ctx, threadId, goal);
          ctx.ui.notify("Goal cleared", "info");
          break;
        }

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
            const updated = store.updateGoal(
              {
                objective: edited,
                status: "active",
              },
              undefined,
              "user",
            );
            runtime.onExternalSet(updated, previousGoal);
            deps.emitUpdated(ctx, updated, "updated");
            ctx.ui.notify(`Goal updated: ${updated.objective}`, "info");
            runtime.maybeContinueIfIdle(ctx);
          } catch (e) {
            ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }

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
          const newBudget = parseBudgetArg(budgetArg, ctx);
          if (newBudget === undefined) return;
          try {
            runtime.onExternalMutationStarting();
            const updated = store.updateGoal({ token_budget: newBudget }, undefined, "user");
            runtime.onExternalSet(updated);
            deps.emitUpdated(ctx, updated, "updated");
            ctx.ui.notify(`Budget set: ${updated.token_budget ?? "unlimited"} (status: ${updated.status})`, "info");
          } catch (e) {
            ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
          }
          break;
        }

        case "set": {
          const objectiveText = parts.slice(1).join(" ").trim();
          if (!objectiveText) {
            ctx.ui.notify("Usage: /goal set <objective>", "warning");
            return;
          }
          await handleSetObjective(ctx, objectiveText, store, runtime, deps);
          break;
        }

        default: {
          await handleSetObjective(ctx, input, store, runtime, deps);
          break;
        }
      }
    },
  });
}

function parseBudgetArg(budgetArg: string, ctx: ExtensionContext): number | null | undefined {
  const result = parseBudgetValue(budgetArg);
  if (result.ok) return result.value;
  ctx.ui.notify(
    "Budget must be a positive integer, scientific notation (e.g. 1e5), grouped digits (e.g. 10,000), or 'none'",
    "warning",
  );
  return undefined;
}

async function handleSetObjective(
  ctx: ExtensionContext,
  input: string,
  store: GoalStore,
  runtime: GoalRuntime,
  deps: GoalCommandDeps,
): Promise<void> {
  const parsed = parseObjectiveInput(input, ctx);
  if (!parsed) return;

  runtime.onExternalMutationStarting();

  const existingGoal = store.getGoal();
  if (existingGoal) {
    const confirmed = await ctx.ui.confirm(
      "Replace existing goal?",
      `Current: "${existingGoal.objective}"\nNew: "${parsed.objective}"`,
    );
    if (!confirmed) {
      ctx.ui.notify("Goal replacement cancelled", "info");
      return;
    }
  }

  try {
    const previousGoal = store.getGoal();
    const newGoal = existingGoal
      ? store.replaceGoal(ctx.sessionManager.getSessionId(), parsed.objective, "active", parsed.budget, "user")
      : store.createGoal(ctx.sessionManager.getSessionId(), parsed.objective, parsed.budget, "user");
    runtime.onExternalSet(newGoal, previousGoal);
    deps.emitUpdated(ctx, newGoal, "set");
    ctx.ui.notify(`Goal set: ${newGoal.objective}`, "info");
    runtime.maybeContinueIfIdle(ctx);
  } catch (e) {
    ctx.ui.notify(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
}

function parseObjectiveInput(
  input: string,
  ctx: ExtensionContext,
): { objective: string; budget: number | null } | null {
  const { positionals, flags } = parseFlags(tokenizeArgs(input), {
    aliases: { b: "budget" },
    known: ["budget"],
  });

  let budget: number | null = null;
  if (flags.has("budget")) {
    const raw = flags.get("budget")![0] ?? "";
    const result = parseBudgetValue(raw);
    if (!result.ok) {
      ctx.ui.notify(
        result.reason === "out-of-range"
          ? "Budget must be a positive integer"
          : "Invalid --budget usage. Expected: /goal [--budget <n>] <objective> or /goal <objective> [--budget <n>] (forms: --budget <n>, --budget=<n>, -b <n>)",
        "warning",
      );
      return null;
    }
    budget = result.value;
  }

  const objective = positionals.join(" ").trim();
  if (!objective) {
    ctx.ui.notify("Usage: /goal <objective> [--budget <n>]", "warning");
    return null;
  }
  return { objective, budget };
}

type BudgetParseResult =
  | { ok: true; value: number | null }
  | { ok: false; reason: "unparseable" | "out-of-range" };

/**
 * Parse a budget token. Accepts plain integers, scientific notation that
 * resolves to a positive integer (e.g. `1e5`), and thousands-grouped digits
 * (e.g. `10,000`). `none` means unlimited (null). Returns a tagged result so
 * callers can distinguish garbage input (`unparseable`) from an out-of-range
 * number like `0` or `1.5` (`out-of-range`).
 */
function parseBudgetValue(raw: string): BudgetParseResult {
  if (raw === "none") return { ok: true, value: null };
  const cleaned = raw.replace(/[\s,]/g, "");
  if (!/^[+]?\d+(\.\d+)?([eE][+]?\d+)?$/.test(cleaned)) return { ok: false, reason: "unparseable" };
  const n = Number(cleaned);
  // isSafeInteger subsumes isFinite + isInteger and also rejects values that
  // lost integer precision beyond 2^53 (e.g. 1e21). All required forms
  // (1e5, 10,000, plain ints) resolve to safe integers.
  if (!Number.isSafeInteger(n) || n <= 0) {
    return { ok: false, reason: "out-of-range" };
  }
  return { ok: true, value: n };
}
