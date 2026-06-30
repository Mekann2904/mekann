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
import { DEFAULT_OBJECTIVE_LENGTH, clampObjectiveLimit } from "./state.js";
import { featureRawConfig } from "../../settings/enabled.js";
import { MEKANN_GOAL_DEFAULTS } from "../../config.js";
import type { GoalRuntime } from "./runtime.js";
import { registerGoalCommand } from "./command.js";
import { createGoalWidgetController } from "./goalWidget.js";
import { createGoalEmitters } from "./goalEvents.js";
import { registerGoalTools } from "./goalTools.js";
import { registerGoalPromptProvider } from "./goalPromptProvider.js";
import { registerGoalLifecycle } from "./goalLifecycle.js";
import { isPersistedSession } from "./session.js";

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
    if (!isPersistedSession(ctx)) return false;
    return true;
  }

  /**
   * Resolve the configured objective-length limit for new GoalStores. Reads
   * the merged mekann.json `goal.maxObjectiveLength` (workspace overrides
   * global) and clamps it to the safe range. Defaults are used in tests and on
   * any read error so a malformed setting never disables the limit.
   */
  function getMaxObjectiveLength(): number {
    if (process.env.VITEST || process.env.NODE_ENV === "test") return DEFAULT_OBJECTIVE_LENGTH;
    try {
      const raw = featureRawConfig("goal").maxObjectiveLength;
      return clampObjectiveLimit(typeof raw === "number" ? raw : undefined);
    } catch {
      return DEFAULT_OBJECTIVE_LENGTH;
    }
  }

  /**
   * Resolve the compaction reserve used to gate goal continuation. Reads the
   * merged mekann.json `goal.compactReserveTokens` so the threshold can be
   * re-aligned with Pi's `CompactionSettings.reserveTokens`. Defaults are used
   * in tests and on any read error so a malformed setting never blocks
   * continuation (issue #167 / IC-211).
   */
  function getCompactReserveTokens(): number {
    if (process.env.VITEST || process.env.NODE_ENV === "test") return MEKANN_GOAL_DEFAULTS.compactReserveTokens;
    try {
      const raw = featureRawConfig("goal").compactReserveTokens;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
        return MEKANN_GOAL_DEFAULTS.compactReserveTokens;
      }
      return Math.floor(raw);
    } catch {
      return MEKANN_GOAL_DEFAULTS.compactReserveTokens;
    }
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
    getMaxObjectiveLength,
    getCompactReserveTokens,
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
