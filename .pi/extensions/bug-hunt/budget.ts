// Path: .pi/extensions/bug-hunt/budget.ts
// What: bug-hunt の各モデル段に使う時間予算を配分する
// Why: retrieve で予算を使い切って investigate / observe に進めない退行を防ぐため
// Related: .pi/extensions/bug-hunt/runner.ts, .pi/extensions/bug-hunt/types.ts, tests/unit/extensions/bug-hunt-budget.test.ts

export type BugHuntModelStage = "query" | "hypothesis" | "investigation" | "observer";

const MIN_STAGE_TIMEOUT_MS = 15_000;
const RESERVED_REPORT_MS = 10_000;
const RESERVED_OBSERVER_MS = 45_000;
const RESERVED_HYPOTHESIS_MS = 45_000;
const RESERVED_INVESTIGATION_MS = 120_000;

const STAGE_TIMEOUT_CAP_MS: Record<BugHuntModelStage, number> = {
  query: 60_000,
  hypothesis: 60_000,
  investigation: 90_000,
  observer: 60_000,
};

function getReservedTailMs(stage: BugHuntModelStage): number {
  switch (stage) {
    case "query":
      return RESERVED_HYPOTHESIS_MS + RESERVED_INVESTIGATION_MS + RESERVED_OBSERVER_MS + RESERVED_REPORT_MS;
    case "hypothesis":
      return RESERVED_INVESTIGATION_MS + RESERVED_OBSERVER_MS + RESERVED_REPORT_MS;
    case "investigation":
      return RESERVED_OBSERVER_MS + RESERVED_REPORT_MS;
    case "observer":
      return RESERVED_REPORT_MS;
    default:
      return RESERVED_REPORT_MS;
  }
}

export function hasBudgetForBugHuntStage(stage: BugHuntModelStage, remainingMs: number): boolean {
  return remainingMs - getReservedTailMs(stage) >= MIN_STAGE_TIMEOUT_MS;
}

export function allocateBugHuntStageTimeout(stage: BugHuntModelStage, remainingMs: number): number {
  const usableBudget = remainingMs - getReservedTailMs(stage);
  if (usableBudget < MIN_STAGE_TIMEOUT_MS) {
    throw new Error(`iteration budget exhausted before ${stage}`);
  }

  return Math.min(usableBudget, STAGE_TIMEOUT_CAP_MS[stage]);
}
