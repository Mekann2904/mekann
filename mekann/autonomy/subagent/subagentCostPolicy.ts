import type { SpawnParams } from "./types.js";

export type SubagentRoiCategory =
  | "parallel_search"
  | "fault_localization"
  | "candidate_generation"
  | "fresh_review"
  | "verification"
  | "large_context_isolation"
  | "other";

export type SubagentCostIntent = "cheap" | "standard" | "expensive";

export interface SpawnCostPolicyInput {
  params: SpawnParams;
  sessionSpawnCount: number;
  openSubagents: number;
  queuedSubagents: number;
}

export interface SpawnCostAdvice {
  level: "none" | "note" | "warning";
  message?: string;
  reasons: string[];
}

const SOFT_HINT_AFTER_SPAWNS = 1;
const STRONG_HINT_AFTER_SPAWNS = 4;

const GOOD_ROI_CATEGORIES = new Set<SubagentRoiCategory>([
  "parallel_search",
  "fault_localization",
  "candidate_generation",
  "fresh_review",
  "verification",
  "large_context_isolation",
]);

export function subagentBudgetHint(spawnCount: number): string | undefined {
  if (spawnCount > STRONG_HINT_AFTER_SPAWNS) {
    return `This session has spawned ${spawnCount} subagents. Each spawn pays a fresh child loop; confirm the next spawn is genuinely needed for independent exploration, candidate generation, or fresh verification before spawning again.`;
  }
  if (spawnCount > SOFT_HINT_AFTER_SPAWNS) {
    return `This session has spawned ${spawnCount} subagents; prefer direct tools unless this spawn buys independent evidence or verification.`;
  }
  return undefined;
}

export function evaluateSpawnCost(input: SpawnCostPolicyInput): SpawnCostAdvice {
  const reasons: string[] = [];
  const p = input.params;
  const roiCategory = p.roi_category;
  const justification = p.justification?.trim();

  if (!roiCategory) reasons.push("roi_category is missing");
  else if (roiCategory === "other") reasons.push("roi_category=other is not a strong ROI signal");
  else if (!GOOD_ROI_CATEGORIES.has(roiCategory)) reasons.push(`unknown roi_category=${roiCategory}`);

  if (!justification) reasons.push("justification is missing");
  if (input.sessionSpawnCount >= SOFT_HINT_AFTER_SPAWNS) reasons.push(`session already has ${input.sessionSpawnCount} prior subagent spawn(s)`);
  if (input.queuedSubagents > 0) reasons.push(`${input.queuedSubagents} queued subagent(s) already exist`);

  const text = `${p.task_name}\n${p.message}`.toLowerCase();
  if (/\b(simple|quick|small|one[- ]file|single[- ]file|just|only)\b/.test(text)) reasons.push("task wording looks small; direct tools may be cheaper");
  if ((p.cost_intent ?? "standard") === "expensive" && roiCategory !== "fault_localization" && roiCategory !== "candidate_generation") reasons.push("cost_intent=expensive without a high-ROI roi_category");

  if (reasons.length === 0) return { level: "none", reasons: [] };
  const strong = input.sessionSpawnCount >= STRONG_HINT_AFTER_SPAWNS || (!roiCategory && !justification);
  return {
    level: strong ? "warning" : "note",
    reasons,
    message: `${strong ? "Strong" : "Soft"} subagent cost advisory: ${reasons.join("; ")}. Prefer direct tools unless the task buys independent exploration, candidate diversity, fresh review, or large-context isolation.`,
  };
}
