/**
 * goal/goalPromptProvider.ts — Registration of the goal prompt-fragment provider.
 *
 * Exposes goal policy / objective / runtime-state fragments to the prompt
 * core. The provider reads the live store so fragments reflect the current
 * goal without the composition root having to push updates.
 */

import { registerPromptProvider } from "../../core/prompt-core/index.js";
import {
  renderGoalPolicy,
  renderGoalObjectiveContext,
  renderGoalRuntimeState,
} from "./prompts.js";
import type { GoalStore } from "./state.js";

/**
 * Register the goal prompt-fragment provider.
 *
 * Returns no fragments when the feature is effectively inactive (disabled,
 * no goal, or goal not active) so the prompt surface stays clean.
 */
export function registerGoalPromptProvider(getStore: () => GoalStore | null): void {
  registerPromptProvider({
    id: "goal",
    getFragments() {
      const goal = getStore()?.getGoal();
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
}
