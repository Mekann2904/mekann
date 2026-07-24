import type { GoalStatus } from "./state.js";

/**
 * Classify a settled Pi/provider failure into the Goal stop status.
 *
 * Pi 0.81 exposes only the assistant error message at this boundary, not a
 * provider-neutral error code. Keep this compatibility policy isolated here so
 * provider wording changes do not leak into the Goal state machine.
 */
export function classifyGoalStopReason(message: string): Extract<GoalStatus, "usage_limited" | "blocked"> {
  const usageLimited = [
    /\b429\b/i,
    /too many requests/i,
    /(?:rate|usage|quota).{0,24}limit/i,
    /limit.{0,24}(?:rate|usage|quota)/i,
    /insufficient (?:credit|quota)/i,
  ].some((pattern) => pattern.test(message));
  return usageLimited ? "usage_limited" : "blocked";
}
