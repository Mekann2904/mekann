/**
 * goal/goalWidget.ts — Goal UI widget and model-tool surface control.
 *
 * Owns the TUI widget rendering for the current goal and decides whether the
 * `get_goal` / `create_goal` / `update_goal` tools are exposed to the model
 * based on the configured tool surface policy.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { featureStringValue } from "../../settings/enabled.js";
import { setToolsActive } from "../../settings/toolSurface.js";
import { renderWidget } from "./prompts.js";
import type { GoalStore } from "./state.js";

// ---------------------------------------------------------------------------
// Tool surface policy
// ---------------------------------------------------------------------------

/** Model tools owned by the goal feature. */
export const GOAL_TOOL_NAMES = ["get_goal", "create_goal", "update_goal"] as const;

type GoalToolSurface = "always" | "active" | "slash";

/** Resolve the configured tool surface policy for goal tools. */
function resolveToolSurface(): GoalToolSurface {
  const surface = featureStringValue("goal", "toolSurface", "slash");
  if (surface === "always" || surface === "active") return surface;
  return "slash";
}

// ---------------------------------------------------------------------------
// Widget controller
// ---------------------------------------------------------------------------

export interface GoalWidgetController {
  /** Recompute tool exposure and refresh the TUI widget for the current goal. */
  updateWidget(ctx: ExtensionContext): void;
  /** Recompute tool exposure only (used outside of a UI context, e.g. shutdown). */
  syncToolSurface(): void;
}

/**
 * Create the widget controller.
 *
 * `getStore` is a getter so the controller always observes the live store
 * owned by the composition root rather than a stale snapshot.
 */
export function createGoalWidgetController(
  pi: ExtensionAPI,
  getStore: () => GoalStore | null,
): GoalWidgetController {
  function shouldExposeGoalTools(): boolean {
    const surface = resolveToolSurface();
    if (surface === "always") return true;
    if (surface === "active") {
      const goal = getStore()?.getGoal();
      return goal?.status === "active";
    }
    return false;
  }

  function syncToolSurface(): void {
    setToolsActive(pi, GOAL_TOOL_NAMES, shouldExposeGoalTools());
  }

  function updateWidget(ctx: ExtensionContext): void {
    syncToolSurface();
    if (!ctx.hasUI) return;
    const goal = getStore()?.getGoal() ?? null;
    const lines = renderWidget(goal);
    ctx.ui.setWidget(
      "goal",
      lines
        ? (_tui: unknown, _theme: any) => ({
            invalidate() {},
            render(width: number): string[] {
              return lines.map((l) => truncateToWidth(l, width));
            },
          })
        : undefined,
    );
  }

  return { updateWidget, syncToolSurface };
}
