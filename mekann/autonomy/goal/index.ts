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
 *
 * This module is a thin composition root: it owns the `goals` feature flag,
 * the shared `store` / `runtime` state, and the `isEnabled` gate, then wires
 * the focused modules (`goalWidget`, `goalEvents`, `goalTools`,
 * `goalPromptProvider`, `goalLifecycle`, `command`) together. Implementation
 * detail for UI / events / tools / prompts / lifecycle lives in those modules.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GoalStateEntry, GoalStore } from "./state.js";
import type { GoalRuntime } from "./runtime.js";
import { registerGoalCommand } from "./command.js";
import { createGoalWidgetController } from "./goalWidget.js";
import { createGoalEmitters } from "./goalEvents.js";
import { registerGoalTools } from "./goalTools.js";
import { registerGoalPromptProvider } from "./goalPromptProvider.js";
import { registerGoalLifecycle } from "./goalLifecycle.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Custom-entry type used to persist goal state in the session branch. */
const CUSTOM_TYPE = "goal-state";

// ---------------------------------------------------------------------------
// Extension factory (composition root)
// ---------------------------------------------------------------------------

export default function goalExtension(pi: ExtensionAPI): void {
  // Shared feature state, owned here and observed/mutated by the modules below.
  let store: GoalStore | null = null;
  let runtime: GoalRuntime | null = null;

  // ─── Feature flag ─────────────────────────────────────────────

  pi.registerFlag("goals", {
    description: "Enable the goal tracking feature",
    type: "boolean",
    default: true,
  });

  // ─── Shared-state accessors ───────────────────────────────────

  const getStore = (): GoalStore | null => store;
  const getRuntime = (): GoalRuntime | null => runtime;
  const setStore = (next: GoalStore | null): void => {
    store = next;
  };
  const setRuntime = (next: GoalRuntime | null): void => {
    runtime = next;
  };

  // ─── Feature gates & persistence ──────────────────────────────

  function persist(entry: GoalStateEntry): void {
    pi.appendEntry(CUSTOM_TYPE, entry);
  }

  function isEnabled(ctx: ExtensionContext): boolean {
    if (pi.getFlag("goals") !== true) return false;
    if (!(ctx.sessionManager as any).isPersisted?.()) return false;
    return true;
  }

  // ─── Wire focused modules ─────────────────────────────────────

  // UI widget + model-tool surface control
  const widget = createGoalWidgetController(pi, getStore);

  // goal:updated / goal:cleared emitters + ledger recording
  const { emitUpdated, emitCleared } = createGoalEmitters(pi, widget.updateWidget);

  // get_goal / create_goal / update_goal
  registerGoalTools({ pi, getStore, getRuntime, isEnabled, emitUpdated });

  // Prompt fragment provider (goal policy / objective / runtime state)
  registerGoalPromptProvider(getStore);

  // session_start replay + agent lifecycle hooks
  registerGoalLifecycle({
    pi,
    getStore,
    getRuntime,
    setStore,
    setRuntime,
    isEnabled,
    persist,
    customType: CUSTOM_TYPE,
    syncToolSurface: widget.syncToolSurface,
    updateWidget: widget.updateWidget,
  });

  // /goal command
  registerGoalCommand(pi, {
    getStore,
    getRuntime,
    isEnabled,
    emitUpdated,
    emitCleared,
  });
}
