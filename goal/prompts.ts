/**
 * goal/prompts.ts — Prompt templates for goal steering.
 *
 * Injected as follow-up user messages or system prompt context, depending on lifecycle.
 */

import { type Goal, remainingTokens } from "./state.js";

// ---------------------------------------------------------------------------
// XML escaping
// ---------------------------------------------------------------------------

/** Escape text for safe inclusion inside XML-style tags. */
export function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatDuration(seconds: number): string {
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
  const remaining = remainingTokens(goal);
  if (remaining !== null) {
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
    `<goal_objective>${escapeXmlText(goal.objective)}</goal_objective>`,
    `Status: ${goal.status}`,
    `Continuation: ${goal.continuation_count} / ${goal.max_continuations}`,
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
  const remaining = remainingTokens(goal);
  return [
    `[Token budget limit reached]`,
    ``,
    `<goal_objective>${escapeXmlText(goal.objective)}</goal_objective>`,
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
    `Previous objective: ${escapeXmlText(previous)}`,
    `New objective: ${escapeXmlText(next)}`,
    ``,
    `Instructions:`,
    `1. The goal objective has been changed by the user.`,
    `2. Follow the new objective from now on.`,
    `3. Do not continue work based on the old objective.`,
    `4. If the new objective invalidates in-progress work, pivot accordingly.`,
  ].join("\n");
}

/**
 * Render the active goal context for injection into the system prompt.
 * Returns an empty string if no active goal.
 */
export function renderGoalContext(goal: Goal): string {
  if (goal.status !== "active") return "";
  const lines: string[] = [
    "[Active Goal Context]",
    "",
    `<goal_objective>${escapeXmlText(goal.objective)}</goal_objective>`,
    `Status: ${goal.status}`,
  ];
  if (remaining !== null) {
    lines.push(`Token budget: ${goal.token_budget} (used: ${goal.tokens_used}, remaining: ${remaining})`);
  } else {
    lines.push(`Tokens used: ${goal.tokens_used}`);
  }
  lines.push(
    `Time used: ${formatDuration(goal.time_used_seconds)}`,
    `Continuation: ${goal.continuation_count} / ${goal.max_continuations}`,
  );
  lines.push(
    "",
    "Instructions:",
    '- Continue to respect this active goal while answering the user.',
    '- If the goal is fully achieved and no required work remains, call update_goal with status="complete".',
    '- Do not mark the goal complete merely because the budget is low or work is paused.',
    '- Do not pause, resume, clear, or budget-limit the goal through model tools.',
  );
  return lines.join("\n");
}
