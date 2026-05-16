/**
 * goal/prompts.ts — Hidden prompt templates for goal steering.
 *
 * Injected as hidden custom messages (display: false) to guide the model
 * during continuation, budget limits, and objective updates.
 */

import type { Goal } from "./state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatUsage(goal: Goal): string {
  const lines: string[] = [];
  lines.push(`Tokens used: ${goal.tokens_used}`);
  if (goal.token_budget !== null) {
    const remaining = Math.max(0, goal.token_budget - goal.tokens_used);
    lines.push(`Token budget: ${goal.token_budget}`);
    lines.push(`Remaining tokens: ${remaining}`);
  }
  lines.push(`Time used: ${formatDuration(goal.time_used_seconds)}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Prompt functions
// ---------------------------------------------------------------------------

/**
 * Prompt for idle continuation. Tells the model to assess the goal
 * and continue working or mark complete.
 */
export function continuationPrompt(goal: Goal): string {
  return [
    `[Goal continuation check]`,
    ``,
    `Objective: ${goal.objective}`,
    `Status: ${goal.status}`,
    ``,
    formatUsage(goal),
    ``,
    `Instructions:`,
    `1. Assess whether the objective has been fully achieved.`,
    `2. If the objective is genuinely complete, call update_goal with status="complete".`,
    `3. If not complete, continue working on the remaining tasks.`,
    `4. Do NOT mark the goal as complete unless all required work is done.`,
    `5. If the token budget is nearly exhausted, avoid starting large new tasks.`,
  ].join("\n");
}

/**
 * Prompt for when the token budget has been reached.
 * Tells the model to wrap up and wait for user instructions.
 */
export function budgetLimitPrompt(goal: Goal): string {
  const remaining = goal.token_budget !== null
    ? Math.max(0, goal.token_budget - goal.tokens_used)
    : "N/A";
  return [
    `[Token budget limit reached]`,
    ``,
    `Objective: ${goal.objective}`,
    `Tokens used: ${goal.tokens_used} / ${goal.token_budget}`,
    `Remaining: ${remaining}`,
    `Time used: ${formatDuration(goal.time_used_seconds)}`,
    ``,
    `The token budget for this goal has been reached.`,
    ``,
    `Instructions:`,
    `1. If the objective is fully achieved, call update_goal with status="complete".`,
    `2. If not complete, report the current progress to the user and wait for instructions.`,
    `3. Do NOT start new significant work without user confirmation.`,
    `4. Summarize what has been accomplished and what remains.`,
  ].join("\n");
}

/**
 * Prompt for when the objective has been updated.
 * Tells the model to switch to the new objective.
 */
export function objectiveUpdatedPrompt(previous: string, next: string): string {
  return [
    `[Goal objective updated]`,
    ``,
    `Previous objective: ${previous}`,
    `New objective: ${next}`,
    ``,
    `Instructions:`,
    `1. The goal objective has been changed by the user.`,
    `2. Follow the new objective from now on.`,
    `3. Do not continue work based on the old objective.`,
    `4. If the new objective invalidates in-progress work, pivot accordingly.`,
  ].join("\n");
}
