/**
 * goal/render.ts — UI rendering utilities for goal status display.
 */

import { type Goal, type GoalStatus, remainingTokens } from "./state.js";
import { formatDuration } from "./prompts.js";

// ---------------------------------------------------------------------------
// Status labels
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<GoalStatus, string> = {
  active: "● active",
  paused: "○ paused",
  budget_limited: "■ limited by budget",
  complete: "✓ complete",
};

function truncateObjective(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

// ---------------------------------------------------------------------------
// Public render functions
// ---------------------------------------------------------------------------

/** Render a goal summary for the /goal command output. */
export function renderGoalSummary(goal: Goal): string[] {
  const lines: string[] = [];
  lines.push(`Goal [${STATUS_LABELS[goal.status]}]`);
  lines.push(`  ${goal.objective}`);
  lines.push(`  Time: ${formatDuration(goal.time_used_seconds)} | Tokens: ${goal.tokens_used}`);
  if (goal.token_budget !== null) {
    const remaining = remainingTokens(goal);
    lines.push(`  Budget: ${goal.tokens_used} / ${goal.token_budget} (${remaining} remaining)`);
  }
  return lines;
}

/** Render the "no goal" message. */
export function renderNoGoal(): string[] {
  return [
    "No active goal",
    "",
    "Commands: /goal <objective>, /goal edit, /goal pause, /goal resume, /goal clear, /goal budget <n>",
  ];
}

/** Render widget lines from a goal (or undefined to clear). */
export function renderWidget(goal: Goal | null): string[] | undefined {
  if (!goal) return undefined;
  if (goal.status === "complete") return undefined;
  const lines: string[] = [];
  lines.push(`Goal ${STATUS_LABELS[goal.status]}: ${truncateObjective(goal.objective, 80)}`);
  if (goal.token_budget !== null) {
    const remaining = remainingTokens(goal);
    lines.push(`  Tokens: ${goal.tokens_used}/${goal.token_budget} (${remaining} left) | Time: ${formatDuration(goal.time_used_seconds)}`);
  } else {
    lines.push(`  Tokens: ${goal.tokens_used} | Time: ${formatDuration(goal.time_used_seconds)}`);
  }
  return lines;
}
