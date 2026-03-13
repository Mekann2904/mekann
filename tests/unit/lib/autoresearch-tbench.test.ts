/**
 * path: tests/unit/lib/autoresearch-tbench.test.ts
 * role: terminal-bench autoresearch の score 比較と result 正規化を検証する
 * why: keep/drop 判定が固定 task 集合に対して安定し、速さ優先の tie-break も壊れないようにするため
 * related: .pi/lib/autoresearch-tbench.ts, scripts/autoresearch-tbench.ts, tests/unit/lib/autoresearch-e2e.test.ts, scripts/run-terminal-bench.sh
 */

import { describe, expect, it } from "vitest";

import {
  compareAutoresearchTbenchScores,
  determineAutoresearchTbenchOutcome,
  formatAutoresearchTbenchScore,
  parseTerminalBenchJobReport,
} from "../../../.pi/lib/autoresearch-tbench.js";

describe("autoresearch-tbench", () => {
  it("success 数が増えた候補を improved と判定する", () => {
    const outcome = determineAutoresearchTbenchOutcome(
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 0.75,
        elapsedMs: 12_000,
      },
      {
        successCount: 3,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 0.75,
        elapsedMs: 10_000,
      },
    );

    expect(outcome).toBe("improved");
  });

  it("成功数が同じなら mean reward を優先する", () => {
    const result = compareAutoresearchTbenchScores(
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 1,
        meanReward: 0.9,
        elapsedMs: 15_000,
      },
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 0.8,
        elapsedMs: 2_000,
      },
    );

    expect(result).toBe(1);
  });

  it("完全同点なら elapsed が短い候補を優先する", () => {
    const result = compareAutoresearchTbenchScores(
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 1,
        elapsedMs: 9_000,
      },
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 1,
        elapsedMs: 12_000,
      },
    );

    expect(result).toBe(1);
  });

  it("terminal-bench result.json を score に正規化する", () => {
    const parsed = parseTerminalBenchJobReport(JSON.stringify({
      started_at: "2026-03-13T00:00:00.000Z",
      finished_at: "2026-03-13T00:02:00.000Z",
      n_total_trials: 6,
      stats: {
        n_trials: 6,
        n_errors: 1,
        evals: {
          "pi__terminal-bench": {
            n_trials: 6,
            n_errors: 1,
            metrics: [{ mean: 0.75 }],
            reward_stats: {
              reward: {
                "1.0": ["task-a", "task-b", "task-c", "task-d"],
                "0.5": ["task-e"],
                "0.0": ["task-f"],
              },
            },
            exception_stats: {
              AgentTimeoutError: ["task-f"],
            },
          },
        },
      },
    }));

    expect(parsed.score).toEqual({
      successCount: 4,
      completedTrials: 6,
      totalTrials: 6,
      errorCount: 1,
      meanReward: 0.75,
      elapsedMs: 120_000,
    });
    expect(parsed.exceptionBuckets.AgentTimeoutError).toEqual(["task-f"]);
    expect(formatAutoresearchTbenchScore(parsed.score)).toContain("success=4");
  });
});
